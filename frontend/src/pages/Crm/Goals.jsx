import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';

function formatBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pct(actual, target) {
  if (!target) return null;
  return Math.min(Math.round((actual / target) * 100), 100);
}

function ProgressBar({ actual, target, label, format = 'number', color = 'bg-amber-500' }) {
  const p = pct(actual, target);
  if (target === 0 || target == null) return null;
  const display = format === 'currency' ? formatBRL(actual) : actual;
  const targetDisplay = format === 'currency' ? formatBRL(target) : target;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-300 font-medium">{label}</span>
        <span className="text-zinc-400">
          <span className={p >= 100 ? 'text-emerald-400 font-bold' : 'text-white font-semibold'}>{display}</span>
          <span className="text-zinc-600"> / {targetDisplay}</span>
          <span className={`ml-2 text-xs font-bold ${p >= 100 ? 'text-emerald-400' : p >= 70 ? 'text-amber-400' : 'text-zinc-500'}`}>
            {p}%
          </span>
        </span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${p >= 100 ? 'bg-emerald-500' : color}`}
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  );
}

// Gera lista dos últimos 6 meses (YYYY-MM) para o selector
function getMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts;
}

const MONTH_OPTIONS = getMonthOptions();
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

export default function Goals() {
  const [period,   setPeriod]   = useState(CURRENT_MONTH);
  const [data,     setData]     = useState(null);
  const [editing,  setEditing]  = useState(false);
  const [form,     setForm]     = useState({ target_revenue: '', target_deals: '', target_meetings: '', target_followups: '', target_new_leads: '' });
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    try {
      const res = await api.get('/crm/goals', { params: { period } });
      setData(res);
      const g = res.goal;
      setForm({
        target_revenue:   String(g.target_revenue   || ''),
        target_deals:     String(g.target_deals     || ''),
        target_meetings:  String(g.target_meetings  || ''),
        target_followups: String(g.target_followups || ''),
        target_new_leads: String(g.target_new_leads || ''),
      });
    } catch {
      showToast('Erro ao carregar metas', 'error');
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  async function saveGoals() {
    setSaving(true);
    try {
      await api.put('/crm/goals', { period, ...form });
      setEditing(false);
      showToast('Metas salvas!');
      await load();
    } catch {
      showToast('Erro ao salvar', 'error');
    }
    setSaving(false);
  }

  const isCurrentMonth = period === CURRENT_MONTH;
  const g = data?.goal;
  const p = data?.progress;

  // Dias restantes no mês
  const daysLeft = (() => {
    const [y, m] = period.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    if (!isCurrentMonth) return 0;
    return lastDay - new Date().getDate();
  })();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg
          ${toast.type === 'error' ? 'bg-red-900 text-red-200' : 'bg-emerald-900 text-emerald-200'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>🎯</span> Minhas Metas
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Defina e acompanhe seus objetivos mensais de vendas.</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Seletor de mês */}
          <select
            value={period}
            onChange={e => { setPeriod(e.target.value); setEditing(false); }}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
          >
            {MONTH_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {/* Export CSV rápido */}
          <button
            onClick={() => {
              const token = localStorage.getItem('wa_token') || '';
              fetch(`/api/crm/export/goals?period=${period}`, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.blob()).then(blob => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `metas-${period}.csv`; a.click();
                  URL.revokeObjectURL(url);
                }).catch(() => {});
            }}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 text-sm hover:border-amber-500 transition-colors"
            title="Exportar metas para CSV"
          >
            ⬇ CSV
          </button>
        </div>
      </div>

      {/* Dias restantes pill */}
      {isCurrentMonth && daysLeft > 0 && (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${
          daysLeft <= 5
            ? 'border-red-800 bg-red-900/20 text-red-400'
            : daysLeft <= 10
              ? 'border-amber-800 bg-amber-900/20 text-amber-400'
              : 'border-zinc-700 bg-zinc-800 text-zinc-300'
        }`}>
          📅 {daysLeft} {daysLeft === 1 ? 'dia restante' : 'dias restantes'} no mês
        </div>
      )}

      {/* Progress cards */}
      {data && g && p && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-lg">Progresso</h2>
            {isCurrentMonth && (
              <button
                onClick={() => setEditing(e => !e)}
                className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
              >
                {editing ? 'Cancelar' : '✏️ Editar metas'}
              </button>
            )}
          </div>

          {/* Se não tem metas definidas */}
          {g.target_revenue === 0 && g.target_deals === 0 && g.target_meetings === 0 && !editing ? (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">🎯</p>
              <p className="text-zinc-400 mb-1">Nenhuma meta definida para este mês.</p>
              {isCurrentMonth && (
                <button
                  onClick={() => setEditing(true)}
                  className="mt-3 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-sm transition-colors"
                >
                  Definir metas agora
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <ProgressBar actual={p.actual_revenue}   target={g.target_revenue}   label="💰 Faturamento"       format="currency" color="bg-amber-500" />
              <ProgressBar actual={p.actual_deals}     target={g.target_deals}     label="🤝 Negócios fechados" format="number"   color="bg-emerald-500" />
              <ProgressBar actual={p.actual_meetings}  target={g.target_meetings}  label="📅 Reuniões"          format="number"   color="bg-blue-500" />
              <ProgressBar actual={p.actual_followups} target={g.target_followups} label="📨 Follow-ups feitos" format="number"   color="bg-purple-500" />
              <ProgressBar actual={p.actual_new_leads} target={g.target_new_leads} label="👤 Novos leads"       format="number"   color="bg-pink-500" />
            </div>
          )}

          {/* Formulário de edição */}
          {editing && (
            <div className="border-t border-zinc-800 pt-5 space-y-4">
              <p className="text-zinc-400 text-sm">Define os alvos para {MONTH_OPTIONS.find(o => o.value === period)?.label}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: 'target_revenue',   label: '💰 Faturamento (R$)', type: 'number', placeholder: '10000' },
                  { key: 'target_deals',     label: '🤝 Negócios fechados', type: 'number', placeholder: '5' },
                  { key: 'target_meetings',  label: '📅 Reuniões',          type: 'number', placeholder: '10' },
                  { key: 'target_followups', label: '📨 Follow-ups',        type: 'number', placeholder: '30' },
                  { key: 'target_new_leads', label: '👤 Novos leads',       type: 'number', placeholder: '20' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-zinc-400 text-xs mb-1">{f.label}</label>
                    <input
                      type={f.type}
                      min={0}
                      value={form[f.key]}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={saveGoals}
                  disabled={saving}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-lg text-sm transition-colors"
                >
                  {saving ? 'Salvando...' : 'Salvar metas'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Histórico dos últimos meses */}
      {data?.history?.length > 1 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h2 className="text-white font-semibold text-lg">Histórico</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                  <th className="text-left pb-2 font-medium">Mês</th>
                  <th className="text-right pb-2 font-medium">Faturamento</th>
                  <th className="text-right pb-2 font-medium">Deals</th>
                  <th className="text-right pb-2 font-medium">Reuniões</th>
                  <th className="text-right pb-2 font-medium">% receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {data.history.map(h => {
                  const revPct = pct(h.actual_revenue, h.target_revenue);
                  return (
                    <tr
                      key={h.period}
                      className={`cursor-pointer hover:bg-zinc-800/30 transition-colors ${h.period === period ? 'bg-zinc-800/20' : ''}`}
                      onClick={() => setPeriod(h.period)}
                    >
                      <td className="py-2 text-zinc-300 font-medium">
                        {new Date(h.period + '-15').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}
                        {h.period === CURRENT_MONTH && <span className="ml-2 text-xs text-amber-400">atual</span>}
                      </td>
                      <td className="py-2 text-right text-white">{formatBRL(h.actual_revenue)}</td>
                      <td className="py-2 text-right text-zinc-300">{h.actual_deals}</td>
                      <td className="py-2 text-right text-zinc-300">{h.actual_meetings}</td>
                      <td className="py-2 text-right">
                        {revPct !== null ? (
                          <span className={`font-bold text-xs ${revPct >= 100 ? 'text-emerald-400' : revPct >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                            {revPct}%
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-xs">sem meta</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
