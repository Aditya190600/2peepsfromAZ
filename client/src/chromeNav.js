// Full nav model, including entries hidden from the rail (kept here, not
// deleted, so their routes/components stay reachable by direct URL).
export const PRODUCT_NAV_ALL = [
  { href: "/home", label: "Home", match: (path) => path === "/home" },
  { href: "/try", label: "Voice Compliance", match: (path) => path === "/try" },
  // Folded into the Try page as the "Compliance Examples" tab (Dashboard.jsx's
  // ExamplesPanels) - hidden, not deleted, since the standalone route still
  // works (see Examples.jsx's default export).
  { href: "/examples", label: "Compliance Examples", match: (path) => path === "/examples", hidden: true },
  {
    href: "/sessions",
    label: "Sessions",
    match: (path) => path === "/sessions" || path.startsWith("/sessions/"),
    hidden: true,
  },
  { href: "/numbers", label: "Numbers", match: (path) => path === "/numbers", hidden: true },
  { href: "/api-keys", label: "API Keys", match: (path) => path === "/api-keys", hidden: true },
  { href: "/evals", label: "Evals", match: (path) => path === "/evals", hidden: true },
  {
    href: "/qualeval",
    label: "Qualitative Evals",
    match: (path) => path === "/qualeval" || path.startsWith("/qualeval/"),
  },
];

// Visible left-rail entries only.
export const PRODUCT_NAV = PRODUCT_NAV_ALL.filter((item) => !item.hidden);
