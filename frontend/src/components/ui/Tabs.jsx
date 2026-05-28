import React from 'react';

export function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div
      className={`flex items-center gap-1 p-1 rounded-lg ${className}`}
      style={{ background: 'var(--bg-surface)' }}
    >
      {tabs.map((tab) => {
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all"
            style={{
              background: isActive ? 'var(--gold-500)' : 'transparent',
              color: isActive ? '#000' : 'var(--text-secondary)',
            }}
          >
            {tab.icon && <span>{tab.icon}</span>}
            {tab.label}
            {tab.count != null && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: isActive ? 'rgba(0,0,0,0.2)' : 'var(--bg-surface-2)',
                  color: isActive ? '#000' : 'var(--text-muted)',
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
