import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password) {
      toast.error('Preencha usuário e senha');
      return;
    }

    setLoading(true);
    try {
      const data = await api.post('/auth/login', {
        username: form.username.trim(),
        password: form.password,
      });
      login(data.token, data.username);
      toast.success(`Bem-vindo, ${data.username}!`);
      navigate('/');
    } catch (err) {
      toast.error(err.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-whatsapp-green rounded-2xl text-3xl mb-4">
            💬
          </div>
          <h1 className="text-2xl font-bold text-white">WhatsApp Scheduler</h1>
          <p className="text-gray-400 text-sm mt-1">Faça login para continuar</p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">Usuário</label>
            <input
              type="text"
              className="input"
              placeholder="admin"
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label className="label">Senha</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center py-3 mt-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-6">
          Usuário padrão: <span className="text-gray-400">admin</span> / Senha: <span className="text-gray-400">admin123</span>
        </p>
      </div>
    </div>
  );
}
