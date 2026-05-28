import React, { useState } from 'react';
import { LOSS_REASONS } from './stages';

export default function LossReasonModal({ onConfirm, onCancel }) {
  const [reason, setReason] = useState(LOSS_REASONS[0]);
  const [detail, setDetail] = useState('');

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-red-500/40 rounded-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-white mb-1">Motivo da perda</h2>
        <p className="text-sm text-gray-400 mb-4">Vai ajudar nos relatórios futuros.</p>
        <div className="space-y-2 mb-3">
          {LOSS_REASONS.map(r => (
            <label key={r} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-800">
              <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
              <span className="text-sm text-gray-200">{r}</span>
            </label>
          ))}
        </div>
        <textarea
          rows="3"
          className="input w-full"
          placeholder="Detalhes adicionais (opcional)"
          value={detail}
          onChange={e => setDetail(e.target.value)}
        />
        <div className="flex gap-2 pt-4">
          <button onClick={onCancel} className="btn btn-ghost flex-1">Cancelar</button>
          <button onClick={() => onConfirm({ reason, detail })} className="btn btn-danger flex-1">Confirmar perda</button>
        </div>
      </div>
    </div>
  );
}
