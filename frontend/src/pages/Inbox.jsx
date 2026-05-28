import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../lib/api';
import socket from '../lib/socket';
import { TextareaWithSnippets } from '../components/ui/TextareaWithSnippets';
import BattleCardsPanel from '../components/BattleCardsPanel';

/* ── Constants ───────────────────────────────────────────── */
const STAGE_LABELS = {
  entrou_contato:      'Entrou Contato',
  conversando:         'Conversando',
  diagnostico:         'Diagnóstico',
  reuniao_agendada:    'Reunião Agendada',
  reuniao_realizada:   'Reunião Realizada',
  aguardando_proposta: 'Aguardando Proposta',
  proposta_enviada:    'Proposta Enviada',
  analisando_proposta: 'Analisando Proposta',
  negociacao:          'Negociação',
  fechado:             'Fechado',
  perdido:             'Perdido',
};

const STAGE_COLORS = {
  entrou_contato:      '#6B7280',
  conversando:         '#3B82F6',
  diagnostico:         '#8B5CF6',
  reuniao_agendada:    '#F59E0B',
  reuniao_realizada:   '#10B981',
  aguardando_proposta: '#F97316',
  proposta_enviada:    '#EF4444',
  analisando_proposta: '#EC4899',
  negociacao:          '#D4AF37',
  fechado:             '#10B981',
  perdido:             '#6B7280',
};

