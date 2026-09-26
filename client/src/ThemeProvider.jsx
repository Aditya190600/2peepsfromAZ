import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  applyResolvedTheme,
  getStoredThemePreference,
  resolveTheme,
  setStoredThemePreference,
} from "./theme.js";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(getStoredThemePreference);
  const [systemResolved, setSystemResolved] = useState(() => resolveTheme("system"));
  const resolved = preference === "system" ? systemResolved : preference;

  useEffect(() => {
    applyResolvedTheme(resolved);
    setStoredThemePreference(preference);
  }, [preference, resolved]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => setSystemResolved(resolveTheme("system"));
    syncSystemTheme();
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, []);

  const value = useMemo(
    () => ({
      preference,
      resolved,
      setPreference: setPreferenceState,
      toggleTheme: () => setPreferenceState(resolved === "dark" ? "light" : "dark"),
    }),
    [preference, resolved]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
