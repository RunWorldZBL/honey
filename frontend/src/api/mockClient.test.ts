import { describe, expect, it } from 'vitest';

import { createMockBackendClient, mockBackendClient } from './mockClient';

describe('mockBackendClient', () => {
  it('returns transcript records and keeps direct transcription as default mode', async () => {
    const [records, settings] = await Promise.all([
      mockBackendClient.listTranscriptRecords(),
      mockBackendClient.getSettings(),
    ]);

    expect(records.length).toBeGreaterThan(0);
    expect(records[0]).toMatchObject({
      mode: expect.any(String),
      rawText: expect.any(String),
      outputText: expect.any(String),
    });
    expect(settings.defaultMode).toBe('direct');
    expect(settings.personaModeEnabled).toBe(false);
  });

  it('returns runtime health for local development fallback', async () => {
    const health = await mockBackendClient.getRuntimeHealth();

    expect(health).toMatchObject({
      service: 'honey-backend',
      mode: 'local',
      asr: {
        status: 'mock',
        commandConfigured: false,
      },
      personaRewrite: {
        status: 'fallback',
        commandConfigured: false,
        detail: 'local_persona_rewrite_fallback',
      },
      llmRuntime: {
        status: 'stopped',
      },
    });
    expect(health.audioCapturePath).toContain('audio-captures');
    expect(health.issues).toContain('asr_command_not_configured');
    expect(health.issues).toContain('persona_rewrite_running_in_local_fallback');
  });

  it('simulates local LLM runtime start and stop', async () => {
    const client = createMockBackendClient();

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
    await expect(client.stopLocalLlmRuntime()).resolves.toEqual({
      status: 'stopped',
      modelPath: 'D:/products/voice-to-text/models/Qwen3-0.6B-Q8_0.gguf',
      modelAlias: 'qwen3-0_6b',
      host: '127.0.0.1',
      port: 18082,
      baseUrl: 'http://127.0.0.1:18082',
    });
  });

  it('mutates hotwords and previews replacement rules in an isolated mock backend', async () => {
    const client = createMockBackendClient();

    await client.saveHotword({
      id: 'hotword-openai',
      canonical: 'OpenAI',
      aliases: ['欧盆 AI'],
      blacklist: [],
      enabled: true,
    });

    expect((await client.listHotwords()).some(item => item.canonical === 'OpenAI')).toBe(true);

    await client.deleteHotword('hotword-openai');

    expect((await client.listHotwords()).some(item => item.canonical === 'OpenAI')).toBe(false);

    await client.saveRule({
      id: 'rule-bee',
      name: '产品昵称',
      pattern: '小蜜蜂',
      replacement: 'honey',
      isRegex: false,
      enabled: true,
    });

    await expect(client.previewRules('把小蜜蜂发出去')).resolves.toBe('把honey发出去');
  });
});
