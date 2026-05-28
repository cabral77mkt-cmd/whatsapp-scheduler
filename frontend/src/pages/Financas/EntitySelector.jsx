import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useEntity } from '../../contexts/EntityContext';
import { useAuth } from '../../contexts/AuthContext';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function EntitySelector() {
  const [entities, setEntities] = useState([]);
  const [loading, setLoading]   = useState(true);
  const { selectEntity }        = useEntity();
  const { username, logout }    = useAuth();
  const navigate                = useNavigate();

  useEffect(() => {
    api.get('/finance/entities')
      .then((ents) => setEntities(Array.isArray(ents) ? ents : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const choose = (ent) => {
    selectEntity(ent);
    navigate('/fin/dashboard');
  };

  const handleLogout = () => {
    logout();
    navigate('/fin');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-blue-950/20 to-gray-950 flex flex-col">

      {/* Topo */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-blue-900/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-lg shadow-lg shadow-blue-900/40">
            💰
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Finanças WhatsApp</p>
            <p className="text-blue-400 text-xs">Gestão Financeira</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm hidden sm:block">{username}</span>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-red-400 text-sm transition-colors"
          >
            Sair
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-2xl">

          {/* Título */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600/20 border border-blue-700/40 rounded-2xl text-3xl mb-4">
              🏢
            </div>
            <h1 className="text-2xl font-bold text-white">Selecionar Empresa</h1>
            <p className="text-gray-400 text-sm mt-1">Escolha qual empresa deseja acessar</p>
          </div>

          {/* Cards */}
          {loading ? (
            <div className="text-center text-gray-400 py-12">
              <span className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p>Carregando empresas...</p>
            </div>
          ) : entities.length === 0 ? (
            <div className="text-center py-12 bg-gray-800/50 rounded-2xl border border-gray-700">
              <p className="text-gray-400 text-lg mb-2">Nenhuma empresa cadastrada</p>
              <p className="text-gray-600 text-sm">Acesse o sistema completo para criar entidades primeiro.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {entities.map((ent) => (
                <button
                  key={ent.id}
                  onClick={() => choose(ent)}
                  className="bg-gray-800/80 hover:bg-gray-800 border border-gray-700 hover:border-blue-500/50 rounded-2xl p-5 text-left transition-all group shadow-lg hover:shadow-blue-900/20 hover:scale-[1.02] active:scale-[0.99]"
                >
                  {/* Header do card */}
                  <div className="flex items-center gap-4 mb-4">
                    <span
                      className="text-3xl w-14 h-14 flex items-center justify-center rounded-xl flex-shrink-0"
                      style={{ backgroundColor: ent.color + '33', border: `2px solid ${ent.color}` }}
                    >
                      {ent.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-white text-lg truncate leading-tight">{ent.name}</p>
                      {ent.description && (
                        <p className="text-gray-400 text-sm truncate mt-0.5">{ent.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Saldo */}
                  <div className="bg-gray-700/40 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Saldo total</p>
                      <p className={`font-bold text-xl ${ent.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fmt(ent.balance)}
                      </p>
                    </div>
                    <div className="text-right space-y-0.5">
                      <p className="text-xs text-green-500">↑ {fmt(ent.total_income)}</p>
                      <p className="text-xs text-red-500">↓ {fmt(ent.total_expense)}</p>
                    </div>
                  </div>

                  {/* Botão acessar */}
                  <div className="mt-3 flex items-center justify-between">
                    {ent.wa_group_id ? (
                      <span className="text-xs text-green-500">📱 WA vinculado</span>
                    ) : (
                      <span className="text-xs text-gray-600">Sem grupo WA</span>
                    )}
                    <span className="text-blue-400 text-sm group-hover:text-blue-300 font-medium transition-colors">
                      Entrar →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
