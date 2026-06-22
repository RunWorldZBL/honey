import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHttpBackendClient } from './httpClient';

describe('httpClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads model profiles from the local backend HTTP API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
      {
        id: 'http-asr',
        kind: 'asr',
        name: 'HTTP ASR',
        engine: 'custom',
        status: 'installed',
        recommendedTier: 'low',
      },
    ])));
    const client = createHttpBackendClient('http://127.0.0.1:33577');

    await expect(client.listModels()).resolves.toMatchObject([
      {
        id: 'http-asr',
        name: 'HTTP ASR',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/models', undefined);
  });

  it('loads runtime health from the local backend HTTP API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      service: 'honey-backend',
      mode: 'local',
      localDataPath: 'D:/honey',
      audioCapturePath: 'D:/honey/audio-captures',
      modelRoot: '../Fun-ASR-Nano-GGUF',
      llmModelRoot: '../models',
      llamaServerPath: 'D:/honey/runtime/llama.cpp/llama-server.exe',
      models: [
        {
          id: 'fun-asr-nano',
          name: 'Fun-ASR-Nano',
          kind: 'asr',
          engine: 'fun-asr-nano',
          status: 'installed',
          modelRoot: '../Fun-ASR-Nano-GGUF',
          requiredFiles: ['tokens.txt'],
          requiredFilesMissing: [],
        },
      ],
      asr: {
        status: 'ready',
        commandConfigured: true,
      },
      personaRewrite: {
        status: 'fallback',
        commandConfigured: false,
        detail: 'local_persona_rewrite_fallback',
      },
      llmRuntime: {
        status: 'stopped',
      },
      issues: ['persona_rewrite_running_in_local_fallback'],
    })));
    const client = createHttpBackendClient('http://127.0.0.1:33577');

    await expect(client.getRuntimeHealth()).resolves.toMatchObject({
      service: 'honey-backend',
      localDataPath: 'D:/honey',
      asr: {
        status: 'ready',
        commandConfigured: true,
      },
      personaRewrite: {
        status: 'fallback',
        commandConfigured: false,
        detail: 'local_persona_rewrite_fallback',
      },
      llmRuntime: {
        status: 'stopped',
      },
      issues: ['persona_rewrite_running_in_local_fallback'],
    });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/runtime/health', undefined);
  });

  it('controls the local LLM runtime through the local backend HTTP API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const path = String(url).replace('http://127.0.0.1:33577', '');
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (path === '/api/runtime/llm') {
        return new Response(JSON.stringify({ status: 'stopped' }));
      }

      if (path === '/api/runtime/llm/start') {
        return new Response(JSON.stringify({
          status: 'running',
          modelPath: body.modelPath,
          modelAlias: body.modelAlias,
          host: body.host,
          port: body.port,
          baseUrl: `http://${body.host}:${body.port}`,
          pid: 1234,
        }));
      }

      if (path === '/api/runtime/llm/stop') {
        return new Response(JSON.stringify({ status: 'stopped' }));
      }

      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    });
    const client = createHttpBackendClient('http://127.0.0.1:33577');

    await expect(client.getLocalLlmRuntimeStatus()).resolves.toEqual({ status: 'stopped' });
    await expect(client.startLocalLlmRuntime({
      modelPath: 'D:/products/voice-to-text/models/Qwen3-0.6B-Q8_0.gguf',
      modelAlias: 'qwen3-0_6b',
      host: '127.0.0.1',
      port: 18082,
    })).resolves.toMatchObject({
      status: 'running',
      modelAlias: 'qwen3-0_6b',
      baseUrl: 'http://127.0.0.1:18082',
    });
    await expect(client.stopLocalLlmRuntime()).resolves.toEqual({ status: 'stopped' });

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/runtime/llm', undefined);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/runtime/llm/start', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        modelPath: 'D:/products/voice-to-text/models/Qwen3-0.6B-Q8_0.gguf',
        modelAlias: 'qwen3-0_6b',
        host: '127.0.0.1',
        port: 18082,
      }),
    }));
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/runtime/llm/stop', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('loads and creates file tasks through the local backend HTTP API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const path = String(url).replace('http://127.0.0.1:33577', '');
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (path === '/api/file-tasks') {
        if (init?.method === 'POST') {
          return new Response(JSON.stringify({
            id: 'task-created',
            fileName: body.fileName,
            sourcePath: body.filePath,
            status: 'completed',
            progress: 100,
            outputFormats: body.outputFormats,
            transcriptText: 'HTTP 文件转录结果',
          }));
        }

        return new Response(JSON.stringify([
          {
            id: 'task-http',
            fileName: 'HTTP 录音.wav',
            status: 'waiting',
            progress: 0,
            outputFormats: ['txt'],
          },
        ]));
      }

      if (path === '/api/tray-actions') {
        return new Response(JSON.stringify([
          {
            id: 'tray-http',
            label: 'HTTP 托盘动作',
            description: '来自 HTTP 后端',
            enabled: true,
          },
        ]));
      }

      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    });
    const client = createHttpBackendClient('http://127.0.0.1:33577');

    await expect(client.listFileTranscriptionTasks()).resolves.toMatchObject([
      { id: 'task-http', fileName: 'HTTP 录音.wav' },
    ]);
    await expect(client.createFileTranscriptionTask({
      filePath: 'D:/recordings/客户访谈.mp3',
      fileName: '客户访谈.mp3',
      outputFormats: ['txt', 'json'],
    })).resolves.toMatchObject({
      id: 'task-created',
      sourcePath: 'D:/recordings/客户访谈.mp3',
      transcriptText: 'HTTP 文件转录结果',
    });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/file-tasks', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        filePath: 'D:/recordings/客户访谈.mp3',
        fileName: '客户访谈.mp3',
        outputFormats: ['txt', 'json'],
      }),
    }));
  });

  it('loads tray actions from the local backend HTTP API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const path = String(url).replace('http://127.0.0.1:33577', '');

      if (path === '/api/tray-actions') {
        return new Response(JSON.stringify([
          {
            id: 'tray-http',
            label: 'HTTP 托盘动作',
            description: '来自 HTTP 后端',
            enabled: true,
          },
        ]));
      }

      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    });
    const client = createHttpBackendClient('http://127.0.0.1:33577');

    await expect(client.listTrayActions()).resolves.toMatchObject([
      { id: 'tray-http', label: 'HTTP 托盘动作' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/tray-actions', undefined);
  });

  it('falls back to the mock backend when the local HTTP API is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const client = createHttpBackendClient('http://127.0.0.1:33577');

    await expect(client.getSettings()).resolves.toMatchObject({
      defaultMode: 'direct',
      personaModeEnabled: false,
    });
  });

  it('saves hotwords and rules through the local backend HTTP API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const path = String(url).replace('http://127.0.0.1:33577', '');
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (path === '/api/hotwords') {
        return new Response(JSON.stringify(body));
      }

      if (path === '/api/rules') {
        return new Response(JSON.stringify(body));
      }

      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    });
    const client = createHttpBackendClient('http://127.0.0.1:33577');

    await client.saveHotword({
      id: 'hotword-openai',
      canonical: 'OpenAI',
      aliases: ['欧盆 AI'],
      blacklist: [],
      enabled: true,
    });
    await client.saveRule({
      id: 'rule-openai',
      name: 'OpenAI 昵称',
      pattern: '欧盆 AI',
      replacement: 'OpenAI',
      isRegex: false,
      enabled: true,
    });

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/hotwords', expect.objectContaining({
      method: 'POST',
    }));
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/rules', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('updates settings and personas through the local backend HTTP API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const path = String(url).replace('http://127.0.0.1:33577', '');
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (path === '/api/settings') {
        return new Response(JSON.stringify({
          defaultMode: 'direct',
          personaModeEnabled: body.personaModeEnabled ?? false,
          hotkey: body.hotkey ?? 'F9',
          mouseShortcut: '鼠标侧键 1',
          triggerMode: 'hold-to-talk',
          triggerThresholdMs: 0,
          outputMethod: 'paste',
          restoreClipboard: true,
          language: 'zh-CN',
          numericFormatting: true,
          removeTrailingPunctuation: false,
          saveAudio: true,
          saveHistory: true,
          localDataPath: 'D:/honey',
          asrModelRoot: 'D:/honey/models/Fun-ASR-Nano-GGUF',
          llmModelRoot: 'D:/honey/models/llm',
          llamaServerPath: 'D:/honey/runtime/llama.cpp/llama-server.exe',
          startupEnabled: false,
          trayEnabled: true,
          defaultWindowMode: 'full',
          overlayEnabled: true,
          overlayPosition: 'bottom-center',
          gpuAcceleration: false,
          forcePasteApps: [],
          autoEnterApps: [],
          punctuationCleanupApps: [],
        }));
      }

      if (path === '/api/personas') {
        return new Response(JSON.stringify(body));
      }

      if (path === '/api/personas/persona-director') {
        return new Response(JSON.stringify({ ok: true, id: 'persona-director' }));
      }

      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    });
    const client = createHttpBackendClient('http://127.0.0.1:33577');

    await expect(client.updateSettings({ hotkey: 'F8', personaModeEnabled: true })).resolves.toMatchObject({
      hotkey: 'F8',
      personaModeEnabled: true,
    });
    await expect(client.savePersona({
      id: 'persona-director',
      name: '项目负责人',
      triggerAliases: ['项目'],
      description: '项目推进语气',
      prompt: '整理成项目推进表达。',
      outputMode: 'typing',
      enabled: true,
      keepContext: false,
    })).resolves.toMatchObject({
      id: 'persona-director',
      name: '项目负责人',
    });
    await expect(client.deletePersona('persona-director')).resolves.toEqual({ ok: true, id: 'persona-director' });

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/settings', expect.objectContaining({
      method: 'PATCH',
    }));
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/personas', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('uploads audio captures through the local backend HTTP API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      return new Response(JSON.stringify({
        audioPath: 'D:/honey/audio-captures/hold-to-talk.wav',
        byteLength: 18,
        mimeType: body.mimeType,
        durationMs: body.durationMs,
      }));
    });
    const client = createHttpBackendClient('http://127.0.0.1:33577');

    await expect(client.saveAudioCapture({
      fileName: 'hold-to-talk.wav',
      mimeType: 'audio/wav',
      base64Data: 'aG9uZXktYXVkaW8=',
      durationMs: 1200,
    })).resolves.toEqual({
      audioPath: 'D:/honey/audio-captures/hold-to-talk.wav',
      byteLength: 18,
      mimeType: 'audio/wav',
      durationMs: 1200,
    });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/audio-captures', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        fileName: 'hold-to-talk.wav',
        mimeType: 'audio/wav',
        base64Data: 'aG9uZXktYXVkaW8=',
        durationMs: 1200,
      }),
    }));
  });

  it('does not fall back to mock data when the local backend rejects writes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: 'invalid_request',
    }), { status: 400 }));
    const client = createHttpBackendClient('http://127.0.0.1:33577');

    await expect(client.updateSettings({ hotkey: 'F8' })).rejects.toThrow('HTTP 400');
    await expect(client.savePersona({
      id: 'persona-invalid',
      name: '非法人设',
      triggerAliases: [],
      description: '非法',
      prompt: '非法',
      outputMode: 'typing',
      enabled: true,
      keepContext: false,
    })).rejects.toThrow('HTTP 400');
  });

  it('does not fall back to mock data when write requests cannot reach the local backend', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('backend offline'));
    const client = createHttpBackendClient('http://127.0.0.1:33577');

    await expect(client.updateSettings({ hotkey: 'F8' })).rejects.toThrow('backend offline');
    await expect(client.saveHotword({
      id: 'hotword-offline',
      canonical: 'Offline',
      aliases: [],
      blacklist: [],
      enabled: true,
    })).rejects.toThrow('backend offline');
    await expect(client.savePersona({
      id: 'persona-offline',
      name: '离线人设',
      triggerAliases: [],
      description: '离线测试',
      prompt: '离线测试',
      outputMode: 'typing',
      enabled: true,
      keepContext: false,
    })).rejects.toThrow('backend offline');
    await expect(client.deleteTranscriptRecord('rec-offline')).rejects.toThrow('backend offline');
    await expect(client.runDirectDictationSession({
      audioPath: 'D:/tmp/offline.wav',
    })).rejects.toThrow('backend offline');
  });

  it('deletes transcripts and clears persona memory through the local backend HTTP API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const path = String(url).replace('http://127.0.0.1:33577', '');

      if (path === '/api/personas/persona-office/memory') {
        return new Response(JSON.stringify({ ok: true, personaId: 'persona-office' }));
      }

      return new Response(JSON.stringify({ ok: true, id: 'rec-001' }));
    });
    const client = createHttpBackendClient('http://127.0.0.1:33577');

    await client.deleteTranscriptRecord('rec-001');
    await client.clearPersonaMemory('persona-office');

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/transcripts/rec-001', expect.objectContaining({
      method: 'DELETE',
    }));
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/personas/persona-office/memory', expect.objectContaining({
      method: 'DELETE',
    }));
  });

  it('runs direct dictation sessions through the local backend HTTP API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const path = String(url).replace('http://127.0.0.1:33577', '');
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (path === '/api/dictation/direct-session') {
        return new Response(JSON.stringify({
          overlayStates: ['listening', 'recognizing', 'completed', 'inserted'],
          record: {
            id: 'rec-http-direct',
            createdAt: '2026-06-20T00:00:00.000Z',
            sourceApp: body.sourceApp,
            mode: 'direct',
            rawText: 'HTTP 转写原文',
            outputText: 'HTTP 转写原文',
            audioPath: body.audioPath,
            durationMs: 900,
            latencyMs: 0,
            status: 'completed',
          },
        }));
      }

      if (path === '/api/dictation/persona-session') {
        return new Response(JSON.stringify({
          overlayStates: ['listening', 'recognizing', 'completed', 'inserted'],
          record: {
            id: 'rec-http-persona',
            createdAt: '2026-06-20T00:00:00.000Z',
            sourceApp: body.sourceApp,
            mode: 'persona',
            roleId: body.personaId,
            rawText: 'HTTP persona raw text',
            outputText: 'HTTP persona rewritten text',
            audioPath: body.audioPath,
            durationMs: 900,
            latencyMs: 120,
            status: 'completed',
          },
        }));
      }

      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    });
    const client = createHttpBackendClient('http://127.0.0.1:33577');

    await expect(client.runDirectDictationSession({
      audioPath: 'D:/tmp/honey-client.wav',
      sourceApp: 'Client 输入框',
    })).resolves.toMatchObject({
      overlayStates: ['listening', 'recognizing', 'completed', 'inserted'],
      record: {
        id: 'rec-http-direct',
        audioPath: 'D:/tmp/honey-client.wav',
        sourceApp: 'Client 输入框',
      },
    });
    await expect(client.runPersonaDictationSession({
      audioPath: 'D:/tmp/honey-client-persona.wav',
      sourceApp: 'Client Persona',
      personaId: 'persona-office',
    })).resolves.toMatchObject({
      overlayStates: ['listening', 'recognizing', 'completed', 'inserted'],
      record: {
        id: 'rec-http-persona',
        mode: 'persona',
        roleId: 'persona-office',
        outputText: 'HTTP persona rewritten text',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/dictation/direct-session', expect.objectContaining({
      method: 'POST',
    }));
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:33577/api/dictation/persona-session', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        audioPath: 'D:/tmp/honey-client-persona.wav',
        sourceApp: 'Client Persona',
        personaId: 'persona-office',
      }),
    }));
  });
});
