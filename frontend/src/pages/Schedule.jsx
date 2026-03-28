import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { format } from 'date-fns';

// Tipos de destinatário
const DEST_TYPES = [
  { key: 'manual', label: '📱 Número Manual' },
  { key: 'contact', label: '👥 Da Agenda' },
  { key: 'group', label: '💬 Grupo WhatsApp' },
];

export default function Schedule() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loading, setLoading] = useState(false);
  const [destType, setDestType] = useState('manual');

  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  const defaultDate = format(now, "yyyy-MM-dd'T'HH:mm");

  const [form, setForm] = useState({
    phone: '',
    contact_id: '',
    group_id: '',
    message: '',
    scheduled_at: defaultDate,
  });

  useEffect(() => {
    api.get('/contacts').then(setContacts).catch(() => {});
  }, []);

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const data = await api.get('/groups');
      setGroups(data);
    } catch (err) {
      toast.error('Erro ao carregar grupos. Verifique se o WhatsApp está conectado.');
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleDestTypeChange = (type) => {
    setDestType(type);
    setForm((prev) => ({ ...prev, phone: '', contact_id: '', group_id: '' }));
    if (type === 'group' && groups.length === 0) {
      loadGroups();
    }
  };

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleContactSelect = (e) => {
    const id = e.target.value;
    set('contact_id', id);
    if (id) {
      const c = contacts.find((c) => String(c.id) === id);
      if (c) set('phone', c.phone);
    } else {
      set('phone', '');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.message || !form.scheduled_at) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (destType === 'group' && !form.group_id) {
      toast.error('Selecione um grupo');
      return;
    }

    if (destType !== 'group' && !form.phone) {
      toast.error('Informe o número de telefone');
      return;
    }

    setLoading(true);
    try {
      if (destType === 'group') {
        const group = groups.find((g) => g.id === form.group_id);
        await api.post('/messages/schedule', {
          recipient_type: 'group',
          recipient_id: form.group_id,
          group_name: group?.name || form.group_id,
          message: form.message,
          scheduled_at: new Date(form.scheduled_at).toISOString(),
        });
      } else {
        const contact = contacts.find((c) => c.phone === form.phone);
        await api.post('/messages/schedule', {
          recipient_type: 'number',
          phone: form.phone,
          message: form.message,
          scheduled_at: new Date(form.scheduled_at).toISOString(),
          contact_name: contact?.name || null,
        });
      }
      toast.success('Mensagem agendada com sucesso!');
      navigate('/mensagens');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-1">Agendar Mensagem</h2>
      <p className="text-gray-400 text-sm mb-8">Programe uma mensagem para ser enviada automaticamente.</p>

      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Toggle: tipo de destinatário */}
        <div className="flex gap-2">
          {DEST_TYPES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleDestTypeChange(key)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                destType === key
                  ? 'border-whatsapp-green bg-whatsapp-green/10 text-whatsapp-green'
                  : 'border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Destinatário: número manual */}
        {destType === 'manual' && (
          <div>
            <label className="label">Número de Telefone *</label>
            <input
              type="text"
              className="input"
              placeholder="Ex: 5511999998888 (com código do país)"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              required
            />
            <p className="text-xs text-gray-500 mt-1">Formato: código do país + DDD + número (sem espaços ou traços)</p>
          </div>
        )}

        {/* Destinatário: contato da agenda */}
        {destType === 'contact' && (
          <div>
            <label className="label">Contato *</label>
            <select
              className="input"
              value={form.contact_id}
              onChange={handleContactSelect}
              required
            >
              <option value="">Selecione um contato...</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.phone}
                </option>
              ))}
            </select>
            {contacts.length === 0 && (
              <p className="text-xs text-yellow-500 mt-1">
                Nenhum contato cadastrado. <a href="/contatos" className="underline">Adicionar</a>
              </p>
            )}
          </div>
        )}

        {/* Destinatário: grupo WhatsApp */}
        {destType === 'group' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label">Grupo WhatsApp *</label>
              <button
                type="button"
                onClick={loadGroups}
                className="text-xs text-whatsapp-green hover:underline"
              >
                🔄 Atualizar lista
              </button>
            </div>
            {loadingGroups ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <span className="w-4 h-4 border-2 border-whatsapp-green border-t-transparent rounded-full animate-spin" />
                Carregando grupos...
              </div>
            ) : (
              <select
                className="input"
                value={form.group_id}
                onChange={(e) => set('group_id', e.target.value)}
                required
              >
                <option value="">Selecione um grupo...</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} {g.size ? `(${g.size} membros)` : ''}
                  </option>
                ))}
              </select>
            )}
            {!loadingGroups && groups.length === 0 && (
              <p className="text-xs text-yellow-500 mt-1">
                Nenhum grupo encontrado. Verifique se o WhatsApp está conectado.
              </p>
            )}
          </div>
        )}

        {/* Mensagem */}
        <div>
          <label className="label">Mensagem *</label>
          <textarea
            className="input resize-none"
            rows={5}
            placeholder="Digite a mensagem que será enviada..."
            value={form.message}
            onChange={(e) => set('message', e.target.value)}
            required
          />
          <p className="text-xs text-gray-500 mt-1">{form.message.length} caracteres</p>
        </div>

        {/* Data/Hora */}
        <div>
          <label className="label">Data e Hora do Envio *</label>
          <input
            type="datetime-local"
            className="input"
            value={form.scheduled_at}
            onChange={(e) => set('scheduled_at', e.target.value)}
            required
          />
        </div>

        {/* Submit */}
        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Agendando...
            </>
          ) : (
            <>⏰ Agendar Mensagem</>
          )}
        </button>
      </form>
    </div>
  );
}
