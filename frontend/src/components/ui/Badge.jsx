import React from 'react';

const VARIANTS = {
  gold:    'badge-gold',
  success: 'badge-success',
  warning: 'badge-warning',
  danger:  'badge-danger',
  info:    'badge-info',
  muted:   'badge-muted',
};

export function Badge({ variant = 'muted', className = '', children }) {
  return (
    <span className={`badge ${VARIANTS[variant] ?? VARIANTS.muted} ${className}`}>
      {children}
    </span>
  );
}
