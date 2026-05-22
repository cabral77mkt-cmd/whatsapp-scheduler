import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const PRIORITY_COLOR = {
  urgent: 'border-l-red-500',
  high:   'border-l-amber-500',
  normal: 'border-l-zinc-600',
  low:    'border-l-zinc-700',
};

const TYPE_LINK = {
  cold_lead:          '/crm/kanban',
  followup_overdue:   '/crm/followups',
  hot_no_contact:     '/inbox',
  proposal_expiring:  '/crm/kanban',
  goal_at_risk:       '/crm/goals',
  goal_achieved:      '/crm/goals',
};

export default function AlertsPanel() {
  const [open,   setOpen]   = useState(false);
  const [data,   setData]   = useState({ alerts: [], unread_count: 0 });
  const panelRef = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const res = await api.get('/crm/alerts');
      if (res && typeof res === 'object' && Array.isArray(res.alerts)) {
        setData(res);
      }
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // refresh a cada minuto
    return () => clearInterval(interval);
  }, [load]);

  // Fecha ao clicar fora
  useEffect(() => {
    function onClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function markRead(id) {
    await api.patch(`/crm/alerts/${id}/read`).catch(() => {});
    setData(d => ({
      ...d,
      alerts: d.alerts.map(a => a.id === id ? { ...a, read_at: new Date().toISOString() } : a),
      unread_count: Math.max(0, d.unread_count - 1),
    }));
  }

  async function dismiss(id) {
    await api.delete(`/crm/alerts/${id}`).catch(() => {});
    setData(d => ({
      ...d,
      alerts: d.alerts.filter(a => a.id !== id),
      unread_count: d.alerts.find(a => a.id === id && !a.read_at) ? Math.max(0, d.unread_count - 1) : d.unread_count,
    }));
  }

  async function markAllRead() {
    await api.patch('/crm/alerts/read-all').catch(() => {});
    setData(d => ({
      ...d,
      alerts: d.alerts.map(a => ({ ...a, read_at: a.read_at || new Date().toISOString() })),
      unread_count: 0,
    }));
  }

  function handleClick(alert) {
    markRead(alert.id);
    const link = TYPE_LINK[alert.type];
    if (link) {
      if (alert.entity_type === 'lead' && alert.entity_id) {
        navigate(`/crm/kanban`);
      } else {
        navigate(link);
      }
    }
    setOpen(false);
  }

  const { alerts, unread_count } = data;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) load(); }}
        className="relative p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        title="Alertas"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread_count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread_count > 9 ? '9+' : unread_count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-10 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <span className="text-white font-semibold text-sm">
              Alertas {unread_count > 0 && <span className="text-amber-400">({unread_count} novos)</span>}
            </span>
            <div className="flex items-center gap-2">
              {unread_count > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Marcar todos lidos
                </button>
              )}
              <button
                onClick={async () => { await api.post('/crm/alerts/generate'); load(); }}
                title="Gerar novos alertas"
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                ↻
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-zinc-500 text-sm">Tudo em ordem! Sem alertas.</p>
              </div>
            ) : (
              alerts.map(a => (
                <div
                  key={a.id}
                  className={`group flex gap-3 px-4 py-3 border-b border-zinc-800/50 border-l-2 cursor-pointer transition-colors
                    ${!a.read_at ? 'bg-zinc-800/30 hover:bg-zinc-800/50' : 'hover:bg-zinc-800/20 opacity-70'}
                    ${PRIORITY_COLOR[a.priority] || PRIORITY_COLOR.normal}`}
                  onClick={() => handleClick(a)}
                >
                  {/* Dot não lido */}
                  <div className="mt-1 shrink-0">
                    {!a.read_at && <span className="block w-2 h-2 rounded-full bg-amber-500" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium leading-tight">{a.title}</p>
                    {a.body && <p className="text-xs text-zinc-400 mt-0.5 leading-snug">{a.body}</p>}
                    <p className="text-xs text-zinc-600 mt-1">
                      {new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Dismiss */}
                  <button
                    onClick={e => { e.stopPropagation(); dismiss(a.id); }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-all text-lg leading-none mt-0.5"
                    title="Descartar"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {alerts.length > 0 && (
            <div className="px-4 py-2 border-t border-zinc-800 text-center">
              <button
                onClick={() => { navigate('/crm/goals'); setOpen(false); }}
                className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                Ver metas →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
