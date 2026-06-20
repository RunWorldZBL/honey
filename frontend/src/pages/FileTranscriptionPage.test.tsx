import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FileTranscriptionTask } from '@honey/api-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const seedFileTranscriptionTasks: FileTranscriptionTask[] = [
  {
    id: 'task-file',
    fileName: '后端会议录音.wav',
    status: 'processing',
    progress: 64,
    outputFormats: ['srt', 'txt'],
  },
];
const listFileTranscriptionTasks = vi.hoisted(() => vi.fn(async () => seedFileTranscriptionTasks));
const createFileTranscriptionTask = vi.hoisted(() => vi.fn(async (input: {
  filePath: string;
  fileName?: string;
  outputFormats: string[];
}) => ({
  id: 'task-created',
  fileName: input.fileName ?? '客户访谈.mp3',
  sourcePath: input.filePath,
  status: 'completed',
  progress: 100,
  outputFormats: input.outputFormats,
  transcriptText: '客户说明天继续推进。',
})));
const pickAudioFile = vi.hoisted(() => vi.fn(async () => 'D:\\recordings\\客户访谈.mp3'));
const openPath = vi.hoisted(() => vi.fn(async ({ path }: { path: string }) => ({
  ok: true as const,
  path,
})));

vi.mock('@/api/client', () => ({
  backendClient: {
    listFileTranscriptionTasks,
    createFileTranscriptionTask,
  },
}));

vi.mock('@/api/desktopShell', () => ({
  desktopShellClient: {
    pickAudioFile,
    openPath,
  },
}));

import { FileTranscriptionPage } from './FileTranscriptionPage';

describe('FileTranscriptionPage', () => {
  beforeEach(() => {
    listFileTranscriptionTasks.mockClear();
    createFileTranscriptionTask.mockClear();
    pickAudioFile.mockClear();
    openPath.mockClear();
    pickAudioFile.mockResolvedValue('D:\\recordings\\客户访谈.mp3');
  });

  it('loads file transcription tasks from the backend client', async () => {
    render(<FileTranscriptionPage />);

    expect(await screen.findByText('后端会议录音.wav')).toBeInTheDocument();
    expect(screen.getByText('1 个任务')).toBeInTheDocument();
    expect(screen.getByText('srt / txt')).toBeInTheDocument();
    expect(listFileTranscriptionTasks).toHaveBeenCalledOnce();
  });

  it('creates an MP3 file transcription task from a local file path', async () => {
    const user = userEvent.setup();
    render(<FileTranscriptionPage />);

    await screen.findByText('后端会议录音.wav');
    await user.type(screen.getByLabelText('本地文件路径'), 'D:/recordings/客户访谈.mp3');
    await user.click(screen.getByRole('checkbox', { name: 'SRT 字幕' }));
    await user.click(screen.getByRole('button', { name: '开始转录' }));

    expect(createFileTranscriptionTask).toHaveBeenCalledWith({
      filePath: 'D:/recordings/客户访谈.mp3',
      fileName: '客户访谈.mp3',
      outputFormats: ['txt', 'json', 'merged-txt'],
    });
    expect(await screen.findByText('客户访谈.mp3')).toBeInTheDocument();
    expect(screen.getByText('客户说明天继续推进。')).toBeInTheDocument();
  });

  it('fills the local file path from the native desktop file picker', async () => {
    const user = userEvent.setup();
    render(<FileTranscriptionPage />);

    await screen.findByText('后端会议录音.wav');
    await user.click(screen.getByRole('button', { name: '选择文件' }));

    expect(pickAudioFile).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('本地文件路径')).toHaveValue('D:\\recordings\\客户访谈.mp3');

    await user.click(screen.getByRole('button', { name: '开始转录' }));

    expect(createFileTranscriptionTask).toHaveBeenCalledWith({
      filePath: 'D:\\recordings\\客户访谈.mp3',
      fileName: '客户访谈.mp3',
      outputFormats: ['srt', 'txt', 'json', 'merged-txt'],
    });
  });

  it('opens the generated result directory for completed file transcription tasks', async () => {
    const user = userEvent.setup();
    listFileTranscriptionTasks.mockResolvedValueOnce([
      {
        id: 'task-completed',
        fileName: '客户访谈.mp3',
        status: 'completed',
        progress: 100,
        outputFormats: ['txt', 'json'],
        resultPath: 'D:\\honey\\file-transcriptions\\task-completed',
        transcriptText: '客户说明天继续推进。',
      },
    ]);

    render(<FileTranscriptionPage />);

    expect(await screen.findByText('客户访谈.mp3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '打开结果' }));

    expect(openPath).toHaveBeenCalledWith({
      path: 'D:\\honey\\file-transcriptions\\task-completed',
    });
  });
});
