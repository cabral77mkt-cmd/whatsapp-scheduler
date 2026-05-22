import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../lib/api';

/* ── Configuração visual por tipo de evento ─────────────────────────── */
const EVENT_CONFIG = {
  created:          { icon: '👤', color: 'bg-zinc-700',      border: 'border-zinc-600',    label: 'Lead criado'          },
  message_in:       { icon: '💬', color: 'bg-blue-900',      border: 'border-blue-700',    label: 'Mensagem recebida'    },
  message_out:      { icon: '📤', color: 'bg-zinc-800',      border: 'border-zinc-600',    label: 'Mensagem enviada'     },
  note:             { icon: '📋', color: 'bg-zinc-800',      border: 'border-zinc-700',    label: 'Nota do sistema'      },
  meeting:          { icon: '📅', color: 'bg-purple-900',    border: 'border-purple-700',  label: 'Reunião'              },
  proposal:         { icon: '📄', color: 'bg-indigo-900',    border: 'border-indigo-700',  label: 'Proposta'             },
  proposal_accepted:{ icon: '✅', color: 'bg-emerald-900',   border: 'border-emerald-700', label: 'Proposta aceita'      },
  followup:         { icon: '📨', color: 'bg-amber-900',     border: 'border-amber-700',   label: 'Follow-up'            },
  task:             { icon: '✔️', color: 'bg-zinc-800',      border: 'border-zinc-600',    label: 'Tarefa'               },
  ai_score:         { icon: '🤖', color: 'bg-violet-900',    border: 'border-violet-700',  label: 'Score IA'             },
  tickfy:           { icon: '🎟️', color: 'bg-orange-900',   border: 'border-orange-700',  label: 'Tickfy'               },
  hot_recovery:     { icon: '🔥', color: 'bg-red-900',       border: 'border-red-700',     label: 'Lead retornou'        },
  closed:           { icon: '🏆', color: 'bg-emerald-900',   border: 'border-emerald-600', label: 'Negócio fechado'      },
  lost:             { icon: '💔', color: 'bg-red-900',       border: 'border-red-700',     label: 'Lead perdido'         },
};

const SOURCE_LABELS = {
  whatsapp_dm: 'WhatsApp DM',
  tickfy:      'Tickfy',
  csv_import:  'Importação CSV',
  manual:      'Manual',
  outbound:    'Campanha Outbound',
};

const STAGE_LABELS = {
  entrou_contato: 'Entrou em Contato',
  qualificado:    'Qualificado',
  proposta:       'Proposta',
  negociacao:     'Negociação',
  fechado:        'Fechado',
  perdido:        'Perdido',
};

const STATUS_LABELS_MEETING = { scheduled: 'Agendada', done: 'Realizada', cancelled: 'Cancelada', no_show: 'Não compareceu' };
const STATUS_LABELS_PROPOSAL = { pending: 'Pendente', sent: 'Enviada', accepted: 'Aceita', rejected: 'Recusada' };
const STATUS_LABELS_FOLLOWUP = { pending: 'Agendado', sent: 'Enviado', canceled: 'Cancelado', failed: 'Falhou' };
const STATUS_TICKFY = { PG: 'Pago', NP: 'Não Pago', EA: 'Em Análise', CA: 'Cancelado', DV: 'Devolvido' };

function formatBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ── Renderiza o corpo de cada evento ───────────────────────────────── */
function EventBody({ event }) {
  const { type, data } = event;

  if (type === 'created') return (
    <div className="text-sm text-zinc-300 space-y-0.5">
      {data.name && <p>Nome: <span className="text-white font-medium">{data.name}</span></p>}
      {data.phone && <p>Telefone: <span className="text-white">{data.phone}</span></p>}
      {data.source && <p>Origem: <span className="text-amber-400">{SOURCE_LABELS[data.source] || data.source}</span></p>}
    </div>
  );

  if (type === 'message_in' || type === 'message_out') return (
    <div className={`text-sm rounded-lg px-3 py-2 max-w-sm ${
      type === 'message_in'
        ? 'bg-blue-900/40 text-blue-100 border border-blue-800/40'
        : 'bg-zinc-800 text-zinc-200 border border-zinc-700'
    }`}>
      {data.body}
      {data.auto_response > 0 && (
        <span className="block text-xs text-zinc-500 mt-1">
          {data.auto_response === 1 ? '🤖 Auto-responder' : '🤖 SDR IA'}
        </span>
      )}
    </div>
  );

  if (type === 'note') return (
    <div className="text-sm text-zinc-400 italic border-l-2 border-zinc-700 pl-3">{data.body}</div>
  );

  if (type === 'meeting') return (
    <div className="text-sm text-zinc-300 space-y-0.5">
      <p className="text-white font-medium">{data.title}</p>
      {data.location && <p className="text-zinc-500">📍 {data.location}</p>}
      <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${
        data.status === 'done' ? 'bg-emerald-900/50 text-emerald-400' :
        data.status === 'cancelled' ? 'bg-red-900/50 text-red-400' :
        'bg-amber-900/50 text-amber-400'
      }`}>{STATUS_LABELS_MEETING[data.status] || data.status}</span>
    </div>
  );

  if (type === 'proposal' || type === 'proposal_accepted') return (
    <div className="text-sm text-zinc-300 space-y-0.5">
      {data.title && <p className="text-white font-medium">{data.title}</p>}
      {data.amount > 0 && <p className="text-amber-400 font-bold">{formatBRL(data.amount)}</p>}
      {data.status && (
        <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${
          data.status === 'accepted' ? 'bg-emerald-900/50 text-emerald-400' :
          data.status === 'rejected' ? 'bg-red-900/50 text-red-400' :
          'bg-blue-900/50 text-blue-400'
        }`}>{STATUS_LABELS_PROPOSAL[data.status] || data.status}</span>
      )}
      {data.due_date && <p className="text-zinc-500 text-xs">Validade: {new Date(data.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>}
    </div>
  );

  if (type === 'followup') return (
    <div className="text-sm text-zinc-300 space-y-1">
      {data.message && <p className="text-zinc-200 italic">"{data.message}"</p>}
      <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${
        data.status === 'sent' ? 'bg-emerald-900/50 text-emerald-400' :
        data.status === 'canceled' ? 'bg-zinc-800 text-zinc-500' :
        'bg-amber-900/50 text-amber-400'
      }`}>{STATUS_LABELS_FOLLOWUP[data.status] || data.status}</span>
      {data.automation_type && <p className="text-zinc-600 text-xs">Tipo: {data.automation_type}</p>}
    </div>
  );

  if (type === 'task') return (
    <div className="text-sm text-zinc-300 space-y-0.5">
      <p className={data.done ? 'line-through text-zinc-500' : 'text-white'}>{data.title}</p>
      {data.done && data.done_at && <p className="text-emerald-400 text-xs">✓ Concluída em {formatDateShort(data.done_at)}</p>}
      {!data.done && data.due_date && <p className="text-amber-400 text-xs">⏰ Vence {new Date(data.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>}
    </div>
  );

  if (type === 'ai_score') return (
    <div className="text-sm text-zinc-300 space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-violet-400">{data.score}</span>
        <span className="text-zinc-500 text-xs">/ 100</span>
        <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div className="h-full bg-violet-500 rounded-full" style={{ width: `${data.score}%` }} />
        </div>
      </div>
      {data.score_reason && <p className="text-zinc-400 text-xs">{data.score_reason}</p>}
      {data.next_step && <p className="text-amber-400 text-xs">💡 {data.next_step}</p>}
      {data.summary && <p className="text-zinc-500 text-xs italic">{data.summary}</p>}
    </div>
  );

  if (type === 'tickfy') return (
    <div className="text-sm text-zinc-300 space-y-0.5">
      {data.evento && <p className="text-white font-medium">🎟️ {data.evento}</p>}
      {data.valor > 0 && <p className="text-amber-400 font-bold">{formatBRL(data.valor)}</p>}
      {data.status_code && (
        <span className="text-xs text-zinc-400">{STATUS_TICKFY[data.status_code] || data.status_code}</span>
      )}
    </div>
  );

  if (type === 'hot_recovery') return (
    <p className="text-sm text-red-300">Lead retornou após período de silêncio. Temperatura elevada para 🔥 quente.</p>
  );

  if (type === 'closed') return (
    <div className="text-sm space-y-0.5">
      <p className="text-emerald-400 font-bold text-lg">{data.closed_value > 0 ? formatBRL(data.closed_value) : 'Valor não informado'}</p>
      <p className="text-zinc-400">Negócio fechado com sucesso! 🎉</p>
    </div>
  );

  if (type === 'lost') return (
    <div className="text-sm space-y-0.5">
      {data.loss_reason && <p className="text-zinc-300">Motivo: <span className="text-red-300">{data.loss_reason}</span></p>}
      {data.loss_detail && <p className="text-zinc-500 text-xs italic">{data.loss_detail}</p>}
    </div>
  );

  return null;
}

/* ── Componente principal ────────────────────────────────────────────── */
export default function LeadTimeline() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const [data,    setData]    = useState(null);
  const [filter,  setFilter]  = useState('all');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/crm/leads/${id}/timeline`);
      setData(res);
    } catch (e) {
      setError(e.response?.data?.error || 'Erro ao carregar timeline');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="p-8 text-center">
      <div className="text-4xl animate-pulse mb-3">⏳</div>
      <p className="text-zinc-500">Carregando timeline...</p>
    </div>
  );

  if (error) return (
    <div className="p-8 text-center">
      <p className="text-red-400">{error}</p>
      <button onClick={() => navigate(-1)} className="mt-4 text-amber-400 text-sm hover:underline">← Voltar</button>
    </div>
  );

  const { lead, tags, ai_data, responsible, timeline } = data;

  const FILTERS = [
    { key: 'all',      label: 'Tudo',       types: null },
    { key: 'messages', label: '💬 Msgs',     types: ['message_in','message_out','note'] },
    { key: 'actions',  label: '📋 Ações',    types: ['meeting','proposal','proposal_accepted','followup','task'] },
    { key: 'events',   label: '⚡ Eventos',   types: ['created','hot_recovery','ai_score','tickfy','closed','lost'] },
  ];

  const activeFilter = FILTERS.find(f => f.key === filter);
  const visible = activeFilter?.types
    ? timeline.filter(e => activeFilter.types.includes(e.type))
    : timeline;

  // Agrupar por data (dia)
  const grouped = [];
  let lastDay = null;
  for (const event of visible) {
    const day = event.at ? new Date(event.at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : 'Data desconhecida';
    if (day !== lastDay) {
      grouped.push({ type: 'day', label: day });
      lastDay = day;
    }
    grouped.push(event);
  }

  const tempColor = {
    quente: 'text-red-400', morno: 'text-amber-400', frio: 'text-blue-400',
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link to="/crm/leads" className="hover:text-amber-400 transition-colors">Leads</Link>
        <span>/</span>
        <span className="text-zinc-300">{lead.name || lead.phone}</span>
        <span>/</span>
        <span className="text-zinc-500">Timeline</span>
      </div>

      {/* Lead header card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center text-white font-bold text-xl shrink-0">
            {(lead.name || lead.phone || '?')[0].toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white">{lead.name || lead.phone}</h1>
              {lead.temperature && (
                <span className={`text-sm font-semibold ${tempColor[lead.temperature] || 'text-zinc-400'}`}>
                  {lead.temperature === 'quente' ? '🔥' : lead.temperature === 'frio' ? '❄️' : '🌡️'}
                  {lead.temperature}
                </span>
              )}
            </div>
            <p className="text-zinc-400 text-sm">{lead.phone}</p>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map(t => (
                  <span key={t.id} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: t.color + '22', color: t.color, border: `1px solid ${t.color}44` }}>
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Score IA */}
          {ai_data?.score != null && (
            <div className="shrink-0 text-center bg-violet-900/20 border border-violet-800/40 rounded-xl px-3 py-2">
              <p className="text-2xl font-bold text-violet-400">{ai_data.score}</p>
              <p className="text-zinc-500 text-xs">score IA</p>
            </div>
          )}
        </div>

        {/* Meta info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-zinc-600 text-xs">Estágio</p>
            <p className="text-white font-medium">{STAGE_LABELS[lead.stage] || lead.stage}</p>
          </div>
          {lead.closed_value > 0 && (
            <div>
              <p className="text-zinc-600 text-xs">Valor</p>
              <p className="text-amber-400 font-bold">{formatBRL(lead.closed_value)}</p>
            </div>
          )}
          {lead.potential_value > 0 && (
            <div>
              <p className="text-zinc-600 text-xs">Potencial</p>
              <p className="text-zinc-300">{formatBRL(lead.potential_value)}</p>
            </div>
          )}
          {responsible && (
            <div>
              <p className="text-zinc-600 text-xs">Responsável</p>
              <p className="text-zinc-300">{responsible.display_name || responsible.username}</p>
            </div>
          )}
          <div>
            <p className="text-zinc-600 text-xs">Origem</p>
            <p className="text-zinc-300">{SOURCE_LABELS[lead.source] || lead.source || '—'}</p>
          </div>
          <div>
            <p className="text-zinc-600 text-xs">Primeiro contato</p>
            <p className="text-zinc-300">{lead.first_contact_at ? new Date(lead.first_contact_at).toLocaleDateString('pt-BR') : '—'}</p>
          </div>
        </div>

        {/* Ações rápidas */}
        <div className="flex gap-2 flex-wrap pt-1">
          <button
            onClick={() => navigate('/inbox?lead=' + lead.id)}
            className="px-3 py-1.5 bg-blue-800/40 hover:bg-blue-800/60 text-blue-300 rounded-lg text-xs font-medium transition-colors border border-blue-800/40"
          >
            💬 Abrir no Inbox
          </button>
          <button
            onClick={() => navigate('/crm/kanban')}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
          >
            🗂️ Ver Kanban
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-amber-500 text-black'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {f.label} {f.key === 'all' && `(${timeline.length})`}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {visible.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-zinc-500">Nenhum evento nesta categoria.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Linha vertical */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-zinc-800" />

          <div className="space-y-1">
            {grouped.map((item, i) => {
              // Separador de dia
              if (item.type === 'day') {
                return (
                  <div key={`day-${i}`} className="flex items-center gap-3 py-3 relative z-10">
                    <div className="w-10 shrink-0" />
                    <span className="text-xs text-zinc-600 font-semibold uppercase tracking-wide bg-zinc-950 px-2">
                      {item.label}
                    </span>
                    <div className="flex-1 h-px bg-zinc-800" />
                  </div>
                );
              }

              const cfg = EVENT_CONFIG[item.type] || EVENT_CONFIG.note;

              return (
                <div key={`${item.type}-${item.at}-${i}`} className="flex gap-4 group">
                  {/* Ícone na timeline */}
                  <div className="relative shrink-0 flex flex-col items-center" style={{ width: 40 }}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm z-10 border ${cfg.color} ${cfg.border}`}>
                      {cfg.icon}
                    </div>
                  </div>

                  {/* Conteúdo do evento */}
                  <div className={`flex-1 min-w-0 pb-4 ${i < grouped.length - 1 ? '' : ''}`}>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2 group-hover:border-zinc-700 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                          {cfg.label}
                        </span>
                        <span className="text-xs text-zinc-600 shrink-0">{formatDateShort(item.at)}</span>
                      </div>
                      <EventBody event={item} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
