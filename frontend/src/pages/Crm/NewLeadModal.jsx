import React, { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function NewLeadModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', source: '', temperature: 'morno', potential_value: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.phone.trim()) { toast.error('Telefone obrigatório'); return; }
    setSaving(true);
    try {
      await api.post('/crm/leads', {
        ...form,
        potential_value: form.potential_value ? Number(form.potential_value) : null
      });
      toast.success('Lead criado');
      onCreated();
    } catch (err) {
      toast.error(err.message || 'Erro ao criar lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-white mb-4">Novo Lead</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Nome</label>
            <input className="input w-full" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Telefone *</label>
            <input className="input w-full" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="5511999999999" />
          </div>
          <div>
            <label className="label">Origem</label>
            <input className="input w-full" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="Instagram, indicação..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Temperatura</label>
              <select className="input w-full" value={form.temperature} onChange={e => setForm({ ...form, temperature: e.target.value })}>
                <option value="frio">Frio</option>
                <option value="morno">Morno</option>
                <option value="quente">Quente</option>
              </select>
            </div>
            <div>
              <label className="label">Valor potencial (R$)</label>
              <input type="number" step="0.01" className="input w-full" value={form.potential_value} onChange={e => setForm({ ...form, potential_value: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea className="input w-full" rows="3" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">{saving ? 'Salvando...' : 'Criar Lead'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
