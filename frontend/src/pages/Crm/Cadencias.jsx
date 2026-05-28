import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

const STAGE_LABELS = {
  entrou_contato: 'Entrou Contato', conversando: 'Conversando',
  diagnostico: 'Diagnóstico', reuniao_agendada: 'Reunião Agendada',
  reuniao_realizada: 'Reunião Realizada', aguardando_proposta: 'Aguardando Proposta',
  proposta_enviada: 'Proposta Enviada', analisando_proposta: 'Analisando Proposta',
  negociacao: 'Negociação', fechado: 'Fechado', perdido: 'Perdido',
};

const UNIT_LABELS = { minutes: 'minutos', hours: 'horas', days: 'dias' };

const VARS = ['{nome}', '{evento}', '{cidade}', '{data}', '{telefone}'];

const DEFAULT_STEP = { wait_amount: 1, wait_unit: 'days', message_template: '', skip_if_replied: true };

/* ── Step row no builder ─────────────────────────────────── */
function StepRow({ step, index, total, onChange, onDelete, onMove }) {
  const insertVar = (v) => {
    onChange({ ...step, message_template: step.message_template + v });
  };

  return (
    <div className="relative pl-8">
      {/* Timeline line */}
      {index < total - 1 && (
        <div className="absolute left-[13px] top-8 bottom-0 w-0.5" style={{ background: 'var(--border-default)' }} />
      )}
      {/* Step dot */}
      <div
        className="absolute left-0 top-3 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: 'var(--gold-500)', color: '#000' }}
      >
        {index + 1}
      </div>

      <div className="card mb-4 space-y-3">
        {/* Wait config */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Aguardar</span>
          <input
            type="number"
            min={0}
            max={999}
            value={step.wait_amount}
            onChange={(e) => onChange({ ...step, wait_amount: Number(e.target.value) || 0 })}
            className="w-16 text-sm px-2 py-1 rounded-lg text-center outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
          />
          <select
            value={step.wait_unit}
            onChange={(e) => onChange({ ...step, wait_unit: e.target.value })}
            className="text-sm px-2 py-1 rounded-lg outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
          >
            {Object.entries(UNIT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>e enviar:</span>

          <div className="ml-auto flex items-center gap-1">
            {index > 0 && (
              <button onClick={() => onMove(index, -1)} className="w-6 h-6 text-xs rounded flex items-center justify-center"
                style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }} title="Subir">↑</button>
            )}
            {index < total - 1 && (
              <button onClick={() => onMove(index, 1)} className="w-6 h-6 text-xs rounded flex items-center justify-center"
                style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }} title="Descer">↓</button>
            )}
            <button onClick={onDelete} className="w-6 h-6 text-xs rounded flex items-center justify-center"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }} title="Remover">✕</button>
          </div>
        </div>

        {/* Message */}
        <div>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {VARS.map((v) => (
              <button key={v} onClick={() => insertVar(v)}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--bg-surface-2)', color: 'var(--gold-400)', border: '1px solid var(--border-default)' }}>
                {v}
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            value={step.message_template}
            onChange={(e) => onChange({ ...step, message_template: e.target.value })}
            placeholder="Mensagem do passo… use {nome}, {evento} etc."
            className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Skip if replied */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!step.skip_if_replied}
            onChange={(e) => onChange({ ...step, skip_if_replied: e.target.checked })}
          />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Pausar automaticamente se o lead responder
          </span>
        </label>
      </div>
    </div>
  );
}

