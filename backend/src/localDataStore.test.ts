import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLocalDataStore, type PersistedHoneyData } from './localDataStore.js';
import { seedHotwords, seedPersonas, seedRules, seedSettings, seedTranscriptRecords } from './seedData.js';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function testLocalDataStoreKeepsBackupOnOverwrite() {
  const dataDir = await mkdtemp(join(tmpdir(), 'honey-store-'));
  const dataFilePath = join(dataDir, 'honey-data.json');
  const backupFilePath = `${dataFilePath}.bak`;
  const store = createLocalDataStore(dataFilePath);
  const firstData: PersistedHoneyData = {
    records: seedTranscriptRecords,
    hotwords: seedHotwords,
    rules: seedRules,
    personas: seedPersonas,
    settings: seedSettings,
  };
  const secondData: PersistedHoneyData = {
    ...firstData,
    settings: {
      ...seedSettings,
      hotkey: 'F7',
    },
  };

  try {
    store.save(firstData);
    store.save(secondData);

    const currentData = JSON.parse(await readFile(dataFilePath, 'utf8')) as PersistedHoneyData;
    const backupData = JSON.parse(await readFile(backupFilePath, 'utf8')) as PersistedHoneyData;

    assertEqual(existsSync(`${dataFilePath}.tmp`), false, 'temporary local data file should not remain after save');
    assertEqual(currentData.settings.hotkey, 'F7', 'current local data file should contain latest save');
    assertEqual(backupData.settings.hotkey, 'F9', 'backup local data file should contain previous save');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testLocalDataStoreMigratesLegacySettingsWithModelDirectoryDefaults() {
  const dataDir = await mkdtemp(join(tmpdir(), 'honey-store-legacy-'));
  const dataFilePath = join(dataDir, 'honey-data.json');
  const store = createLocalDataStore(dataFilePath);
  const defaultData: PersistedHoneyData = {
    records: seedTranscriptRecords,
    hotwords: seedHotwords,
    rules: seedRules,
    personas: seedPersonas,
    settings: seedSettings,
  };
  const {
    asrModelRoot: _asrModelRoot,
    llmModelRoot: _llmModelRoot,
    llamaServerPath: _llamaServerPath,
    ...legacySettings
  } = {
    ...seedSettings,
    hotkey: 'F6',
  };

  try {
    await writeFile(dataFilePath, JSON.stringify({
      records: seedTranscriptRecords,
      hotwords: seedHotwords,
      rules: seedRules,
      personas: seedPersonas,
      settings: legacySettings,
    }), 'utf8');

    const loadedData = store.load(defaultData);

    assertEqual(loadedData.settings.hotkey, 'F6', 'legacy settings should keep existing user values');
    assertEqual(loadedData.settings.asrModelRoot, seedSettings.asrModelRoot, 'legacy settings should receive the default ASR model directory');
    assertEqual(loadedData.settings.llmModelRoot, seedSettings.llmModelRoot, 'legacy settings should receive the default LLM model directory');
    assertEqual(loadedData.settings.llamaServerPath, seedSettings.llamaServerPath, 'legacy settings should receive the default llama.cpp runtime path');
    assertEqual(loadedData.records.length, seedTranscriptRecords.length, 'legacy local data should keep transcript records');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

await testLocalDataStoreKeepsBackupOnOverwrite();
await testLocalDataStoreMigratesLegacySettingsWithModelDirectoryDefaults();
