import React from 'react';

export function Input({ label, error, hint, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && <label className="label">{label}</label>}
      <input
        className={`input ${error ? '!border-danger !ring-danger/30' : ''} ${className}`}
        {...props}
      />
      {error && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{error}</p>}
      {hint && !error && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}
