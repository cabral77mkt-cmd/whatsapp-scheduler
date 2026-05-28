import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

/* ── Static navigation items ─────────────────────────────── */
const NAV_ITEMS = [
  { id: 'nav-dashboard',      label: 'Dashboard',          icon: '📊', to: '/' },
  { id: 'nav-inbox',          label: 'Inbox',              icon: '💬', to: '/inbox' },
  { id: 'nav-conectar',       label: 'Conectar WhatsApp',  icon: '🔗', to: '/conectar' },
  { id: 'nav-agendar',        label: 'Agendar Mensagem',   icon: '⏰', to: '/agendar' },
  { id: 'nav-massa',          label: 'Envio em Massa',     icon: '📢', to: '/envio-em-massa' },
  { id: 'nav-mensagens',      label: 'Mensagens',          icon: '📋', to: '/mensagens' },
  { id: 'nav-contatos',       label: 'Contatos',           icon: '👥', to: '/contatos' },
  { id: 'nav-entregas',       label: 'Verificar Entregas', icon: '🔍', to: '/verificar-entregas' },
  { id: 'nav-vip',            label: 'Grupos VIP',         icon: '👑', to: '/grupos-vip' },
  { id: 'nav-tickfy',         label: 'TICKFY',             icon: '🎟️', to: '/tickfy' },
  { id: 'nav-kanban',         label: 'Funil (Kanban)',     icon: '🗂️', to: '/crm/kanban' },
  { id: 'nav-leads',          label: 'Leads',              icon: '👥', to: '/crm/leads' },
  { id: 'nav-followups',      label: 'Follow-ups',         icon: '📨', to: '/crm/followups' },
  { id: 'nav-calendar',       label: 'Calendário CRM',     icon: '📅', to: '/crm/calendar' },
  { id: 'nav-reports',        label: 'Relatórios CRM',     icon: '📈', to: '/crm/reports' },
  { id: 'nav-gestao',         label: 'Painel Gerencial',   icon: '📊', to: '/crm/gestao' },
  { id: 'nav-fin-dashboard',  label: 'Dashboard Finanças', icon: '📈', to: '/fin/dashboard' },
  { id: 'nav-fin-trans',      label: 'Transações',         icon: '💳', to: '/fin/transacoes' },
  { id: 'nav-fin-contas',     label: 'Contas a Pagar',     icon: '⏰', to: '/fin/contas' },
  { id: 'nav-fin-fluxo',      label: 'Fluxo de Caixa',    icon: '📉', to: '/fin/fluxo' },
];

const STAGE_LABELS = {
  new: 'Novo', contacted: 'Contatado', qualified: 'Qualificado',
  proposal: 'Proposta', negotiation: 'Negociação', won: 'Ganho', lost: 'Perdido',
};

const TEMP_LABELS = { hot: '🔥', warm: '🌤️', cold: '🧊' };

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

/* ── Result row ──────────────────────────────────────────── */
function ResultRow({ item, isActive, onSelect }) {
  const ref = useRef(null);
  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isActive]);

  return (
    <button
      ref={ref}
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
      style={{
        background: isActive ? 'var(--bg-surface-2)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--gold-500)' : '2px solid transparent',
      }}
    >
      <span className="text-base w-5 text-center shrink-0">{item.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {item.label}
        </p>
        {item.sub && (
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{item.sub}</p>
        )}
      </div>
      {item.badge && (
        <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}>
          {item.badge}
        </span>
      )}
    </button>
  );
}

/* ── Section header ──────────────────────────────────────── */
function SectionLabel({ label }) {
  return (
    <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-disabled)' }}>
      {label}
    </p>
  );
}

