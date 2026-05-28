import React from 'react';

function Spinner() {
  return (
    <span
      className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
      aria-hidden="true"
    />
  );
}

const VARIANTS = {
  primary: 'btn-primary',
  danger:  'btn-danger',
  ghost:   'btn-ghost',
  outline: 'btn-outline-gold',
};

const SIZES = {
  sm: 'text-xs !px-3 !py-1.5 !min-h-[36px]',
  md: '',
  lg: 'text-base !px-5 !py-3 !min-h-[52px]',
};

export function Button({
  variant  = 'primary',
  size     = 'md',
  loading  = false,
  className = '',
  children,
  ...props
}) {
  return (
    <button
      className={`${VARIANTS[variant] ?? VARIANTS.primary} ${SIZES[size]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
