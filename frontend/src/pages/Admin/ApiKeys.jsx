import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';

const EVENTS = ['lead.created', 'stage.changed', 'proposal.sent', 'followup.due'];

/* ── Webhook Endpoints section ── */
function WebhookEndpoints() {
  const [endpoints, setEndpoints] = useState([]);
  const [open,      setOpen]      = useState(false);
  const [form,      setForm]      = useState({ name: '', url: '', events: EVENTS.join(',') });
  const [newSecret, setNewSecret] = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  const load = useCallback(async () => {
    const data = await api.get('/webhooks/endpoints').catch(() => []);
    setEndpoints(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.url.trim()) { setError('Nome e URL obrigatórios'); return; }
    setSaving(true); setError('');
    try {
      const res = await api.post('/webhooks/endpoints', form);
      setNewSecret(res.secret);
      await load();
      setOpen(false);
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao criar');
    } finally { setSaving(false); }
  };

  const toggleActive = async (ep) => {
    await api.patch(`/webhooks/endpoints/${ep.id}`, { active: !ep.active }).catch(() => {});
    setEndpoints(prev => prev.map(e => e.id === ep.id ? { ...e, active: !ep.active } : e));
  };

  const handleDelete = async (id) => {
    if (!confirm('Remover este endpoint?')) return;
    await api.delete(`/webhooks/endpoints/${id}`).catch(() => {});
    setEndpoints(prev => prev.filter(e => e.id !== id));
  };

  const handleTest = async (id) => {
    await api.post(`/webhooks/endpoints/${id}/test`).catch(() => {});
    alert('Ping enviado! Verifique os logs do seu endpoint.');
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          🔗 Webhooks Outbound
        </h2>
        <button className="btn-primary text-xs" onClick={() => { setOpen(true); setForm({ name: '', url: '', events: EVENTS.join(',') }); }}>
          + Novo Endpoint
        </button>
      </div>

      {newSecret && (
        <div className="rounded-xl p-3" style={{ background: 'var(--gold-500)22', border: '1px solid var(--gold-500)' }}>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--gold-400)' }}>
            ⚠️ Salve este secret agora — não será exibido novamente
          </p>
          <code className="text-xs font-mono break-all" style={{ color: 'var(--text-primary)' }}>{newSecret}</code>
          <button className="btn-ghost text-xs mt-2 block" onClick={() => setNewSecret(null)}>✓ Já salvei</button>
        </div>
      )}

      {endpoints.length === 0 ? (
        <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
          Nenhum webhook configurado
        </p>
      ) : (
        <div className="space-y-2">
          {endpoints.map(ep => (
            <div key={ep.id} className="flex items-start gap-3 p-3 rounded-xl"
              style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{ep.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${ep.active ? 'text-emerald-400' : 'text-red-400'}`}
                    style={{ background: ep.active ? '#10b98122' : '#ef444422' }}>
                    {ep.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <p className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>{ep.url}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(ep.events || '').split(',').map(ev => (
                    <span key={ev} className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                      style={{ background: 'var(--bg-surface)', color: 'var(--gold-400)' }}>{ev.trim()}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button className="btn-ghost text-xs" onClick={() => handleTest(ep.id)}>Testar</button>
                <button className="btn-ghost text-xs" onClick={() => toggleActive(ep)}>
                  {ep.active ? 'Pausar' : 'Ativar'}
                </button>
                <button className="text-xs px-2 py-1 rounded-lg transition-colors"
                  style={{ color: 'var(--danger)', background: 'var(--danger)15' }}
                  onClick={() => handleDelete(ep.id)}>
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Novo Endpoint Webhook">
        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Nome</label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Meu Zapier" />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>URL</label>
            <Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://hooks.zapier.com/..." />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Eventos (separados por vírgula)</label>
            <Input value={form.events} onChange={e => setForm(f => ({ ...f, events: e.target.value }))} />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-disabled)' }}>
              Disponíveis: {EVENTS.join(', ')}
            </p>
          </div>
          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost text-sm" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn-primary text-sm" onClick={handleCreate} disabled={saving}>
              {saving ? 'Criando…' : 'Criar Endpoint'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ── Main page ── */
export default function ApiKeys() {
  const [keys,       setKeys]       = useState([]);
  const [creating,   setCreating]   = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newScopes,  setNewScopes]  = useState('leads:read');
  const [saving,     setSaving]     = useState(false);
  const [revealed,   setRevealed]   = useState(null); // { key, name }
  const [error,      setError]      = useState('');

  const load = useCallback(async () => {
    const data = await api.get('/keys').catch(() => []);
    setKeys(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) { setError('Nome obrigatório'); return; }
    setSaving(true); setError('');
    try {
      const res = await api.post('/keys', { name: newKeyName.trim(), scopes: newScopes });
      setRevealed(res);
      await load();
      setCreating(false);
      setNewKeyName('');
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao criar chave');
    } finally { setSaving(false); }
  };

  const handleRevoke = async (id) => {
    if (!confirm('Revogar esta chave? Esta ação é irreversível.')) return;
    await api.delete(`/keys/${id}`).catch(() => {});
    setKeys(prev => prev.map(k => k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold font-display" style={{ color: 'var(--text-primary)' }}>
          🔑 API & Integrações
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Chaves de API para integrações externas + webhooks outbound (Zapier, Make, etc.)
        </p>
      </div>

      {/* Revealed key banner */}
      {revealed && (
        <div className="card" style={{ border: '1px solid var(--gold-500)' }}>
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--gold-400)' }}>
            ⚠️ Chave criada — copie agora, não será exibida novamente
          </p>
          <div className="flex items-center gap-2 p-3 rounded-lg font-mono text-sm break-all"
            style={{ background: 'var(--bg-surface-2)', color: 'var(--text-primary)' }}>
            {revealed.key}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button className="btn-primary text-xs" onClick={() => { navigator.clipboard.writeText(revealed.key); }}>
              📋 Copiar
            </button>
            <button className="btn-ghost text-xs" onClick={() => setRevealed(null)}>
              ✓ Já copiei
            </button>
          </div>
          <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}>
            <p className="font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Como usar:</p>
            <code className="block">Authorization: Bearer {revealed.key}</code>
            <code className="block mt-1">GET /api/v1/leads</code>
            <code className="block">POST /api/v1/leads</code>
            <code className="block">POST /api/v1/leads/:id/stage</code>
            <code className="block">POST /api/v1/inbound</code>
          </div>
        </div>
      )}

      {/* API Keys */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            🗝️ Chaves de API
          </h2>
          <button className="btn-primary text-xs" onClick={() => setCreating(true)}>
            + Nova Chave
          </button>
        </div>

        {creating && (
          <div className="p-3 rounded-xl space-y-3" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-strong)' }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Nome da chave</label>
                <Input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="ex: Zapier Leads" />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Escopos</label>
                <select className="input w-full text-sm" value={newScopes} onChange={e => setNewScopes(e.target.value)}>
                  <option value="leads:read">leads:read</option>
                  <option value="leads:read,leads:write">leads:read,leads:write</option>
                  <option value="leads:read,leads:write,pipeline:read">Full Access</option>
                </select>
              </div>
            </div>
            {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <div className="flex gap-2">
              <button className="btn-primary text-sm" onClick={handleCreate} disabled={saving}>
                {saving ? 'Criando…' : 'Criar Chave'}
              </button>
              <button className="btn-ghost text-sm" onClick={() => { setCreating(false); setError(''); }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {keys.length === 0 && !creating ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
            Nenhuma chave criada ainda
          </p>
        ) : (
          <div className="space-y-2">
            {keys.map(k => (
              <div key={k.id} className={`flex items-center gap-3 p-3 rounded-xl ${k.revoked_at ? 'opacity-50' : ''}`}
                style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{k.name}</span>
                    {k.revoked_at && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#ef444422', color: 'var(--danger)' }}>
                        Revogada
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs font-mono" style={{ color: 'var(--gold-400)' }}>
                      {k.key_prefix}••••••••
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{k.scopes}</span>
                    {k.last_used_at && (
                      <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>
                        Usado {new Date(k.last_used_at).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>
                {!k.revoked_at && (
                  <button className="text-xs px-2.5 py-1 rounded-lg shrink-0 transition-colors"
                    style={{ color: 'var(--danger)', background: 'var(--danger)15' }}
                    onClick={() => handleRevoke(k.id)}>
                    Revogar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Webhook endpoints */}
      <WebhookEndpoints />

      {/* API Reference */}
      <div className="card">
        <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          📖 Referência da API v1
        </h2>
        <div className="space-y-2 text-xs font-mono">
          {[
            { method: 'GET',  path: '/api/v1/leads',              desc: 'Listar leads (paginado)' },
            { method: 'GET',  path: '/api/v1/leads/:id',          desc: 'Buscar lead por ID' },
            { method: 'POST', path: '/api/v1/leads',              desc: 'Criar lead' },
            { method: 'POST', path: '/api/v1/leads/:id/stage',    desc: 'Mover lead de estágio' },
            { method: 'GET',  path: '/api/v1/pipeline',           desc: 'Contagens por estágio' },
            { method: 'POST', path: '/api/v1/inbound',            desc: 'Receber lead externo (Zapier/Make)' },
          ].map(e => (
            <div key={e.path} className="flex items-center gap-3 p-2 rounded-lg"
              style={{ background: 'var(--bg-surface-2)' }}>
              <span className="w-12 text-center text-[10px] font-bold rounded px-1"
                style={{
                  background: e.method === 'GET' ? '#22d3ee22' : '#a78bfa22',
                  color: e.method === 'GET' ? '#22d3ee' : '#a78bfa',
                }}>
                {e.method}
              </span>
              <span style={{ color: 'var(--text-primary)' }}>{e.path}</span>
              <span className="ml-auto" style={{ color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: '11px' }}>{e.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          Autenticação: <code className="font-mono" style={{ color: 'var(--gold-400)' }}>Authorization: Bearer &lt;sua-chave&gt;</code>
        </p>
      </div>
    </div>
  );
}
