import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCommandPersonaRewriteAdapter, createMockPersonaRewriteAdapter, createOpenAiCompatiblePersonaRewriteAdapter } from './personaRewriteAdapter.js';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function listenOnRandomPort(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('test server did not expose a TCP address');
  }

  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function testCommandPersonaRewriteAdapter() {
  const tempDir = await mkdtemp(join(tmpdir(), 'honey-persona-adapter-'));
  const scriptPath = join(tempDir, 'rewrite-runner.mjs');

  try {
    await writeFile(scriptPath, `
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { input += chunk; });
      process.stdin.on('end', () => {
        const payload = JSON.parse(input);
        process.stdout.write(JSON.stringify({
          text: [payload.text, payload.persona.id, payload.modelId, payload.sourceApp].join('|'),
          latencyMs: 88
        }));
      });
    `, 'utf8');

    const adapter = createCommandPersonaRewriteAdapter({
      command: `"${process.execPath}" "${scriptPath}"`,
    });
    const result = await adapter.rewrite({
      text: '怎么今天加班啊？',
      modelId: 'qwen3-0_6b',
      sourceApp: 'Editor',
      persona: {
        id: 'persona-office',
        name: '职场老油条',
        triggerAliases: ['职场'],
        description: '友好表达',
        prompt: 'Rewrite politely.',
        outputMode: 'typing',
        enabled: true,
        keepContext: false,
      },
    });

    assertEqual(result.text, '怎么今天加班啊？|persona-office|qwen3-0_6b|Editor', 'command persona adapter should pass rewrite input through stdin');
    assertEqual(result.latencyMs, 88, 'command persona adapter should parse latency from stdout JSON');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function testCommandPersonaRewriteAdapterRejectsInvalidOutput() {
  const tempDir = await mkdtemp(join(tmpdir(), 'honey-persona-adapter-invalid-'));
  const scriptPath = join(tempDir, 'rewrite-runner-invalid.mjs');

  try {
    await writeFile(scriptPath, 'process.stdout.write(JSON.stringify({ text: "" }));', 'utf8');

    const adapter = createCommandPersonaRewriteAdapter({
      command: `"${process.execPath}" "${scriptPath}"`,
    });
    await adapter.rewrite({
      text: 'hello',
      persona: {
        id: 'persona-office',
        name: '职场老油条',
        triggerAliases: [],
        description: '',
        prompt: '',
        outputMode: 'typing',
        enabled: true,
        keepContext: false,
      },
    }).then(
      () => {
        throw new Error('command persona adapter should reject empty text output');
      },
      () => undefined,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function testOpenAiCompatiblePersonaRewriteAdapter() {
  let capturedPath = '';
  let capturedBody: Record<string, unknown> | undefined;
  const server = createServer(async (request, response) => {
    capturedPath = request.url ?? '';
    capturedBody = JSON.parse(await readRequestBody(request)) as Record<string, unknown>;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [
        {
          message: {
            content: '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。',
          },
        },
      ],
    }));
  });
  const baseUrl = await listenOnRandomPort(server);

  try {
    const adapter = createOpenAiCompatiblePersonaRewriteAdapter({
      baseUrl,
      model: 'qwen3-1.7b-q4_k_m',
      timeoutMs: 5000,
    });
    const result = await adapter.rewrite({
      text: '怎么今天加班啊？',
      modelId: 'qwen3-1_7b',
      sourceApp: '飞书',
      persona: {
        id: 'persona-office',
        name: '职场老油条',
        triggerAliases: ['职场'],
        description: '把直接表达转成更友好的职场表达。',
        prompt: '请把用户的话改写成礼貌、稳妥、便于协作的职场表达。',
        outputMode: 'typing',
        enabled: true,
        keepContext: false,
      },
    });
    const messages = capturedBody?.messages as Array<{ role: string; content: string }> | undefined;

    assertEqual(capturedPath, '/v1/chat/completions', 'OpenAI-compatible adapter should call chat completions endpoint');
    assertEqual(capturedBody?.model, 'qwen3-1.7b-q4_k_m', 'OpenAI-compatible adapter should send configured model');
    assertEqual(capturedBody?.temperature, 0.2, 'OpenAI-compatible adapter should use a stable rewrite temperature');
    assertEqual(capturedBody?.stream, false, 'OpenAI-compatible adapter should request a non-streaming response');
    assertEqual(messages?.[0]?.role, 'system', 'OpenAI-compatible adapter should send persona prompt as system message');
    assertEqual(messages?.[0]?.content.includes('职场老油条'), true, 'OpenAI-compatible adapter should include persona identity');
    assertEqual(messages?.[0]?.content.includes('不要回答用户的问题'), true, 'OpenAI-compatible adapter should prohibit answering the source text');
    assertEqual(messages?.[0]?.content.includes('不要编造'), true, 'OpenAI-compatible adapter should prohibit adding unsupported information');
    assertEqual(messages?.[1]?.role, 'user', 'OpenAI-compatible adapter should send transcription as user message');
    assertEqual(messages?.[1]?.content.includes('怎么今天加班啊？'), true, 'OpenAI-compatible adapter should include source text');
    assertEqual(messages?.[1]?.content.includes('只做改写'), true, 'OpenAI-compatible adapter should frame the source text as rewrite-only input');
    assertEqual(result.text, '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。', 'OpenAI-compatible adapter should parse rewritten text');
    assertEqual(typeof result.latencyMs, 'number', 'OpenAI-compatible adapter should report latency');
  } finally {
    await closeServer(server);
  }
}

async function testOpenAiCompatiblePersonaRewriteAdapterFallsBackFromAnswerLikeOutput() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [
        {
          message: {
            content: '今天加班的原因是...',
          },
        },
      ],
    }));
  });
  const baseUrl = await listenOnRandomPort(server);

  try {
    const adapter = createOpenAiCompatiblePersonaRewriteAdapter({
      baseUrl,
      model: 'qwen3-0_6b',
    });
    const result = await adapter.rewrite({
      text: '怎么今天加班啊？',
      persona: {
        id: 'persona-office',
        name: '职场老油条',
        triggerAliases: ['职场'],
        description: '把直接表达转成更友好的职场表达。',
        prompt: '请把用户的话改写成礼貌、稳妥、便于协作的职场表达。',
        outputMode: 'typing',
        enabled: true,
        keepContext: false,
      },
    });

    assertEqual(
      result.text,
      '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。',
      'OpenAI-compatible adapter should fall back when the model answers instead of rewriting',
    );
  } finally {
    await closeServer(server);
  }
}

