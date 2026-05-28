import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';

const ACTION_COLORS = {
  create:       'var(--success)',
  update:       'var(--gold-400)',
  delete:       'var(--danger)',
  stage_change: '#818cf8',
};

function ActionBadge({ action }) {
  const color = ACTION_COLORS[action] || 'var(--text-muted)';
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
      style={{ background: color + '22', color }}
    >
      {action}
    </span>
  );
}

function DiffView({ before, after }) {
  let b, a;
  try { b = before ? JSON.parse(before) : null; } catch { b = before; }
  try { a = after  ? JSON.parse(after)  : null; } catch { a = after; }

  if (!b && !a) return <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>—</span>;

  if (typeof b === 'object' && typeof a === 'object') {
    // Show changed fields only
    const allKeys = [...new Set([...Object.keys(b || {}), ...Object.keys(a || {})])];
    const changed = allKeys.filter(k => JSON.stringify(b?.[k]) !== JSON.stringify(a?.[k]));
    if (!changed.length) return <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>sem alterações</span>;
    return (
      <div className="space-y-0.5">
        {changed.slice(0, 6).map(k => (
          <div key={k} className="text-[10px] font-mono">
            <span style={{ color: 'var(--text-muted)' }}>{k}: </span>
            <span style={{ color: 'var(--danger)' }}>{String(b?.[k] ?? '—')}</span>
            <span style={{ color: 'var(--text-disabled)' }}> → </span>
            <span style={{ color: 'var(--success)' }}>{String(a?.[k] ?? '—')}</span>
          </div>
        ))}
        {changed.length > 6 && (
          <p className="text-[10px]" style={{ color: 'var(--text-disabled)' }}>+{changed.length - 6} mais…</p>
        )}
      </div>
    );
  }

  return (
    <pre className="text-[10px] font-mono whitespace-pre-wrap break-all max-w-xs" style={{ color: 'var(--text-secondary)' }}>
      {a ? JSON.stringify(a, null, 2).slice(0, 200) : JSON.stringify(b, null, 2).slice(0, 200)}
    </pre>
  );
}

export default function Auditoria() {
  const [rows,       setRows]       = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [entities,   setEntities]   = useState([]);
  const [users,      setUsers]      = useState([]);
  const [expanded,   setExpanded]   = useState(null);

  const [filters, setFilters] = useState({
    entity_type: '', action: '', user_id: '', from: '', to: '',
  });

  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT, ...Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v)
      )}).toString();
      const data = await api.get(`/audit?${params}`);
      setRows(data.rows);
      setTotal(data.total);
    } catch {}
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/audit/entities').then(setEntities).catch(() => {});
    api.get('/audit/users').then(setUsers).catch(() => {});
  }, []);

  const setFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-display" style={{ color: 'var(--text-primary)' }}>
            🔍 Auditoria
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Histórico completo de ações no sistema
          </p>
        </div>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {total.toLocaleString('pt-BR')} registros
        </span>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Entidade</label>
            <select className="input w-full text-sm" value={filters.entity_type} onChange={e => setFilter('entity_type', e.target.value)}>
              <option value="">Todas</option>
              {entities.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Ação</label>
            <select className="input w-full text-sm" value={filters.action} onChange={e => setFilter('action', e.target.value)}>
              <option value="">Todas</option>
              {['create','update','delete','stage_change'].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Usuário</label>
            <select className="input w-full text-sm" value={filters.user_id} onChange={e => setFilter('user_id', e.target.value)}>
              <option value="">Todos</option>
              {users.map(u => <option key={u.user_id} value={u.user_id}>{u.username || u.user_id}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>De</label>
            <input type="date" className="input w-full text-sm" value={filters.from} onChange={e => setFilter('from', e.target.value)} />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Até</label>
            <input type="date" className="input w-full text-sm" value={filters.to} onChange={e => setFilter('to', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button className="btn-ghost text-xs" onClick={() => { setFilters({ entity_type: '', action: '', user_id: '', from: '', to: '' }); setPage(1); }}>
            Limpar filtros
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface-2)' }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-12">
          <span className="text-4xl">🔍</span>
          <p className="mt-3" style={{ color: 'var(--text-muted)' }}>Nenhum registro encontrado</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface-2)' }}>
                  {['Data/Hora', 'Usuário', 'Entidade', 'ID', 'Ação', 'Alterações'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <React.Fragment key={r.id}>
                    <tr
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: '1px solid var(--border-default)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    >
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                        {new Date(r.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-primary)' }}>
                        {r.username || `#${r.user_id}` || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--gold-400)' }}>
                        {r.entity_type}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {r.entity_id ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <ActionBadge action={r.action} />
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <DiffView before={r.before_json} after={r.after_json} />
                      </td>
                    </tr>
                    {expanded === r.id && (
                      <tr style={{ background: 'var(--bg-surface-2)' }}>
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-4">
                            {r.before_json && (
                              <div>
                                <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>ANTES</p>
                                <pre className="text-[10px] font-mono whitespace-pre-wrap break-all" style={{ color: 'var(--danger)' }}>
                                  {JSON.stringify(JSON.parse(r.before_json), null, 2)}
                                </pre>
                              </div>
                            )}
                            {r.after_json && (
                              <div>
                                <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>DEPOIS</p>
                                <pre className="text-[10px] font-mono whitespace-pre-wrap break-all" style={{ color: 'var(--success)' }}>
                                  {JSON.stringify(JSON.parse(r.after_json), null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                          {r.ip && (
                            <p className="text-[10px] mt-2" style={{ color: 'var(--text-disabled)' }}>IP: {r.ip}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button className="btn-ghost text-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            ← Anterior
          </button>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {page} / {totalPages}
          </span>
          <button className="btn-ghost text-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Próximo →
          </button>
        </div>
      )}
    </div>
  );
}
