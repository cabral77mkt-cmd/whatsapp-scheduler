import React, { useState } from 'react';

export default function CloseLeadModal({ leadName, onConfirm, onCancel }) {
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!value || isNaN(Number(value)) || Number(value) <= 0) return;
    setSaving(true);
    await onConfirm({ value: Number(value), notes });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-emerald-700/40 rounded-xl max-w-sm w-full p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-2xl">
            🎉
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Negócio Fechado!</h2>
            <p className="text-xs text-gray-400 truncate max-w-[200px]">{leadName}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Valor fechado (R$) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input w-full text-lg font-semibold text-emerald-400"
              placeholder="0,00"
              value={value}
              onChange={e => setValue(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            />
          </div>

          <div>
            <label className="label">Observações (opcional)</label>
            <textarea
              rows="2"
              className="input w-full text-sm"
              placeholder="Detalhes do fechamento, próximos passos..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            className="btn btn-ghost flex-1 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !value || Number(value) <= 0}
            className="btn flex-1 text-sm bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
          >
            {saving ? 'Salvando...' : '✅ Confirmar fechamento'}
          </button>
        </div>
      </div>
    </div>
  );
}
