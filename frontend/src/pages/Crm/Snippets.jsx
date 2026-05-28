import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';

const CATEGORIES = ['geral', 'abertura', 'proposta', 'followup', 'reunião', 'fechamento', 'reativação', 'urgência'];

function SnippetModal({ open, onClose, snippet, onSaved }) {
  const isEdit = !!snippet;
  const [shortcut, setShortcut] = useState('');
  const [body,     setBody]     = useState('');
  const [category, setCategory] = useState('geral');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (open) {
      setShortcut(snippet?.shortcut || '');
      setBody(snippet?.body || '');
      setCategory(snippet?.category || 'geral');
      setError('');
    }
  }, [open, snippet]);

  const handleSave = async () => {
    if (!shortcut.trim() || !body.trim()) {
      setError('Atalho e corpo são obrigatórios');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await api.put(`/snippets/${snippet.id}`, { shortcut, body, category });
      } else {
        await api.post('/snippets', { shortcut, body, category });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao salvar snippet');
    } finally {
      setSaving(false);
    }
  };

  const VARS = ['{nome}', '{evento}', '{cidade}', '{data}', '{telefone}'];

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar Snippet' : 'Novo Snippet'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Atalho (ex: proposta)
            </label>
            <div className="relative">
              <span
                className="absolute left-2 top-1/2 -translate-y-1/2 font-mono font-bold text-sm"
                style={{ color: 'var(--gold-400)' }}
              >
                /
              </span>
              <Input
                value={shortcut}
                onChange={e => setShortcut(e.target.value.replace(/\s/g, '').toLowerCase())}
                placeholder="atalho"
                style={{ paddingLeft: 20 }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Categoria
            </label>
            <select
              className="input w-full"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Corpo da mensagem
            </label>
            <div className="flex gap-1">
              {VARS.map(v => (
                <button
                  key={v}
                  className="text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors"
                  style={{ background: 'var(--bg-surface-2)', color: 'var(--gold-400)' }}
                  onClick={() => setBody(prev => prev + v)}
                  title={`Inserir variável ${v}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="input w-full resize-y"
            rows={5}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Oi, {nome}! Como posso te ajudar?"
          />
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Variáveis disponíveis: {VARS.join(', ')}
          </p>
        </div>

        {error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button className="btn-ghost text-sm" onClick={onClose}>Cancelar</button>
          <button className="btn-primary text-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar Snippet'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function Snippets() {
  const [snippets, setSnippets]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [modal,    setModal]      = useState({ open: false, snippet: null });
  const [search,   setSearch]     = useState('');
  const [catFilter,setCatFilter]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setSnippets(await api.get('/snippets')); }
    catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!confirm('Apagar este snippet?')) return;
    await api.delete(`/snippets/${id}`);
    setSnippets(prev => prev.filter(s => s.id !== id));
  };

  const filtered = snippets.filter(s => {
    const matchSearch = !search || s.shortcut.includes(search.toLowerCase()) || s.body.toLowerCase().includes(search.toLowerCase());
    const matchCat    = !catFilter || s.category === catFilter;
    return matchSearch && matchCat;
  });

  const categories = [...new Set(snippets.map(s => s.category))].sort();
  const topSnippets = [...snippets].sort((a, b) => b.uses_count - a.uses_count).slice(0, 3);

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold font-display" style={{ color: 'var(--text-primary)' }}>
            📝 Snippets de Mensagem
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Atalhos rápidos com "/" em qualquer campo de mensagem
          </p>
        </div>
        <button className="btn-primary text-sm" onClick={() => setModal({ open: true, snippet: null })}>
          + Novo Snippet
        </button>
      </div>

      {/* Top snippets */}
      {topSnippets.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-muted)' }}>
            🔥 Mais usados
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topSnippets.map(s => (
              <div
                key={s.id}
                className="p-3 rounded-xl"
                style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--gold-500)22', color: 'var(--gold-400)' }}
                  >
                    /{s.shortcut}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {s.uses_count}× usado
                  </span>
                </div>
                <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                  {s.body.slice(0, 70)}…
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          className="input text-sm"
          placeholder="🔍 Buscar…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 200 }}
        />
        <div className="flex flex-wrap gap-1">
          <button
            className="text-xs px-2.5 py-1 rounded-full transition-colors"
            style={{
              background: !catFilter ? 'var(--gold-500)' : 'var(--bg-surface)',
              color:      !catFilter ? '#000'            : 'var(--text-secondary)',
              border:     `1px solid ${!catFilter ? 'var(--gold-500)' : 'var(--border-default)'}`,
            }}
            onClick={() => setCatFilter('')}
          >
            Todos
          </button>
          {categories.map(c => (
            <button
              key={c}
              className="text-xs px-2.5 py-1 rounded-full transition-colors capitalize"
              style={{
                background: catFilter === c ? 'var(--gold-500)' : 'var(--bg-surface)',
                color:      catFilter === c ? '#000'            : 'var(--text-secondary)',
                border:     `1px solid ${catFilter === c ? 'var(--gold-500)' : 'var(--border-default)'}`,
              }}
              onClick={() => setCatFilter(catFilter === c ? '' : c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Snippet list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface-2)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <span className="text-4xl">📝</span>
          <p className="mt-3 font-semibold" style={{ color: 'var(--text-primary)' }}>Nenhum snippet encontrado</p>
          <button className="btn-primary mt-4 text-sm" onClick={() => setModal({ open: true, snippet: null })}>
            Criar primeiro snippet
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <div
              key={s.id}
              className="card flex items-start gap-4"
              style={{ padding: '12px 16px' }}
            >
              <span
                className="text-sm font-mono font-bold px-2 py-1 rounded-lg shrink-0"
                style={{ background: 'var(--gold-500)22', color: 'var(--gold-400)', marginTop: 2 }}
              >
                /{s.shortcut}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  {s.body}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full capitalize"
                    style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}
                  >
                    {s.category}
                  </span>
                  {s.uses_count > 0 && (
                    <span className="text-[10px]" style={{ color: 'var(--text-disabled)' }}>
                      {s.uses_count}× usado
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                  style={{ color: 'var(--text-muted)', background: 'var(--bg-surface-2)' }}
                  onClick={() => setModal({ open: true, snippet: s })}
                >
                  Editar
                </button>
                <button
                  className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                  style={{ color: 'var(--danger)', background: 'var(--danger)15' }}
                  onClick={() => handleDelete(s.id)}
                >
                  Apagar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SnippetModal
        open={modal.open}
        onClose={() => setModal({ open: false, snippet: null })}
        snippet={modal.snippet}
        onSaved={load}
      />
    </div>
  );
}
