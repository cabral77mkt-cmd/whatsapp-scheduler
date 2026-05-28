import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api';

const ROLES = [
  { value: 'seller',  label: 'Vendedor',  desc: 'Acessa apenas os próprios leads' },
  { value: 'manager', label: 'Gerente',   desc: 'Vê todo o pipeline, sem acesso admin' },
  { value: 'admin',   label: 'Admin',     desc: 'Acesso completo' },
];

function RoleBadge({ role }) {
  const map = { admin: { bg: '#D4AF3722', color: '#D4AF37' }, manager: { bg: '#818cf822', color: '#818cf8' }, seller: { bg: '#10b98122', color: '#10b981' } };
  const style = map[role] || map.seller;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold capitalize"
      style={{ background: style.bg, color: style.color }}>{role || 'seller'}</span>
  );
}

function ModalUsuario({ user, onClose, onSave }) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    username: user?.username || '',
    display_name: user?.display_name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'seller',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!isEdit && !form.username.trim()) { toast.error('Login é obrigatório'); return; }
    if (!isEdit && form.password.length < 6) { toast.error('Senha deve ter no mínimo 6 caracteres'); return; }
    if (isEdit && form.password && form.password.length < 6) { toast.error('Nova senha deve ter no mínimo 6 caracteres'); return; }

    setLoading(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-white">{isEdit ? `Editar: ${user.username}` : 'Novo Usuário'}</h3>

        {!isEdit && (
          <div>
            <label className="label">Login <span className="text-red-400">*</span></label>
            <input className="input" placeholder="Ex: operador1" value={form.username}
              onChange={e => set('username', e.target.value)} autoFocus />
          </div>
        )}

        <div>
          <label className="label">Nome completo</label>
          <input className="input" placeholder="Ex: João Silva" value={form.display_name}
            onChange={e => set('display_name', e.target.value)} autoFocus={isEdit} />
        </div>

        <div>
          <label className="label">Email <span className="text-gray-500 font-normal">(opcional)</span></label>
          <input className="input" type="email" placeholder="joao@empresa.com" value={form.email}
            onChange={e => set('email', e.target.value)} />
        </div>

        <div>
          <label className="label">
            {isEdit ? 'Nova senha' : 'Senha'} {isEdit && <span className="text-gray-500 font-normal">(deixe em branco para não alterar)</span>}
            {!isEdit && <span className="text-red-400"> *</span>}
          </label>
          <div className="relative">
            <input className="input pr-10" type={showPassword ? 'text' : 'password'}
              placeholder={isEdit ? 'Nova senha (mín. 6 caracteres)' : 'Mínimo 6 caracteres'}
              value={form.password} onChange={e => set('password', e.target.value)} />
            <button type="button" onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors">
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="label">Perfil de acesso</label>
          <select className="input w-full" value={form.role} onChange={e => set('role', e.target.value)}>
            {ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={loading} className="btn-primary text-sm">
            {loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Usuário'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUsers = () => {
    api.get('/admin/users').then(setUsers).catch(() => toast.error('Erro ao carregar usuários')).finally(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  const handleCreate = async (form) => {
    try {
      await api.post('/admin/users', form);
      toast.success('Usuário criado!');
      loadUsers();
    } catch (err) {
      toast.error(err.message || 'Erro ao criar usuário');
      throw err;
    }
  };

  const handleEdit = async (form) => {
    try {
      const payload = { display_name: form.display_name, email: form.email, role: form.role };
      if (form.password) payload.password = form.password;
      await api.put(`/admin/users/${editUser.id}`, payload);
      toast.success('Usuário atualizado!');
      loadUsers();
    } catch (err) {
      toast.error(err.message || 'Erro ao atualizar usuário');
      throw err;
    }
  };

  const handleDelete = async (user) => {
    if (!confirm(`Remover o usuário "${user.username}"? Todos os dados dele serão mantidos no banco mas ele não conseguirá mais fazer login.`)) return;
    try {
      await api.delete(`/admin/users/${user.id}`);
      toast.success('Usuário removido');
      loadUsers();
    } catch (err) {
      toast.error(err.message || 'Erro ao remover usuário');
    }
  };

  return (
    <>
      {showModal && (
        <ModalUsuario
          user={null}
          onClose={() => setShowModal(false)}
          onSave={handleCreate}
        />
      )}
      {editUser && (
        <ModalUsuario
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={handleEdit}
        />
      )}

      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Gerenciar Usuários</h2>
            <p className="text-gray-400 text-sm mt-1">
              Cada usuário tem seu próprio WhatsApp e dados isolados.
            </p>
          </div>
          <button onClick={() => setShowModal(true)} className="btn-primary text-sm">
            + Novo Usuário
          </button>
        </div>

        {loading ? (
          <div className="card text-center py-12 text-gray-500">
            <div className="w-8 h-8 border-2 border-whatsapp-green border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Carregando...
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="divide-y divide-gray-800">
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 bg-whatsapp-green/20 rounded-full flex items-center justify-center text-sm font-bold text-whatsapp-green shrink-0">
                    {(u.display_name || u.username)?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white truncate">
                        {u.display_name || u.username}
                      </p>
                      <RoleBadge role={u.is_admin ? 'admin' : (u.role || 'seller')} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      @{u.username}{u.email ? ` · ${u.email}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setEditUser(u)}
                      className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-700"
                    >
                      Editar
                    </button>
                    {!u.is_admin && (
                      <button
                        onClick={() => handleDelete(u)}
                        className="text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-gray-700"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card bg-gray-800/50">
          <p className="text-xs text-gray-400 leading-relaxed">
            <span className="font-medium text-gray-300">Como funciona:</span> Cada usuário precisa conectar o próprio WhatsApp em "Conectar WhatsApp". Os dados (contatos, mensagens, lançamentos) são completamente isolados por usuário.
          </p>
        </div>
      </div>
    </>
  );
}
