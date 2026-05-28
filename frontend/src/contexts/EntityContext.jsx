import { createContext, useContext, useState } from 'react';

const EntityContext = createContext(null);

export function EntityProvider({ children }) {
  const [entity, setEntityState] = useState(() => {
    try {
      const saved = localStorage.getItem('wa_fin_entity');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const selectEntity = (ent) => {
    localStorage.setItem('wa_fin_entity', JSON.stringify(ent));
    setEntityState(ent);
  };

  const clearEntity = () => {
    localStorage.removeItem('wa_fin_entity');
    setEntityState(null);
  };

  return (
    <EntityContext.Provider value={{ entity, selectEntity, clearEntity }}>
      {children}
    </EntityContext.Provider>
  );
}

export function useEntity() {
  return useContext(EntityContext);
}
