import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import socket from '../../lib/socket';

/* ── Util ── */
const STAGE_LABELS = {
  entrou_contato: 'Entrou Contato', conversando: 'Conversando', diagnostico: 'Diagnóstico',
  reuniao_agendada: 'Reunião Agendada', reuniao_realizada: 'Reunião Realizada',
  aguardando_proposta: 'Aguardando Proposta', proposta_enviada: 'Proposta Enviada',
  analisando_proposta: 'Analisando Proposta', negociacao: 'Negociação',
};

const TEMP_COLORS = { quente: '#ef4444', morno: '#f59e0b', frio: '#3b82f6' };

// F3: Mapeia estágio → nome da cadência de resgate sugerida
const RESCUE_CADENCE_HINT = {
  conversando:         '🏃 Sumiu na Qualificação',
  diagnostico:         '🏃 Sumiu na Qualificação',
  proposta_enviada:    '📋 Sumiu Após Proposta',
  reuniao_realizada:   '🤝 Pós-Reunião Sem Retorno',
  negociacao:          '💸 Pediu Desconto e Sumiu',
  analisando_proposta: '🤔 Disse "Vou Pensar"',
};

function daysSince(dateStr) {
  if (!dateStr) return '∞';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return days;
}

function priorityColor(p) {
  if (p >= 80) return '#ef4444';
  if (p >= 60) return '#f59e0b';
  if (p >= 40) return '#D4AF37';
  return '#6B7280';
}

