import React from 'react';

export function EmptyState({ icon = '📭', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
      >
        {icon}
      </div>
      {title && (
        <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</p>
      )}
      {description && (
        <p className="text-sm max-w-xs" style={{ color: 'var(--text-secondary)' }}>{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
