import { FileAudio, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FileTranscriptionOutputFormat, FileTranscriptionTask } from '@honey/api-contracts';

import { backendClient } from '@/api/client';
import { desktopShellClient } from '@/api/desktopShell';
import { StatusBadge } from '@/components/StatusBadge';

const taskTone = {
  waiting: 'neutral',
  processing: 'info',
  completed: 'success',
  failed: 'danger',
} as const;

const taskLabel = {
  waiting: '等待中',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
};

const outputFormatOptions: Array<{ label: string; value: FileTranscriptionOutputFormat }> = [
  { label: 'SRT 字幕', value: 'srt' },
  { label: 'TXT 文本', value: 'txt' },
  { label: 'JSON 结构化', value: 'json' },
  { label: '合并 TXT', value: 'merged-txt' },
];

const getFileNameFromPath = (filePath: string) =>
  filePath.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? filePath;

export function FileTranscriptionPage() {
  const [tasks, setTasks] = useState<FileTranscriptionTask[]>([]);
  const [filePath, setFilePath] = useState('');
  const [outputFormats, setOutputFormats] = useState<FileTranscriptionOutputFormat[]>(['srt', 'txt', 'json', 'merged-txt']);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isPickingFile, setIsPickingFile] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let cancelled = false;

    void backendClient.listFileTranscriptionTasks().then((nextTasks) => {
      if (!cancelled) {
        setTasks(nextTasks);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleOutputFormat = (format: FileTranscriptionOutputFormat, checked: boolean) => {
    setOutputFormats(current => checked
      ? Array.from(new Set([...current, format]))
      : current.filter(item => item !== format));
  };

  const createTask = async () => {
    const normalizedPath = filePath.trim();
    if (!normalizedPath || outputFormats.length === 0) {
      setFeedback('请填写本地文件路径并至少选择一种输出格式');
      return;
    }

    setIsCreatingTask(true);
    setFeedback('');
    try {
      const task = await backendClient.createFileTranscriptionTask({
        filePath: normalizedPath,
        fileName: getFileNameFromPath(normalizedPath),
        outputFormats,
      });
      setTasks(current => [task, ...current.filter(item => item.id !== task.id)]);
      setFilePath('');
      setFeedback('文件转录任务已创建');
    } catch {
      setFeedback('文件转录任务创建失败');
    } finally {
      setIsCreatingTask(false);
    }
  };

  const pickFile = async () => {
    setIsPickingFile(true);
    setFeedback('');
    try {
      const selectedPath = await desktopShellClient.pickAudioFile();
      if (selectedPath) {
        setFilePath(selectedPath);
      }
    } catch {
      setFeedback('无法打开文件选择器，请手动填写本地文件路径');
    } finally {
      setIsPickingFile(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="eyebrow">批量音视频</span>
          <h2>文件转录</h2>
          <p>用于生成 SRT、TXT、JSON 和合并文本，可提交本机音频文件路径。</p>
        </div>
      </section>

      <section className="drop-zone">
        <FileAudio size={28} />
        <strong>拖入音频或视频文件</strong>
        <span>当前先支持填写本地文件路径创建转录任务。</span>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h3>创建任务</h3>
            <span>SRT / TXT / JSON / 合并 TXT</span>
          </div>
        </div>
        <label className="form-field" htmlFor="file-transcription-path">
          <span>本地文件路径</span>
          <input
            id="file-transcription-path"
            value={filePath}
            onChange={(event) => setFilePath(event.target.value)}
          />
        </label>
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={() => void pickFile()} disabled={isPickingFile}>
            <FolderOpen size={16} />
            选择文件
          </button>
        </div>
        <div className="checkbox-row">
          {outputFormatOptions.map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={outputFormats.includes(option.value)}
                onChange={(event) => toggleOutputFormat(option.value, event.target.checked)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <div className="button-row">
          <button type="button" className="primary-button" onClick={() => void createTask()} disabled={isCreatingTask}>
            开始转录
          </button>
        </div>
        {feedback ? <p className="inline-feedback">{feedback}</p> : null}
      </section>

      <section className="panel">
        <div className="section-heading">
          <h3>任务队列</h3>
          <StatusBadge label={`${tasks.length} 个任务`} tone="info" />
        </div>
        <div className="record-list">
          {tasks.map((task) => (
            <article className="file-task" key={task.id}>
              <div className="file-task__main">
                <FolderOpen size={18} />
                <div>
                  <strong>{task.fileName}</strong>
                  <span>{task.outputFormats.join(' / ')}</span>
                </div>
              </div>
              <StatusBadge label={taskLabel[task.status]} tone={taskTone[task.status]} />
              <progress value={task.progress} max={100} />
              {task.transcriptText ? <p>{task.transcriptText}</p> : null}
              <button type="button" className="secondary-button" disabled={!task.resultPath}>
                打开结果
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
