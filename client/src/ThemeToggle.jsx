import { useTheme } from "./ThemeProvider.jsx";

export default function ThemeToggle({ className = "site-nav-link theme-toggle" }) {
  const { resolved, toggleTheme } = useTheme();
  const nextLabel = resolved === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      className={className}
      onClick={toggleTheme}
      aria-label={nextLabel}
      title={nextLabel}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {resolved === "dark" ? "☀" : "☾"}
      </span>
      <span className="theme-toggle-label">{resolved === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
