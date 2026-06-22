import { describe, expect, it, vi } from 'vitest';

import type { BackendClient } from './client';
import type { DesktopShellClient } from './desktopShell';

const mocks = vi.hoisted(() => {
  const httpClient = {
    listTranscriptRecords: vi.fn(async () => []),
    getSettings: vi.fn(async () => ({
      hotkey: 'F9',
      defaultMode: 'direct',
      defaultPersonaId: 'persona-office',
      defaultAsrModelId: 'fun-asr-nano',
      defaultLlmModelId: 'qwen3-4b-instruct',
      outputMethod: 'paste',
      restoreClipboard: true,
      forcePasteApps: [],
      defaultWindowMode: 'full',
      launchAtStartup: false,
      telemetryEnabled: false,
      theme: 'system',
    })),
  } as unknown as BackendClient;

  return {
    httpClient,
    createHttpBackendClient: vi.fn(() => httpClient),
  };
});

vi.mock('./httpClient', () => ({
  createHttpBackendClient: mocks.createHttpBackendClient,
}));

describe('desktopBridge', () => {
  it('starts the Tauri-managed backend before the first HTTP backend call', async () => {
    const { createDesktopBridgeClient } = await import('./desktopBridge');
    const desktopShellClient = {
      startBackendProcess: vi.fn(async () => ({
        ok: true,
        status: 'running',
        baseUrl: 'http://127.0.0.1:33577',
        managed: true,
        pid: 1234,
      })),
    } as unknown as DesktopShellClient;

    const client = createDesktopBridgeClient({ desktopShellClient });

    await client.listTranscriptRecords();
    await client.getSettings();

    expect(desktopShellClient.startBackendProcess).toHaveBeenCalledOnce();
    expect(mocks.httpClient.listTranscriptRecords).toHaveBeenCalledOnce();
    expect(mocks.httpClient.getSettings).toHaveBeenCalledOnce();
  });
});