const TEMP_ICON = { hot: '🔥', warm: '🌤️', cold: '🧊' };

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7)  return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fmtFull(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/* ── ConvItem ────────────────────────────────────────────── */
function ConvItem({ conv, active, onClick }) {
  const hasUnread = conv.unread_count > 0;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
      style={{
        background: active ? 'var(--bg-surface-2)' : 'transparent',
        borderLeft: active ? '3px solid var(--gold-500)' : '3px solid transparent',
      }}
    >
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
        style={{ background: 'var(--bg-surface-2)', color: 'var(--gold-400)' }}
      >
        {(conv.name || conv.phone || '?')[0].toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p
            className="text-sm font-semibold truncate"
            style={{ color: hasUnread ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            {conv.name || conv.phone}
          </p>
          <span className="text-xs shrink-0" style={{ color: 'var(--text-disabled)' }}>
            {fmtTime(conv.last_message_at || conv.last_interaction_at)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
            {conv.last_direction === 'out' && <span className="mr-1" style={{ color: 'var(--gold-500)' }}>→</span>}
            {conv.last_message || '—'}
          </p>
          {hasUnread ? (
            <span
              className="text-xs font-bold min-w-[20px] h-5 flex items-center justify-center rounded-full shrink-0 px-1"
              style={{ background: 'var(--gold-500)', color: '#000' }}
            >
              {conv.unread_count}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 mt-1">
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: (STAGE_COLORS[conv.stage] || '#6B7280') + '22', color: STAGE_COLORS[conv.stage] || '#6B7280' }}
          >
            {STAGE_LABELS[conv.stage] || conv.stage}
          </span>
          {conv.temperature && <span className="text-xs">{TEMP_ICON[conv.temperature]}</span>}
        </div>
      </div>
    </button>
  );
}

/* ── MessageBubble ───────────────────────────────────────── */
function MessageBubble({ msg }) {
  const isOut = msg.direction === 'out';
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className="max-w-[72%] px-3 py-2 rounded-2xl text-sm leading-relaxed"
        style={{
          background: isOut ? 'var(--gold-500)' : 'var(--bg-surface-2)',
          color: isOut ? '#000' : 'var(--text-primary)',
          borderBottomRightRadius: isOut ? 4 : 16,
          borderBottomLeftRadius: isOut ? 16 : 4,
        }}
      >
        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        <p
          className="text-xs mt-1 text-right"
          style={{ color: isOut ? 'rgba(0,0,0,0.55)' : 'var(--text-disabled)' }}
        >
          {fmtFull(msg.occurred_at)}
        </p>
      </div>
    </div>
  );
}

/* ── ContextPanel ────────────────────────────────────────── */
function ContextPanel({ lead, onStageChange, onClose }) {
  if (!lead) return (
    <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-disabled)' }}>
      <span className="text-4xl">👤</span>
      <p className="text-sm">Selecione uma conversa</p>
    </div>
  );

  const stageColor = STAGE_COLORS[lead.stage] || '#6B7280';

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
              {lead.name || lead.phone}
            </p>
            {lead.name && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{lead.phone}</p>
            )}
          </div>
          {onClose && (
            <button onClick={onClose} className="text-lg" style={{ color: 'var(--text-muted)' }}>✕</button>
          )}
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span
            className="text-xs font-medium px-2 py-1 rounded"
            style={{ background: stageColor + '22', color: stageColor }}
          >
            {STAGE_LABELS[lead.stage] || lead.stage}
          </span>
          {lead.temperature && (
            <span className="text-sm">{TEMP_ICON[lead.temperature]}</span>
          )}
          {lead.potential_value > 0 && (
            <span className="text-xs font-semibold" style={{ color: 'var(--gold-400)' }}>
              R$ {Number(lead.potential_value).toLocaleString('pt-BR')}
            </span>
          )}
        </div>

        {(lead.event_name || lead.city) && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            🎪 {[lead.event_name, lead.city, lead.event_date].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 space-y-2" style={{ borderBottom: '1px solid var(--border-default)' }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-disabled)' }}>
          Mover Estágio
        </p>
        <select
          defaultValue={lead.stage}
          onChange={(e) => onStageChange(e.target.value)}
          className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-primary)',
          }}
        >
          {Object.entries(STAGE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <a
          href={`/crm/leads?id=${lead.id}`}
          className="flex items-center justify-center gap-2 w-full text-xs py-1.5 rounded-lg transition-colors"
          style={{
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
          }}
        >
          🗂️ Ver no CRM
        </a>
      </div>

      {/* Tags */}
      {lead.tags?.length > 0 && (
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-disabled)' }}>Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {lead.tags.map((t) => (
              <span
                key={t.id}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: (t.color || '#6B7280') + '33', color: t.color || '#6B7280' }}
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Next Follow-ups */}
      {lead.followups?.length > 0 && (
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-disabled)' }}>
            📨 Follow-ups Pendentes
          </p>
          <div className="space-y-2">
            {lead.followups.map((f) => (
              <div key={f.id} className="text-xs p-2 rounded-lg" style={{ background: 'var(--bg-surface-2)' }}>
                <p style={{ color: 'var(--text-primary)' }}>{f.message || f.type}</p>
                <p className="mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {fmtFull(f.scheduled_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proposals */}
      {lead.proposals?.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-disabled)' }}>
            📋 Propostas
          </p>
          <div className="space-y-2">
            {lead.proposals.map((p) => (
              <div key={p.id} className="text-xs p-2 rounded-lg" style={{ background: 'var(--bg-surface-2)' }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{p.title || 'Proposta'}</p>
                  {p.value > 0 && (
                    <span className="font-semibold shrink-0" style={{ color: 'var(--gold-400)' }}>
                      R$ {Number(p.value).toLocaleString('pt-BR')}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 capitalize" style={{ color: 'var(--text-muted)' }}>{p.status}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {lead.notes && (
        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-disabled)' }}>Notas</p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{lead.notes}</p>
        </div>
      )}
    </div>
  );
}

/* ── Main Inbox ──────────────────────────────────────────── */
export default function Inbox() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const [selectedId, setSelectedId] = useState(() => {
    const id = searchParams.get('lead');
    return id ? Number(id) : null;
  });
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [lead, setLead] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [showBattle, setShowBattle] = useState(false);
  const [hotRecovery, setHotRecovery] = useState(null); // F4

  const threadRef = useRef(null);
  const inputRef = useRef(null);

  /* ── Load conversations ── */
  const loadConversations = useCallback(async () => {
    try {
      const data = await api.get('/inbox/conversations');
      setConversations(data);
    } catch (e) {
      console.error('[Inbox] erro ao carregar conversas:', e);
    } finally {
      setConvLoading(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  /* ── Socket: inbox:new-message ── */
  useEffect(() => {
    const handler = (payload) => {
      // Bump the conversation to top + update last_message
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === payload.lead_id);
        if (idx === -1) {
          // New lead with message — reload list
          loadConversations();
          return prev;
        }
        const updated = { ...prev[idx], last_message: payload.body, last_message_at: payload.occurred_at, last_direction: payload.direction };
        if (payload.direction === 'in') updated.unread_count = (updated.unread_count || 0) + 1;
        const arr = [...prev];
        arr.splice(idx, 1);
        return [updated, ...arr];
      });

      // Append to thread if this conversation is open
      if (selectedId === payload.lead_id && payload.direction === 'in') {
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), direction: 'in', body: payload.body, occurred_at: payload.occurred_at },
        ]);
      }
    };

    socket.on('inbox:new-message', handler);
    return () => socket.off('inbox:new-message', handler);
  }, [selectedId, loadConversations]);

  /* ── F4: Hot Recovery socket ── */
  useEffect(() => {
    const handler = (payload) => {
      setHotRecovery(payload);
      // Auto-select the lead if not already open
      if (selectedId !== payload.lead_id) {
        setSelectedId(payload.lead_id);
      }
      // Auto-dismiss after 8s
      setTimeout(() => setHotRecovery((prev) => prev?.lead_id === payload.lead_id ? null : prev), 8000);
    };
    socket.on('crm:hot_recovery', handler);
    return () => socket.off('crm:hot_recovery', handler);
  }, [selectedId]);

  /* ── Load thread when selectedId changes ── */
  useEffect(() => {
    if (!selectedId) return;
    setMsgLoading(true);
    setMessages([]);
    setLead(null);

    Promise.all([
      api.get(`/inbox/conversations/${selectedId}/messages`),
      api.get(`/inbox/conversations/${selectedId}`),
    ]).then(([msgs, leadData]) => {
      setMessages(msgs);
      setLead(leadData);
      // Mark as read: reset unread_count locally
      setConversations((prev) =>
        prev.map((c) => c.id === selectedId ? { ...c, unread_count: 0 } : c)
      );
    }).catch((e) => {
      toast.error('Erro ao carregar mensagens');
      console.error(e);
    }).finally(() => setMsgLoading(false));

    setSearchParams({ lead: selectedId }, { replace: true });
    inputRef.current?.focus();
  }, [selectedId]);

  /* ── Auto-scroll to bottom on new messages ── */
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  /* ── Send message ── */
  const handleSend = async () => {
    const msg = text.trim();
    if (!msg || sending || !selectedId) return;
    setSending(true);
    const optimistic = { id: `opt-${Date.now()}`, direction: 'out', body: msg, occurred_at: new Date().toISOString() };
    setMessages((prev) => [...prev, optimistic]);
    setText('');
    try {
      const { message: saved } = await api.post(`/inbox/conversations/${selectedId}/send`, { message: msg });
      setMessages((prev) => prev.map((m) => m.id === optimistic.id ? (saved || optimistic) : m));
      setConversations((prev) =>
        prev.map((c) => c.id === selectedId ? { ...c, last_message: msg, last_message_at: new Date().toISOString(), last_direction: 'out' } : c)
      );
    } catch (err) {
      toast.error(err.message || 'Falha ao enviar');
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(msg);
    } finally {
      setSending(false);
    }
  };

  /* ── Stage change ── */
  const handleStageChange = async (stage) => {
    if (!selectedId) return;
    try {
      await api.patch(`/inbox/conversations/${selectedId}/stage`, { stage });
      setLead((prev) => prev ? { ...prev, stage } : prev);
      setConversations((prev) => prev.map((c) => c.id === selectedId ? { ...c, stage } : c));
      toast.success(`Estágio atualizado: ${STAGE_LABELS[stage] || stage}`);
    } catch (err) {
      toast.error(err.message || 'Erro ao mover estágio');
    }
  };

  /* ── Filtered conversations ── */
  const filtered = conversations.filter((c) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
  });

  /* ── Keyboard: Ctrl+Enter to send ── */
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSend();
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const showThread = selectedId !== null;

  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--bg-canvas)' }}>

      {/* ── Column 1: Conversation list ────────────────────── */}
      <div
        className={`flex flex-col shrink-0 ${isMobile && showThread ? 'hidden' : 'flex'}`}
        style={{
          width: 300,
          background: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border-default)',
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Inbox</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {conversations.length} conversa{conversations.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Search */}
        <div className="px-3 py-2 shrink-0">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar conversas…"
            className="w-full text-sm px-3 py-1.5 rounded-lg outline-none"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {convLoading ? (
            <div className="space-y-1 p-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: 'var(--bg-surface-2)' }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <span className="text-3xl">💬</span>
              <p className="text-sm text-center px-4" style={{ color: 'var(--text-muted)' }}>
                {filter ? 'Nenhuma conversa encontrada' : 'Sem conversas ainda. Mensagens recebidas aparecerão aqui.'}
              </p>
            </div>
          ) : (
            filtered.map((c) => (
              <ConvItem
                key={c.id}
                conv={c}
                active={selectedId === c.id}
                onClick={() => { setSelectedId(c.id); setShowPanel(false); }}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Column 2: Message thread ────────────────────────── */}
      <div
        className={`flex-1 flex flex-col min-w-0 ${isMobile && !showThread ? 'hidden' : 'flex'}`}
        style={{ background: 'var(--bg-canvas)' }}
      >
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <span className="text-5xl">💬</span>
            <p className="font-semibold text-lg" style={{ color: 'var(--text-secondary)' }}>
              Selecione uma conversa
            </p>
            <p className="text-sm text-center max-w-xs" style={{ color: 'var(--text-muted)' }}>
              Responda leads diretamente pelo sistema sem abrir o WhatsApp.
            </p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div
              className="flex items-center gap-3 px-4 shrink-0"
              style={{ minHeight: 52, background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-default)' }}
            >
              {isMobile && (
                <button
                  onClick={() => setSelectedId(null)}
                  className="w-8 h-8 flex items-center justify-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ←
                </button>
              )}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ background: 'var(--bg-surface-2)', color: 'var(--gold-400)' }}
              >
                {((lead?.name || lead?.phone || '?')[0]).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                  {lead?.name || lead?.phone || '…'}
                </p>
                {lead?.stage && (
                  <p className="text-xs truncate" style={{ color: STAGE_COLORS[lead.stage] || 'var(--text-muted)' }}>
                    {STAGE_LABELS[lead.stage] || lead.stage}
                  </p>
                )}
              </div>
              <button
                onClick={() => { setShowBattle(false); setShowPanel((v) => !v); }}
                className="text-xs px-2 py-1 rounded-lg shrink-0 transition-colors"
                style={{
                  background: showPanel ? 'var(--gold-500)' : 'var(--bg-surface)',
                  color: showPanel ? '#000' : 'var(--text-muted)',
                  border: '1px solid var(--border-default)',
                }}
              >
                {showPanel ? '✕ Painel' : '👤 Painel'}
              </button>
              <button
                onClick={() => { setShowPanel(false); setShowBattle((v) => !v); }}
                className="text-xs px-2 py-1 rounded-lg shrink-0 transition-colors"
                style={{
                  background: showBattle ? '#7c3aed' : 'var(--bg-surface)',
                  color: showBattle ? '#fff' : 'var(--text-muted)',
                  border: '1px solid var(--border-default)',
                }}
              >
                {showBattle ? '✕ Battle' : '⚔️ Battle'}
              </button>
            </div>

            {/* F4: Hot Recovery Banner */}
            {hotRecovery && selectedId === hotRecovery.lead_id && (
              <div
                className="flex items-center gap-3 px-4 py-2.5 shrink-0 animate-pulse"
                style={{ background: 'linear-gradient(90deg, #ef444422 0%, #f59e0b22 100%)', borderBottom: '1px solid #ef444455' }}
              >
                <span className="text-2xl">🔥</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold" style={{ color: '#ef4444' }}>
                    RETORNOU! {hotRecovery.lead_name} respondeu depois de {hotRecovery.days_silent}d
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    "{hotRecovery.body}"
                  </p>
                </div>
                <button
                  onClick={() => setHotRecovery(null)}
                  className="text-xs shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Messages */}
            <div
              ref={threadRef}
              className="flex-1 overflow-y-auto px-4 py-4"
              style={{ background: 'var(--bg-canvas)' }}
            >
              {msgLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                      <div className="h-10 w-48 rounded-2xl animate-pulse" style={{ background: 'var(--bg-surface-2)' }} />
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-muted)' }}>
                  <span className="text-3xl">💬</span>
                  <p className="text-sm">Nenhuma mensagem ainda</p>
                </div>
              ) : (
                messages.map((m) => <MessageBubble key={m.id} msg={m} />)
              )}
            </div>

            {/* Input */}
            <div
              className="px-4 py-3 shrink-0"
              style={{ background: 'var(--bg-sidebar)', borderTop: '1px solid var(--border-default)' }}
            >
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <TextareaWithSnippets
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Digite uma mensagem… (Ctrl+Enter para enviar)"
                    rows={1}
                    leadId={selectedId}
                    leadName={lead?.name}
                    eventName={lead?.event_name}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!text.trim() || sending}
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all mb-7"
                  style={{
                    background: text.trim() && !sending ? 'var(--gold-500)' : 'var(--bg-surface-2)',
                    color: text.trim() && !sending ? '#000' : 'var(--text-disabled)',
                  }}
                >
                  {sending ? (
                    <span className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--text-muted)', borderTopColor: 'transparent' }} />
                  ) : '→'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Column 3: Context panel ─────────────────────────── */}
      {showPanel && selectedId && (
        <div
          className="shrink-0 hidden md:flex flex-col"
          style={{
            width: 280,
            background: 'var(--bg-sidebar)',
            borderLeft: '1px solid var(--border-default)',
          }}
        >
          <ContextPanel
            lead={lead}
            onStageChange={handleStageChange}
            onClose={() => setShowPanel(false)}
          />
        </div>
      )}

      {/* ── Column 4: Battle Cards panel ─────────────────────── */}
      {showBattle && selectedId && (
        <div
          className="shrink-0 hidden md:flex flex-col"
          style={{
            width: 280,
            borderLeft: '1px solid #7c3aed55',
          }}
        >
          <BattleCardsPanel
            onInsert={(txt) => setText((prev) => prev ? `${prev}\n${txt}` : txt)}
            onClose={() => setShowBattle(false)}
          />
        </div>
      )}

    </div>
  );
}
