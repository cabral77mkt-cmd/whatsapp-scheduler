import React, { useEffect, useState, useMemo } from 'react';
import api from '../../lib/api';
import { STAGE_BY_ID, TEMPERATURE } from './stages';
import LeadDrawer from './LeadDrawer';
import NewLeadModal from './NewLeadModal';
import FilterPanel from './FilterPanel';
import { calcScore, scoreColor } from './scoreUtils';

function formatDt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const EMPTY_FILTERS = {
  search: '', stage: '', temperature: '', source: '',
  value_min: '', value_max: '', stale_days: '', sort: '', responsible_user_id: '',
};

export default function Leads() {
  const [leads, setLeads]   = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew]   = useState(false);

  const load = async (f = filters) => {
    const q = new URLSearchParams();
    if (f.search)      q.set('search',      f.search);
    if (f.stage)       q.set('stage',       f.stage);
    if (f.temperature) q.set('temperature', f.temperature);
    if (f.source)      q.set('source',      f.source);
    if (f.value_min)   q.set('value_min',   f.value_min);
    if (f.value_max)   q.set('value_max',   f.value_max);
    if (f.stale_days)          q.set('stale_days',          f.stale_days);
    if (f.sort)                q.set('sort',                f.sort);
    if (f.responsible_user_id) q.set('responsible_user_id', f.responsible_user_id);
    try {
      const data = await api.get(`/crm/leads?${q}`);
      setLeads(data);
    } catch {}
  };

  useEffect(() => {
    const f = { ...filters };
    // score_desc é calculado client-side; não envia para o backend
    if (f.sort === 'score_desc') f.sort = '';
    load(f);
  }, [filters]);

  const displayLeads = useMemo(() => {
    if (filters.sort !== 'score_desc') return leads;
    return [...leads].sort((a, b) => calcScore(b) - calcScore(a));
  }, [leads, filters.sort]);

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('wa_token') || '';
      const res = await fetch('/api/crm/leads/export.csv', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erro ao exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white">👥 Leads</h1>
        <span className="text-sm text-gray-500">{displayLeads.length} resultado(s)</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleExport}
            className="btn btn-ghost text-sm border border-gray-600"
            title="Exportar leads filtrados para CSV"
          >
            ⬇ CSV
          </button>
          <button onClick={() => setShowNew(true)} className="btn btn-primary">+ Novo Lead</button>
        </div>
      </div>

      <FilterPanel
        filters={filters}
        onChange={setFilters}
        showStage={true}
        showSort={true}
      />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-400 uppercase border-b border-gray-700">
            <tr>
              <th className="text-left p-2">Nome</th>
              <th className="text-left p-2">Telefone</th>
              <th className="text-left p-2">Origem</th>
              <th className="text-left p-2">Etapa</th>
              <th className="text-left p-2">Tags</th>
              <th className="text-right p-2">Valor pot.</th>
              <th className="text-right p-2">Score</th>
              <th className="text-left p-2">Responsável</th>
              <th className="text-left p-2">Última int.</th>
            </tr>
          </thead>
          <tbody>
            {displayLeads.length === 0 && (
              <tr><td colSpan="9" className="text-center text-gray-500 py-6">Nenhum lead encontrado.</td></tr>
            )}
            {displayLeads.map(l => {
              const stage = STAGE_BY_ID[l.stage];
              const temp  = TEMPERATURE[l.temperature] || TEMPERATURE.morno;
              const score = calcScore(l);
              const sc    = scoreColor(score);
              return (
                <tr
                  key={l.id}
                  className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer"
                  onClick={() => setSelected(l.id)}
                >
                  <td className="p-2 text-white">
                    {l.name || '—'}{' '}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${temp.chip} ml-1`}>{temp.label}</span>
                  </td>
                  <td className="p-2 text-gray-400">{l.phone}</td>
                  <td className="p-2 text-gray-500 text-xs">{l.source || '—'}</td>
                  <td className="p-2">
                    <span className={`text-xs px-2 py-0.5 rounded text-white ${stage.color}`}>{stage.label}</span>
                  </td>
                  <td className="p-2">
                    {(l.tags || []).slice(0, 2).map(t => (
                      <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded mr-1" style={{ background: t.color + '33', color: t.color }}>{t.name}</span>
                    ))}
                  </td>
                  <td className="p-2 text-right text-emerald-400">
                    {l.potential_value ? `R$ ${Number(l.potential_value).toLocaleString('pt-BR')}` : '—'}
                  </td>
                  <td className={`p-2 text-right text-xs font-bold ${sc.text}`} title={`Score: ${score}/100`}>
                    ★ {score}
                  </td>
                  <td className="p-2 text-blue-400/80 text-xs">{l.responsible_user_name || '—'}</td>
                  <td className="p-2 text-gray-400 text-xs">{formatDt(l.last_interaction_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && <LeadDrawer leadId={selected} onClose={() => setSelected(null)} onUpdate={() => load()} />}
      {showNew   && <NewLeadModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}
