import { FileAudio, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FileTranscriptionTask } from '@honey/api-contracts';

import { backendClient } from '@/api/client';
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

export function FileTranscriptionPage() {
  const [tasks, setTasks] = useState<FileTranscriptionTask[]>([]);

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

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="eyebrow">批量音视频</span>
          <h2>文件转录</h2>
          <p>未来用于生成 SRT、TXT、JSON 和合并文本，第一版只展示任务队列。</p>
        </div>
      </section>

      <section className="drop-zone">
        <FileAudio size={28} />
        <strong>拖入音频或视频文件</strong>
        <span>文件处理尚未接入真实后端，当前区域用于确认交互形态。</span>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h3>输出格式</h3>
          <span>SRT / TXT / JSON / 合并 TXT</span>
        </div>
        <div className="checkbox-row">
          {['SRT 字幕', 'TXT 文本', 'JSON 结构化', '合并 TXT'].map((label) => (
            <label key={label}>
              <input type="checkbox" defaultChecked />
              {label}
            </label>
          ))}
        </div>
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
