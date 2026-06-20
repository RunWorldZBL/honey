import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listFileTranscriptionTasks = vi.hoisted(() => vi.fn(async () => [
  {
    id: 'task-file',
    fileName: '后端会议录音.wav',
    status: 'processing',
    progress: 64,
    outputFormats: ['srt', 'txt'],
  },
]));

vi.mock('@/api/client', () => ({
  backendClient: {
    listFileTranscriptionTasks,
  },
}));

import { FileTranscriptionPage } from './FileTranscriptionPage';

describe('FileTranscriptionPage', () => {
  beforeEach(() => {
    listFileTranscriptionTasks.mockClear();
  });

  it('loads file transcription tasks from the backend client', async () => {
    render(<FileTranscriptionPage />);

    expect(await screen.findByText('后端会议录音.wav')).toBeInTheDocument();
    expect(screen.getByText('1 个任务')).toBeInTheDocument();
    expect(screen.getByText('srt / txt')).toBeInTheDocument();
    expect(listFileTranscriptionTasks).toHaveBeenCalledOnce();
  });
});
