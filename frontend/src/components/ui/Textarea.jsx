import React from 'react';

export function Textarea({ label, error, hint, className = '', rows = 3, ...props }) {
  return (
    <div className="w-full">
      {label && <label className="label">{label}</label>}
      <textarea
        rows={rows}
        className={`input resize-none ${error ? '!border-danger' : ''} ${className}`}
        {...props}
      />
      {error && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{error}</p>}
      {hint && !error && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}
