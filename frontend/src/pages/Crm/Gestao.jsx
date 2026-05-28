import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../lib/api';
import { MetricCard } from '../../components/ui/MetricCard';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';

/* ─── helpers ─────────────────────────────────────────────── */
const fmt = (n) =>
  n >= 1_000_000
    ? `R$ ${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `R$ ${(n / 1_000).toFixed(1)}k`
    : `R$ ${Number(n || 0).toFixed(0)}`;

const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

const STAGE_LABELS = {
  entrou_contato: 'Entrou Contato',
  conversando: 'Conversando',
  diagnostico: 'Diagnóstico',
  reuniao_agendada: 'Reunião Agendada',
  reuniao_realizada: 'Reunião Realizada',
  aguardando_proposta: 'Aguard. Proposta',
  proposta_enviada: 'Proposta Enviada',
  analisando_proposta: 'Analisando',
  negociacao: 'Negociação',
};

const MONTHS = [
  'Jan','Fev','Mar','Abr','Mai','Jun',
  'Jul','Ago','Set','Out','Nov','Dez',
];

/* ─── sub-components ──────────────────────────────────────── */
function GoalModal({ open, onClose, users, month, year, onSaved }) {
  const [assignee, setAssignee]   = useState('');
  const [revenue, setRevenue]     = useState('');
  const [deals, setDeals]         = useState('');
  const [meetings, setMeetings]   = useState('');
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (open) { setAssignee(''); setRevenue(''); setDeals(''); setMeetings(''); }
  }, [open]);

  const handleSave = async () => {
    if (!assignee) return;
    setSaving(true);
    try {
      await api.post('/crm/manager/goals', {
        assignee_user_id: Number(assignee),
        month, year,
        target_revenue: Number(revenue) || 0,
        target_deals: Number(deals) || 0,
        target_meetings: Number(meetings) || 0,
      });
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Definir Meta">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Vendedor
          </label>
          <select
            className="input w-full"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">Selecione…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.username}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Meta Receita (R$)
            </label>
            <Input type="number" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Meta Negócios
            </label>
            <Input type="number" value={deals} onChange={(e) => setDeals(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Meta Reuniões
            </label>
            <Input type="number" value={meetings} onChange={(e) => setMeetings(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={!assignee || saving}>
            {saving ? 'Salvando…' : 'Salvar Meta'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ProgressBar({ value, max, color = 'var(--gold-500)' }) {
  const pctVal = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{ height: 6, background: 'var(--bg-surface-2)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pctVal}%`, background: color }}
        />
      </div>
      <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--text-secondary)', minWidth: 34 }}>
        {pctVal}%
      </span>
    </div>
  );
}

function RankBadge({ rank }) {
  const colors = ['#D4AF37', '#C0C0C0', '#CD7F32'];
  const labels = ['🥇', '🥈', '🥉'];
  if (rank <= 3) return <span className="text-lg">{labels[rank - 1]}</span>;
  return (
    <span
      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
      style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}
    >
      {rank}
    </span>
  );
}

