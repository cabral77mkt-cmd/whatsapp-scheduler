import { useState, useEffect } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useEntity } from '../../contexts/EntityContext';

const COLORS = ['#EF4444','#F97316','#EAB308','#84CC16','#10B981','#06B6D4','#3B82F6','#8B5CF6','#EC4899','#6B7280','#14B8A6','#22C55E'];
const ICONS  = ['📂','🍔','🚗','🏠','💡','📦','📢','💼','💵','🔄','➕','📌','🎓','🏥','✈️','🎮','👗','🛒'];

const EMPTY = { name: '', type: 'expense', color: '#6B7280', icon: '📂' };

export default function Categorias() {
  const { entity } = useEntity();
  const [cats, setCats]     = useState([]);
  const [modal, setModal]   = useState(null);
  const [form, setForm]     = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const r = await api.get('/finance/categories');
    setCats(Array.isArray(r) ? r : []);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(EMPTY); setModal('create'); };
  const openEdit   = (c)  => { setForm({ name: c.name, type: c.type, color: c.color, icon: c.icon }); setModal(c); };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Nome é obrigatório');
    setSaving(true);
    try {
      if (modal === 'create') {
        await api.post('/finance/categories', form);
        toast.success('Categoria criada!');
      } else {
        await api.put(`/finance/categories/${modal.id}`, form);
        toast.success('Atualizada!');
      }
      setModal(null);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro'); }
    finally { setSaving(false); }
  };

  const remove = async (c) => {
    if (!window.confirm(`Excluir "${c.name}"? As transações vinculadas ficam sem categoria.`)) return;
    try {
      await api.delete(`/finance/categories/${c.id}`);
      toast.success('Excluída');
      load();
    } catch { toast.error('Erro'); }
  };

  const income  = cats.filter((c) => c.type !== 'expense');
  const expense = cats.filter((c) => c.type !== 'income');

  const CatList = ({ list, label }) => (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3">{label}</h2>
      {list.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhuma categoria.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {list.map((c) => (
            <div key={c.id} className="bg-gray-800 rounded-xl p-3 border border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-lg"
                  style={{ backgroundColor: c.color + '33', border: `1.5px solid ${c.color}` }}
                >{c.icon}</span>
                <div>
                  <p className="text-white text-sm font-medium">{c.name}</p>
                  <p className="text-gray-500 text-xs">{c.type === 'income' ? 'Entrada' : c.type === 'expense' ? 'Saída' : 'Ambos'}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(c)} className="text-blue-400 hover:text-blue-300 p-1 text-sm">✏️</button>
                <button onClick={() => remove(c)} className="text-red-400 hover:text-red-300 p-1 text-sm">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between items-start">
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
          <h1 className="text-2xl font-bold text-white">Categorias</h1>
        </div>
        <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Nova Categoria
        </button>
      </div>

      <CatList list={expense} label="Categorias de Saída" />
      <CatList list={income}  label="Categorias de Entrada" />

      {modal !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-5">
              {modal === 'create' ? 'Nova Categoria' : `Editar: ${modal.name}`}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-gray-300 text-sm block mb-1">Nome *</label>
                <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
                  placeholder="Ex: Alimentação, Salário..."
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 text-sm" />
              </div>
              <div>
                <label className="text-gray-300 text-sm block mb-1">Tipo</label>
                <div className="flex gap-2">
                  {[{v:'income',l:'Entrada'},{v:'expense',l:'Saída'},{v:'both',l:'Ambos'}].map((opt) => (
                    <button key={opt.v} onClick={() => setForm({...form, type: opt.v})}
                      className={`flex-1 py-1.5 rounded-lg text-sm border ${form.type === opt.v ? 'bg-blue-700 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}>
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-gray-300 text-sm block mb-1">Ícone</label>
                <div className="flex flex-wrap gap-2">
                  {ICONS.map((ic) => (
                    <button key={ic} onClick={() => setForm({...form, icon: ic})}
                      className={`text-xl p-1.5 rounded-lg border ${form.icon === ic ? 'border-blue-500 bg-blue-900/30' : 'border-gray-600 bg-gray-700'}`}>
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-gray-300 text-sm block mb-1">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => setForm({...form, color: c})}
                      className={`w-7 h-7 rounded-full border-2 ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(null)} className="flex-1 bg-gray-700 text-white py-2 rounded-lg text-sm">Cancelar</button>
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
