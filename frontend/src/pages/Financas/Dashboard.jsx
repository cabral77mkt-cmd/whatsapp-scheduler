import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useEntity } from '../../contexts/EntityContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const pctColor = (p) => {
  if (p >= 100) return 'bg-red-500';
  if (p >= 80)  return 'bg-yellow-400';
  return 'bg-green-500';
};

export default function FinancasDashboard() {
  const { entity }           = useEntity();
  const [data, setData]      = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate             = useNavigate();

  const load = useCallback(async () => {
    if (!entity) return;
    setLoading(true);
    try {
      const dash = await api.get(`/finance/dashboard?entity_id=${entity.id}`);
      setData(dash);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Carregando...</div>
  );
  if (!data) return null;

  const { monthly_chart, recent_transactions, top_categories,
          totals_current_month, budgets, comparison, cashflow,
          health_score, urgent_payables } = data;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* Header com empresa */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {entity && (
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium"
                style={{ backgroundColor: entity.color + '22', color: entity.color, border: `1px solid ${entity.color}44` }}
              >
                {entity.icon} {entity.name}
              </span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">Dashboard Financeiro</h1>
        </div>
        <button
          onClick={load}
          className="text-gray-400 hover:text-white text-sm flex items-center gap-1 transition-colors"
        >
          🔄 Atualizar
        </button>
      </div>

      {/* Health Score */}
      {health_score !== undefined && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center gap-5">
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#374151" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none"
                stroke={health_score >= 70 ? '#10B981' : health_score >= 40 ? '#F59E0B' : '#EF4444'}
                strokeWidth="3" strokeDasharray={`${health_score} 100`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold text-white">{health_score}</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              Saúde Financeira: {' '}
              <span className={health_score >= 70 ? 'text-green-400' : health_score >= 40 ? 'text-yellow-400' : 'text-red-400'}>
                {health_score >= 70 ? 'Boa' : health_score >= 40 ? 'Atenção' : 'Crítica'}
              </span>
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Saldo · Orçamentos · Inadimplência</p>
          </div>
          {urgent_payables?.length > 0 && (
            <div className="ml-auto text-right">
              <p className="text-xs text-red-400 font-semibold">⏰ {urgent_payables.length} conta(s) urgente(s)</p>
              <p className="text-xs text-gray-500">
                {urgent_payables[0].description}
                {urgent_payables.length > 1 ? ` +${urgent_payables.length - 1} mais` : ''}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Totais do mês */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-green-900/40 border border-green-700 rounded-xl p-4">
          <p className="text-green-400 text-sm font-medium">Entradas (mês)</p>
          <p className="text-2xl font-bold text-white mt-1">{fmt(totals_current_month.income)}</p>
        </div>
        <div className="bg-red-900/40 border border-red-700 rounded-xl p-4">
          <p className="text-red-400 text-sm font-medium">Saídas (mês)</p>
          <p className="text-2xl font-bold text-white mt-1">{fmt(totals_current_month.expense)}</p>
        </div>
        <div className={`${totals_current_month.balance >= 0 ? 'bg-blue-900/40 border-blue-700' : 'bg-orange-900/40 border-orange-700'} border rounded-xl p-4`}>
          <p className="text-blue-300 text-sm font-medium">Saldo (mês)</p>
          <p className="text-2xl font-bold text-white mt-1">{fmt(totals_current_month.balance)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico mensal */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Entradas vs Saídas (6 meses)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly_chart} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="label" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v, name) => [fmt(v), name === 'income' ? 'Entradas' : 'Saídas']}
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#F9FAFB' }}
              />
              <Legend formatter={(v) => v === 'income' ? 'Entradas' : 'Saídas'} />
              <Bar dataKey="income"  fill="#10B981" radius={[4,4,0,0]} />
              <Bar dataKey="expense" fill="#EF4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top categorias */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Top Gastos (mês atual)</h2>
          {top_categories.length === 0 ? (
            <p className="text-gray-500 text-sm">Sem despesas no mês atual.</p>
          ) : (
            <div className="space-y-3">
              {top_categories.map((cat) => (
                <div key={cat.id || cat.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white">{cat.icon} {cat.name || 'Sem categoria'}</span>
                    <span className="text-gray-300">{fmt(cat.total)} ({cat.percent}%)</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${cat.percent}%`, backgroundColor: cat.color || '#6B7280' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orçamentos */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-white">Orçamentos (mês)</h2>
            <button
              onClick={() => navigate('/fin/orcamentos')}
              className="text-blue-400 text-sm hover:underline"
            >
              Gerenciar
            </button>
          </div>
          {budgets.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum orçamento definido.</p>
          ) : (
            <div className="space-y-3">
              {budgets.map((b) => (
                <div key={b.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white">{b.category_icon} {b.category_name}</span>
                    <span className="text-gray-300">{fmt(b.spent)} / {fmt(b.amount)} ({b.percent}%)</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${pctColor(b.percent)}`}
                      style={{ width: `${Math.min(b.percent, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fluxo de caixa projetado */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Fluxo Projetado (3 meses)</h2>
          {cashflow.length === 0 ? (
            <p className="text-gray-500 text-sm">Dados insuficientes para projeção.</p>
          ) : (
            <div className="space-y-2">
              {cashflow.map((cf) => (
                <div key={cf.label} className="flex justify-between items-center bg-gray-700/50 rounded-lg p-3">
                  <span className="text-gray-300 font-medium">{cf.label}</span>
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-400">+{fmt(cf.projected_income)}</span>
                    <span className="text-red-400">-{fmt(cf.projected_expense)}</span>
                    <span className={`font-bold ${cf.projected_balance >= 0 ? 'text-blue-300' : 'text-orange-400'}`}>
                      {fmt(cf.projected_balance)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Comparativo mês a mês */}
      {comparison.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Comparativo Mês a Mês (Despesas)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left pb-2">Categoria</th>
                  <th className="text-right pb-2">Mês Atual</th>
                  <th className="text-right pb-2">Mês Anterior</th>
                  <th className="text-right pb-2">Variação</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.id || row.name} className="border-b border-gray-700/50">
                    <td className="py-2 text-white">{row.icon} {row.name || 'Sem cat.'}</td>
                    <td className="py-2 text-right text-white">{fmt(row.total)}</td>
                    <td className="py-2 text-right text-gray-400">{fmt(row.prev_total)}</td>
                    <td className="py-2 text-right">
                      {row.diff === 0 ? (
                        <span className="text-gray-500">—</span>
                      ) : row.diff < 0 ? (
                        <span className="text-green-400">
                          ↓ {fmt(Math.abs(row.diff))}{row.diff_pct != null ? ` (${Math.abs(row.diff_pct)}%)` : ''}
                        </span>
                      ) : (
                        <span className="text-red-400">
                          ↑ {fmt(row.diff)}{row.diff_pct != null ? ` (+${row.diff_pct}%)` : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Últimas transações */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-white">Últimas Transações</h2>
          <button
            onClick={() => navigate('/fin/transacoes')}
            className="text-blue-400 text-sm hover:underline"
          >
            Ver todas
          </button>
        </div>
        {recent_transactions.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhuma transação registrada.</p>
        ) : (
          <div className="space-y-2">
            {recent_transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl flex-shrink-0">
                    {tx.type === 'income' ? '✅' : '🔴'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{tx.description || '(sem descrição)'}</p>
                    <p className="text-gray-400 text-xs">
                      {tx.date}
                      {tx.category_name && ` · ${tx.category_icon} ${tx.category_name}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {tx.source === 'whatsapp' && (
                    <span className="text-xs bg-green-900/50 text-green-400 border border-green-700 rounded px-1.5 py-0.5">WA</span>
                  )}
                  <span className={`font-bold ${tx.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                    {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
