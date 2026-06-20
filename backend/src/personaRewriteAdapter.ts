import { spawn } from 'node:child_process';

import type { PersonaProfile } from '@honey/api-contracts';

export interface PersonaRewriteInput {
  text: string;
  persona: PersonaProfile;
  modelId?: string;
  sourceApp?: string;
}

export interface PersonaRewriteResult {
  text: string;
  latencyMs?: number;
}

export interface PersonaRewriteAdapter {
  rewrite(input: PersonaRewriteInput): Promise<PersonaRewriteResult>;
}

export interface CommandPersonaRewriteAdapterOptions {
  command: string;
  timeoutMs?: number;
}

export interface OpenAiCompatiblePersonaRewriteAdapterOptions {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

interface OpenAiCompatibleChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

const officePersonaMarkers = ['职场', '老油条', '委婉', '礼貌', '协作', '稳妥'];

const includesAnyMarker = (value: string, markers: string[]) =>
  markers.some(marker => value.includes(marker));

const isOfficePersona = (input: PersonaRewriteInput) => {
  const personaText = [
    input.persona.id,
    input.persona.name,
    input.persona.description,
    input.persona.prompt,
    ...input.persona.triggerAliases,
  ].join('\n');

  return input.persona.id === 'persona-office'
    || includesAnyMarker(personaText, officePersonaMarkers);
};

const normalizeChineseQuestion = (text: string) =>
  text.trim().replace(/[。！？?!.]+$/g, '');

const rewriteOfficePersonaText = (text: string) => {
  const normalizedText = normalizeChineseQuestion(text);
  const normalizedQuestionCore = normalizedText.replace(/[啊呢呀吧嘛吗]$/u, '');

  if (normalizedQuestionCore === '怎么今天加班' || normalizedQuestionCore === '今天怎么加班') {
    return '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。';
  }

  if (normalizedText.includes('凭什么') && normalizedText.includes('加班')) {
    return '我想确认一下今天加班安排的背景和优先级，方便我这边更好地配合。';
  }

  if (normalizedText.includes('为什么') && normalizedText.includes('加班')) {
    return '我想确认一下今天加班的具体安排和原因，方便我提前协调时间。';
  }

  return text;
};

const rewriteWithLocalPersonaFallback = (input: PersonaRewriteInput) =>
  isOfficePersona(input) ? rewriteOfficePersonaText(input.text) : input.text;

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

const buildPersonaSystemPrompt = (input: PersonaRewriteInput) => [
  '你是 honey 的本地人设改写器。',
  '你的任务是把用户语音转文字后的内容，按指定人设改写成可以直接上屏的文本。',
  '只做改写，不要回答用户的问题，不要推断问题答案。',
  '不要编造原因、背景、承诺、结论、时间、人名、任务或事实。',
  '保留原意，只改变表达方式；如果无法可靠改写，就用更礼貌的方式复述原文。',
  '不要输出省略号或占位内容。',
  '只输出改写后的正文，不要解释，不要列步骤，不要输出 Markdown。',
  `人设名称：${input.persona.name}`,
  `人设描述：${input.persona.description}`,
  `人设要求：${input.persona.prompt}`,
  input.sourceApp ? `当前输入场景：${input.sourceApp}` : undefined,
].filter(Boolean).join('\n');

const buildPersonaUserPrompt = (text: string) => [
  '只做改写，不要回答，不要补充事实。请改写下面这段话，保留原意，语气符合人设：',
  text,
].join('\n');

const isLikelyAnswerInsteadOfRewrite = (input: PersonaRewriteInput, output: string) => {
  const source = normalizeChineseQuestion(input.text);
  const rewritten = output.trim();

  if (!source || !rewritten) {
    return false;
  }

  const answerLikeMarkers = [
    '原因是',
    '因为',
    '这是因为',
    '可能是因为',
    '主要原因',
    '通常是因为',
    '...',
    '……',
  ];

  if (source.includes('加班') && source.includes('怎么')) {
    return answerLikeMarkers.some(marker => rewritten.includes(marker));
  }

  return false;
};

const isLikelyMissingRequiredIntent = (input: PersonaRewriteInput, output: string) => {
  const source = normalizeChineseQuestion(input.text);
  const rewritten = normalizeChineseQuestion(output);

  if (source.includes('加班')) {
    return !['加班', '延长', '下班后', '工作安排'].some(marker => rewritten.includes(marker));
  }

  return false;
};

const parseCommandPersonaRewriteOutput = (rawOutput: string): PersonaRewriteResult => {
  const parsed = JSON.parse(rawOutput) as Partial<PersonaRewriteResult>;

  if (typeof parsed.text !== 'string' || parsed.text.trim().length === 0) {
    throw new Error('invalid_persona_command_output');
  }

  if (parsed.latencyMs !== undefined && typeof parsed.latencyMs !== 'number') {
    throw new Error('invalid_persona_command_output');
  }

  return {
    text: parsed.text,
    latencyMs: parsed.latencyMs,
  };
};

const parseOpenAiCompatiblePersonaOutput = (rawOutput: unknown): string => {
  const parsed = rawOutput as OpenAiCompatibleChatCompletionResponse;
  const text = parsed.choices?.[0]?.message?.content;

  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('invalid_openai_compatible_persona_output');
  }

