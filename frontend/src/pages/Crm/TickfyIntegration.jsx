import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';

const STATUS_OPTIONS = [
  { code: 'PG', label: 'Pago',        color: 'bg-emerald-900/50 text-emerald-400' },
  { code: 'NP', label: 'Não Pago',    color: 'bg-zinc-800 text-zinc-400' },
  { code: 'EA', label: 'Em Análise',  color: 'bg-amber-900/50 text-amber-400' },
  { code: 'CA', label: 'Cancelado',   color: 'bg-red-900/50 text-red-400' },
  { code: 'DV', label: 'Devolvido',   color: 'bg-purple-900/50 text-purple-400' },
];

const CRM_STAGES = [
  { value: 'entrou_contato', label: 'Entrou em Contato' },
  { value: 'qualificado',    label: 'Qualificado'        },
  { value: 'proposta',       label: 'Proposta Enviada'   },
  { value: 'negociacao',     label: 'Em Negociação'      },
];

function formatBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function statusBadge(code) {
  const s = STATUS_OPTIONS.find(o => o.code === code);
  return s
    ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
    : <span className="text-xs text-zinc-500">{code}</span>;
}

export default function TickfyIntegration() {
  const [cfg,      setCfg]      = useState(null);
  const [stats,    setStats]    = useState({});
  const [history,  setHistory]  = useState([]);
  const [preview,  setPreview]  = useState([]);
  const [tab,      setTab]      = useState('config');
  const [syncing,  setSyncing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState(null);

  // Form state (espelha o config)
  const [form, setForm] = useState({
    enabled:        false,
    sync_statuses:  ['PG'],
    default_stage:  'entrou_contato',
    default_tag:    'Tickfy',
    tag_with_event: true,
    create_note:    true,
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadConfig = useCallback(async () => {
    try {
      const res = await api.get('/crm/tickfy/config');
      setCfg(res.config);
      setStats(res.stats || {});
      const c = res.config;
      let parsed = ['PG'];
      try { parsed = JSON.parse(c.sync_statuses || '["PG"]'); } catch {}
      setForm({
        enabled:        !!c.enabled,
        sync_statuses:  parsed,
        default_stage:  c.default_stage  || 'entrou_contato',
        default_tag:    c.default_tag    || 'Tickfy',
        tag_with_event: c.tag_with_event !== 0,
        create_note:    c.create_note    !== 0,
      });
    } catch {
      showToast('Erro ao carregar configuração', 'error');
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.get('/crm/tickfy/history', { params: { limit: 50 } });
      setHistory(res || []);
    } catch {}
  }, []);

  const loadPreview = useCallback(async () => {
    try {
      const res = await api.get('/crm/tickfy/preview');
      setPreview(res || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadConfig();
    loadHistory();
    loadPreview();
  }, [loadConfig, loadHistory, loadPreview]);

  function toggleStatus(code) {
    setForm(f => {
      const has = f.sync_statuses.includes(code);
      return {
        ...f,
        sync_statuses: has
          ? f.sync_statuses.filter(s => s !== code)
          : [...f.sync_statuses, code],
      };
    });
  }

  async function saveConfig() {
    setSaving(true);
    try {
      await api.put('/crm/tickfy/config', {
        ...form,
        sync_statuses: JSON.stringify(form.sync_statuses),
      });
      showToast('Configuração salva!');
      await loadConfig();
    } catch {
      showToast('Erro ao salvar', 'error');
    }
    setSaving(false);
  }

  async function runSync() {
    setSyncing(true);
    try {
      const res = await api.post('/crm/tickfy/sync');
      const d = res;
      showToast(`✅ ${d.synced} leads sincronizados, ${d.skipped} sem telefone`);
      await Promise.all([loadConfig(), loadHistory(), loadPreview()]);
    } catch {
      showToast('Erro durante sync', 'error');
    }
    setSyncing(false);
  }

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>🎟️</span> Tickfy → CRM
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Sincroniza compradores de ingressos Tickfy como leads no CRM automaticamente.
          </p>
        </div>

        {/* Status pill */}
        <div className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${
          cfg?.enabled ? 'bg-emerald-900/50 text-emerald-400' : 'bg-zinc-800 text-zinc-400'
        }`}>
          {cfg?.enabled ? '● Ativa' : '○ Inativa'}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Leads criados',     value: stats.leads_created ?? '—', color: 'text-emerald-400' },
          { label: 'Leads enriquecidos',value: stats.leads_updated ?? '—', color: 'text-blue-400'    },
          { label: 'Sem telefone',      value: stats.skipped       ?? '—', color: 'text-zinc-500'    },
          { label: 'Aguardando sync',   value: stats.pending       ?? '—', color: 'text-amber-400'   },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Sync manual */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-white font-medium text-sm">Sincronização manual</p>
          <p className="text-zinc-500 text-xs mt-0.5">
            {stats.pending > 0
              ? `${stats.pending} vendas aguardam sincronização`
              : 'Todas as vendas elegíveis já foram sincronizadas'}
            {stats.last_sync_at && ` · Último sync: ${new Date(stats.last_sync_at).toLocaleString('pt-BR')}`}
          </p>
        </div>
        <button
          onClick={runSync}
          disabled={syncing || !cfg?.enabled}
          className="shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-semibold rounded-lg text-sm transition-colors"
        >
          {syncing ? 'Sincronizando...' : '🔄 Sincronizar agora'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-fit">
        {[
          { key: 'config',  label: '⚙️ Configuração' },
          { key: 'preview', label: `📋 Pendentes (${preview.length})` },
          { key: 'history', label: '📜 Histórico'    },
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

      {/* ── Config tab ── */}
      {tab === 'config' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6">

          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Integração ativa</p>
              <p className="text-zinc-500 text-xs mt-0.5">
                Novas vendas detectadas pelo poller Tickfy serão sincronizadas automaticamente
              </p>
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${form.enabled ? 'bg-amber-500' : 'bg-zinc-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${form.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="border-t border-zinc-800" />

          {/* Status que disparam sync */}
          <div>
            <label className="block text-zinc-300 text-sm font-medium mb-2">
              Status que disparam sincronização
            </label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.code}
                  onClick={() => toggleStatus(s.code)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                    ${form.sync_statuses.includes(s.code)
                      ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                      : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-zinc-600 text-xs mt-2">Recomendado: apenas "Pago"</p>
          </div>

          {/* Estágio inicial */}
          <div>
            <label className="block text-zinc-300 text-sm font-medium mb-1">
              Estágio inicial do lead criado
            </label>
            <select
              value={form.default_stage}
              onChange={e => setForm(f => ({ ...f, default_stage: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
            >
              {CRM_STAGES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Tag padrão */}
          <div>
            <label className="block text-zinc-300 text-sm font-medium mb-1">
              Tag padrão
            </label>
            <input
              type="text"
              value={form.default_tag}
              onChange={e => setForm(f => ({ ...f, default_tag: e.target.value }))}
              placeholder="Ex: Tickfy, Evento, Lead-Evento"
              className="w-64 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Toggles extras */}
          <div className="space-y-3">
            {[
              { key: 'tag_with_event', label: 'Taguear com nome do evento', desc: 'Cria uma tag adicional com o nome do evento (ex: "Show do Rock")' },
              { key: 'create_note',    label: 'Registrar nota no lead',     desc: 'Adiciona uma nota no histórico do lead com os dados da compra' },
            ].map(opt => (
              <div key={opt.key} className="flex items-center justify-between">
                <div>
                  <p className="text-zinc-200 text-sm">{opt.label}</p>
                  <p className="text-zinc-600 text-xs">{opt.desc}</p>
                </div>
                <button
                  onClick={() => setForm(f => ({ ...f, [opt.key]: !f[opt.key] }))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                    ${form[opt.key] ? 'bg-amber-500' : 'bg-zinc-700'}`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform
                    ${form[opt.key] ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={saveConfig}
            disabled={saving}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-lg text-sm transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar configuração'}
          </button>

          {/* Dica para configurar Tickfy */}
          {!cfg?.enabled && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-400">
              💡 Antes de ativar, certifique-se que o Tickfy está configurado em{' '}
              <Link to="/tickfy" className="text-amber-400 underline hover:text-amber-300">
                Configurações Tickfy
              </Link>{' '}
              com o link e a API key corretos.
            </div>
          )}
        </div>
      )}

      {/* ── Pendentes tab ── */}
      {tab === 'preview' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-white font-semibold">Vendas ainda não sincronizadas</h2>
            <span className="text-zinc-500 text-xs">Máximo 20 exibidos</span>
          </div>

          {preview.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-zinc-400">Nenhuma venda pendente de sincronização.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500 text-xs border-b border-zinc-800 bg-zinc-900/50">
                    <th className="text-left px-4 py-3 font-medium">Comprador</th>
                    <th className="text-left px-4 py-3 font-medium">Evento</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Valor</th>
                    <th className="text-right px-4 py-3 font-medium">Detectado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {preview.map(s => (
                    <tr key={s.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{s.comprador_nome || '—'}</p>
                        <p className="text-zinc-500 text-xs">{s.comprador_telefone || 'sem telefone'}</p>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{s.evento || '—'}</td>
                      <td className="px-4 py-3">{statusBadge(s.status_code)}</td>
                      <td className="px-4 py-3 text-right text-amber-400 font-medium">
                        {s.valor ? formatBRL(s.valor) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                        {new Date(s.detected_at).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Histórico tab ── */}
      {tab === 'history' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="text-white font-semibold">Sincronizações realizadas</h2>
          </div>

          {history.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-zinc-400">Nenhuma sincronização realizada ainda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500 text-xs border-b border-zinc-800 bg-zinc-900/50">
                    <th className="text-left px-4 py-3 font-medium">Lead</th>
                    <th className="text-left px-4 py-3 font-medium">Evento</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Valor</th>
                    <th className="text-center px-4 py-3 font-medium">Ação</th>
                    <th className="text-right px-4 py-3 font-medium">Sincronizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {history.map(h => (
                    <tr key={h.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3">
                        {h.lead_id ? (
                          <Link
                            to={`/crm/leads?id=${h.lead_id}`}
                            className="text-amber-400 hover:text-amber-300 font-medium underline"
                          >
                            {h.lead_name || h.phone || `#${h.lead_id}`}
                          </Link>
                        ) : (
                          <span className="text-zinc-500">{h.phone || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{h.evento || '—'}</td>
                      <td className="px-4 py-3">{statusBadge(h.status_code)}</td>
                      <td className="px-4 py-3 text-right text-zinc-300">
                        {h.valor ? formatBRL(h.valor) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          h.action === 'created' ? 'bg-emerald-900/50 text-emerald-400' :
                          h.action === 'updated' ? 'bg-blue-900/50 text-blue-400' :
                          'bg-zinc-800 text-zinc-500'
                        }`}>
                          {h.action === 'created' ? '✚ Criado' :
                           h.action === 'updated' ? '↑ Atualizado' : '— Ignorado'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                        {new Date(h.synced_at).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
