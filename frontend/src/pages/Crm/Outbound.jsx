import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../lib/api';
import socket from '../../lib/socket';
import toast from 'react-hot-toast';

const STAGE_LABELS = {
  entrou_contato:'Entrou Contato', conversando:'Conversando', diagnostico:'Diagnóstico',
  reuniao_agendada:'Reunião Agendada', reuniao_realizada:'Reunião Realizada',
  aguardando_proposta:'Aguardando Proposta', proposta_enviada:'Proposta Enviada',
  analisando_proposta:'Analisando Proposta', negociacao:'Negociação',
};

const STATUS_META = {
  draft:   { label: 'Rascunho',    color: '#6B7280', bg: '#6B728020', icon: '📝' },
  running: { label: 'Enviando…',   color: '#3B82F6', bg: '#3B82F620', icon: '🚀' },
  paused:  { label: 'Pausada',     color: '#F59E0B', bg: '#F59E0B20', icon: '⏸️' },
  done:    { label: 'Concluída',   color: '#10B981', bg: '#10B98120', icon: '✅' },
};

const TEMPLATE_VARS = ['{nome}', '{primeiro_nome}', '{telefone}', '{estagio}', '{fonte}', '{valor}'];

/* ─── Campaign builder modal ────────────────────────────────────────────── */
function CampaignModal({ campaign, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: campaign?.name || '',
    template: campaign?.template || '',
    delay_seconds: campaign?.delay_seconds || 10,
    ai_personalize: campaign?.ai_personalize || 0,
    target_filters: campaign ? JSON.parse(campaign.target_filters_json || '{}') : {},
  });
  const [previewCount, setPreviewCount] = useState(campaign?.total_leads || null);
  const [saving, setSaving]   = useState(false);
  const [stages, setStages]   = useState(
    form.target_filters.stages || []
  );

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setFilter = (k, v) => setForm(p => ({ ...p, target_filters: { ...p.target_filters, [k]: v } }));

  const toggleStage = (s) => {
    const next = stages.includes(s) ? stages.filter(x => x !== s) : [...stages, s];
    setStages(next);
    setFilter('stages', next.length ? next : undefined);
  };

  const insertVar = (v) => set('template', form.template + v);

  const save = async () => {
    if (!form.name.trim()) return toast.error('Nome obrigatório');
    if (!form.template.trim()) return toast.error('Mensagem obrigatória');
    setSaving(true);
    try {
      const payload = { ...form, target_filters: form.target_filters };
      const result = campaign?.id
        ? await api.put(`/crm/outbound/${campaign.id}`, payload)
        : await api.post('/crm/outbound', payload);
      const id = campaign?.id || result.id;
      const count = result.total_leads ?? result.total_leads;
      setPreviewCount(count);
      onSaved({ id, ...form, total_leads: count, status: 'draft' });
      if (!campaign?.id) onClose();
      else toast.success('Salvo!');
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.8)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-zinc-950 flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h3 className="font-semibold text-white">{campaign?.id ? 'Editar Campanha' : 'Nova Campanha'}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Nome da campanha *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Ex: Reengajamento Leads Frios"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50" />
          </div>

          {/* Target */}
          <div>
            <label className="block text-xs text-zinc-400 mb-2">Público-alvo</label>
            <div className="space-y-3">
              {/* Stages */}
              <div>
                <p className="text-[11px] text-zinc-500 mb-1.5">Estágios (vazio = todos)</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(STAGE_LABELS).map(([k, v]) => (
                    <button key={k} onClick={() => toggleStage(k)}
                      className="text-[11px] px-2.5 py-1 rounded-full transition-colors"
                      style={{
                        background: stages.includes(k) ? 'var(--gold-500,#D4AF37)' : '#27272a',
                        color: stages.includes(k) ? '#000' : '#a1a1aa',
                      }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Temperature + days */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Temperatura</label>
                  <select value={form.target_filters.temperature || ''}
                    onChange={e => setFilter('temperature', e.target.value || undefined)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none">
                    <option value="">Todas</option>
                    <option value="quente">🔥 Quente</option>
                    <option value="morno">🌤️ Morno</option>
                    <option value="frio">🧊 Frio</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Sem interação há + de (dias)</label>
                  <input type="number" min={0}
                    value={form.target_filters.no_interaction_days || ''}
                    onChange={e => setFilter('no_interaction_days', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="Ex: 7"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none" />
                </div>
              </div>
            </div>

            {previewCount !== null && (
              <p className="text-xs mt-2" style={{ color: previewCount > 0 ? '#10B981' : '#EF4444' }}>
                {previewCount > 0 ? `✓ ${previewCount} leads serão atingidos` : '⚠ Nenhum lead encontrado'}
              </p>
            )}
          </div>

          {/* Template */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Mensagem *</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {TEMPLATE_VARS.map(v => (
                <button key={v} onClick={() => insertVar(v)}
                  className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-amber-400 hover:bg-zinc-700 transition-colors">
                  {v}
                </button>
              ))}
            </div>
            <textarea
              value={form.template}
              onChange={e => set('template', e.target.value)}
              rows={4}
              placeholder="Oi {primeiro_nome}! Tudo bem? Vi que conversamos sobre..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-amber-500/50"
            />
          </div>

          {/* Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Delay entre envios (seg)</label>
              <input type="number" min={1} max={120} value={form.delay_seconds}
                onChange={e => set('delay_seconds', Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
              <p className="text-[11px] text-zinc-600 mt-0.5">Mínimo: 5s recomendado</p>
            </div>
            <div className="flex flex-col justify-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <div onClick={() => set('ai_personalize', form.ai_personalize ? 0 : 1)}
                  className="relative w-10 h-5 rounded-full transition-colors"
                  style={{ background: form.ai_personalize ? 'var(--gold-500,#D4AF37)' : '#3f3f46' }}>
                  <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                    style={{ transform: form.ai_personalize ? 'translateX(20px)' : 'none' }} />
                </div>
                <span className="text-xs text-zinc-300">Personalizar com IA</span>
              </label>
              {!!form.ai_personalize && (
                <p className="text-[11px] text-amber-400 mt-1">Claude reescrevdrá para cada lead</p>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-black disabled:opacity-50"
            style={{ background: 'var(--gold-500,#D4AF37)' }}>
            {saving ? 'Salvando…' : campaign?.id ? 'Salvar' : 'Criar campanha'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-zinc-400 border border-zinc-800">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Campaign Card ─────────────────────────────────────────────────────── */
function CampaignCard({ campaign, onLaunch, onPause, onDelete, onOpen }) {
  const meta = STATUS_META[campaign.status] || STATUS_META.draft;
  const pct  = campaign.total_leads > 0
    ? Math.round(((campaign.sent + campaign.failed) / campaign.total_leads) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-white truncate">{campaign.name}</h4>
            <span className="text-[11px] px-2 py-0.5 rounded-full"
              style={{ background: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{campaign.template}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
        <span>👥 {campaign.total_leads} leads</span>
        <span>✉️ {campaign.sent} enviados</span>
        {campaign.failed > 0 && <span className="text-red-400">❌ {campaign.failed} falhas</span>}
        {campaign.ai_personalize ? <span className="text-amber-400">🤖 IA ativo</span> : null}
      </div>

      {/* Progress bar */}
      {['running', 'done', 'paused'].includes(campaign.status) && (
        <div className="mt-3">
          <div className="w-full h-1.5 rounded-full bg-zinc-800">
            <div className="h-1.5 rounded-full transition-all"
              style={{ width: `${pct}%`, background: campaign.status === 'done' ? '#10B981' : 'var(--gold-500,#D4AF37)' }} />
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">{pct}%</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        {campaign.status === 'draft' && (
          <>
            <button onClick={() => onLaunch(campaign)}
              className="flex-1 text-xs py-1.5 rounded-lg font-medium text-black"
              style={{ background: 'var(--gold-500,#D4AF37)' }}>
              🚀 Disparar
            </button>
            <button onClick={() => onOpen(campaign)}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white">
              ✏️ Editar
            </button>
            <button onClick={() => onDelete(campaign.id)}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-600 hover:text-red-400">
              🗑️
            </button>
          </>
        )}
        {campaign.status === 'running' && (
          <button onClick={() => onPause(campaign.id)}
            className="text-xs px-4 py-1.5 rounded-lg border border-amber-500/50 text-amber-400">
            ⏸ Pausar
          </button>
        )}
        {campaign.status === 'paused' && (
          <button onClick={() => onLaunch(campaign)}
            className="text-xs px-4 py-1.5 rounded-lg font-medium text-black"
            style={{ background: 'var(--gold-500,#D4AF37)' }}>
            ▶ Retomar
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Página principal ──────────────────────────────────────────────────── */
export default function Outbound() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCampaigns(await api.get('/crm/outbound')); }
    catch { toast.error('Erro ao carregar campanhas'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Socket — progresso em tempo real */
  useEffect(() => {
    const handleProgress = ({ campaign_id, sent, failed, total_leads }) => {
      setCampaigns(prev => prev.map(c =>
        c.id === campaign_id ? { ...c, sent, failed, total_leads } : c
      ));
    };
    const handleDone = ({ campaign_id }) => {
      setCampaigns(prev => prev.map(c =>
        c.id === campaign_id ? { ...c, status: 'done' } : c
      ));
      toast.success('Campanha concluída!');
    };
    socket.on('outbound:progress', handleProgress);
    socket.on('outbound:done',     handleDone);
    return () => {
      socket.off('outbound:progress', handleProgress);
      socket.off('outbound:done',     handleDone);
    };
  }, []);

  const handleSaved = (c) => {
    setCampaigns(prev => {
      const idx = prev.findIndex(x => x.id === c.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = { ...prev[idx], ...c }; return next; }
      return [c, ...prev];
    });
  };

  const handleLaunch = async (campaign) => {
    try {
      await api.post(`/crm/outbound/${campaign.id}/launch`);
      setCampaigns(prev => prev.map(c =>
        c.id === campaign.id ? { ...c, status: 'running' } : c
      ));
      toast.success('Campanha disparada!');
    } catch (e) { toast.error(e.message || 'Erro ao disparar'); }
  };

  const handlePause = async (id) => {
    try {
      await api.post(`/crm/outbound/${id}/pause`);
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'paused' } : c));
      toast.success('Campanha pausada');
    } catch (e) { toast.error(e.message || 'Erro'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta campanha?')) return;
    try {
      await api.delete(`/crm/outbound/${id}`);
      setCampaigns(prev => prev.filter(c => c.id !== id));
    } catch (e) { toast.error(e.message || 'Erro'); }
  };

  const running = campaigns.filter(c => c.status === 'running').length;
  const done    = campaigns.filter(c => c.status === 'done').length;
  const drafts  = campaigns.filter(c => c.status === 'draft').length;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">📣 Outbound Campaigns</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Envie mensagens personalizadas (com IA) para segmentos de leads.
          </p>
        </div>
        <button
          onClick={() => setModal({})}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold text-black"
          style={{ background: 'var(--gold-500,#D4AF37)' }}
        >
          + Nova campanha
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Em execução', value: running, icon: '🚀', color: '#3B82F6' },
          { label: 'Rascunhos',   value: drafts,  icon: '📝', color: '#6B7280' },
          { label: 'Concluídas',  value: done,    icon: '✅', color: '#10B981' },
        ].map(s => (
          <div key={s.label} className="rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-center">
            <div className="text-xl">{s.icon}</div>
            <div className="text-xl font-bold mt-1" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[11px] text-zinc-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: '#1f1f1f' }} />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 p-10 text-center" style={{ background: '#18181b' }}>
          <div className="text-4xl mb-3">📣</div>
          <p className="text-sm font-medium text-white">Nenhuma campanha ainda</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
            Crie uma campanha para disparar mensagens personalizadas para um segmento de leads.
          </p>
          <button onClick={() => setModal({})}
            className="mt-4 px-5 py-2 rounded-xl text-sm font-semibold text-black"
            style={{ background: 'var(--gold-500,#D4AF37)' }}>
            Criar primeira campanha
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <CampaignCard
              key={c.id} campaign={c}
              onLaunch={handleLaunch}
              onPause={handlePause}
              onDelete={handleDelete}
              onOpen={setModal}
            />
          ))}
        </div>
      )}

      {modal !== null && (
        <CampaignModal
          campaign={modal?.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
