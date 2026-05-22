import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';

function formatBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Commissions() {
  const [summary,     setSummary]     = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [config,      setConfig]      = useState({ percentage: 0, active: false });
  const [globalPct,   setGlobalPct]   = useState('');
  const [filter,      setFilter]      = useState('all');
  const [tab,         setTab]         = useState('my'); // my | leaderboard | config
  const [toast,       setToast]       = useState(null);
  const [paying,      setPaying]      = useState(null);

  const isAdmin = (() => {
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.isAdmin || payload.role === 'manager';
    } catch { return false; }
  })();

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadAll = useCallback(async () => {
    try {
      const [sumRes, listRes, cfgRes] = await Promise.all([
        api.get('/crm/commissions/summary'),
        api.get('/crm/commissions', { params: { status: filter === 'all' ? undefined : filter } }),
        api.get('/crm/commissions/config'),
      ]);
      setSummary(sumRes.data);
      setCommissions(listRes.data || []);
      setConfig(cfgRes.data.personal || { percentage: 0, active: false });
      setGlobalPct(String(cfgRes.data.global?.percentage || 0));
    } catch {
      showToast('Erro ao carregar comissões', 'error');
    }
  }, [filter]);

  const loadLeaderboard = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get('/crm/commissions/leaderboard');
      setLeaderboard(res || []);
    } catch {}
  }, [isAdmin]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  async function markPaid(id) {
    setPaying(id);
    try {
      await api.patch(`/crm/commissions/${id}/pay`);
      await loadAll();
      showToast('Comissão marcada como paga!');
    } catch {
      showToast('Erro ao marcar pagamento', 'error');
    }
    setPaying(null);
  }

  async function saveGlobalConfig() {
    try {
      await api.put('/crm/commissions/config', {
        percentage:     parseFloat(globalPct) || 0,
        active:         parseFloat(globalPct) > 0,
        target_user_id: 0,
      });
      showToast('Config global salva!');
      await loadAll();
    } catch {
      showToast('Erro ao salvar', 'error');
    }
  }

  const filtered = filter === 'all' ? commissions : commissions.filter(c => c.status === filter);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg
          ${toast.type === 'error' ? 'bg-red-900 text-red-200' : 'bg-emerald-900 text-emerald-200'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>💰</span> Comissões
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Acompanhe suas comissões por negócios fechados.
          </p>
        </div>
        <button
          onClick={() => {
            const token = localStorage.getItem('wa_token') || '';
            fetch('/api/crm/export/commissions', { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.blob()).then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'comissoes.csv'; a.click();
                URL.revokeObjectURL(url);
              }).catch(() => {});
          }}
          className="btn btn-ghost text-sm border border-zinc-700 shrink-0"
          title="Exportar comissões para CSV"
        >
          ⬇ CSV
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total acumulado', value: formatBRL(summary.total),      color: 'text-amber-400'    },
            { label: 'Este mês',        value: formatBRL(summary.this_month),  color: 'text-emerald-400'  },
            { label: 'A receber',       value: formatBRL(summary.pending),     color: 'text-blue-400'     },
            { label: 'Já pago',         value: formatBRL(summary.paid),        color: 'text-zinc-300'     },
          ].map(c => (
            <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-500 text-xs mb-1">{c.label}</p>
              <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-fit">
        {[
          { key: 'my',          label: 'Minhas comissões' },
          ...(isAdmin ? [{ key: 'leaderboard', label: 'Ranking' }] : []),
          ...(isAdmin ? [{ key: 'config',      label: 'Config' }] : []),
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
              ${tab === t.key
                ? 'bg-amber-500 text-black'
                : 'text-zinc-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Minhas comissões ── */}
      {tab === 'my' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {/* Filter bar */}
          <div className="flex gap-2 p-4 border-b border-zinc-800">
            {[
              { key: 'all',     label: 'Todas' },
              { key: 'pending', label: 'A receber' },
              { key: 'paid',    label: 'Pagas' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
                  ${filter === f.key
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'text-zinc-400 hover:text-white bg-zinc-800'}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-5xl mb-3">💰</p>
              <p className="text-zinc-400">Nenhuma comissão encontrada.</p>
              <p className="text-zinc-600 text-sm mt-1">Feche negócios para ver suas comissões aqui.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500 text-xs border-b border-zinc-800 bg-zinc-900/50">
                    <th className="text-left px-4 py-3 font-medium">Lead</th>
                    <th className="text-right px-4 py-3 font-medium">Valor negócio</th>
                    <th className="text-right px-4 py-3 font-medium">%</th>
                    <th className="text-right px-4 py-3 font-medium">Comissão</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Data</th>
                    {isAdmin && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{c.lead_name || c.lead_phone}</p>
                        {isAdmin && c.seller_name && (
                          <p className="text-zinc-500 text-xs">{c.seller_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-300">{formatBRL(c.deal_value)}</td>
                      <td className="px-4 py-3 text-right text-zinc-400">{c.percentage}%</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-400">{formatBRL(c.commission_value)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium
                          ${c.status === 'paid'
                            ? 'bg-emerald-900/50 text-emerald-400'
                            : 'bg-blue-900/50 text-blue-400'}`}>
                          {c.status === 'paid' ? 'Pago' : 'Pendente'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                        {new Date(c.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          {c.status === 'pending' && (
                            <button
                              onClick={() => markPaid(c.id)}
                              disabled={paying === c.id}
                              className="text-xs px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded transition-colors disabled:opacity-50"
                            >
                              {paying === c.id ? '...' : 'Pagar'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Ranking (admin) ── */}
      {tab === 'leaderboard' && isAdmin && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="text-white font-semibold">Ranking do Mês</h2>
          </div>
          {leaderboard.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">Sem dados ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500 text-xs border-b border-zinc-800 bg-zinc-900/50">
                    <th className="text-left px-4 py-3 font-medium">#</th>
                    <th className="text-left px-4 py-3 font-medium">Vendedor</th>
                    <th className="text-right px-4 py-3 font-medium">Deals</th>
                    <th className="text-right px-4 py-3 font-medium">Este mês</th>
                    <th className="text-right px-4 py-3 font-medium">A pagar</th>
                    <th className="text-right px-4 py-3 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {leaderboard.map((r, i) => (
                    <tr key={r.user_id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`font-bold text-sm ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-zinc-300' : i === 2 ? 'text-amber-700' : 'text-zinc-600'}`}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}°`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white font-medium">{r.seller_name}</td>
                      <td className="px-4 py-3 text-right text-zinc-400">{r.deals}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-400">{formatBRL(r.this_month)}</td>
                      <td className="px-4 py-3 text-right text-blue-400">{formatBRL(r.pending)}</td>
                      <td className="px-4 py-3 text-right text-zinc-300">{formatBRL(r.total_commission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Config (admin) ── */}
      {tab === 'config' && isAdmin && (
        <div className="space-y-6">
          {/* Config global */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <h2 className="text-white font-semibold text-lg">Percentual padrão (global)</h2>
            <p className="text-zinc-400 text-sm">
              Aplicado a vendedores sem configuração específica. Use 0 para desativar comissões globais.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={globalPct}
                onChange={e => setGlobalPct(e.target.value)}
                className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
              />
              <span className="text-zinc-400 text-sm">%</span>
              <button
                onClick={saveGlobalConfig}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-sm transition-colors"
              >
                Salvar global
              </button>
            </div>
          </div>

          {/* Info minha config */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-2">
            <h2 className="text-white font-semibold">Minha configuração</h2>
            <p className="text-zinc-400 text-sm">
              Percentual: <span className="text-amber-400 font-bold">{config.percentage || 0}%</span>
              {config.active ? (
                <span className="ml-2 text-emerald-400">✓ Ativo</span>
              ) : (
                <span className="ml-2 text-zinc-600">· Inativo</span>
              )}
            </p>
            <p className="text-zinc-600 text-xs">
              Para alterar sua própria configuração, peça ao administrador.
            </p>
          </div>
        </div>
      )}

      {/* Monthly chart simples */}
      {tab === 'my' && summary?.monthly_chart?.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">Evolução mensal</h3>
          <div className="flex items-end gap-2 h-32">
            {summary.monthly_chart.map(m => {
              const maxVal = Math.max(...summary.monthly_chart.map(x => x.value));
              const pct = maxVal > 0 ? (m.value / maxVal) * 100 : 0;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-amber-400 text-xs font-bold">{formatBRL(m.value).replace('R$ ', 'R$')}</span>
                  <div className="w-full rounded-t" style={{ height: `${Math.max(pct, 4)}%`, backgroundColor: '#D4AF37' }} />
                  <span className="text-zinc-600 text-xs">{m.month.slice(5)}/{m.month.slice(2, 4)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
