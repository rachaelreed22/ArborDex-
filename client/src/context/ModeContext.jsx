import { createContext, useContext, useState } from 'react';

const ModeContext = createContext();

export function ModeProvider({ children }) {
  const [mode, setMode] = useState("tag"); // "tag" = public, "dex" = staff

  const toggleMode = () => {
    setMode(prev => (prev === "tag" ? "dex" : "tag"));
  };

  return (
    <ModeContext.Provider value={{ mode, toggleMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  return useContext(ModeContext);
}
