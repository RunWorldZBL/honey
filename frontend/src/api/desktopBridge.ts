import type { BackendClient } from './client';
import { desktopShellClient, type DesktopShellClient } from './desktopShell';
import { createHttpBackendClient } from './httpClient';

export interface DesktopBridgeClientOptions {
  baseUrl?: string;
  desktopShellClient?: DesktopShellClient;
}

export function createDesktopBridgeClient(options: DesktopBridgeClientOptions = {}): BackendClient {
  const httpClient = createHttpBackendClient(options.baseUrl);
  const shellClient = options.desktopShellClient ?? desktopShellClient;
  let backendStart: Promise<void> | undefined;

  const ensureBackendProcess = async () => {
    backendStart ??= shellClient.startBackendProcess().then(() => undefined).catch(() => undefined);
    await backendStart;
  };

  return new Proxy(httpClient, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }

      return async (...args: unknown[]) => {
        await ensureBackendProcess();
        return value.apply(target, args);
      };
    },
  }) as BackendClient;
}
