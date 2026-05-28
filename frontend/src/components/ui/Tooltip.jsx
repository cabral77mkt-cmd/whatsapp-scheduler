import React, { useState, useRef, useEffect } from 'react';

/**
 * Tooltip — lightweight hover tooltip that follows design tokens
 *
 * Usage:
 *   <Tooltip content="Salvar lead">
 *     <button>💾</button>
 *   </Tooltip>
 *
 * Props:
 *   content    {string|ReactNode}  — tooltip text/content
 *   placement  {'top'|'bottom'|'left'|'right'}  — default 'top'
 *   delay      {number}  — ms before showing (default 400)
 *   children   {ReactNode}  — trigger element
 */
export function Tooltip({ content, placement = 'top', delay = 400, children }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);
  const wrapRef  = useRef(null);

  if (!content) return children;

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  };
  const hide = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
  };

  // Clean up timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const placementStyles = {
    top:    { bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' },
    bottom: { top:    'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' },
    left:   { right:  'calc(100% + 6px)', top:  '50%', transform: 'translateY(-50%)' },
    right:  { left:   'calc(100% + 6px)', top:  '50%', transform: 'translateY(-50%)' },
  };

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className="absolute z-[9999] pointer-events-none whitespace-nowrap px-2 py-1 rounded-lg text-xs font-medium"
          style={{
            ...placementStyles[placement],
            background:  'var(--bg-surface)',
            color:       'var(--text-primary)',
            border:      '1px solid var(--border-strong)',
            boxShadow:   '0 4px 16px #00000066',
            maxWidth:    240,
            whiteSpace:  'normal',
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
