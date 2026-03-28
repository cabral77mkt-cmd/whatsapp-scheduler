import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api';

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/contacts' + (search ? `?search=${encodeURIComponent(search)}` : ''));
      setContacts(data);
    } catch {
      toast.error('Erro ao carregar contatos');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const openForm = (contact = null) => {
    setEditing(contact);
    setForm(contact ? { name: contact.name, phone: contact.phone } : { name: '', phone: '' });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditing(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) {
      toast.error('Nome e telefone são obrigatórios');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/contacts/${editing.id}`, form);
        toast.success('Contato atualizado!');
      } else {
        await api.post('/contacts', form);
        toast.success('Contato adicionado!');
      }
      closeForm();
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deletar este contato?')) return;
    try {
      await api.delete(`/contacts/${id}`);
      toast.success('Contato removido');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Contatos</h2>
          <p className="text-gray-400 text-sm mt-1">{contacts.length} contato(s)</p>
        </div>
        <button onClick={() => openForm()} className="btn-primary">
          + Novo Contato
        </button>
      </div>

      {/* Busca */}
      <input
        type="text"
        className="input"
        placeholder="Buscar por nome ou número..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Modal de formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-5">
              {editing ? 'Editar Contato' : 'Novo Contato'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Nome *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Nome do contato"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">Telefone *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ex: 5511999998888"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Com código do país (55 para Brasil)</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeForm} className="btn-ghost flex-1 justify-center">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? 'Salvando...' : editing ? 'Salvar' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-whatsapp-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-3">👥</p>
            <p className="font-medium">Nenhum contato encontrado</p>
            <button onClick={() => openForm()} className="btn-primary mt-4 mx-auto">+ Adicionar Contato</button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-800">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-800/30 transition-colors">
                <div className="w-10 h-10 bg-whatsapp-green/20 rounded-full flex items-center justify-center text-whatsapp-green font-bold text-sm shrink-0">
                  {c.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{c.name}</p>
                  <p className="text-sm text-gray-400">{c.phone}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => openForm(c)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Editar</button>
                  <button onClick={() => handleDelete(c.id)} className="text-xs text-red-400 hover:text-red-300 transition-colors">Deletar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
