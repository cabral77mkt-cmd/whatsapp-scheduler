import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { STAGE_BY_ID, TEMPERATURE } from './stages';
import MeetingForm from './MeetingForm';
import ProposalForm from './ProposalForm';
import CloseLeadModal from './CloseLeadModal';
import { calcScore, scoreColor, scoreLabel } from './scoreUtils';

const TABS = [
  { id: 'overview', label: 'Resumo' },
  { id: 'ai',       label: '🤖 IA'   },
  { id: 'history',  label: 'Histórico' },
  { id: 'event',    label: 'Diagnóstico' },
  { id: 'meetings', label: 'Reuniões' },
  { id: 'proposals',label: 'Propostas' },
  { id: 'followups',label: 'Follow-ups' },
  { id: 'tasks',    label: 'Tarefas' },
];

const NEXT_STEP_ICONS = {
  schedule_meeting: '📅',
  send_proposal:    '📋',
  follow_up:        '📨',
  send_message:     '💬',
  close_deal:       '🤝',
  none:             '⏳',
};

function formatDt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function LeadDrawer({ leadId, onClose, onUpdate }) {
  const [lead, setLead] = useState(null);
  const [tab, setTab] = useState('overview');
  const [allTags, setAllTags] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [cadences, setCadences] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [enrollingId, setEnrollingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msgInput, setMsgInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showMeeting, setShowMeeting] = useState(false);
  const [showProposal, setShowProposal] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [taskInput, setTaskInput] = useState('');
  const [aiRefreshing, setAiRefreshing] = useState(false);
  // F5: Adormecer
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState('');
  const [snoozing, setSnoozing]     = useState(false);
  // F2: Re-engajamento IA
  const [suggesting, setSuggesting] = useState(false);

  const reload = async () => {
    try {
      const data = await api.get(`/crm/leads/${leadId}`);
      setLead(data);
    } catch {
      toast.error('Erro ao carregar lead');
    } finally {
      setLoading(false);
    }
  };

  const reloadCadences = () => {
    api.get('/crm/cadences').then((data) => setCadences(data.filter((c) => c.active))).catch(() => {});
    api.get(`/crm/cadences/enrollments/${leadId}`).then(setEnrollments).catch(() => {});
  };

  useEffect(() => {
    reload();
    api.get('/crm/tags').then(setAllTags).catch(() => {});
    api.get('/crm/leads/users').then(setAllUsers).catch(() => {});
    reloadCadences();
  }, [leadId]);

  if (loading || !lead) {
    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
        <div className="text-white">Carregando...</div>
      </div>
    );
  }

  const stage = STAGE_BY_ID[lead.stage];
  const temp = TEMPERATURE[lead.temperature];
  const score = calcScore(lead);
  const sc = scoreColor(score);

  const moveStage = async (newStage) => {
    try {
      await api.put(`/crm/leads/${leadId}/stage`, { stage: newStage });
      toast.success('Etapa atualizada');
      reload();
      onUpdate?.();
    } catch (err) {
      toast.error(err.message || 'Erro');
    }
  };

  const sendMessage = async () => {
    if (!msgInput.trim()) return;
    setSending(true);
    try {
      await api.post(`/crm/leads/${leadId}/message`, { message: msgInput });
      setMsgInput('');
      toast.success('Mensagem enviada');
      reload();
    } catch (err) {
      toast.error(err.message || 'Erro ao enviar');
    } finally {
      setSending(false);
    }
  };

  const toggleTag = async (tagId) => {
    const current = lead.tags.map(t => t.id);
    const next = current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId];
    try {
      await api.put(`/crm/leads/${leadId}/tags`, { tag_ids: next });
      reload();
    } catch {
      toast.error('Erro ao atualizar tags');
    }
  };

  const toggleAutomations = async () => {
    try {
      await api.put(`/crm/leads/${leadId}`, { automations_enabled: lead.automations_enabled ? 0 : 1 });
      reload();
    } catch { toast.error('Erro'); }
  };

  const updateField = async (field, value) => {
    try {
      await api.put(`/crm/leads/${leadId}`, { [field]: value });
      reload();
    } catch { toast.error('Erro ao salvar'); }
  };

  const saveEvent = async (eventData) => {
    try {
      await api.put(`/crm/leads/${leadId}`, { event: eventData });
      toast.success('Diagnóstico salvo');
      reload();
    } catch { toast.error('Erro ao salvar'); }
  };

  const cancelFollowup = async (fId) => {
    try {
      await api.post(`/crm/followups/${fId}/cancel`);
      toast.success('Follow-up cancelado');
      reload();
    } catch { toast.error('Erro'); }
  };

  const addTask = async () => {
    if (!taskInput.trim()) return;
    try {
      await api.post('/crm/tasks', { lead_id: leadId, title: taskInput });
      setTaskInput('');
      reload();
    } catch { toast.error('Erro'); }
  };

  const toggleTask = async (taskId, done) => {
    try { await api.put(`/crm/tasks/${taskId}`, { done }); reload(); } catch {}
  };

  const enrollCadence = async (cadenceId) => {
    setEnrollingId(cadenceId);
    try {
      await api.post(`/crm/cadences/${cadenceId}/enroll`, { lead_id: leadId });
      toast.success('Lead matriculado na cadência!');
      reloadCadences();
    } catch (err) {
      toast.error(err.message || 'Erro ao matricular');
    } finally {
      setEnrollingId(null);
    }
  };

  const updateEnrollmentStatus = async (enrollId, status) => {
    try {
      await api.patch(`/crm/cadences/enrollments/${enrollId}/status`, { status });
      reloadCadences();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const refreshAi = async () => {
    setAiRefreshing(true);
    try {
      await api.post(`/crm/leads/${leadId}/ai-refresh`);
      await reload();
      toast.success('Análise de IA atualizada!');
    } catch (err) {
      toast.error(err.message || 'Erro na análise de IA');
    } finally {
      setAiRefreshing(false);
    }
  };

  // F5: Adormecer com Graça
  const handleSnooze = async () => {
    if (!snoozeDate) return toast.error('Selecione uma data');
    setSnoozing(true);
    try {
      await api.post(`/crm/leads/${leadId}/snooze`, { until: snoozeDate });
      toast.success(`Lead adormecido até ${new Date(snoozeDate + 'T12:00:00').toLocaleDateString('pt-BR')}`);
      setShowSnooze(false);
      reload();
      onUpdate?.();
    } catch (err) {
      toast.error(err.message || 'Erro ao adormecer lead');
    } finally {
      setSnoozing(false); }
  };

  const handleWake = async () => {
    try {
      await api.post(`/crm/leads/${leadId}/wake`);
      toast.success('Lead despertado!');
      reload();
      onUpdate?.();
    } catch (err) {
      toast.error(err.message || 'Erro ao despertar lead');
    }
  };

  // F2: Re-engajamento IA
  const suggestReengagement = async () => {
    setSuggesting(true);
    try {
      const { message } = await api.post(`/crm/leads/${leadId}/suggest-reengagement`);
      setMsgInput(message);
      toast.success('✨ Mensagem sugerida pela IA!');
    } catch (err) {
      toast.error(err.message || 'Erro ao gerar sugestão');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-end">
      <div className="bg-gray-900 w-full max-w-2xl h-full flex flex-col border-l border-orange-900/40 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-gray-800 shrink-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-white truncate">{lead.name || lead.phone}</h2>
              <p className="text-sm text-gray-400">📱 {lead.phone}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">✕</button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className={`px-2 py-1 rounded text-xs font-semibold text-white ${stage.color}`}>{stage.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${temp.chip}`}>{temp.label}</span>
            {lead.ai?.score != null ? (
              <button
                onClick={() => setTab('ai')}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer transition-colors"
                style={{
                  background: '#D4AF3720',
                  borderColor: '#D4AF3750',
                  color: '#D4AF37',
                }}
                title={`IA: ${lead.ai.score}/100 — clique para ver análise completa`}
              >
                🤖 {lead.ai.score}/100
              </button>
            ) : (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-800 border border-gray-700 ${sc.text}`}
                title={`Score calculado: ${score}/100 — ${scoreLabel(score)}`}
              >
                ★ {score}/100 · {scoreLabel(score)}
              </span>
            )}
            <button onClick={toggleAutomations} className={`px-2 py-0.5 rounded-full text-[10px] ${lead.automations_enabled ? 'bg-green-600/30 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
              {lead.automations_enabled ? '🤖 Automações ON' : '🤖 Automações OFF'}
            </button>
            {/* F5: Badge dormência */}
            {lead.dormant_until && new Date(lead.dormant_until) > new Date() ? (
              <button
                onClick={handleWake}
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: '#6B728033', color: '#9CA3AF' }}
                title={`Dormindo até ${new Date(lead.dormant_until + 'T12:00:00').toLocaleDateString('pt-BR')} — clique para despertar`}
              >
                😴 Dorme até {new Date(lead.dormant_until + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </button>
            ) : (
              <button
                onClick={() => setShowSnooze(v => !v)}
                className="px-2 py-0.5 rounded-full text-[10px]"
                style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}
                title="Adormecer este lead por alguns dias"
              >
                😴 Adormecer
              </button>
            )}
          </div>

          {/* F5: Snooze date picker */}
          {showSnooze && (
            <div className="mt-3 p-3 rounded-xl flex items-end gap-3" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)' }}>
              <div className="flex-1">
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  😴 Adormecer até quando?
                </p>
                <input
                  type="date"
                  value={snoozeDate}
                  min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                  onChange={e => setSnoozeDate(e.target.value)}
                  className="input text-sm w-full"
                />
              </div>
              <button onClick={handleSnooze} disabled={snoozing || !snoozeDate} className="btn-primary text-xs shrink-0">
                {snoozing ? '…' : 'Confirmar'}
              </button>
              <button onClick={() => setShowSnooze(false)} className="btn-ghost text-xs shrink-0">✕</button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-800 px-3 flex gap-1 overflow-x-auto shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 ${
                tab === t.id ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── IA Tab ───────────────────────────────────── */}
          {tab === 'ai' && (
            <div className="space-y-5">
              {/* Header + refresh */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white">Análise de IA</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {lead.ai?.last_updated_at
                      ? `Atualizado ${new Date(lead.ai.last_updated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
                      : 'Ainda não analisado'}
                  </p>
                </div>
                <button
                  onClick={refreshAi}
                  disabled={aiRefreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: aiRefreshing ? 'var(--bg-surface-2)' : 'var(--gold-500)',
                    color: aiRefreshing ? 'var(--text-muted)' : '#000',
                  }}
                >
                  {aiRefreshing
                    ? <><span className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{borderColor:'var(--text-muted)',borderTopColor:'transparent'}} /> Analisando…</>
                    : '✨ Analisar agora'}
                </button>
              </div>

              {!lead.ai && !aiRefreshing && (
                <div className="text-center py-10 space-y-2">
                  <p className="text-3xl">🤖</p>
                  <p className="text-sm text-gray-400">Nenhuma análise ainda.</p>
                  <p className="text-xs text-gray-500">Clique em "Analisar agora" para o Claude avaliar este lead.</p>
                </div>
              )}

              {lead.ai && (
                <>
                  {/* Score ring */}
                  <div
                    className="flex items-center gap-5 p-4 rounded-xl"
                    style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)' }}
                  >
                    <div className="relative w-20 h-20 shrink-0">
                      <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1F1F1F" strokeWidth="3" />
                        <circle
                          cx="18" cy="18" r="15.9" fill="none"
                          stroke={lead.ai.score >= 70 ? '#D4AF37' : lead.ai.score >= 40 ? '#F59E0B' : '#6B7280'}
                          strokeWidth="3"
                          strokeDasharray={`${lead.ai.score} ${100 - lead.ai.score}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-bold text-white">{lead.ai.score}</span>
                        <span className="text-[9px] text-gray-400">/100</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-300 mb-1">Probabilidade de fechamento</p>
                      <p className="text-sm text-gray-400 leading-relaxed">{lead.ai.score_reason || '—'}</p>
                    </div>
                  </div>

                  {/* Próximo passo */}
                  {lead.ai.next_step_text && (
                    <div
                      className="p-4 rounded-xl"
                      style={{ background: '#D4AF3710', border: '1px solid #D4AF3730' }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#D4AF37' }}>
                        Próxima ação recomendada
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{NEXT_STEP_ICONS[lead.ai.next_step_action] || '✨'}</span>
                        <p className="font-medium text-white">{lead.ai.next_step_text}</p>
                      </div>
                    </div>
                  )}

                  {/* Resumo */}
                  {lead.ai.conversation_summary && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Resumo da conversa</p>
                      <p className="text-sm text-gray-300 leading-relaxed">{lead.ai.conversation_summary}</p>
                    </div>
                  )}

                  {/* Hot signals */}
                  {lead.ai.hot_signals_json && (() => {
                    try {
                      const signals = JSON.parse(lead.ai.hot_signals_json);
                      if (!signals?.length) return null;
                      return (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Sinais positivos</p>
                          <div className="flex flex-wrap gap-2">
                            {signals.map((s, i) => (
                              <span key={i} className="text-xs px-2.5 py-1 rounded-full" style={{ background: '#10B98122', color: '#10B981' }}>
                                ✓ {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    } catch { return null; }
                  })()}
                </>
              )}
            </div>
          )}

          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Temperatura</label>
                  <select className="input w-full" value={lead.temperature} onChange={e => updateField('temperature', e.target.value)}>
                    <option value="frio">Frio</option><option value="morno">Morno</option><option value="quente">Quente</option>
                  </select>
                </div>
                <div>
                  <label className="label">Valor potencial</label>
                  <input type="number" className="input w-full" defaultValue={lead.potential_value || ''}
                    onBlur={e => updateField('potential_value', e.target.value ? Number(e.target.value) : null)} />
                </div>
              </div>
              {allUsers.length > 1 && (
                <div>
                  <label className="label">Responsável</label>
                  <select
                    className="input w-full"
                    value={lead.responsible_user_id || ''}
                    onChange={e => updateField('responsible_user_id', e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— Sem responsável —</option>
                    {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Nome</label>
                <input className="input w-full" defaultValue={lead.name || ''} onBlur={e => updateField('name', e.target.value || null)} />
              </div>
              <div>
                <label className="label">Origem</label>
                <input className="input w-full" defaultValue={lead.source || ''} onBlur={e => updateField('source', e.target.value || null)} />
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea rows="3" className="input w-full" defaultValue={lead.notes || ''} onBlur={e => updateField('notes', e.target.value || null)} />
              </div>

              <div>
                <label className="label">Tags</label>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map(t => {
                    const active = lead.tags.some(lt => lt.id === t.id);
                    return (
                      <button key={t.id} onClick={() => toggleTag(t.id)}
                        className={`text-xs px-2 py-1 rounded-full border ${
                          active ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-700 text-gray-400 hover:border-orange-500'
                        }`}>
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-gray-800 pt-3 grid grid-cols-2 gap-2">
                <button onClick={() => setShowMeeting(true)} className="btn btn-ghost text-xs">📅 Criar reunião</button>
                <button onClick={() => setShowProposal(true)} className="btn btn-ghost text-xs">📝 Nova proposta</button>
                <button onClick={() => setShowClose(true)} className="btn text-xs bg-emerald-600 hover:bg-emerald-700 text-white">✅ Marcar como fechado</button>
                <button onClick={() => moveStage('perdido')} className="btn btn-danger text-xs">❌ Marcar como perdido</button>
              </div>

              <div className="border-t border-gray-800 pt-3">
                <label className="label">Mover para etapa</label>
                <select className="input w-full" value={lead.stage} onChange={e => moveStage(e.target.value)}>
                  {Object.values(STAGE_BY_ID).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>

              <div className="border-t border-gray-800 pt-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="label">Enviar mensagem WhatsApp</label>
                  {/* F2: Botão sugerir reengajamento */}
                  <button
                    onClick={suggestReengagement}
                    disabled={suggesting}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg transition-colors"
                    style={{ background: 'var(--bg-surface-2)', color: 'var(--gold-400)' }}
                    title="IA sugere uma mensagem personalizada de reengajamento"
                  >
                    {suggesting
                      ? <><span className="w-2.5 h-2.5 border border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gold-400)', borderTopColor: 'transparent' }} /> Gerando…</>
                      : '✨ Sugerir msg'}
                  </button>
                </div>
                <textarea rows="3" className="input w-full" value={msgInput} onChange={e => setMsgInput(e.target.value)} placeholder="Digite ou use ✨ para IA sugerir..." />
                <button onClick={sendMessage} disabled={sending || !msgInput.trim()} className="btn btn-primary w-full mt-2">
                  {sending ? 'Enviando...' : 'Enviar agora'}
                </button>
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-2">
              {lead.messages.length === 0 && <p className="text-gray-500 text-sm">Sem mensagens.</p>}
              {lead.messages.map(m => (
                <div key={m.id} className={`p-3 rounded-lg text-sm ${
                  m.direction === 'in' ? 'bg-gray-800 mr-8' :
                  m.direction === 'out' ? 'bg-orange-500/20 ml-8 text-right' :
                  'bg-gray-700/30 text-center text-xs text-gray-400 italic'
                }`}>
                  <p className="text-gray-200 whitespace-pre-wrap">{m.body}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{formatDt(m.occurred_at)}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'event' && (
            <EventForm event={lead.event} onSave={saveEvent} />
          )}

          {tab === 'meetings' && (
            <div className="space-y-2">
              <button onClick={() => setShowMeeting(true)} className="btn btn-primary text-xs">+ Nova reunião</button>
              {lead.meetings.length === 0 && <p className="text-gray-500 text-sm mt-3">Sem reuniões.</p>}
              {lead.meetings.map(m => (
                <div key={m.id} className="bg-gray-800 rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-semibold">{formatDt(m.meeting_at)}</span>
                    <span className="text-xs text-gray-400">{m.format || 'sem formato'} · {m.status}</span>
                  </div>
                  {m.link && <a href={m.link} target="_blank" rel="noreferrer" className="text-orange-400 text-xs underline">{m.link}</a>}
                  {m.notes && <p className="text-gray-400 text-xs mt-1">{m.notes}</p>}
                  {m.summary && <p className="text-gray-300 text-xs mt-2 border-t border-gray-700 pt-2"><b>Resumo:</b> {m.summary}</p>}
                </div>
              ))}
            </div>
          )}

          {tab === 'proposals' && (
            <div className="space-y-2">
              <button onClick={() => setShowProposal(true)} className="btn btn-primary text-xs">+ Nova proposta</button>
              {lead.proposals.length === 0 && <p className="text-gray-500 text-sm mt-3">Sem propostas.</p>}
              {lead.proposals.map(p => (
                <div key={p.id} className="bg-gray-800 rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-semibold">R$ {Number(p.amount || 0).toLocaleString('pt-BR')}</span>
                    <span className="text-xs text-gray-400">{p.status}</span>
                  </div>
                  {p.service && <p className="text-gray-300 text-xs">{p.service}</p>}
                  {p.sent_at && <p className="text-gray-500 text-[10px] mt-1">Enviada: {formatDt(p.sent_at)}</p>}
                  {p.file_url && <a href={p.file_url} target="_blank" rel="noreferrer" className="text-orange-400 text-xs underline">Ver proposta</a>}
                </div>
              ))}
            </div>
          )}

          {tab === 'followups' && (
            <div className="space-y-2">
              {lead.followups.length === 0 && <p className="text-gray-500 text-sm">Sem follow-ups.</p>}
              {lead.followups.map(f => (
                <div key={f.id} className={`rounded-lg p-3 text-sm border ${
                  f.status === 'pending' ? 'bg-orange-500/10 border-orange-500/30' :
                  f.status === 'sent' ? 'bg-green-500/10 border-green-500/30' :
                  f.status === 'failed' ? 'bg-red-500/10 border-red-500/30' :
                  'bg-gray-800 border-gray-700'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">{f.automation_type} · {f.status}</span>
                    <span className="text-xs text-gray-300">{formatDt(f.scheduled_at)}</span>
                  </div>
                  <p className="text-gray-200 text-xs whitespace-pre-wrap">{f.message}</p>
                  {f.status === 'pending' && (
                    <button onClick={() => cancelFollowup(f.id)} className="text-red-400 text-xs mt-2 hover:underline">Cancelar</button>
                  )}
                  {f.error_msg && <p className="text-red-400 text-[10px] mt-1">{f.error_msg}</p>}
                </div>
              ))}
            </div>
          )}

          {/* ── Cadências ────────────────────────────────── */}
          {tab === 'overview' && (cadences.length > 0 || enrollments.length > 0) && (
            <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-disabled)' }}>
                📨 Cadências
              </p>

              {/* Matrículas ativas */}
              {enrollments.filter((e) => ['active','paused'].includes(e.status)).map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 p-2 rounded-lg mb-2 text-xs"
                  style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)' }}>
                  <div className="min-w-0">
                    <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{e.cadence_name}</p>
                    <p style={{ color: 'var(--text-muted)' }}>
                      Passo {e.current_step + 1}/{e.total_steps} ·{' '}
                      <span style={{ color: e.status === 'active' ? '#10B981' : '#F59E0B' }}>
                        {e.status === 'active' ? 'Ativa' : 'Pausada'}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {e.status === 'paused' && (
                      <button onClick={() => updateEnrollmentStatus(e.id, 'active')}
                        className="px-2 py-0.5 rounded text-[10px]"
                        style={{ background: '#10B98122', color: '#10B981' }}>▶ Retomar</button>
                    )}
                    {e.status === 'active' && (
                      <button onClick={() => updateEnrollmentStatus(e.id, 'paused')}
                        className="px-2 py-0.5 rounded text-[10px]"
                        style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}>⏸</button>
                    )}
                    <button onClick={() => updateEnrollmentStatus(e.id, 'canceled')}
                      className="px-2 py-0.5 rounded text-[10px]"
                      style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>✕</button>
                  </div>
                </div>
              ))}

              {/* Enroll buttons */}
              {cadences.filter((c) => !enrollments.find((e) => e.cadence_id === c.id && ['active','paused'].includes(e.status))).length > 0 && (
                <div>
                  <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-disabled)' }}>Matricular em cadência:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cadences
                      .filter((c) => !enrollments.find((e) => e.cadence_id === c.id && ['active','paused'].includes(e.status)))
                      .map((c) => (
                        <button key={c.id} onClick={() => enrollCadence(c.id)} disabled={!!enrollingId}
                          className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                          style={{ background: 'var(--bg-surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
                          {enrollingId === c.id ? '…' : `+ ${c.name}`}
                        </button>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'tasks' && (
            <div>
              <div className="flex gap-2 mb-3">
                <input className="input flex-1" placeholder="Nova tarefa..." value={taskInput} onChange={e => setTaskInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTask()} />
                <button onClick={addTask} className="btn btn-primary text-xs">+ Add</button>
              </div>
              {lead.tasks.length === 0 && <p className="text-gray-500 text-sm">Sem tarefas.</p>}
              {lead.tasks.map(t => (
                <div key={t.id} className="flex items-center gap-2 p-2 bg-gray-800 rounded mb-1.5">
                  <input type="checkbox" checked={!!t.done_at} onChange={e => toggleTask(t.id, e.target.checked)} />
                  <span className={`text-sm flex-1 ${t.done_at ? 'line-through text-gray-500' : 'text-gray-200'}`}>{t.title}</span>
                  {t.due_date && <span className="text-[10px] text-gray-500">{t.due_date}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showMeeting && (
        <MeetingForm leadId={leadId} onClose={() => setShowMeeting(false)} onSaved={() => { setShowMeeting(false); reload(); onUpdate?.(); }} />
      )}
      {showProposal && (
        <ProposalForm leadId={leadId} onClose={() => setShowProposal(false)} onSaved={() => { setShowProposal(false); reload(); onUpdate?.(); }} />
      )}
      {showClose && (
        <CloseLeadModal
          leadName={lead.name || lead.phone}
          onCancel={() => setShowClose(false)}
          onConfirm={async ({ value, notes }) => {
            try {
              await api.post(`/crm/leads/${leadId}/close`, { value, notes });
              toast.success('🎉 Negócio fechado!');
              setShowClose(false);
              reload();
              onUpdate?.();
            } catch { toast.error('Erro ao fechar negócio'); }
          }}
        />
      )}
    </div>
  );
}

function EventForm({ event, onSave }) {
  const [e, setE] = useState(event || {});
  const upd = (f, v) => setE({ ...e, [f]: v });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Nome do evento</label><input className="input w-full" value={e.event_name || ''} onChange={ev => upd('event_name', ev.target.value)} /></div>
        <div><label className="label">Cidade</label><input className="input w-full" value={e.city || ''} onChange={ev => upd('city', ev.target.value)} /></div>
        <div><label className="label">Data do evento</label><input type="date" className="input w-full" value={e.event_date || ''} onChange={ev => upd('event_date', ev.target.value)} /></div>
        <div><label className="label">Tipo</label>
          <select className="input w-full" value={e.event_type || ''} onChange={ev => upd('event_type', ev.target.value)}>
            <option value="">—</option>
            <option>Casa noturna</option><option>Rodeio</option><option>Festa universitária</option>
            <option>Show</option><option>Festival</option><option>Outro</option>
          </select>
        </div>
        <div><label className="label">Público esperado</label><input type="number" className="input w-full" value={e.expected_audience || ''} onChange={ev => upd('expected_audience', Number(ev.target.value) || null)} /></div>
        <div><label className="label">Plataforma de ingresso</label><input className="input w-full" value={e.ticket_platform || ''} onChange={ev => upd('ticket_platform', ev.target.value)} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <YesNo label="Vende ingresso?" value={e.sells_tickets} onChange={v => upd('sells_tickets', v)} />
        <YesNo label="Faz tráfego pago?" value={e.runs_paid_ads} onChange={v => upd('runs_paid_ads', v)} />
        <YesNo label="Tem equipe de criação?" value={e.has_creative_team} onChange={v => upd('has_creative_team', v)} />
      </div>
      <div>
        <label className="label">Principal dificuldade</label>
        <textarea rows="3" className="input w-full" value={e.main_difficulty || ''} onChange={ev => upd('main_difficulty', ev.target.value)} />
      </div>
      <button onClick={() => onSave(e)} className="btn btn-primary w-full">Salvar diagnóstico</button>
    </div>
  );
}

function YesNo({ label, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input w-full" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">—</option>
        <option value="1">Sim</option>
        <option value="0">Não</option>
      </select>
    </div>
  );
}
