import React from 'react';

export function Skeleton({ className = '', width, height }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{
        background: 'var(--bg-surface-2)',
        width: width || '100%',
        height: height || '1rem',
      }}
    />
  );
}

export function SkeletonCard({ rows = 3 }) {
  return (
    <div className="card space-y-3">
      <Skeleton height="1.25rem" width="60%" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height="0.875rem" width={i === rows - 1 ? '40%' : '100%'} />
      ))}
    </div>
  );
}
