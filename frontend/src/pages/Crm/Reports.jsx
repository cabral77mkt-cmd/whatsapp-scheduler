import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../lib/api';
import { STAGE_BY_ID, STAGES } from './stages';

const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDays = (d) => {
  if (d === null || d === undefined) return '—';
  const n = Number(d);
  if (n < 1) return `${Math.round(n * 24)}h`;
  return `${n.toFixed(1)}d`;
};

export default function Reports() {
  const [pipeline, setPipeline]     = useState(null);
  const [closing, setClosing]       = useState(null);
  const [reasons, setReasons]       = useState([]);
  const [activity, setActivity]     = useState(null);
  const [conversion, setConversion] = useState(null);
  const [stageTime, setStageTime]   = useState(null);
  const [forecast, setForecast]     = useState(null);

  useEffect(() => {
    api.get('/crm/reports/pipeline').then(setPipeline).catch(() => {});
    api.get('/crm/reports/closing').then(setClosing).catch(() => {});
    api.get('/crm/reports/loss-reasons').then(setReasons).catch(() => {});
    api.get('/crm/reports/activity').then(setActivity).catch(() => {});
    api.get('/crm/reports/conversion').then(setConversion).catch(() => {});
    api.get('/crm/reports/stage-time').then(setStageTime).catch(() => {});
    api.get('/crm/reports/forecast').then(setForecast).catch(() => {});
  }, []);

  const pipelineData = pipeline ? STAGES.map(s => ({
    name: s.label,
    count: pipeline.stages[s.id]?.count || 0,
    valor: pipeline.stages[s.id]?.total_potential || 0,
  })) : [];

  const stageTimeData = stageTime
    ? stageTime.by_stage
        .filter(s => s.avg_days !== null || s.avg_days_so_far !== null)
        .map(s => ({
          name: STAGE_BY_ID[s.stage]?.label || s.stage,
          'Concluídos (dias)': s.avg_days !== null ? +Number(s.avg_days).toFixed(1) : null,
          'Em andamento (dias)': s.avg_days_so_far !== null ? +Number(s.avg_days_so_far).toFixed(1) : null,
        }))
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">📈 Relatórios</h1>

      {/* ── Métricas de atividade ── */}
      {activity && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Follow-ups enviados"  value={activity.followups_sent}    icon="✓" color="bg-green-500/20" />
          <StatCard label="Follow-ups pendentes" value={activity.followups_pending}  icon="⏰" color="bg-orange-500/20" />
          <StatCard label="Leads parados (>7d)"  value={activity.leads_stale_7d}    icon="🕓" color="bg-yellow-500/20" />
          <StatCard label="Leads sem resposta"   value={activity.leads_no_response} icon="🤐" color="bg-red-500/20" />
        </div>
      )}

      {/* ── Fechamentos + Win Rate ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {closing && (
          <div className="card">
            <p className="label">Fechamentos (acumulado)</p>
            <p className="text-3xl font-bold text-emerald-400">{fmtBRL(closing.total_value)}</p>
            <p className="text-sm text-gray-400">{closing.count} negócio(s) fechado(s)</p>
          </div>
        )}
        {conversion && (
          <div className="card">
            <p className="label">Taxa de fechamento geral</p>
            <p className="text-3xl font-bold text-orange-400">{conversion.win_rate}%</p>
            <p className="text-sm text-gray-400">
              {conversion.closed} fechados · {conversion.lost} perdidos · {conversion.total_leads} total
            </p>
          </div>
        )}
      </div>

      {/* ── Forecast de receita ── */}
      {forecast && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-1">💰 Forecast de Receita</h2>
          <p className="text-xs text-gray-500 mb-4">Valor potencial do pipeline ponderado pela probabilidade de fechamento de cada etapa</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-800/60 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">Receita prevista</p>
              <p className="text-2xl font-bold text-orange-400">{fmtBRL(forecast.forecast_total)}</p>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">Pipeline total</p>
              <p className="text-2xl font-bold text-blue-400">{fmtBRL(forecast.pipeline_total)}</p>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">Realizado (fechado)</p>
              <p className="text-2xl font-bold text-emerald-400">{fmtBRL(forecast.realized)}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {forecast.by_stage.filter(s => s.potential > 0).map(s => {
              const stage = STAGE_BY_ID[s.stage];
              return (
                <div key={s.stage} className="flex items-center gap-3 text-xs">
                  <span className="w-36 text-gray-400 truncate">{stage?.label || s.stage}</span>
                  <span className="w-14 text-gray-500 text-right">{Math.round(s.prob * 100)}%</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-orange-500/70" style={{ width: `${s.prob * 100}%` }} />
                  </div>
                  <span className="w-28 text-right text-emerald-400">{fmtBRL(s.weighted)}</span>
                  <span className="w-24 text-right text-gray-500">/ {fmtBRL(s.potential)}</span>
                </div>
              );
            })}
            {forecast.by_stage.every(s => s.potential === 0) && (
              <p className="text-gray-500 text-sm">Nenhum lead ativo com valor potencial cadastrado.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Funil de conversão por etapa ── */}
      {conversion && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">🔽 Funil de conversão por etapa</h2>
          <p className="text-xs text-gray-500 mb-3">Quantos leads já passaram por cada etapa (histórico total)</p>
          <div className="space-y-2">
            {conversion.by_stage
              .filter(s => s.entered > 0)
              .map((s, i, arr) => {
                const stage = STAGE_BY_ID[s.stage];
                const max = arr[0]?.entered || 1;
                const pct = Math.round((s.entered / max) * 100);
                return (
                  <div key={s.stage}>
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-0.5">
                      <span>{stage?.label || s.stage}</span>
                      <span className="text-white font-medium">{s.entered} leads</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: stage?.color?.replace('bg-', '')
                            ? `var(--color-${stage.color.replace('bg-', '').replace('-500', '')})` : '#F97316',
                          backgroundColor: '#F97316',
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-600 mt-0.5">
                      <span>{pct}% do topo</span>
                      {s.current > 0 && <span>{s.current} agora</span>}
                    </div>
                  </div>
                );
              })}
            {conversion.by_stage.every(s => s.entered === 0) && (
              <p className="text-gray-500 text-sm">Nenhuma movimentação registrada ainda. O histórico é gerado conforme você move leads entre etapas.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Tempo médio por etapa ── */}
      {stageTimeData.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-1">⏱ Tempo médio por etapa</h2>
          <p className="text-xs text-gray-500 mb-3">Quantos dias os leads ficam em cada etapa antes de avançar</p>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={stageTimeData} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 10 }} angle={-35} textAnchor="end" height={90} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} unit="d" />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151' }}
                  formatter={(v) => v !== null ? `${v} dias` : '—'}
                />
                <Bar dataKey="Concluídos (dias)" fill="#F97316" radius={[4,4,0,0]} />
                <Bar dataKey="Em andamento (dias)" fill="#6366F1" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-2 text-xs text-gray-400 justify-center">
            <span><span className="inline-block w-3 h-3 rounded bg-orange-500 mr-1" />Leads que avançaram</span>
            <span><span className="inline-block w-3 h-3 rounded bg-indigo-500 mr-1" />Leads ainda na etapa</span>
          </div>
        </div>
      )}

      {stageTimeData.length === 0 && stageTime && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-2">⏱ Tempo médio por etapa</h2>
          <p className="text-gray-500 text-sm">Disponível após leads avançarem entre etapas. Os dados são calculados a partir do histórico de movimentações.</p>
        </div>
      )}

      {/* ── Leads por etapa (gráfico existente) ── */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-3">Funil — leads por etapa (snapshot atual)</h2>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={pipelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 10 }} angle={-30} textAnchor="end" height={80} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151' }} />
              <Bar dataKey="count" fill="#F97316" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Motivos de perda ── */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-3">Motivos de perda</h2>
        {reasons.length === 0 && <p className="text-gray-500 text-sm">Nenhum lead perdido ainda.</p>}
        {reasons.map(r => (
          <div key={r.reason} className="flex items-center justify-between border-b border-gray-800 py-2">
            <span className="text-gray-300 text-sm">{r.reason}</span>
            <span className="text-white font-bold">{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className="card flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${color}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
}
