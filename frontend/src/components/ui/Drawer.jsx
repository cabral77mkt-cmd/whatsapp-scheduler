import React, { useEffect } from 'react';

export function Drawer({ open, onClose, title, children, width = 'max-w-md', side = 'right' }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const translateClosed = side === 'right' ? 'translate-x-full' : '-translate-x-full';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.70)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 ${side}-0 z-50 h-full w-full ${width} flex flex-col
          transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : translateClosed}`}
        style={{ background: 'var(--bg-surface)', borderLeft: side === 'right' ? '1px solid var(--border-default)' : 'none', borderRight: side === 'left' ? '1px solid var(--border-default)' : 'none' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-lg"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </>
  );
}
