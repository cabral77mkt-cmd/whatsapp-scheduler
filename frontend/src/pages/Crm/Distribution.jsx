import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';

const STRATEGIES = [
  { value: 'round_robin', label: 'Round-Robin', desc: 'Distribui em rodízio — cada vendedor recebe um lead por vez' },
  { value: 'capacity',    label: 'Capacidade',  desc: 'Distribui para quem tem menos leads ativos (respeita o limite máximo)' },
];

export default function Distribution() {
  const [config,     setConfig]     = useState({ enabled: false, strategy: 'round_robin', max_leads_per_seller: 50 });
  const [members,    setMembers]    = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [stats,      setStats]      = useState([]);
  const [addId,      setAddId]      = useState('');
  const [saving,     setSaving]     = useState(false);
  const [adding,     setAdding]     = useState(false);
  const [toast,      setToast]      = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    try {
      const [cfg, st] = await Promise.all([
        api.get('/crm/distribution/config'),
        api.get('/crm/distribution/stats'),
      ]);
      setConfig({
        enabled:              !!cfg.data.config.enabled,
        strategy:             cfg.data.config.strategy             || 'round_robin',
        max_leads_per_seller: cfg.data.config.max_leads_per_seller || 50,
      });
      setMembers(cfg.data.members    || []);
      setCandidates(cfg.data.candidates || []);
      setStats(st.data || []);
    } catch (e) {
      showToast('Erro ao carregar configurações', 'error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveConfig() {
    setSaving(true);
    try {
      await api.put('/crm/distribution/config', config);
      showToast('Configuração salva!');
    } catch {
      showToast('Erro ao salvar', 'error');
    }
    setSaving(false);
  }

  async function addMember() {
    if (!addId) return;
    setAdding(true);
    try {
      await api.post('/crm/distribution/members', { member_user_id: Number(addId) });
      setAddId('');
      await load();
      showToast('Vendedor adicionado!');
    } catch (e) {
      showToast(e.response?.data?.error || 'Erro ao adicionar', 'error');
    }
    setAdding(false);
  }

  async function removeMember(memberId) {
    if (!confirm('Remover vendedor da distribuição?')) return;
    try {
      await api.delete(`/crm/distribution/members/${memberId}`);
      await load();
      showToast('Vendedor removido');
    } catch {
      showToast('Erro ao remover', 'error');
    }
  }

  async function toggleMember(memberId) {
    try {
      await api.patch(`/crm/distribution/members/${memberId}/toggle`);
      await load();
    } catch {
      showToast('Erro ao alternar status', 'error');
    }
  }

  // Filtra candidatos que ainda não são membros
  const availableCandidates = candidates.filter(
    c => !members.some(m => m.member_user_id === c.id)
  );

  // Mapa de stats por member_user_id
  const statsMap = Object.fromEntries(stats.map(s => [s.member_user_id, s]));

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
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <span>👥</span> Distribuição de Leads
        </h1>
        <p className="text-zinc-400 text-sm mt-1">
          Atribui automaticamente novos leads recebidos pelo WhatsApp a vendedores da equipe.
        </p>
      </div>

      {/* Config geral */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
        <h2 className="text-white font-semibold text-lg">Configuração</h2>

        {/* Ativar/Desativar */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-medium">Distribuição automática</p>
            <p className="text-zinc-400 text-sm">Quando ativada, novos leads são atribuídos automaticamente</p>
          </div>
          <button
            onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${config.enabled ? 'bg-amber-500' : 'bg-zinc-700'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
              ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Estratégia */}
        <div>
          <label className="block text-zinc-300 text-sm font-medium mb-2">Estratégia</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STRATEGIES.map(s => (
              <button
                key={s.value}
                onClick={() => setConfig(c => ({ ...c, strategy: s.value }))}
                className={`text-left p-4 rounded-lg border transition-all
                  ${config.strategy === s.value
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
              >
                <p className={`font-semibold text-sm ${config.strategy === s.value ? 'text-amber-400' : 'text-white'}`}>
                  {s.label}
                </p>
                <p className="text-zinc-400 text-xs mt-1">{s.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Máximo de leads */}
        {config.strategy === 'capacity' && (
          <div>
            <label className="block text-zinc-300 text-sm font-medium mb-1">
              Máximo de leads ativos por vendedor
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={config.max_leads_per_seller}
              onChange={e => setConfig(c => ({ ...c, max_leads_per_seller: Number(e.target.value) }))}
              className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
        )}

        <button
          onClick={saveConfig}
          disabled={saving}
          className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-lg text-sm transition-colors"
        >
          {saving ? 'Salvando...' : 'Salvar configuração'}
        </button>
      </div>

      {/* Membros */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Vendedores na fila</h2>
          <span className="text-zinc-500 text-sm">{members.filter(m => m.active).length} ativos</span>
        </div>

        {/* Adicionar */}
        <div className="flex gap-2">
          <select
            value={addId}
            onChange={e => setAddId(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
          >
            <option value="">Selecionar vendedor...</option>
            {availableCandidates.map(c => (
              <option key={c.id} value={c.id}>
                {c.display_name || c.username} ({c.role})
              </option>
            ))}
          </select>
          <button
            onClick={addMember}
            disabled={!addId || adding}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-lg text-sm transition-colors"
          >
            {adding ? '...' : 'Adicionar'}
          </button>
        </div>

        {/* Lista */}
        {members.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-6">
            Nenhum vendedor na fila. Adicione um acima.
          </p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {members.map(m => {
              const s = statsMap[m.member_user_id] || {};
              return (
                <div key={m.id} className="py-3 flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {(m.display_name || m.username || '?')[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {m.display_name || m.username}
                    </p>
                    <p className="text-zinc-500 text-xs">
                      {s.active_leads ?? 0} ativos · {s.total_assigned ?? 0} total atribuídos
                      {m.last_assigned_at && ` · último: ${new Date(m.last_assigned_at).toLocaleDateString('pt-BR')}`}
                    </p>
                  </div>

                  {/* Status badge */}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.active
                    ? 'bg-emerald-900/50 text-emerald-400'
                    : 'bg-zinc-800 text-zinc-500'}`}>
                    {m.active ? 'Ativo' : 'Pausado'}
                  </span>

                  {/* Actions */}
                  <button
                    onClick={() => toggleMember(m.member_user_id)}
                    title={m.active ? 'Pausar' : 'Ativar'}
                    className="text-zinc-400 hover:text-white transition-colors text-sm px-2 py-1 rounded hover:bg-zinc-800"
                  >
                    {m.active ? '⏸' : '▶'}
                  </button>
                  <button
                    onClick={() => removeMember(m.member_user_id)}
                    title="Remover"
                    className="text-zinc-500 hover:text-red-400 transition-colors text-sm px-2 py-1 rounded hover:bg-zinc-800"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Estatísticas */}
      {stats.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h2 className="text-white font-semibold text-lg">Estatísticas</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                  <th className="text-left pb-2 font-medium">Vendedor</th>
                  <th className="text-right pb-2 font-medium">Total atrib.</th>
                  <th className="text-right pb-2 font-medium">Ativos</th>
                  <th className="text-right pb-2 font-medium">Fechados</th>
                  <th className="text-right pb-2 font-medium">Último atrib.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {stats.map(s => (
                  <tr key={s.member_user_id}>
                    <td className="py-2 text-white font-medium">
                      {s.name}
                      {!s.active && <span className="ml-2 text-xs text-zinc-600">(pausado)</span>}
                    </td>
                    <td className="py-2 text-right text-zinc-300">{s.total_assigned}</td>
                    <td className="py-2 text-right">
                      <span className="text-emerald-400">{s.active_leads}</span>
                    </td>
                    <td className="py-2 text-right text-zinc-400">{s.closed_leads}</td>
                    <td className="py-2 text-right text-zinc-500 text-xs">
                      {s.last_assigned_at
                        ? new Date(s.last_assigned_at).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-500 space-y-1">
        <p>💡 <strong className="text-zinc-400">Round-Robin:</strong> cada novo lead vai para o próximo vendedor da fila, independente da carga atual.</p>
        <p>💡 <strong className="text-zinc-400">Capacidade:</strong> o lead vai para quem tem menos leads ativos, respeitando o limite máximo configurado.</p>
        <p>💡 Vendedores pausados não recebem novos leads, mas mantêm os já atribuídos.</p>
      </div>
    </div>
  );
}
