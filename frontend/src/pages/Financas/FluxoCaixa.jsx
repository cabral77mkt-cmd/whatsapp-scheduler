import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { useEntity } from '../../contexts/EntityContext';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const fmtShort = (v) => {
  const abs = Math.abs(v || 0);
  if (abs >= 1000) return `${v < 0 ? '-' : ''}R$${(abs / 1000).toFixed(1)}k`;
  return `R$${abs.toFixed(0)}`;
};

const DAYS_OPTIONS = [15, 30, 60, 90];

export default function FluxoCaixa() {
  const { entity }          = useEntity();
  const [data, setData]     = useState(null);
  const [days, setDays]     = useState(30);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    if (!entity) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ entity_id: entity.id, days });
      const r = await api.get(`/finance/cashflow?${params}`);
      setData(r);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [entity, days]);

  // Filtra dias com eventos para tabela
  const eventDays = data?.projection?.filter(d => d.events.length > 0) || [];
  const shownDays = showAll ? eventDays : eventDays.slice(0, 10);

  const chartData = data?.projection?.filter((_, i) => {
    // Para muitos dias, mostrar 1 a cada 2 ou 3 para não sobrecarregar
    if (days <= 30) return true;
    if (days <= 60) return i % 2 === 0;
    return i % 3 === 0;
  }) ?? [];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Fluxo de Caixa</h1>
          <p className="text-sm text-gray-400 mt-1">
            Projeção baseada em contas a pagar/receber e recorrências
            {entity ? ` · ${entity.icon || '💰'} ${entity.name}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {DAYS_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                days === d ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-500">Calculando projeção...</div>
      ) : !data ? null : (
        <>
          {/* Cards resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-900 border border-gray-700/40 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Saldo Atual</p>
              <p className={`text-lg font-bold ${data.current_balance >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                {fmt(data.current_balance)}
              </p>
            </div>
            <div className="bg-gray-900 border border-green-900/30 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">A Entrar</p>
              <p className="text-lg font-bold text-green-400">{fmt(data.total_incoming)}</p>
            </div>
            <div className="bg-gray-900 border border-red-900/30 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">A Sair</p>
              <p className="text-lg font-bold text-red-400">{fmt(data.total_outgoing)}</p>
            </div>
            <div className={`bg-gray-900 border rounded-xl p-4 ${
              data.final_balance >= 0 ? 'border-blue-900/30' : 'border-orange-900/30'
            }`}>
              <p className="text-xs text-gray-400 mb-1">Saldo em {days}d</p>
              <p className={`text-lg font-bold ${data.final_balance >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                {fmt(data.final_balance)}
              </p>
            </div>
          </div>

          {/* Alerta de saldo mínimo */}
          {data.lowest_balance < 0 && (
            <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4 mb-6 flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="text-red-400 font-semibold">Saldo negativo projetado</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  O saldo projetado chega a <span className="text-red-400 font-medium">{fmt(data.lowest_balance)}</span> neste período.
                  Verifique as contas a pagar.
                </p>
              </div>
            </div>
          )}

          {/* Gráfico */}
          <div className="bg-gray-900 border border-gray-700/40 rounded-xl p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Evolução do saldo projetado</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#6B7280', fontSize: 11 }}
                  tickFormatter={v => v.slice(5)} // MM-DD
                />
                <YAxis
                  tick={{ fill: '#6B7280', fontSize: 11 }}
                  tickFormatter={fmtShort}
                  width={60}
                />
                <Tooltip
                  formatter={(v) => [fmt(v), 'Saldo projetado']}
                  contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#9CA3AF', fontSize: 11 }}
                />
                <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#3B82F6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Eventos futuros */}
          <div className="bg-gray-900 border border-gray-700/40 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-300">
                Eventos previstos ({eventDays.length} dia{eventDays.length !== 1 ? 's' : ''})
              </h2>
              {eventDays.length > 10 && (
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {showAll ? 'Mostrar menos' : `Ver todos (${eventDays.length})`}
                </button>
              )}
            </div>

            {shownDays.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhuma conta ou recorrência prevista neste período.</p>
            ) : (
              <div className="space-y-3">
                {shownDays.map(day => {
                  const isToday  = day.is_today;
                  const dateObj  = new Date(day.date + 'T12:00:00');
                  const dateLabel = dateObj.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
                  return (
                    <div key={day.date} className={`rounded-xl p-3 border ${
                      isToday ? 'border-blue-700/50 bg-blue-900/10' : 'border-gray-700/30 bg-gray-800/40'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-300">{dateLabel}</span>
                          {isToday && <span className="text-xs bg-blue-600/30 text-blue-400 px-2 py-0.5 rounded-full">Hoje</span>}
                        </div>
                        <div className="flex gap-3 text-xs">
                          {day.day_income > 0  && <span className="text-green-400">+{fmt(day.day_income)}</span>}
                          {day.day_expense > 0 && <span className="text-red-400">-{fmt(day.day_expense)}</span>}
                          <span className={`font-bold ${day.balance >= 0 ? 'text-blue-300' : 'text-orange-400'}`}>
                            = {fmt(day.balance)}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {day.events.map((ev, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span>{ev.icon}</span>
                            <span className={ev.type === 'income' ? 'text-green-400' : 'text-red-400'}>
                              {ev.type === 'income' ? '+' : '-'}{fmt(ev.amount)}
                            </span>
                            <span className="text-gray-400 truncate">{ev.label}</span>
                            {ev.source === 'recurring' && (
                              <span className="text-gray-600 text-xs">(recorrente)</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
