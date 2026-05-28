import { useState, useEffect } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useEntity } from '../../contexts/EntityContext';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const pctColor = (p) => {
  if (p >= 100) return 'bg-red-500';
  if (p >= 80)  return 'bg-yellow-400';
  return 'bg-green-500';
};

const pctTextColor = (p) => {
  if (p >= 100) return 'text-red-400';
  if (p >= 80)  return 'text-yellow-400';
  return 'text-green-400';
};

export default function Orcamentos() {
  const { entity } = useEntity();

  const [budgets, setBudgets]       = useState([]);
  const [categories, setCategories] = useState([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear]   = useState(new Date().getFullYear());
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState({ category_id: '', amount: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!entity) return;
    try {
      const params = new URLSearchParams({ month, year, entity_id: entity.id });
      const r = await api.get(`/finance/budgets?${params}`);
      setBudgets(Array.isArray(r) ? r : []);
    } catch { toast.error('Erro ao carregar orçamentos'); }
  };

  const loadMeta = async () => {
    const cats = await api.get('/finance/categories');
    setCategories(Array.isArray(cats) ? cats.filter((c) => c.type !== 'income') : []);
  };

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { load(); }, [month, year, entity]);

  const save = async () => {
    if (!form.category_id) return toast.error('Selecione uma categoria');
    if (!form.amount || isNaN(Number(form.amount))) return toast.error('Valor inválido');
    setSaving(true);
    try {
      await api.post('/finance/budgets', { ...form, month, year, entity_id: entity?.id || null });
      toast.success('Orçamento salvo!');
      setModal(false);
      setForm({ category_id: '', amount: '' });
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro'); }
    finally { setSaving(false); }
  };

  const remove = async (b) => {
    if (!window.confirm('Remover orçamento?')) return;
    try {
      await api.delete(`/finance/budgets/${b.id}`);
      toast.success('Removido');
      load();
    } catch { toast.error('Erro'); }
  };

  const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header com empresa */}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          {entity && (
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium"
                style={{ backgroundColor: entity.color + '22', color: entity.color, border: `1px solid ${entity.color}44` }}
              >
                {entity.icon} {entity.name}
              </span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">Orçamentos</h1>
        </div>
        <button onClick={() => setModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Definir Orçamento
        </button>
      </div>

      {/* Navegação de período */}
      <div className="flex items-center gap-2 bg-gray-800 rounded-lg border border-gray-700 px-3 py-2 w-fit">
        <button onClick={() => { let m = month - 1, y = year; if (m < 1) { m = 12; y--; } setMonth(m); setYear(y); }}
          className="text-gray-400 hover:text-white px-1">‹</button>
        <span className="text-white font-medium min-w-[90px] text-center">{monthNames[month - 1]}/{year}</span>
        <button onClick={() => { let m = month + 1, y = year; if (m > 12) { m = 1; y++; } setMonth(m); setYear(y); }}
          className="text-gray-400 hover:text-white px-1">›</button>
      </div>

      {budgets.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-2">🎯</p>
          <p>Nenhum orçamento para {monthNames[month - 1]}/{year}.</p>
          <p className="text-sm mt-1">Defina limites para receber alertas quando aproximar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map((b) => (
            <div key={b.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-lg"
                    style={{ backgroundColor: (b.category_color || '#6B7280') + '33' }}
                  >{b.category_icon}</span>
                  <p className="text-white font-medium text-sm">{b.category_name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-bold text-sm ${pctTextColor(b.percent)}`}>{b.percent}%</span>
                  <button onClick={() => remove(b)} className="text-red-400 hover:text-red-300 p-1">🗑️</button>
                </div>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${pctColor(b.percent)}`}
                  style={{ width: `${Math.min(b.percent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                <span>Gasto: {fmt(b.spent)}</span>
                <span>Limite: {fmt(b.amount)}</span>
              </div>
              {b.percent >= 100 && (
                <p className="text-red-400 text-xs mt-1">🔴 Limite atingido! Excesso: {fmt(b.spent - b.amount)}</p>
              )}
              {b.percent >= 80 && b.percent < 100 && (
                <p className="text-yellow-400 text-xs mt-1">⚠️ Atenção: {100 - b.percent}% restante</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-1">Definir Orçamento</h2>
            {entity && (
              <p className="text-sm mb-1" style={{ color: entity.color }}>{entity.icon} {entity.name}</p>
            )}
            <p className="text-gray-400 text-sm mb-5">{monthNames[month - 1]}/{year}</p>
            <div className="space-y-4">
              <div>
                <label className="text-gray-300 text-sm block mb-1">Categoria de Saída *</label>
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 text-sm">
                  <option value="">Selecione...</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-300 text-sm block mb-1">Limite (R$) *</label>
                <input type="number" step="0.01" min="0" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="Ex: 800,00"
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 text-sm" />
              </div>
              <p className="text-gray-500 text-xs">
                Alertas são enviados via WhatsApp no grupo da entidade quando atingir 80% e 100% do limite.
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(false)} className="flex-1 bg-gray-700 text-white py-2 rounded-lg text-sm">Cancelar</button>
              <button onClick={save} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
