import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Connect from './pages/Connect';
import Schedule from './pages/Schedule';
import Messages from './pages/Messages';
import Contacts from './pages/Contacts';
import BulkSend from './pages/BulkSend';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import socket from './lib/socket';

function ProtectedLayout() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [waStatus, setWaStatus] = useState('connecting');
  const [waUser, setWaUser] = useState(null);

  useEffect(() => {
    socket.on('status', ({ status, user }) => {
      setWaStatus(status);
      if (user) setWaUser(user);
      if (status === 'disconnected') setWaUser(null);
    });

    // Tenta via socket primeiro
    socket.emit('requestStatus');

    // Fallback via REST API — garante que o status chegue mesmo se o socket perder o evento
    import('./lib/api').then(({ default: api }) => {
      api.get('/status').then(({ status }) => {
        setWaStatus(status);
      }).catch(() => {});
    });

    return () => socket.off('status');
  }, []);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar waStatus={waStatus} waUser={waUser} />
      <main className="flex-1 overflow-y-auto p-6">
        <Routes>
          <Route path="/" element={<Dashboard waStatus={waStatus} />} />
          <Route path="/conectar" element={<Connect waStatus={waStatus} />} />
          <Route path="/agendar" element={<Schedule />} />
          <Route path="/mensagens" element={<Messages />} />
          <Route path="/contatos" element={<Contacts />} />
          <Route path="/envio-em-massa" element={<BulkSend />} />
        </Routes>
      </main>
    </div>
  );
}

function LoginGuard() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/" replace /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginGuard />} />
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
    </AuthProvider>
  );
}