/* ─── Main component ──────────────────────────────────────── */
export default function Gestao() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());

  const [overview, setOverview]   = useState(null);
  const [ranking, setRanking]     = useState([]);
  const [forecast, setForecast]   = useState(null);
  const [funnel, setFunnel]       = useState({});
  const [stale, setStale]         = useState([]);
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [goalModal, setGoalModal] = useState(false);
  const [activeTab, setActiveTab] = useState('ranking');

  const load = useCallback(async () => {
    setLoading(true);
    const q = `?month=${month}&year=${year}`;
    try {
      const [ov, rk, fc, fn, st, us] = await Promise.all([
        api.get(`/crm/manager/overview${q}`),
        api.get(`/crm/manager/ranking${q}`),
        api.get('/crm/manager/forecast'),
        api.get('/crm/manager/funnel'),
        api.get('/crm/manager/stale?days=7'),
        api.get('/crm/manager/goals' + q).catch(() => ({ goals: [] })),
      ]);
      setOverview(ov);
      setRanking(rk);
      setForecast(fc);
      setFunnel(fn);
      setStale(st);
      // Build users list from ranking (already has name, id)
      setUsers(rk.map((r) => ({ id: r.id, name: r.name })));
    } catch (e) {
      console.error('[Gestao] load error', e);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  /* ── Funnel chart data ── */
  const funnelData = Object.entries(funnel).map(([stage, d]) => ({
    stage: STAGE_LABELS[stage] || stage,
    count: d.count,
    value: d.total_value,
  }));

  /* ── Forecast chart: proposals by probability bucket ── */
  const forecastBuckets = forecast
    ? [
        { name: '70%+ (Neg.)', value: forecast.items.filter((i) => i.probability >= 70).reduce((s, i) => s + i.weighted, 0) },
        { name: '50% (Prop.)', value: forecast.items.filter((i) => i.probability === 50).reduce((s, i) => s + i.weighted, 0) },
        { name: '30% (Env.)', value: forecast.items.filter((i) => i.probability === 30).reduce((s, i) => s + i.weighted, 0) },
        { name: '15% (Ag.)', value: forecast.items.filter((i) => i.probability === 15).reduce((s, i) => s + i.weighted, 0) },
      ].filter((b) => b.value > 0)
    : [];

  /* ── KPI trend calcs ── */
  const revTrend = overview ? pct(overview.revenue, overview.prev_revenue) : null;
  const dealsTrend = overview ? pct(overview.deals_closed, overview.prev_deals) : null;

  const periodLabel = `${MONTHS[month - 1]}/${year}`;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold font-display" style={{ color: 'var(--text-primary)' }}>
            📊 Painel Gerencial
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Visão consolidada de receita, pipeline e equipe
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period selector */}
          <select
            className="input text-sm"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            className="input text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            className="btn-primary text-sm"
            onClick={() => setGoalModal(true)}
          >
            🎯 Definir Meta
          </button>
        </div>
      </div>

      {/* ── KPI cards ── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card h-28 animate-pulse" style={{ background: 'var(--bg-surface-2)' }} />
          ))}
        </div>
      ) : overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Receita Fechada"
            value={fmt(overview.revenue)}
            sub={periodLabel}
            icon="💰"
            trend={revTrend}
            trendLabel="vs mês ant."
          />
          <MetricCard
            label="Negócios Fechados"
            value={overview.deals_closed}
            sub={`${overview.prev_deals} no mês anterior`}
            icon="🤝"
            trend={dealsTrend}
            trendLabel="vs mês ant."
          />
          <MetricCard
            label="Leads Ativos"
            value={overview.active_leads}
            sub={`${overview.stale_count} parados >7d`}
            icon="👥"
            color={overview.stale_count > 5 ? '#F59E0B' : undefined}
          />
          <MetricCard
            label="Forecast Ponderado"
            value={fmt(overview.forecast)}
            sub={`${overview.meetings} reuniões no mês`}
            icon="🔮"
            color="var(--text-primary)"
          />
        </div>
      )}

      {/* ── Tabs ── */}
      <div
        className="flex gap-1 p-1 rounded-xl w-full sm:w-auto"
        style={{ background: 'var(--bg-surface)', width: 'fit-content' }}
      >
        {[
          { id: 'ranking', label: '🏆 Ranking' },
          { id: 'funnel',  label: '🔽 Funil'   },
          { id: 'forecast',label: '🔮 Forecast' },
          { id: 'stale',   label: `⚠️ Parados (${stale.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: activeTab === t.id ? 'var(--gold-500)' : 'transparent',
              color: activeTab === t.id ? '#000' : 'var(--text-secondary)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─────── RANKING TAB ─────── */}
      {activeTab === 'ranking' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                {['#', 'Vendedor', 'Receita', 'Meta Rev.', 'Negócios', 'Reuniões', 'Leads Ativos'].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: '1px solid var(--border-default)' }}
                  className="transition-colors hover:bg-[var(--bg-surface-2)]"
                >
                  <td className="py-3 px-3">
                    <RankBadge rank={i + 1} />
                  </td>
                  <td className="py-3 px-3">
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{r.name}</p>
                  </td>
                  <td className="py-3 px-3">
                    <p className="font-bold" style={{ color: 'var(--gold-400)' }}>{fmt(r.revenue)}</p>
                    {r.target_revenue > 0 && (
                      <ProgressBar value={r.revenue} max={r.target_revenue} />
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {r.target_revenue > 0 ? (
                      <span style={{ color: 'var(--text-secondary)' }}>{fmt(r.target_revenue)}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {r.deals_closed}
                    </span>
                    {r.target_deals > 0 && (
                      <span style={{ color: 'var(--text-muted)' }}>/{r.target_deals}</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {r.meetings}
                    </span>
                    {r.target_meetings > 0 && (
                      <span style={{ color: 'var(--text-muted)' }}>/{r.target_meetings}</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span style={{ color: 'var(--text-secondary)' }}>{r.active_leads}</span>
                  </td>
                </tr>
              ))}
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center" style={{ color: 'var(--text-muted)' }}>
                    Nenhum dado para {periodLabel}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─────── FUNNEL TAB ─────── */}
      {activeTab === 'funnel' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar chart */}
          <div className="card">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              Leads por Estágio
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  dataKey="stage"
                  type="category"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                  width={120}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                    fontSize: 12,
                  }}
                  formatter={(val) => [val, 'Leads']}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {funnelData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={`hsl(${45 - i * 4}, ${70 - i * 4}%, 55%)`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Funnel table */}
          <div className="card overflow-y-auto" style={{ maxHeight: 360 }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Valor em Pipeline
            </h3>
            <div className="space-y-2">
              {funnelData.map((row) => (
                <div
                  key={row.stage}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                  style={{ background: 'var(--bg-surface-2)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold w-5 text-center shrink-0"
                      style={{ color: 'var(--text-muted)' }}>
                      {row.count}
                    </span>
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {row.stage}
                    </span>
                  </div>
                  <span className="text-sm font-bold shrink-0" style={{ color: 'var(--gold-400)' }}>
                    {fmt(row.value)}
                  </span>
                </div>
              ))}
              {funnelData.length === 0 && (
                <p className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
                  Pipeline vazio
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────── FORECAST TAB ─────── */}
      {activeTab === 'forecast' && forecast && (
        <div className="space-y-5">
          {/* Summary card */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MetricCard
              label="Forecast Total Ponderado"
              value={fmt(forecast.total_weighted)}
              sub={`${forecast.items.length} propostas abertas`}
              icon="🔮"
            />
            <MetricCard
              label="Propostas em Negociação"
              value={fmt(forecast.items.filter((i) => i.probability >= 70).reduce((s, i) => s + i.value, 0))}
              sub="probabilidade ≥ 70%"
              icon="🤝"
              color="#10B981"
            />
            <MetricCard
              label="Ticket Médio"
              value={forecast.items.length > 0 ? fmt(forecast.items.reduce((s, i) => s + i.value, 0) / forecast.items.length) : '—'}
              sub="valor médio das propostas"
              icon="📋"
              color="var(--text-primary)"
            />
          </div>

          {/* Forecast bar chart */}
          {forecastBuckets.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Forecast por Estágio
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={forecastBuckets}>
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [fmt(v), 'Forecast']}
                  />
                  <Bar dataKey="value" fill="var(--gold-500)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Proposals table */}
          <div className="card overflow-x-auto">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Propostas Abertas
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  {['Lead', 'Vendedor', 'Valor', 'Prob.', 'Ponderado', 'Vencimento', 'Estágio'].map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {forecast.items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-default)' }}
                    className="hover:bg-[var(--bg-surface-2)] transition-colors">
                    <td className="py-2.5 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {item.lead_name}
                    </td>
                    <td className="py-2.5 px-3" style={{ color: 'var(--text-secondary)' }}>
                      {item.seller || '—'}
                    </td>
                    <td className="py-2.5 px-3 font-semibold" style={{ color: 'var(--gold-400)' }}>
                      {fmt(item.value)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{
                          background: item.probability >= 70 ? '#10B98122' : item.probability >= 50 ? '#D4AF3722' : '#F59E0B22',
                          color: item.probability >= 70 ? '#10B981' : item.probability >= 50 ? '#D4AF37' : '#F59E0B',
                        }}
                      >
                        {item.probability}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(item.weighted)}
                    </td>
                    <td className="py-2.5 px-3" style={{ color: 'var(--text-muted)' }}>
                      {item.due_date
                        ? new Date(item.due_date).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--bg-surface-2)', color: 'var(--text-secondary)' }}
                      >
                        {STAGE_LABELS[item.stage] || item.stage}
                      </span>
                    </td>
                  </tr>
                ))}
                {forecast.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center" style={{ color: 'var(--text-muted)' }}>
                      Nenhuma proposta aberta
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────── STALE LEADS TAB ─────── */}
      {activeTab === 'stale' && (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              ⚠️ Leads sem interação há +7 dias
            </h3>
            <span
              className="text-xs px-2 py-1 rounded-full font-semibold"
              style={{ background: stale.length > 0 ? '#F59E0B22' : '#10B98122', color: stale.length > 0 ? '#F59E0B' : '#10B981' }}
            >
              {stale.length} leads
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                {['Lead', 'Telefone', 'Estágio', 'Temp.', 'Vendedor', 'Última Interação', 'Pot. Valor'].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stale.map((lead) => {
                const daysAgo = lead.last_interaction_at
                  ? Math.floor((Date.now() - new Date(lead.last_interaction_at)) / 86400000)
                  : null;
                return (
                  <tr
                    key={lead.id}
                    style={{ borderBottom: '1px solid var(--border-default)' }}
                    className="hover:bg-[var(--bg-surface-2)] transition-colors"
                  >
                    <td className="py-2.5 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {lead.name}
                    </td>
                    <td className="py-2.5 px-3" style={{ color: 'var(--text-muted)' }}>
                      {lead.phone}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--bg-surface-2)', color: 'var(--text-secondary)' }}
                      >
                        {STAGE_LABELS[lead.stage] || lead.stage}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {lead.temperature === 'hot' ? '🔥' : lead.temperature === 'cold' ? '🧊' : '😐'}
                    </td>
                    <td className="py-2.5 px-3" style={{ color: 'var(--text-secondary)' }}>
                      {lead.seller || '—'}
                    </td>
                    <td className="py-2.5 px-3">
                      {daysAgo !== null ? (
                        <span
                          className="text-xs font-semibold"
                          style={{ color: daysAgo > 14 ? '#EF4444' : daysAgo > 7 ? '#F59E0B' : 'var(--text-muted)' }}
                        >
                          {daysAgo}d atrás
                        </span>
                      ) : (
                        <span style={{ color: '#EF4444' }} className="text-xs font-semibold">Nunca</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-semibold" style={{ color: 'var(--gold-400)' }}>
                      {lead.potential_value ? fmt(lead.potential_value) : '—'}
                    </td>
                  </tr>
                );
              })}
              {stale.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center" style={{ color: 'var(--text-muted)' }}>
                    ✅ Nenhum lead parado — equipe em dia!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Goal Modal ── */}
      <GoalModal
        open={goalModal}
        onClose={() => setGoalModal(false)}
        users={users}
        month={month}
        year={year}
        onSaved={load}
      />
    </div>
  );
}
