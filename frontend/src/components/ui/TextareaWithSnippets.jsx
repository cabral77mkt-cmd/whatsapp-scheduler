import React, { useState, useRef, useEffect, useCallback } from 'react';
import api from '../../lib/api';

/**
 * TextareaWithSnippets
 * Drop-in replacement for <textarea> that supports:
 *  - "/" shortcut → opens snippet dropdown
 *  - "✨ Reescrever" button with tone options (requires leadId)
 *
 * Props:
 *  value, onChange, placeholder, rows, disabled, className, style
 *  leadId       {number}  — needed for AI rewrite context
 *  leadName     {string}  — lead name for variable expansion + AI context
 *  eventName    {string}  — event name for variable expansion + AI context
 *  onKeyDown    {fn}      — passthrough
 */
export function TextareaWithSnippets({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
  className = '',
  style,
  leadId,
  leadName,
  eventName,
  onKeyDown,
}) {
  const textareaRef   = useRef(null);
  const dropdownRef   = useRef(null);

  const [snippets,     setSnippets]     = useState([]);
  const [slashQuery,   setSlashQuery]   = useState(null); // null = closed
  const [slashStart,   setSlashStart]   = useState(-1);   // index of "/" in value
  const [activeIdx,    setActiveIdx]    = useState(0);
  const [rewriting,    setRewriting]    = useState(false);
  const [toneMenuOpen, setToneMenuOpen] = useState(false);

  // Load snippets once
  useEffect(() => {
    api.get('/snippets').then(setSnippets).catch(() => {});
  }, []);

  // Filtered snippets
  const filtered = slashQuery === null
    ? []
    : snippets.filter(s =>
        s.shortcut.startsWith(slashQuery.toLowerCase()) ||
        s.body.toLowerCase().includes(slashQuery.toLowerCase())
      ).slice(0, 8);

  // Reset active index when list changes
  useEffect(() => { setActiveIdx(0); }, [filtered.length]);

  // Close dropdown on outside click
  useEffect(() => {
    if (slashQuery === null) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          textareaRef.current && !textareaRef.current.contains(e.target)) {
        setSlashQuery(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [slashQuery]);

  // Expand variables in snippet body
  function expandVars(body) {
    return body
      .replace(/\{nome\}/gi,   leadName   || '')
      .replace(/\{evento\}/gi, eventName  || '')
      .replace(/\{telefone\}/gi, '');
  }

  // Insert snippet at the "/" position
  function insertSnippet(snippet) {
    const expanded = expandVars(snippet.body);
    const before   = value.slice(0, slashStart);
    const after    = value.slice(slashStart + 1 + (slashQuery?.length || 0));
    const newVal   = before + expanded + after;
    onChange({ target: { value: newVal } });
    setSlashQuery(null);
    // Increment use counter (fire and forget)
    api.post(`/snippets/${snippet.id}/use`).catch(() => {});
    // Move cursor after inserted text
    setTimeout(() => {
      const pos = before.length + expanded.length;
      textareaRef.current?.setSelectionRange(pos, pos);
      textareaRef.current?.focus();
    }, 0);
  }

  const handleChange = (e) => {
    const newVal = e.target.value;
    onChange(e);

    const cursor = e.target.selectionStart;
    // Find last "/" before cursor
    const beforeCursor = newVal.slice(0, cursor);
    const slashIdx = beforeCursor.lastIndexOf('/');

    if (slashIdx === -1) {
      setSlashQuery(null);
      return;
    }

    // Only trigger if "/" is at start of line or after whitespace
    const charBefore = slashIdx > 0 ? newVal[slashIdx - 1] : '\n';
    if (charBefore !== '\n' && charBefore !== ' ' && charBefore !== '\t' && slashIdx !== 0) {
      setSlashQuery(null);
      return;
    }

    const query = beforeCursor.slice(slashIdx + 1);
    // Close if whitespace entered (user typed a space, not a shortcut)
    if (query.includes(' ') || query.includes('\n')) {
      setSlashQuery(null);
      return;
    }

    setSlashStart(slashIdx);
    setSlashQuery(query);
  };

  const handleKeyDown = (e) => {
    if (slashQuery !== null && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertSnippet(filtered[activeIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setSlashQuery(null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  // AI rewrite
  const handleRewrite = useCallback(async (tone) => {
    if (!value.trim()) return;
    setRewriting(true);
    setToneMenuOpen(false);
    try {
      const { rewritten } = await api.post('/snippets/ai-rewrite', {
        message:    value,
        tone,
        lead_name:  leadName,
        event_name: eventName,
      });
      onChange({ target: { value: rewritten } });
    } catch (e) {
      console.error('[TextareaWithSnippets] rewrite error', e);
    } finally {
      setRewriting(false);
    }
  }, [value, leadName, eventName, onChange]);

  const TONES = [
    { id: 'friendly', label: '😊 Amigável'    },
    { id: 'formal',   label: '👔 Formal'       },
    { id: 'short',    label: '⚡ Mais curta'   },
    { id: 'urgent',   label: '🚀 Com urgência' },
  ];

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={`input w-full resize-y ${className}`}
        style={style}
      />

      {/* Snippet dropdown */}
      {slashQuery !== null && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 z-50 rounded-xl overflow-hidden py-1"
          style={{
            bottom: 'calc(100% + 4px)',
            background:  'var(--bg-surface)',
            border:      '1px solid var(--border-strong)',
            boxShadow:   '0 8px 32px #00000055',
          }}
        >
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Snippets
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-disabled)' }}>↑↓ Enter</span>
          </div>
          {filtered.map((s, i) => (
            <button
              key={s.id}
              className="w-full text-left px-3 py-2 flex items-start gap-3 transition-colors"
              style={{
                background: i === activeIdx ? 'var(--gold-500)22' : 'transparent',
                borderLeft: i === activeIdx ? '2px solid var(--gold-500)' : '2px solid transparent',
              }}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => insertSnippet(s)}
            >
              <span
                className="text-xs font-mono font-bold shrink-0 mt-0.5 px-1.5 py-0.5 rounded"
                style={{ background: 'var(--bg-surface-2)', color: 'var(--gold-400)' }}
              >
                /{s.shortcut}
              </span>
              <div className="min-w-0">
                <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                  {s.body.slice(0, 60)}{s.body.length > 60 ? '…' : ''}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.category}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px]" style={{ color: 'var(--text-disabled)' }}>
          / para snippets
        </span>
        <div className="relative">
          <button
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-colors"
            style={{
              color:      rewriting ? 'var(--text-muted)' : 'var(--gold-400)',
              background: 'transparent',
              border:     '1px solid var(--border-default)',
            }}
            onClick={() => setToneMenuOpen(v => !v)}
            disabled={rewriting || !value.trim()}
          >
            {rewriting ? '⏳ Reescrevendo…' : '✨ Reescrever'}
          </button>
          {toneMenuOpen && (
            <div
              className="absolute right-0 bottom-full mb-1 rounded-xl overflow-hidden py-1 z-50 min-w-40"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', boxShadow: '0 8px 24px #00000066' }}
            >
              {TONES.map(t => (
                <button
                  key={t.id}
                  className="w-full text-left px-3 py-2 text-sm transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => handleRewrite(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
