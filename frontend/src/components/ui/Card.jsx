import React from 'react';

export function Card({ hoverable = false, className = '', children, ...props }) {
  return (
    <div className={`${hoverable ? 'card-hover' : 'card'} ${className}`} {...props}>
      {children}
    </div>
  );
}
