import React, { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
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
      login({ token: data.token, username: data.username, userId: data.userId, isAdmin: data.isAdmin, role: data.role });
      toast.success(`Bem-vindo, ${data.username}!`);
      // O LoginGuard em App.jsx redireciona automaticamente quando isAuthenticated vira true
    } catch (err) {
      toast.error(err.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-canvas)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl text-3xl mb-4 font-bold"
            style={{ background: 'var(--gold-500)', color: '#000' }}
          >
            W
          </div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
            WA Scheduler
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Faça login para continuar</p>
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

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-disabled)' }}>
          Usuário padrão:{' '}
          <span style={{ color: 'var(--text-secondary)' }}>admin</span> / Senha:{' '}
          <span style={{ color: 'var(--text-secondary)' }}>admin123</span>
        </p>
      </div>
    </div>
  );
}