/* ── CadenceBuilder modal ────────────────────────────────── */
function CadenceBuilder({ cadence, onSave, onClose }) {
  const [name, setName] = useState(cadence?.name || '');
  const [description, setDescription] = useState(cadence?.description || '');
  const [triggerStage, setTriggerStage] = useState(cadence?.trigger_stage || '');
  const [steps, setSteps] = useState(cadence?.steps?.length ? cadence.steps : [{ ...DEFAULT_STEP }]);
  const [saving, setSaving] = useState(false);

  const updateStep = (i, s) => setSteps((prev) => prev.map((x, idx) => idx === i ? s : x));
  const removeStep = (i) => setSteps((prev) => prev.filter((_, idx) => idx !== i));
  const moveStep = (i, dir) => {
    const arr = [...steps];
    const target = i + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[i], arr[target]] = [arr[target], arr[i]];
    setSteps(arr);
  };
  const addStep = () => setSteps((prev) => [...prev, { ...DEFAULT_STEP }]);

  const save = async () => {
    if (!name.trim()) { toast.error('Nome obrigatório'); return; }
    if (!steps.length) { toast.error('Adicione pelo menos um passo'); return; }
    const emptyStep = steps.findIndex((s) => !s.message_template.trim());
    if (emptyStep >= 0) { toast.error(`Passo ${emptyStep + 1} sem mensagem`); return; }

    setSaving(true);
    try {
      const payload = { name, description, trigger_stage: triggerStage || null, steps };
      if (cadence?.id) {
        await api.put(`/crm/cadences/${cadence.id}`, payload);
        toast.success('Cadência atualizada!');
      } else {
        await api.post('/crm/cadences', payload);
        toast.success('Cadência criada!');
      }
      onSave();
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl overflow-hidden"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-default)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
            {cadence?.id ? 'Editar Cadência' : 'Nova Cadência'}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nome da cadência *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Ex: Sem resposta 7 dias" />
            </div>
            <div>
              <label className="label">Estágio gatilho (opcional)</label>
              <select value={triggerStage} onChange={(e) => setTriggerStage(e.target.value)} className="input">
                <option value="">— Qualquer estágio —</option>
                {Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Descrição</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="Opcional…" />
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Passos da cadência ({steps.length})
              </p>
              <button onClick={addStep} className="btn-outline-gold text-xs !py-1 !px-3 !min-h-0">
                + Adicionar passo
              </button>
            </div>
            {steps.map((s, i) => (
              <StepRow key={i} step={s} index={i} total={steps.length}
                onChange={(v) => updateStep(i, v)}
                onDelete={() => removeStep(i)}
                onMove={(idx, dir) => moveStep(idx, dir)}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--border-default)' }}>
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Salvando…' : cadence?.id ? 'Salvar alterações' : 'Criar cadência'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────── */
export default function Cadencias() {
  const [cadences, setCadences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      const data = await api.get('/crm/cadences');
      setCadences(data);
    } catch (e) {
      toast.error('Erro ao carregar cadências');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (id) => {
    try {
      const { active } = await api.patch(`/crm/cadences/${id}/toggle`);
      setCadences((prev) => prev.map((c) => c.id === id ? { ...c, active: active ? 1 : 0 } : c));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Excluir esta cadência? Os leads matriculados serão cancelados.')) return;
    try {
      await api.delete(`/crm/cadences/${id}`);
      setCadences((prev) => prev.filter((c) => c.id !== id));
      toast.success('Cadência excluída');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openEdit = async (id) => {
    try {
      const data = await api.get(`/crm/cadences/${id}`);
      setEditing(data);
      setShowBuilder(true);
    } catch (err) {
      toast.error('Erro ao carregar cadência');
    }
  };

  const handleSaved = () => {
    setShowBuilder(false);
    setEditing(null);
    load();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="section-title">Cadências de Venda</h2>
          <p className="section-subtitle">Sequências automáticas de mensagens por lead</p>
        </div>
        <button onClick={() => { setEditing(null); setShowBuilder(true); }} className="btn-primary">
          + Nova cadência
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)' }} />
          ))}
        </div>
      ) : cadences.length === 0 ? (
        <div className="card flex flex-col items-center py-16 gap-3 text-center">
          <span className="text-5xl">📨</span>
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Nenhuma cadência criada</p>
          <p className="text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
            Crie sequências automáticas de mensagens para nutrir leads sem esforço manual.
          </p>
          <button onClick={() => setShowBuilder(true)} className="btn-primary mt-2">+ Criar primeira cadência</button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* F3: Templates de resgate separados */}
          {cadences.some(c => c.is_template) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2 px-1"
                style={{ color: 'var(--gold-400)' }}>
                🔄 Cadências de Resgate (Templates)
              </p>
            </div>
          )}
          {cadences.filter(c => c.is_template).length > 0 && cadences.filter(c => !c.is_template).length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-default)', marginBottom: 8 }} />
          )}
          {cadences.filter(c => !c.is_template).length > 0 && (
            <p className="text-xs font-semibold uppercase tracking-widest mb-2 px-1 pt-1"
              style={{ color: 'var(--text-muted)' }}>
              Suas cadências
            </p>
          )}
          {cadences.map((c) => (
            <div key={c.id} className="card" style={c.is_template ? { borderLeft: '3px solid #D4AF3755', opacity: 0.95 } : {}}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                    {c.is_template && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: '#D4AF3720', color: 'var(--gold-400)' }}>
                        template
                      </span>
                    )}
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: c.active ? '#10B98122' : 'var(--bg-surface-2)', color: c.active ? '#10B981' : 'var(--text-disabled)' }}
                    >
                      {c.active ? 'Ativa' : 'Inativa'}
                    </span>
                    {c.trigger_stage && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}>
                        🔔 {STAGE_LABELS[c.trigger_stage] || c.trigger_stage}
                      </span>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{c.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: 'var(--text-disabled)' }}>
                    <span>📋 {c.steps_count} passo{c.steps_count !== 1 ? 's' : ''}</span>
                    <span>▶ {c.active_enrollments} ativos</span>
                    <span>🏁 {c.total_enrollments} total</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!c.is_template && (
                    <>
                      <button
                        onClick={() => toggle(c.id)}
                        className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                        style={{
                          background: c.active ? 'var(--bg-surface-2)' : '#10B98122',
                          color: c.active ? 'var(--text-muted)' : '#10B981',
                          border: '1px solid var(--border-default)',
                        }}
                      >
                        {c.active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        onClick={() => openEdit(c.id)}
                        className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                        style={{ background: 'var(--bg-surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                        style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
                      >
                        Excluir
                      </button>
                    </>
                  )}
                  {c.is_template && (
                    <span className="text-xs px-2.5 py-1" style={{ color: 'var(--text-disabled)' }}>
                      só leitura
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Builder modal */}
      {showBuilder && (
        <CadenceBuilder
          cadence={editing}
          onSave={handleSaved}
          onClose={() => { setShowBuilder(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
