import type { ReactNode } from 'react';

export function FormField({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