/* ── RescueCard ── */
function RescueCard({ rescue, onDismiss, onSend, onActed }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState(rescue.suggested_message || '');
  const [sending, setSending]   = useState(false);

  const days = daysSince(rescue.last_interaction_at);
  const pColor = priorityColor(rescue.priority);

  const handleSend = async () => {
    setSending(true);
    try {
      await api.post(`/crm/rescues/${rescue.id}/send`, { message: draft });
      toast.success('✅ Mensagem enviada!');
      onSend?.();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao enviar');
    } finally { setSending(false); }
  };

  return (
    <div
      className="card"
      style={{ borderLeft: `4px solid ${pColor}`, padding: '14px 16px' }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {/* Priority badge */}
        <div
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
          style={{ background: pColor + '22', color: pColor }}
        >
          {rescue.priority}
        </div>

        {/* Lead info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {rescue.lead_name || rescue.lead_phone}
            </h3>
            {rescue.lead_temperature && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold capitalize"
                style={{ background: TEMP_COLORS[rescue.lead_temperature] + '22', color: TEMP_COLORS[rescue.lead_temperature] }}>
                {rescue.lead_temperature}
              </span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}>
              {STAGE_LABELS[rescue.lead_stage] || rescue.lead_stage}
            </span>
            {rescue.ai_score && (
              <span className="text-[10px] font-bold" style={{ color: 'var(--gold-400)' }}>
                IA {rescue.ai_score}
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {days === '∞' ? 'Sem interação' : `${days}d sem resposta`}
            {rescue.lead_potential_value && (
              <span> · 💰 R$ {Number(rescue.lead_potential_value).toLocaleString('pt-BR')}</span>
            )}
          </p>
        </div>

        <button
          onClick={() => navigate(`/inbox?lead=${rescue.lead_id}`)}
          className="text-xs px-2.5 py-1 rounded-lg shrink-0 transition-colors"
          style={{ background: 'var(--bg-surface-2)', color: 'var(--gold-400)' }}
        >
          💬 Abrir
        </button>
      </div>

      {/* Reason */}
      <div className="mb-3 p-2.5 rounded-lg"
        style={{ background: 'var(--bg-surface-2)', borderLeft: `2px solid ${pColor}` }}>
        <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
          🎯 Motivo
        </p>
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{rescue.reason}</p>
      </div>

      {/* Suggested action */}
      {rescue.suggested_action && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
            💡 Ação sugerida
          </p>
          <p className="text-sm" style={{ color: 'var(--gold-400)' }}>{rescue.suggested_action}</p>
        </div>
      )}

      {/* F3: Cadência de resgate sugerida */}
      {RESCUE_CADENCE_HINT[rescue.lead_stage] && (
        <div className="mb-3 flex items-center gap-2 text-xs py-1.5 px-2.5 rounded-lg"
          style={{ background: '#D4AF3710', border: '1px solid #D4AF3730' }}>
          <span>🔄</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Cadência sugerida: <span style={{ color: 'var(--gold-400)', fontWeight: 600 }}>{RESCUE_CADENCE_HINT[rescue.lead_stage]}</span>
          </span>
        </div>
      )}

      {/* Suggested message (expand/edit) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>
            ✉️ Mensagem rascunho
          </p>
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            {expanded ? 'Ocultar ▲' : 'Ver/Enviar ▼'}
          </button>
        </div>
        {expanded && (
          <>
            <textarea
              className="input w-full resize-y text-sm"
              rows={4}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onFocus={() => setEditing(true)}
            />
            <div className="flex items-center justify-between mt-2">
              <button
                className="btn-ghost text-xs"
                onClick={() => onDismiss?.(rescue.id)}
              >
                ✕ Descartar
              </button>
              <div className="flex gap-2">
                <button
                  className="btn-ghost text-xs"
                  onClick={() => onActed?.(rescue.id)}
                >
                  ✓ Já agi (manual)
                </button>
                <button
                  className="btn-primary text-xs"
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                >
                  {sending ? 'Enviando…' : '📤 Enviar agora'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Main ── */
export default function Resgatador() {
  const [rescues, setRescues]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);
  const [date, setDate]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/crm/rescues/today');
      setRescues(data.rescues);
      setDate(data.date);
    } catch (e) {
      toast.error('Erro ao carregar resgates');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* F4: Hot Recovery — quando um lead frio responde, aparece aqui imediatamente */
  useEffect(() => {
    const handler = (payload) => {
      toast(`🔥 ${payload.lead_name} RETORNOU após ${payload.days_silent}d!`, {
        icon: '🔥',
        duration: 6000,
        style: { background: '#1a0a0a', color: '#ef4444', border: '1px solid #ef444444' },
      });
      // Recarrega a lista pra incluir o lead que retornou (pode já estar na lista ou ser novo)
      load();
    };
    socket.on('crm:hot_recovery', handler);
    return () => socket.off('crm:hot_recovery', handler);
  }, [load]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await api.post('/crm/rescues/generate');
      toast.success(`✨ ${result.generated} rescues gerados`);
      await load();
    } catch (e) {
      toast.error('Erro ao regenerar');
    } finally { setGenerating(false); }
  };

  const handleDismiss = async (id) => {
    try {
      await api.post(`/crm/rescues/${id}/dismiss`);
      setRescues(prev => prev.filter(r => r.id !== id));
      toast('Rescue descartado', { icon: '🗑️' });
    } catch {}
  };

  const handleActed = async (id) => {
    try {
      await api.post(`/crm/rescues/${id}/acted`);
      setRescues(prev => prev.filter(r => r.id !== id));
      toast.success('Marcado como concluído');
    } catch {}
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold font-display" style={{ color: 'var(--text-primary)' }}>
            🚨 Resgatador Diário
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {loading ? 'Carregando…' :
              rescues.length === 0
                ? 'Nenhum lead precisa atenção hoje 🎉'
                : `${rescues.length} ${rescues.length === 1 ? 'lead' : 'leads'} precisam atenção hoje`
            }
            {date && <span> · {new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>}
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="btn-ghost text-sm shrink-0"
        >
          {generating ? '✨ Gerando…' : '🔄 Regerar agora'}
        </button>
      </div>

      {/* Info banner se vazio */}
      {!loading && rescues.length === 0 && (
        <div className="card text-center py-12">
          <span className="text-4xl">🎉</span>
          <p className="mt-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
            Pipeline em dia!
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Nenhum lead precisa atenção hoje. Que tal prospectar novos?
          </p>
        </div>
      )}

      {/* Skeleton loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-40 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface-2)' }} />
          ))}
        </div>
      )}

      {/* List */}
      {!loading && rescues.length > 0 && (
        <div className="space-y-3">
          {rescues.map(r => (
            <RescueCard
              key={r.id}
              rescue={r}
              onDismiss={handleDismiss}
              onActed={handleActed}
              onSend={() => setRescues(prev => prev.filter(x => x.id !== r.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
