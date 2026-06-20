import { Inbox } from 'lucide-react';

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <Inbox size={24} />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}
