import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('wa_token'));
  const [username, setUsername] = useState(() => localStorage.getItem('wa_username'));

  const login = useCallback((newToken, newUsername) => {
    localStorage.setItem('wa_token', newToken);
    localStorage.setItem('wa_username', newUsername);
    setToken(newToken);
    setUsername(newUsername);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('wa_token');
    localStorage.removeItem('wa_username');
    setToken(null);
    setUsername(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, username, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