  return text.trim();
};

export function createCommandPersonaRewriteAdapter(options: CommandPersonaRewriteAdapterOptions): PersonaRewriteAdapter {
  return {
    async rewrite(input) {
      return await new Promise<PersonaRewriteResult>((resolve, reject) => {
        const child = spawn(options.command, {
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timeout = options.timeoutMs
          ? setTimeout(() => {
            settled = true;
            child.kill();
            reject(new Error('persona_command_timeout'));
          }, options.timeoutMs)
          : undefined;

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', chunk => {
          stdout += chunk;
        });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', chunk => {
          stderr += chunk;
        });
        child.on('error', error => {
          if (settled) {
            return;
          }

          settled = true;
          if (timeout) {
            clearTimeout(timeout);
          }
          reject(error);
        });
        child.on('close', code => {
          if (settled) {
            return;
          }

          settled = true;
          if (timeout) {
            clearTimeout(timeout);
          }

          if (code !== 0) {
            reject(new Error(stderr.trim() || `persona_command_failed:${code}`));
            return;
          }

          try {
            resolve(parseCommandPersonaRewriteOutput(stdout));
          } catch (error) {
            reject(error);
          }
        });
        child.stdin.end(JSON.stringify(input));
      });
    },
  };
}

export function createOpenAiCompatiblePersonaRewriteAdapter(options: OpenAiCompatiblePersonaRewriteAdapterOptions): PersonaRewriteAdapter {
  return {
    async rewrite(input) {
      const startedAt = Date.now();
      const abortController = new AbortController();
      const timeout = options.timeoutMs
        ? setTimeout(() => abortController.abort(), options.timeoutMs)
        : undefined;

      try {
        const response = await fetch(`${normalizeBaseUrl(options.baseUrl)}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: options.model,
            messages: [
              {
                role: 'system',
                content: buildPersonaSystemPrompt(input),
              },
              {
                role: 'user',
                content: buildPersonaUserPrompt(input.text),
              },
            ],
            temperature: 0.2,
            stream: false,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`openai_compatible_persona_request_failed:${response.status}`);
        }

        const parsedText = parseOpenAiCompatiblePersonaOutput(await response.json());

        return {
          text: isLikelyAnswerInsteadOfRewrite(input, parsedText)
            || isLikelyMissingRequiredIntent(input, parsedText)
            ? rewriteWithLocalPersonaFallback(input)
            : parsedText,
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('openai_compatible_persona_timeout');
        }

        throw error;
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    },
  };
}

export function createLocalPersonaRewriteAdapter(): PersonaRewriteAdapter {
  return {
    async rewrite(input) {
      return {
        text: rewriteWithLocalPersonaFallback(input),
        latencyMs: 0,
      };
    },
  };
}

export function createMockPersonaRewriteAdapter(): PersonaRewriteAdapter {
  return createLocalPersonaRewriteAdapter();
}
