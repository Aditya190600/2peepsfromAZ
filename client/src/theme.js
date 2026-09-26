export const THEME_STORAGE_KEY = "complyline-theme";

/** @typedef {"light" | "dark" | "system"} ThemePreference */
/** @typedef {"light" | "dark"} ResolvedTheme */

/** @returns {ThemePreference} */
export function getStoredThemePreference() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    /* private browsing */
  }
  return "system";
}

/** @param {ThemePreference} preference */
export function setStoredThemePreference(preference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* private browsing */
  }
}

/** @param {ThemePreference} preference @returns {ResolvedTheme} */
export function resolveTheme(preference) {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/** @param {ResolvedTheme} resolved */
export function applyResolvedTheme(resolved) {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

/** @param {ThemePreference} [preference] */
export function initTheme(preference = getStoredThemePreference()) {
  applyResolvedTheme(resolveTheme(preference));
}

/** @param {ResolvedTheme} resolved */
export function getClerkAppearance(resolved) {
  const dark = resolved === "dark";
  return {
    variables: {
      colorPrimary: dark ? "#6b9fd4" : "#1f3a5f",
      colorBackground: dark ? "#1a1d25" : "#ffffff",
      colorText: dark ? "#e8eaed" : "#14161c",
      colorTextSecondary: dark ? "#9aa3ae" : "#666e78",
      colorInputBackground: dark ? "#12141a" : "#ffffff",
      colorInputText: dark ? "#e8eaed" : "#14161c",
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      borderRadius: "3px",
    },
    elements: {
      formButtonPrimary: {
        backgroundColor: dark ? "#6b9fd4" : "#1f3a5f",
        "&:hover": { backgroundColor: dark ? "#8bb8e8" : "#16294a" },
      },
    },
  };
}
