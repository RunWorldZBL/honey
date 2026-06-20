import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  AudioCaptureUploadInputSchema,
  CreateFileTranscriptionTaskInputSchema,
  DictationSessionInputSchema,
  HotwordEntrySchema,
  PersonaDictationSessionInputSchema,
  PersonaProfileSchema,
  ReplaceRuleSchema,
  StartLocalLlmRuntimeRequestSchema,
  UpdateAppSettingsSchema,
} from '@honey/api-contracts';

import type { HoneyService } from './honeyService.js';

type RouteHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

class BadRequestError extends Error {
  constructor(message = 'invalid_request') {
    super(message);
  }
}

const allowedOrigins = new Set([
  'http://localhost:1420',
  'http://127.0.0.1:1420',
]);

const resolveCorsOrigin = (request: IncomingMessage) => {
  const origin = request.headers.origin;
  return origin && allowedOrigins.has(origin) ? origin : 'http://localhost:1420';
};

const sendJson = (request: IncomingMessage, response: ServerResponse, statusCode: number, body: unknown) => {
  response.writeHead(statusCode, {
    'access-control-allow-origin': resolveCorsOrigin(request),
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
};

const readJsonBody = async <T>(request: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  try {
    return (rawBody ? JSON.parse(rawBody) : {}) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new BadRequestError('invalid_json');
    }

    throw error;
  }
};

const isValidRegexPattern = (pattern: string) => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

const createRoutes = (service: HoneyService): Record<string, RouteHandler> => ({
  'GET /api/health': async (request, response) => {
    sendJson(request, response, 200, {
      service: 'honey-backend',
      mode: 'local',
    });
  },
  'GET /api/runtime/health': async (request, response) => {
    sendJson(request, response, 200, await service.getRuntimeHealth());
  },
  'GET /api/runtime/llm': async (request, response) => {
    sendJson(request, response, 200, await service.getLocalLlmRuntimeStatus());
  },
  'POST /api/runtime/llm/start': async (request, response) => {
    const body = StartLocalLlmRuntimeRequestSchema.safeParse(await readJsonBody<unknown>(request));
    if (!body.success) {
      sendJson(request, response, 400, { error: 'invalid_request' });
      return;
    }

    sendJson(request, response, 200, await service.startLocalLlmRuntime(body.data));
  },
  'POST /api/runtime/llm/stop': async (request, response) => {
    sendJson(request, response, 200, await service.stopLocalLlmRuntime());
  },
  'GET /api/models': async (request, response) => {
    sendJson(request, response, 200, await service.listModels());
  },
  'GET /api/settings': async (request, response) => {
    sendJson(request, response, 200, await service.getSettings());
  },
  'PATCH /api/settings': async (request, response) => {
    const body = UpdateAppSettingsSchema.safeParse(await readJsonBody<unknown>(request));
    if (!body.success) {
      sendJson(request, response, 400, { error: 'invalid_request' });
      return;
    }

    sendJson(request, response, 200, await service.updateSettings(body.data));
  },
  'GET /api/transcripts': async (request, response) => {
    sendJson(request, response, 200, await service.listTranscriptRecords());
  },
  'POST /api/audio-captures': async (request, response) => {
    const body = AudioCaptureUploadInputSchema.safeParse(await readJsonBody<unknown>(request));
    if (!body.success) {
      sendJson(request, response, 400, { error: 'invalid_request' });
      return;
    }

    sendJson(request, response, 200, await service.saveAudioCapture(body.data));
  },
  'POST /api/dictation/direct-session': async (request, response) => {
    const body = DictationSessionInputSchema.safeParse(await readJsonBody<unknown>(request));
    if (!body.success) {
      sendJson(request, response, 400, { error: 'invalid_request' });
      return;
    }

    sendJson(request, response, 200, await service.runDirectDictationSession(body.data));
  },
  'POST /api/dictation/persona-session': async (request, response) => {
    const body = PersonaDictationSessionInputSchema.safeParse(await readJsonBody<unknown>(request));
    if (!body.success) {
      sendJson(request, response, 400, { error: 'invalid_request' });
      return;
    }

    sendJson(request, response, 200, await service.runPersonaDictationSession(body.data));
  },
  'GET /api/file-tasks': async (request, response) => {
    sendJson(request, response, 200, await service.listFileTranscriptionTasks());
  },
  'POST /api/file-tasks': async (request, response) => {
    const body = CreateFileTranscriptionTaskInputSchema.safeParse(await readJsonBody<unknown>(request));
    if (!body.success) {
      sendJson(request, response, 400, { error: 'invalid_request' });
      return;
    }

    sendJson(request, response, 200, await service.createFileTranscriptionTask(body.data));
  },
  'GET /api/tray-actions': async (request, response) => {
    sendJson(request, response, 200, await service.listTrayActions());
  },
  'GET /api/hotwords': async (request, response) => {
    sendJson(request, response, 200, await service.listHotwords());
  },
  'POST /api/hotwords': async (request, response) => {
    const body = HotwordEntrySchema.safeParse(await readJsonBody<unknown>(request));
    if (!body.success) {
      sendJson(request, response, 400, { error: 'invalid_request' });
      return;
    }

    sendJson(request, response, 200, await service.saveHotword(body.data));
  },
  'GET /api/rules': async (request, response) => {
    sendJson(request, response, 200, await service.listRules());
  },
  'POST /api/rules': async (request, response) => {
    const body = ReplaceRuleSchema.safeParse(await readJsonBody<unknown>(request));
    if (!body.success || (body.data.isRegex && !isValidRegexPattern(body.data.pattern))) {
      sendJson(request, response, 400, { error: 'invalid_request' });
      return;
    }

    sendJson(request, response, 200, await service.saveRule(body.data));
  },
  'GET /api/personas': async (request, response) => {
    sendJson(request, response, 200, await service.listPersonas());
  },
  'POST /api/personas': async (request, response) => {
    const body = PersonaProfileSchema.safeParse(await readJsonBody<unknown>(request));
    if (!body.success) {
      sendJson(request, response, 400, { error: 'invalid_request' });
      return;
    }

    sendJson(request, response, 200, await service.savePersona(body.data));
  },
  'POST /api/rules/preview': async (request, response) => {
    const body = await readJsonBody<{ input?: string }>(request);
    sendJson(request, response, 200, {
      output: await service.previewRules(body.input ?? ''),
    });
  },
});

export function createHoneyHttpServer(service: HoneyService): Server {
  const routes = createRoutes(service);

  return createServer((request, response) => {
    void (async () => {
      if (request.method === 'OPTIONS') {
        sendJson(request, response, 204, null);
        return;
      }

      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const route = routes[`${request.method} ${url.pathname}`];

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/transcripts/')) {
        const id = decodeURIComponent(url.pathname.replace('/api/transcripts/', ''));
        sendJson(request, response, 200, await service.deleteTranscriptRecord(id));
        return;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/hotwords/')) {
        const id = decodeURIComponent(url.pathname.replace('/api/hotwords/', ''));
        sendJson(request, response, 200, await service.deleteHotword(id));
        return;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/rules/')) {
        const id = decodeURIComponent(url.pathname.replace('/api/rules/', ''));
        sendJson(request, response, 200, await service.deleteRule(id));
        return;
      }

      if (request.method === 'DELETE' && url.pathname === '/api/personas/memory') {
        sendJson(request, response, 200, await service.clearPersonaMemory());
        return;
      }

      const personaMemoryMatch = url.pathname.match(/^\/api\/personas\/([^/]+)\/memory$/);
      if (request.method === 'DELETE' && personaMemoryMatch?.[1]) {
        sendJson(request, response, 200, await service.clearPersonaMemory(decodeURIComponent(personaMemoryMatch[1])));
        return;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/personas/')) {
        const id = decodeURIComponent(url.pathname.replace('/api/personas/', ''));
        sendJson(request, response, 200, await service.deletePersona(id));
        return;
      }

      if (!route) {
        sendJson(request, response, 404, { error: 'not_found' });
        return;
      }

      await route(request, response);
    })().catch((error: unknown) => {
      if (error instanceof BadRequestError) {
        sendJson(request, response, 400, {
          error: error.message,
        });
        return;
      }

      sendJson(request, response, 500, {
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  });
}
