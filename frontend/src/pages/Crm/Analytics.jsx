import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';

function formatBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function DeltaBadge({ value }) {
  if (value === null || value === undefined) return null;
  const pos = value >= 0;
  return (
    <span className={`text-xs font-semibold ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
      {pos ? '▲' : '▼'} {Math.abs(value)}%
    </span>
  );
}

// Barra horizontal simples
function HBar({ value, max, color = 'bg-amber-500', label, sublabel, right }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="text-white font-medium">{label}</span>
          {sublabel && <span className="text-zinc-500 text-xs ml-2">{sublabel}</span>}
        </div>
        <span className="text-zinc-300 font-semibold">{right}</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Gráfico de colunas simples (div-based)
function BarChart({ data, keys, colors, yFormat = v => v }) {
  if (!data?.length) return <p className="text-zinc-600 text-sm text-center py-6">Sem dados</p>;
  const maxVal = Math.max(...data.flatMap(d => keys.map(k => d[k] || 0)));
  return (
    <div className="flex items-end gap-1 h-36">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <div className="w-full flex items-end gap-px" style={{ height: 112 }}>
            {keys.map((k, ki) => {
              const h = maxVal > 0 ? Math.max(((d[k] || 0) / maxVal) * 112, d[k] > 0 ? 3 : 0) : 0;
              return (
                <div
                  key={k}
                  className={`flex-1 rounded-t transition-all ${colors[ki]}`}
                  style={{ height: h }}
                  title={`${k}: ${yFormat(d[k] || 0)}`}
                />
              );
            })}
          </div>
          <span className="text-zinc-600 text-xs truncate w-full text-center">
            {d.month ? d.month.slice(5) : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

const TABS = [
  { key: 'overview',  label: '📊 Visão Geral' },
  { key: 'funnel',    label: '🔽 Funil'        },
  { key: 'sources',   label: '🌐 Origens'      },
  { key: 'velocity',  label: '⚡ Velocidade'   },
  { key: 'lost',      label: '❌ Perdas'        },
];

export default function Analytics() {
  const [tab,       setTab]       = useState('overview');
  const [summary,   setSummary]   = useState(null);
  const [funnel,    setFunnel]    = useState(null);
  const [sources,   setSources]   = useState(null);
  const [velocity,  setVelocity]  = useState(null);
  const [lostData,  setLostData]  = useState(null);
  const [trends,    setTrends]    = useState(null);
  const [loading,   setLoading]   = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, f, sr, v, l, t] = await Promise.all([
        api.get('/crm/analytics/summary'),
        api.get('/crm/analytics/funnel'),
        api.get('/crm/analytics/sources'),
        api.get('/crm/analytics/velocity'),
        api.get('/crm/analytics/lost-reasons'),
        api.get('/crm/analytics/trends'),
      ]);
      setSummary(s.data);
      setFunnel(f.data);
      setSources(sr.data);
      setVelocity(v.data);
      setLostData(l.data);
      setTrends(t.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (loading) {
    return (
      <div className="p-6 text-center text-zinc-500 mt-20">
        <div className="text-4xl animate-pulse mb-3">📊</div>
        Carregando analytics...
      </div>
    );
  }

  const m = summary?.this_month || {};
  const d = summary?.deltas || {};

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <span>📊</span> Analytics de Pipeline
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Conversão, velocidade e origens — tudo sobre o seu funil de vendas.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Leads este mês',  value: m.leads_created ?? '—', delta: d.leads_created, color: 'text-white' },
          { label: 'Deals fechados',  value: m.deals_closed  ?? '—', delta: d.deals_closed,  color: 'text-emerald-400' },
          { label: 'Faturamento',     value: formatBRL(m.revenue),    delta: d.revenue,        color: 'text-amber-400' },
          { label: 'Leads ativos',    value: summary?.active_leads ?? '—', delta: null,        color: 'text-blue-400' },
        ].map(c => (
          <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
            {c.delta !== null && <DeltaBadge value={c.delta} />}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors
              ${tab === t.key ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Visão Geral ── */}
      {tab === 'overview' && trends && (
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <h2 className="text-white font-semibold">Tendência dos últimos meses</h2>
            <div className="flex gap-4 text-xs mb-2">
              {[
                { label: 'Criados',  color: 'bg-blue-500' },
                { label: 'Fechados', color: 'bg-emerald-500' },
                { label: 'Perdidos', color: 'bg-red-500' },
              ].map(l => (
                <span key={l.label} className="flex items-center gap-1 text-zinc-400">
                  <span className={`w-3 h-3 rounded-sm ${l.color}`} /> {l.label}
                </span>
              ))}
            </div>
            <BarChart
              data={trends}
              keys={['created', 'closed', 'lost']}
              colors={['bg-blue-500', 'bg-emerald-500', 'bg-red-500']}
            />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <h2 className="text-white font-semibold">Faturamento mensal</h2>
            <BarChart
              data={trends}
              keys={['revenue']}
              colors={['bg-amber-500']}
              yFormat={v => formatBRL(v)}
            />
          </div>
        </div>
      )}

      {/* ── Funil ── */}
      {tab === 'funnel' && funnel && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Funil de Conversão</h2>
            <span className="text-zinc-500 text-sm">{funnel.total} leads total · {funnel.lost} perdidos</span>
          </div>
          <div className="space-y-3">
            {funnel.funnel.map((stage, i) => (
              <div key={stage.stage} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-xs w-4">{i + 1}</span>
                    <span className="text-white font-medium">{stage.label}</span>
                    {stage.conversion_from_prev !== null && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        stage.conversion_from_prev >= 50 ? 'bg-emerald-900/50 text-emerald-400'
                        : stage.conversion_from_prev >= 25 ? 'bg-amber-900/50 text-amber-400'
                        : 'bg-red-900/50 text-red-400'
                      }`}>
                        ↓ {stage.conversion_from_prev}%
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-white font-semibold">{stage.count}</span>
                    <span className="text-zinc-600 text-xs ml-1">({stage.pct_of_total}%)</span>
                  </div>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-700"
                    style={{ width: `${stage.pct_of_total}%`, opacity: 1 - i * 0.12 }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Taxa de conversão global */}
          {funnel.funnel[0]?.count > 0 && (
            <div className="border-t border-zinc-800 pt-4 flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Taxa de conversão geral</span>
              <span className="text-amber-400 font-bold text-lg">
                {Math.round(((funnel.funnel[funnel.funnel.length - 1]?.count || 0) / funnel.funnel[0].count) * 100)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Origens ── */}
      {tab === 'sources' && sources && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
          <h2 className="text-white font-semibold">Origens de Lead</h2>
          {sources.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-6">Sem dados de origem ainda.</p>
          ) : (
            <>
              <div className="space-y-4">
                {sources.map(s => (
                  <HBar
                    key={s.source}
                    label={s.label}
                    sublabel={`${s.conversion_rate}% conversão`}
                    value={s.total}
                    max={sources[0]?.total || 1}
                    color="bg-amber-500"
                    right={`${s.total} leads · ${formatBRL(s.revenue)}`}
                  />
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm mt-4">
                  <thead>
                    <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                      <th className="text-left pb-2 font-medium">Origem</th>
                      <th className="text-right pb-2 font-medium">Leads</th>
                      <th className="text-right pb-2 font-medium">Fechados</th>
                      <th className="text-right pb-2 font-medium">Conv.</th>
                      <th className="text-right pb-2 font-medium">Faturamento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {sources.map(s => (
                      <tr key={s.source}>
                        <td className="py-2 text-white font-medium">{s.label}</td>
                        <td className="py-2 text-right text-zinc-300">{s.total}</td>
                        <td className="py-2 text-right text-emerald-400">{s.closed}</td>
                        <td className="py-2 text-right">
                          <span className={`text-xs font-bold ${s.conversion_rate >= 20 ? 'text-emerald-400' : s.conversion_rate >= 10 ? 'text-amber-400' : 'text-red-400'}`}>
                            {s.conversion_rate}%
                          </span>
                        </td>
                        <td className="py-2 text-right text-amber-400 font-medium">{formatBRL(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Velocidade ── */}
      {tab === 'velocity' && velocity && (
        <div className="space-y-6">
          {/* Ciclo médio */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-4">Ciclo de Vendas</h2>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-4xl font-bold text-amber-400">
                  {velocity.avg_cycle_days ?? '—'}
                </p>
                <p className="text-zinc-500 text-sm mt-1">dias em média<br/>até fechar</p>
              </div>
              <div className="flex-1 space-y-2">
                {velocity.buckets.map(b => (
                  <HBar
                    key={b.bucket}
                    label={b.bucket}
                    value={b.count}
                    max={Math.max(...velocity.buckets.map(x => x.count))}
                    color="bg-blue-500"
                    right={`${b.count}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Leads mais parados */}
          {velocity.most_stale?.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Leads mais parados</h2>
              <div className="space-y-2">
                {velocity.most_stale.map(l => (
                  <div key={l.id} className="flex items-center gap-3 py-2 border-b border-zinc-800 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{l.name || l.phone}</p>
                      <p className="text-zinc-500 text-xs">{l.stage}</p>
                    </div>
                    <span className={`text-sm font-bold px-2 py-1 rounded ${
                      l.days_idle >= 14 ? 'bg-red-900/30 text-red-400'
                      : l.days_idle >= 7  ? 'bg-amber-900/30 text-amber-400'
                      : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {l.days_idle}d
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Perdas ── */}
      {tab === 'lost' && lostData && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Motivos de Perda</h2>
            <span className="text-zinc-500 text-sm">{lostData.total} perdidos (últimos 6 meses)</span>
          </div>

          {lostData.total === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">🎉</p>
              <p className="text-zinc-400">Nenhuma perda registrada no período.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lostData.reasons.map(r => (
                <HBar
                  key={r.reason}
                  label={r.reason}
                  sublabel={`${r.pct}%`}
                  value={r.count}
                  max={lostData.reasons[0]?.count || 1}
                  color="bg-red-500"
                  right={`${r.count}`}
                />
              ))}
            </div>
          )}

          <div className="border-t border-zinc-800 pt-4 text-zinc-500 text-xs">
            💡 Ao marcar um lead como perdido, informe o motivo para alimentar este relatório.
          </div>
        </div>
      )}
    </div>
  );
}