/* ── Main component ──────────────────────────────────────── */
export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ leads: [], contacts: [], messages: [] });
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debouncedQuery = useDebounce(query, 250);

  /* Focus input when opened */
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setResults({ leads: [], contacts: [], messages: [] });
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  /* Fetch from backend */
  useEffect(() => {
    if (!open) return;
    if (debouncedQuery.trim().length < 1) {
      setResults({ leads: [], contacts: [], messages: [] });
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.get(`/search?q=${encodeURIComponent(debouncedQuery.trim())}`)
      .then((data) => { if (!cancelled) setResults(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedQuery, open]);

  /* Build flat items list for keyboard nav */
  const items = buildItems(query, results);

  /* Reset active index when items change */
  useEffect(() => { setActiveIndex(0); }, [items.length]);

  const select = useCallback((item) => {
    if (item.to) navigate(item.to);
    onClose();
  }, [navigate, onClose]);

  /* Keyboard handler */
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[activeIndex]) select(items[activeIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed z-50 w-full max-w-xl mx-auto"
        style={{
          top: '15vh',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: '0.75rem',
          boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-4"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          <span style={{ color: 'var(--text-muted)' }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar leads, contatos, mensagens, páginas…"
            className="flex-1 py-4 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          {loading && (
            <span className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--gold-500)', borderTopColor: 'transparent' }} />
          )}
          <kbd className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-disabled)' }}>Esc</kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
          {items.length === 0 && query.trim().length > 0 && !loading && (
            <p className="px-4 py-8 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
              Nenhum resultado para "{query}"
            </p>
          )}

          {items.length === 0 && query.trim().length === 0 && (
            <div className="py-3">
              <SectionLabel label="Navegação Rápida" />
              {NAV_ITEMS.slice(0, 6).map((item, i) => (
                <ResultRow key={item.id} item={item} isActive={false} onSelect={() => select(item)} />
              ))}
              <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-disabled)' }}>
                Digite para buscar leads, contatos e mensagens
              </p>
            </div>
          )}

          {renderGrouped(items, activeIndex, select)}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-4 px-4 py-2 text-xs"
          style={{ borderTop: '1px solid var(--border-default)', color: 'var(--text-disabled)' }}
        >
          <span><kbd style={{ background: 'var(--bg-surface-2)', padding: '1px 4px', borderRadius: 3 }}>↑↓</kbd> navegar</span>
          <span><kbd style={{ background: 'var(--bg-surface-2)', padding: '1px 4px', borderRadius: 3 }}>↵</kbd> abrir</span>
          <span><kbd style={{ background: 'var(--bg-surface-2)', padding: '1px 4px', borderRadius: 3 }}>Esc</kbd> fechar</span>
        </div>
      </div>
    </>
  );
}

/* ── Helpers ─────────────────────────────────────────────── */
function buildItems(query, results) {
  const items = [];
  const q = query.trim().toLowerCase();

  /* Navigation items (filtered by query or shown when empty) */
  if (q.length > 0) {
    const navMatches = NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(q));
    navMatches.forEach((n) => items.push({ ...n, _group: 'nav' }));
  }

  /* Leads */
  (results.leads || []).forEach((l) => {
    items.push({
      id: `lead-${l.id}`,
      icon: TEMP_LABELS[l.temperature] || '👤',
      label: l.name || l.phone,
      sub: `${l.phone} · ${STAGE_LABELS[l.stage] || l.stage}`,
      to: `/crm/leads?id=${l.id}`,
      _group: 'leads',
    });
  });

  /* Contacts */
  (results.contacts || []).forEach((c) => {
    items.push({
      id: `contact-${c.id}`,
      icon: '👥',
      label: c.name || c.phone,
      sub: c.phone,
      to: `/contatos`,
      _group: 'contacts',
    });
  });

  /* Scheduled messages */
  (results.messages || []).forEach((m) => {
    const at = m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    items.push({
      id: `msg-${m.id}`,
      icon: '⏰',
      label: m.phone,
      sub: m.preview,
      badge: at,
      to: `/mensagens`,
      _group: 'messages',
    });
  });

  return items;
}

function renderGrouped(items, activeIndex, onSelect) {
  if (items.length === 0) return null;

  const groups = [
    { key: 'nav',      label: 'Páginas' },
    { key: 'leads',    label: 'Leads' },
    { key: 'contacts', label: 'Contatos' },
    { key: 'messages', label: 'Mensagens Agendadas' },
  ];

  let offset = 0;
  return groups.map(({ key, label }) => {
    const group = items.filter((i) => i._group === key);
    if (group.length === 0) { return null; }
    const startOffset = offset;
    offset += group.length;
    return (
      <div key={key}>
        <SectionLabel label={label} />
        {group.map((item, i) => (
          <ResultRow
            key={item.id}
            item={item}
            isActive={activeIndex === startOffset + i}
            onSelect={() => onSelect(item)}
          />
        ))}
      </div>
    );
  });
}
