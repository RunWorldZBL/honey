import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { LocalModelInventoryItem } from '@honey/api-contracts';

const funAsrNanoRequiredFiles = [
  'Fun-ASR-Nano-Encoder-Adaptor.int8.onnx',
  'Fun-ASR-Nano-CTC.int8.onnx',
  'Fun-ASR-Nano-Decoder.q8_0.gguf',
  'tokens.txt',
];

const qwenGgufModels = [
  {
    id: 'qwen3-0_6b',
    name: 'Qwen3 0.6B GGUF',
    file: 'Qwen3-0.6B-Q8_0.gguf',
  },
  {
    id: 'qwen3-1_7b',
    name: 'Qwen3 1.7B GGUF',
    file: 'Qwen_Qwen3-1.7B-Q4_K_M.gguf',
  },
  {
    id: 'qwen3-4b',
    name: 'Qwen3 4B Instruct GGUF',
    file: 'Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
  },
];

const exists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const knownQwenGgufFiles = new Set(qwenGgufModels.map(model => model.file.toLowerCase()));

const createLocalGgufModelId = (fileName: string) => {
  const baseName = fileName.replace(/\.gguf$/i, '');
  const slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return `local-gguf-${slug || Buffer.from(fileName, 'utf8').toString('hex').slice(0, 8)}`;
};

const scanCustomGgufModels = async (llmModelRoot: string): Promise<LocalModelInventoryItem[]> => {
  try {
    const entries = await readdir(llmModelRoot, { withFileTypes: true });

    return entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .filter(fileName => fileName.toLowerCase().endsWith('.gguf'))
      .filter(fileName => !knownQwenGgufFiles.has(fileName.toLowerCase()))
      .sort((left, right) => left.localeCompare(right))
      .map(fileName => ({
        id: createLocalGgufModelId(fileName),
        name: fileName.replace(/\.gguf$/i, ''),
        kind: 'llm',
        engine: 'custom',
        status: 'installed',
        modelRoot: llmModelRoot,
        requiredFiles: [fileName],
        requiredFilesMissing: [],
      }));
  } catch {
    return [];
  }
};

export async function scanFunAsrNanoModel(modelRoot: string): Promise<LocalModelInventoryItem> {
  const requiredFilesMissing: string[] = [];

  for (const file of funAsrNanoRequiredFiles) {
    if (!(await exists(join(modelRoot, file)))) {
      requiredFilesMissing.push(file);
    }
  }

  return {
    id: 'fun-asr-nano',
    name: 'Fun-ASR-Nano',
    kind: 'asr',
    engine: 'fun-asr-nano',
    status: requiredFilesMissing.length === 0 ? 'installed' : 'missing',
    modelRoot,
    requiredFiles: [...funAsrNanoRequiredFiles],
    requiredFilesMissing,
  };
}

const scanQwenGgufModel = async (
  llmModelRoot: string,
  model: typeof qwenGgufModels[number],
): Promise<LocalModelInventoryItem> => {
  const requiredFilesMissing = await exists(join(llmModelRoot, model.file))
    ? []
    : [model.file];

  return {
    id: model.id,
    name: model.name,
    kind: 'llm',
    engine: 'qwen3',
    status: requiredFilesMissing.length === 0 ? 'installed' : 'missing',
    modelRoot: llmModelRoot,
    requiredFiles: [model.file],
    requiredFilesMissing,
  };
};

export async function scanLocalModelInventory(
  modelRoot: string,
  llmModelRoot = '../models',
): Promise<LocalModelInventoryItem[]> {
  return [
    await scanFunAsrNanoModel(modelRoot),
    ...await Promise.all(qwenGgufModels.map(model => scanQwenGgufModel(llmModelRoot, model))),
    ...await scanCustomGgufModels(llmModelRoot),
  ];
}
