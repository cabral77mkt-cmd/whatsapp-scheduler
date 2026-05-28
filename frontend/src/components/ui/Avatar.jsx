import React from 'react';

const SIZES = {
  xs: { box: 'w-5 h-5', text: '9px' },
  sm: { box: 'w-6 h-6', text: '10px' },
  md: { box: 'w-8 h-8', text: '13px' },
  lg: { box: 'w-10 h-10', text: '15px' },
  xl: { box: 'w-12 h-12', text: '18px' },
};

export function Avatar({ name, src, size = 'md', className = '' }) {
  const sz = SIZES[size] ?? SIZES.md;
  const initial = name?.[0]?.toUpperCase() || '?';

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sz.box} rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sz.box} rounded-full flex items-center justify-center font-bold shrink-0 ${className}`}
      style={{
        background: 'rgba(212,175,55,0.15)',
        color: 'var(--gold-400)',
        fontSize: sz.text,
      }}
    >
      {initial}
    </div>
  );
}
