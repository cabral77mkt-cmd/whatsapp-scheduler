import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import socket from '../lib/socket';
import api from '../lib/api';

export default function Connect({ waStatus }) {
  const [qrData, setQrData] = useState(null);
  const [qrImage, setQrImage] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    if (!confirm('Desconectar o WhatsApp atual? Será necessário escanear o QR Code novamente.')) return;
    setDisconnecting(true);
    try {
      await api.post('/disconnect');
    } catch (err) {
      alert('Erro ao desconectar: ' + err.message);
    } finally {
      setDisconnecting(false);
    }
  }

  useEffect(() => {
    // Inicia conexão WhatsApp para este usuário
    api.post('/connect').catch(() => {});

    socket.on('qr', ({ qr }) => {
      // qr pode vir como base64 data URL ou como string raw
      if (qr.startsWith('data:image')) {
        setQrImage(qr);
        setQrData(null);
      } else {
        setQrData(qr);
        setQrImage(null);
      }
    });

    socket.on('status', ({ status }) => {
      if (status === 'connected') {
        setQrData(null);
        setQrImage(null);
      }
    });

    return () => {
      socket.off('qr');
      socket.off('status');
    };
  }, []);

  const isConnected = waStatus === 'connected';
  const isConnecting = waStatus === 'connecting';

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-1">Conectar WhatsApp</h2>
      <p className="text-gray-400 text-sm mb-8">
        Escaneie o QR Code com seu WhatsApp para conectar.
      </p>

      <div className="card flex flex-col items-center gap-6">
        {isConnected ? (
          <div className="text-center py-8">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">✅</span>
            </div>
            <h3 className="text-xl font-semibold text-white">WhatsApp Conectado!</h3>
            <p className="text-gray-400 text-sm mt-2">
              Você já pode agendar e enviar mensagens.
            </p>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="btn-danger mt-4"
            >
              {disconnecting ? 'Desconectando...' : 'Desconectar WhatsApp'}
            </button>
          </div>
        ) : (
          <>
            {/* QR Code Box */}
            <div className="bg-white p-5 rounded-2xl shadow-lg">
              {qrImage ? (
                <img src={qrImage} alt="QR Code WhatsApp" className="w-64 h-64 object-contain" />
              ) : qrData ? (
                <QRCodeSVG value={qrData} size={256} level="M" />
              ) : (
                <div className="w-64 h-64 flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 border-4 border-whatsapp-green border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-500 text-sm text-center">
                    {isConnecting ? 'Gerando QR Code...' : 'Aguardando conexão...'}
                  </p>
                </div>
              )}
            </div>

            {/* Instruções */}
            <div className="w-full space-y-3">
              <h3 className="font-semibold text-white text-center">Como escanear:</h3>
              <ol className="space-y-2 text-sm text-gray-400">
                {[
                  'Abra o WhatsApp no seu celular',
                  'Toque em Menu (⋮) ou Configurações',
                  'Selecione "Dispositivos Conectados"',
                  'Toque em "Conectar um dispositivo"',
                  'Aponte a câmera para o QR Code acima',
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-5 h-5 bg-whatsapp-green/20 text-whatsapp-green rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            {(qrData || qrImage) && (
              <p className="text-xs text-yellow-500 text-center">
                ⚠️ O QR Code expira em 60 segundos. Um novo será gerado automaticamente.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
