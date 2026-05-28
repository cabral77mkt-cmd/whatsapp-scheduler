import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

function formatDt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

const STATUS_LABEL = {
  pending: { label: '⏰ Pendente',   color: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
  sent:    { label: '✓ Enviado',     color: 'bg-green-500/20 text-green-300 border-green-500/40' },
  failed:  { label: '✗ Falhou',       color: 'bg-red-500/20 text-red-300 border-red-500/40' },
  canceled:{ label: '— Cancelado',    color: 'bg-gray-700 text-gray-400 border-gray-700' },
  paused:  { label: '⏸ Pausado',      color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
};

export default function Followups() {
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ message: '', scheduled_at: '' });

  const load = async () => {
    try {
      const data = await api.get(`/crm/followups?status=${status}`);
      setItems(data);
    } catch { toast.error('Erro ao carregar'); }
  };
  useEffect(() => { load(); }, [status]);

  const startEdit = (f) => {
    setEditing(f.id);
    setForm({
      message: f.message,
      scheduled_at: new Date(f.scheduled_at).toISOString().slice(0, 16)
    });
  };

  const saveEdit = async () => {
    try {
      await api.put(`/crm/followups/${editing}`, {
        message: form.message,
        scheduled_at: new Date(form.scheduled_at).toISOString()
      });
      toast.success('Atualizado');
      setEditing(null); load();
    } catch (err) { toast.error(err.message); }
  };

  const cancel = async (id) => {
    if (!confirm('Cancelar este follow-up?')) return;
    try { await api.post(`/crm/followups/${id}/cancel`); load(); }
    catch { toast.error('Erro'); }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold text-white mr-auto">📨 Follow-ups</h1>
        <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="pending">Pendentes</option>
          <option value="sent">Enviados</option>
          <option value="failed">Falharam</option>
          <option value="canceled">Cancelados</option>
        </select>
      </div>

      <div className="space-y-2">
        {items.length === 0 && <p className="text-center text-gray-500 py-8">Nenhum follow-up.</p>}
        {items.map(f => {
          const st = STATUS_LABEL[f.status] || STATUS_LABEL.pending;
          return (
            <div key={f.id} className={`card border ${st.color}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-semibold text-white">{f.lead_name || f.lead_phone}</span>
                    <span className="text-xs text-gray-400">{f.lead_phone}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">{f.automation_type}</span>
                  </div>
                  {editing === f.id ? (
                    <div className="space-y-2 mt-2">
                      <textarea rows="3" className="input w-full" value={form.message} onChange={e => setForm({...form, message: e.target.value})} />
                      <input type="datetime-local" className="input" value={form.scheduled_at} onChange={e => setForm({...form, scheduled_at: e.target.value})} />
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className="btn btn-primary text-xs">Salvar</button>
                        <button onClick={() => setEditing(null)} className="btn btn-ghost text-xs">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-200 whitespace-pre-wrap">{f.message}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">{formatDt(f.scheduled_at)}</p>
                  <p className="text-[10px] mt-1">{st.label}</p>
                </div>
              </div>
              {f.status === 'pending' && editing !== f.id && (
                <div className="flex gap-2 mt-2 pt-2 border-t border-gray-700">
                  <button onClick={() => startEdit(f)} className="text-xs text-orange-400 hover:underline">Editar</button>
                  <button onClick={() => cancel(f.id)} className="text-xs text-red-400 hover:underline">Cancelar</button>
                </div>
              )}
              {f.error_msg && <p className="text-red-400 text-[10px] mt-1">{f.error_msg}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
