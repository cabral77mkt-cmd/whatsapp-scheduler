import React, { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function ProposalForm({ leadId, onClose, onSaved }) {
  const [form, setForm] = useState({
    amount: '', service: '', payment_terms: '', file_url: '',
    expected_response_at: '', notes: '',
    mark_as_sent: true, schedule_followups: true
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/crm/proposals', {
        lead_id: leadId,
        amount: form.amount ? Number(form.amount) : null,
        service: form.service || null,
        payment_terms: form.payment_terms || null,
        file_url: form.file_url || null,
        expected_response_at: form.expected_response_at || null,
        notes: form.notes || null,
        sent_at: form.mark_as_sent ? new Date().toISOString() : null,
        schedule_followups: form.schedule_followups
      });
      toast.success('Proposta criada');
      onSaved();
    } catch (err) {
      toast.error(err.message || 'Erro');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-orange-500/40 rounded-xl max-w-md w-full p-6 max-h-[90dvh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-4">Nova proposta</h2>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor (R$)</label>
              <input type="number" step="0.01" className="input w-full" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
            </div>
            <div>
              <label className="label">Resposta prevista</label>
              <input type="date" className="input w-full" value={form.expected_response_at} onChange={e => setForm({...form, expected_response_at: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="label">Serviço oferecido</label>
            <input className="input w-full" value={form.service} onChange={e => setForm({...form, service: e.target.value})} placeholder="Campanha de tráfego + criativos" />
          </div>
          <div>
            <label className="label">Condições de pagamento</label>
            <input className="input w-full" value={form.payment_terms} onChange={e => setForm({...form, payment_terms: e.target.value})} placeholder="50% início, 50% pós-evento" />
          </div>
          <div>
            <label className="label">Link/arquivo da proposta</label>
            <input className="input w-full" value={form.file_url} onChange={e => setForm({...form, file_url: e.target.value})} placeholder="https://..." />
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea rows="2" className="input w-full" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={form.mark_as_sent} onChange={e => setForm({...form, mark_as_sent: e.target.checked})} />
            Marcar como enviada agora
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={form.schedule_followups} onChange={e => setForm({...form, schedule_followups: e.target.checked})} disabled={!form.mark_as_sent} />
            Agendar follow-ups automáticos (24h, 3d, 5d)
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">{saving ? 'Salvando...' : 'Criar proposta'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
