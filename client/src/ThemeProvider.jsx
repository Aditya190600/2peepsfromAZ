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
  const resolved = useMemo(() => resolveTheme(preference), [preference]);

  useEffect(() => {
    applyResolvedTheme(resolved);
    setStoredThemePreference(preference);
  }, [preference, resolved]);

  useEffect(() => {
    if (preference !== "system") return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyResolvedTheme(resolveTheme("system"));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

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
