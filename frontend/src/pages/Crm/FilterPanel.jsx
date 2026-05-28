import React, { useEffect, useState } from 'react';
import api from '../../lib/api';
import { STAGES } from './stages';

/**
 * Painel de filtros avançados reutilizável para o CRM.
 * Props:
 *   filters: { search, stage, temperature, source, value_min, value_max, stale_days, sort, responsible_user_id }
 *   onChange: (filters) => void
 *   showStage: bool (default true) — exibe filtro de etapa
 *   showSort:  bool (default false) — exibe ordenação
 */
export default function FilterPanel({ filters, onChange, showStage = true, showSort = false }) {
  const [sources, setSources] = useState([]);
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get('/crm/leads/sources').then(setSources).catch(() => {});
    api.get('/crm/leads/users').then(setUsers).catch(() => {});
  }, []);

  const update = (key, val) => onChange({ ...filters, [key]: val });

  const activeCount = [
    filters.source, filters.value_min, filters.value_max, filters.stale_days,
    showStage && filters.stage, filters.temperature, filters.responsible_user_id,
  ].filter(Boolean).length;

  const clear = () => onChange({
    search: filters.search || '',
    stage: '', temperature: '', source: '', value_min: '', value_max: '',
    stale_days: '', sort: '', responsible_user_id: '',
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Busca principal */}
      <input
        type="text"
        placeholder="Buscar nome, telefone ou evento..."
        value={filters.search || ''}
        onChange={e => update('search', e.target.value)}
        className="input text-sm w-56"
      />

      {/* Temperatura */}
      <select
        value={filters.temperature || ''}
        onChange={e => update('temperature', e.target.value)}
        className="input text-sm"
      >
        <option value="">Temperatura</option>
        <option value="frio">🥶 Frio</option>
        <option value="morno">🌤️ Morno</option>
        <option value="quente">🔥 Quente</option>
      </select>

      {/* Etapa — opcional */}
      {showStage && (
        <select
          value={filters.stage || ''}
          onChange={e => update('stage', e.target.value)}
          className="input text-sm"
        >
          <option value="">Todas as etapas</option>
          {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      )}

      {/* Filtros avançados (collapse) */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`btn btn-ghost text-sm border ${activeCount > 0 ? 'border-orange-500 text-orange-400' : 'border-gray-600'}`}
      >
        Filtros{activeCount > 0 ? ` (${activeCount})` : ''} {open ? '▲' : '▼'}
      </button>

      {activeCount > 0 && (
        <button onClick={clear} className="btn btn-ghost text-xs text-red-400 border border-red-800">
          ✕ Limpar
        </button>
      )}

      {/* Painel expandido */}
      {open && (
        <div className="w-full flex flex-wrap gap-3 mt-1 p-3 bg-gray-800/60 rounded-xl border border-gray-700">
          {/* Origem */}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs text-gray-400">Origem</label>
            <select
              value={filters.source || ''}
              onChange={e => update('source', e.target.value)}
              className="input text-sm"
            >
              <option value="">Qualquer origem</option>
              {sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Responsável */}
          {users.length > 1 && (
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs text-gray-400">Responsável</label>
              <select
                value={filters.responsible_user_id || ''}
                onChange={e => update('responsible_user_id', e.target.value)}
                className="input text-sm"
              >
                <option value="">Qualquer responsável</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}

          {/* Valor mínimo */}
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs text-gray-400">Valor mínimo (R$)</label>
            <input
              type="number"
              min="0"
              value={filters.value_min || ''}
              onChange={e => update('value_min', e.target.value)}
              className="input text-sm"
              placeholder="0"
            />
          </div>

          {/* Valor máximo */}
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs text-gray-400">Valor máximo (R$)</label>
            <input
              type="number"
              min="0"
              value={filters.value_max || ''}
              onChange={e => update('value_max', e.target.value)}
              className="input text-sm"
              placeholder="sem limite"
            />
          </div>

          {/* Parado há X dias */}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs text-gray-400">Parado há pelo menos</label>
            <select
              value={filters.stale_days || ''}
              onChange={e => update('stale_days', e.target.value)}
              className="input text-sm"
            >
              <option value="">Qualquer</option>
              <option value="1">1 dia</option>
              <option value="3">3 dias</option>
              <option value="7">7 dias</option>
              <option value="14">14 dias</option>
              <option value="30">30 dias</option>
            </select>
          </div>

          {/* Ordenação — opcional */}
          {showSort && (
            <div className="flex flex-col gap-1 min-w-[180px]">
              <label className="text-xs text-gray-400">Ordenar por</label>
              <select
                value={filters.sort || ''}
                onChange={e => update('sort', e.target.value)}
                className="input text-sm"
              >
                <option value="">Padrão (posição)</option>
                <option value="score_desc">★ Maior score primeiro</option>
                <option value="last_interaction">Última interação</option>
                <option value="value_desc">Maior valor primeiro</option>
                <option value="value_asc">Menor valor primeiro</option>
                <option value="name">Nome (A–Z)</option>
                <option value="created">Mais recente</option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
