import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  AppSettingsSchema,
  HotwordEntrySchema,
  PersonaProfileSchema,
  ReplaceRuleSchema,
  TranscriptRecordSchema,
} from '@honey/api-contracts';

const PersistedHoneyDataSchema = z.object({
  records: z.array(TranscriptRecordSchema),
  hotwords: z.array(HotwordEntrySchema),
  rules: z.array(ReplaceRuleSchema),
  personas: z.array(PersonaProfileSchema),
  settings: AppSettingsSchema,
});

export type PersistedHoneyData = z.infer<typeof PersistedHoneyDataSchema>;

const clone = <T>(value: T): T => structuredClone(value);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const parsePersistedHoneyData = (rawData: unknown, defaultData: PersistedHoneyData): PersistedHoneyData => {
  const parsed = PersistedHoneyDataSchema.safeParse(rawData);
  if (parsed.success) {
    return parsed.data;
  }

  if (!isPlainObject(rawData) || !isPlainObject(rawData.settings)) {
    return clone(defaultData);
  }

  const migrated = PersistedHoneyDataSchema.safeParse({
    ...rawData,
    settings: {
      ...defaultData.settings,
      ...rawData.settings,
    },
  });

  return migrated.success ? migrated.data : clone(defaultData);
};

export interface LocalDataStore {
  load(defaultData: PersistedHoneyData): PersistedHoneyData;
  save(data: PersistedHoneyData): void;
}

export function createLocalDataStore(dataFilePath?: string): LocalDataStore {
  if (!dataFilePath) {
    return {
      load: defaultData => clone(defaultData),
      save: () => undefined,
    };
  }

  return {
    load(defaultData) {
      if (!existsSync(dataFilePath)) {
        return clone(defaultData);
      }

      try {
        return parsePersistedHoneyData(JSON.parse(readFileSync(dataFilePath, 'utf8')), defaultData);
      } catch {
        return clone(defaultData);
      }
    },
    save(data) {
      mkdirSync(dirname(dataFilePath), { recursive: true });
      const temporaryFilePath = `${dataFilePath}.tmp`;
      const backupFilePath = `${dataFilePath}.bak`;

      writeFileSync(temporaryFilePath, JSON.stringify(data, null, 2), 'utf8');
      if (existsSync(dataFilePath)) {
        copyFileSync(dataFilePath, backupFilePath);
      }
      renameSync(temporaryFilePath, dataFilePath);
    },
  };
}
