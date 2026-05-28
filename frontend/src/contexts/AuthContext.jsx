import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import socket from '../lib/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('wa_token'));
  const [username, setUsername] = useState(() => localStorage.getItem('wa_username'));
  const [userId, setUserId] = useState(() => {
    const v = localStorage.getItem('wa_user_id');
    return v ? Number(v) : null;
  });
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('wa_is_admin') === '1');
  const [role,    setRole]    = useState(() => localStorage.getItem('wa_role') || 'seller');
  const [mode, setMode] = useState(() => localStorage.getItem('wa_mode') || 'full'); // 'full' | 'finance'

  // Conecta socket automaticamente se já tem token salvo
  useEffect(() => {
    const savedToken = localStorage.getItem('wa_token');
    if (savedToken && !socket.connected) {
      socket.auth = { token: savedToken };
      socket.connect();
    }
  }, []);

  const login = useCallback(({ token: newToken, username: newUsername, userId: newUserId, isAdmin: newIsAdmin, role: newRole, mode: newMode = 'full' }) => {
    localStorage.setItem('wa_token', newToken);
    localStorage.setItem('wa_username', newUsername);
    localStorage.setItem('wa_user_id', String(newUserId));
    localStorage.setItem('wa_is_admin', newIsAdmin ? '1' : '0');
    localStorage.setItem('wa_role', newRole || (newIsAdmin ? 'admin' : 'seller'));
    localStorage.setItem('wa_mode', newMode);
    setToken(newToken);
    setUsername(newUsername);
    setUserId(Number(newUserId));
    setIsAdmin(!!newIsAdmin);
    setRole(newRole || (newIsAdmin ? 'admin' : 'seller'));
    setMode(newMode);
    // Reconecta socket com novo token
    socket.auth = { token: newToken };
    if (socket.connected) socket.disconnect();
    socket.connect();
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('wa_token');
    localStorage.removeItem('wa_username');
    localStorage.removeItem('wa_user_id');
    localStorage.removeItem('wa_is_admin');
    localStorage.removeItem('wa_role');
    localStorage.removeItem('wa_mode');
    setToken(null);
    setUsername(null);
    setUserId(null);
    setIsAdmin(false);
    setRole('seller');
    setMode('full');
    socket.disconnect();
  }, []);

  return (
    <AuthContext.Provider value={{ token, username, userId, isAdmin, role, mode, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
