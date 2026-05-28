import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_BADGE = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  sent: 'bg-green-500/20 text-green-400 border-green-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const STATUS_LABEL = { pending: '⏰ Pendente', sent: '✅ Enviada', failed: '❌ Falhou' };

function formatDate(d) {
  if (!d) return '—';
  try {
    return format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return d;
  }
}

export default function Messages() {
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/messages' + (filter ? `?status=${filter}` : ''));
      setMessages(data.messages);
      setTotal(data.total);
    } catch (err) {
      toast.error('Erro ao carregar mensagens');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleSendNow = async (id) => {
    if (!confirm('Enviar esta mensagem agora?')) return;
    setSending(id);
    try {
      await api.post(`/messages/${id}/send-now`);
      toast.success('Mensagem enviada!');
      load();
    } catch (err) {
      toast.error(err.message || 'Erro ao enviar');
    } finally {
      setSending(null);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Cancelar este agendamento?')) return;
    try {
      await api.delete(`/messages/${id}`);
      toast.success('Agendamento cancelado');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Mensagens</h2>
          <p className="text-gray-400 text-sm mt-1">{total} mensagem(s) no total</p>
        </div>
        <button onClick={load} className="btn-ghost text-xs">🔄 Atualizar</button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {['', 'pending', 'sent', 'failed'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-all min-h-[44px] ${
              filter === s
                ? 'border-whatsapp-green bg-whatsapp-green/10 text-whatsapp-green'
                : 'border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            {s === '' ? 'Todas' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-whatsapp-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-medium">Nenhuma mensagem encontrada</p>
            <p className="text-sm mt-1">Agende uma mensagem para começar</p>
          </div>
        ) : (
          <>
            {/* ── Mobile: cards ── */}
            <div className="md:hidden divide-y divide-gray-800">
              {messages.map((msg) => (
                <div key={msg.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      {msg.recipient_type === 'group' ? (
                        <div className="flex items-center gap-1 flex-wrap mb-0.5">
                          <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-medium">Grupo</span>
                          <p className="font-medium text-white text-sm truncate">{msg.contact_name || msg.recipient_id}</p>
                        </div>
                      ) : (
                        <p className="font-medium text-white text-sm truncate">
                          {msg.contact_name || msg.phone || msg.recipient_id}
                        </p>
                      )}
                      <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{msg.message}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${STATUS_BADGE[msg.status]}`}>
                      {STATUS_LABEL[msg.status]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-gray-500 text-xs">{formatDate(msg.scheduled_at)}</p>
                    {msg.status === 'pending' && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleSendNow(msg.id)}
                          disabled={sending === msg.id}
                          className="text-xs text-whatsapp-green hover:text-green-300 transition-colors disabled:opacity-50 min-h-[44px] px-3 flex items-center"
                        >
                          {sending === msg.id ? 'Enviando...' : '▶ Enviar'}
                        </button>
                        <button
                          onClick={() => handleDelete(msg.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors min-h-[44px] px-3 flex items-center"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                    {msg.error_msg && (
                      <p className="text-xs text-red-400 truncate max-w-[180px]" title={msg.error_msg}>{msg.error_msg}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Desktop: tabela ── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-800/50">
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Destinatário</th>
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Mensagem</th>
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Agendado</th>
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {messages.map((msg) => (
                    <tr key={msg.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-5 py-3">
                        {msg.recipient_type === 'group' ? (
                          <>
                            <div className="flex items-center gap-1">
                              <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-medium">Grupo</span>
                              <p className="font-medium text-white">{msg.contact_name || msg.recipient_id}</p>
                            </div>
                          </>
                        ) : (
                          <>
                            {msg.contact_name && <p className="font-medium text-white">{msg.contact_name}</p>}
                            <p className="text-gray-400">{msg.phone || msg.recipient_id}</p>
                          </>
                        )}
                      </td>
                      <td className="px-5 py-3 max-w-xs">
                        <p className="text-gray-300 truncate">{msg.message}</p>
                      </td>
                      <td className="px-5 py-3 text-gray-400 whitespace-nowrap">
                        {formatDate(msg.scheduled_at)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${STATUS_BADGE[msg.status]}`}>
                          {STATUS_LABEL[msg.status]}
                        </span>
                        {msg.error_msg && (
                          <p className="text-xs text-red-400 mt-1 truncate max-w-xs" title={msg.error_msg}>{msg.error_msg}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {msg.status === 'pending' && (
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => handleSendNow(msg.id)}
                              disabled={sending === msg.id}
                              className="text-xs text-whatsapp-green hover:text-green-300 transition-colors disabled:opacity-50"
                            >
                              {sending === msg.id ? 'Enviando...' : '▶ Enviar Agora'}
                            </button>
                            <button
                              onClick={() => handleDelete(msg.id)}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
