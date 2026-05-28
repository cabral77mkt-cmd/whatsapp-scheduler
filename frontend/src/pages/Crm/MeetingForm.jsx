import React, { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function MeetingForm({ leadId, onClose, onSaved }) {
  const [form, setForm] = useState({
    meeting_at: '', format: 'meet', link: '', notes: '', schedule_reminders: true
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.meeting_at) { toast.error('Data e horário obrigatórios'); return; }
    setSaving(true);
    try {
      await api.post('/crm/meetings', { ...form, lead_id: leadId });
      toast.success('Reunião criada');
      onSaved();
    } catch (err) {
      toast.error(err.message || 'Erro');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-orange-500/40 rounded-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-white mb-4">Agendar reunião</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Data e horário *</label>
            <input type="datetime-local" required className="input w-full" value={form.meeting_at} onChange={e => setForm({...form, meeting_at: e.target.value})} />
          </div>
          <div>
            <label className="label">Formato</label>
            <select className="input w-full" value={form.format} onChange={e => setForm({...form, format: e.target.value})}>
              <option value="whatsapp">WhatsApp</option>
              <option value="call">Ligação</option>
              <option value="meet">Google Meet</option>
              <option value="presencial">Presencial</option>
            </select>
          </div>
          <div>
            <label className="label">Link (se houver)</label>
            <input className="input w-full" value={form.link} onChange={e => setForm({...form, link: e.target.value})} placeholder="https://meet.google.com/..." />
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea rows="3" className="input w-full" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={form.schedule_reminders} onChange={e => setForm({...form, schedule_reminders: e.target.checked})} />
            Agendar lembretes automáticos (08h e 30min antes)
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">{saving ? 'Salvando...' : 'Criar reunião'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