async function testOpenAiCompatiblePersonaRewriteAdapterFallsBackWhenOutputLosesOvertimeIntent() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [
        {
          message: {
            content: '今天的情况如何？',
          },
        },
      ],
    }));
  });
  const baseUrl = await listenOnRandomPort(server);

  try {
    const adapter = createOpenAiCompatiblePersonaRewriteAdapter({
      baseUrl,
      model: 'qwen3-0_6b',
    });
    const result = await adapter.rewrite({
      text: '怎么今天加班呢',
      persona: {
        id: 'persona-office',
        name: '职场老油条',
        triggerAliases: ['职场'],
        description: '把直接表达转成更友好的职场表达。',
        prompt: '请把用户的话改写成礼貌、稳妥、便于协作的职场表达。',
        outputMode: 'typing',
        enabled: true,
        keepContext: false,
      },
    });

    assertEqual(
      result.text,
      '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。',
      'OpenAI-compatible adapter should fall back when the model drops the overtime intent',
    );
  } finally {
    await closeServer(server);
  }
}

async function testOpenAiCompatiblePersonaRewriteAdapterRejectsInvalidOutput() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: '' } }] }));
  });
  const baseUrl = await listenOnRandomPort(server);

  try {
    const adapter = createOpenAiCompatiblePersonaRewriteAdapter({
      baseUrl,
      model: 'qwen3-1.7b-q4_k_m',
    });
    await adapter.rewrite({
      text: 'hello',
      persona: {
        id: 'persona-office',
        name: '职场老油条',
        triggerAliases: [],
        description: '',
        prompt: '',
        outputMode: 'typing',
        enabled: true,
        keepContext: false,
      },
    }).then(
      () => {
        throw new Error('OpenAI-compatible adapter should reject empty response text');
      },
      (error: unknown) => {
        assertEqual((error as Error).message, 'invalid_openai_compatible_persona_output', 'OpenAI-compatible adapter should reject invalid response shape');
      },
    );
  } finally {
    await closeServer(server);
  }
}

async function testLocalPersonaFallbackSoftensOfficeOvertimeQuestion() {
  const adapter = createMockPersonaRewriteAdapter();
  const result = await adapter.rewrite({
    text: '怎么今天加班啊？',
    modelId: 'qwen3-1_7b',
    sourceApp: '飞书',
    persona: {
      id: 'persona-office',
      name: '职场老油条',
      triggerAliases: ['职场'],
      description: '把直接表达转成更友好的职场表达。',
      prompt: '请把用户的话改写成礼貌、稳妥、便于协作的职场表达。',
      outputMode: 'typing',
      enabled: true,
      keepContext: false,
    },
  });

  assertEqual(
    result.text,
    '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。',
    'local persona fallback should soften the office overtime question',
  );
  assertEqual(result.latencyMs, 0, 'local persona fallback should report deterministic zero latency');
}

async function testLocalPersonaFallbackSoftensAsrOvertimeQuestionVariant() {
  const adapter = createMockPersonaRewriteAdapter();
  const result = await adapter.rewrite({
    text: '怎么今天加班呢',
    persona: {
      id: 'persona-office',
      name: '职场老油条',
      triggerAliases: ['职场'],
      description: '把直接表达转成更友好的职场表达。',
      prompt: '请把用户的话改写成礼貌、稳妥、便于协作的职场表达。',
      outputMode: 'typing',
      enabled: true,
      keepContext: false,
    },
  });

  assertEqual(
    result.text,
    '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。',
    'local persona fallback should soften ASR variants of the overtime question',
  );
}

async function testLocalPersonaFallbackPreservesUnknownPersonaText() {
  const adapter = createMockPersonaRewriteAdapter();
  const result = await adapter.rewrite({
    text: '今天下午把会议纪要发给大家。',
    persona: {
      id: 'persona-unknown',
      name: '未知人设',
      triggerAliases: [],
      description: '',
      prompt: '',
      outputMode: 'typing',
      enabled: true,
      keepContext: false,
    },
  });

  assertEqual(result.text, '今天下午把会议纪要发给大家。', 'local persona fallback should preserve text when no rule applies');
  assertEqual(result.latencyMs, 0, 'local persona fallback should report deterministic zero latency');
}

await testCommandPersonaRewriteAdapter();
await testCommandPersonaRewriteAdapterRejectsInvalidOutput();
await testOpenAiCompatiblePersonaRewriteAdapter();
await testOpenAiCompatiblePersonaRewriteAdapterFallsBackFromAnswerLikeOutput();
await testOpenAiCompatiblePersonaRewriteAdapterFallsBackWhenOutputLosesOvertimeIntent();
await testOpenAiCompatiblePersonaRewriteAdapterRejectsInvalidOutput();
await testLocalPersonaFallbackSoftensOfficeOvertimeQuestion();
await testLocalPersonaFallbackSoftensAsrOvertimeQuestionVariant();
await testLocalPersonaFallbackPreservesUnknownPersonaText();
