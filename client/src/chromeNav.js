export const PRODUCT_NAV = [
  { href: "/home", label: "Home", match: (path) => path === "/home" },
  {
    href: "/sessions",
    label: "Sessions",
    match: (path) => path === "/sessions" || path.startsWith("/sessions/"),
  },
  { href: "/try", label: "Try", match: (path) => path === "/try" },
  { href: "/examples", label: "Examples", match: (path) => path === "/examples" },
  { href: "/numbers", label: "Numbers", match: (path) => path === "/numbers" },
  { href: "/api-keys", label: "API Keys", match: (path) => path === "/api-keys" },
  { href: "/evals", label: "Evals", match: (path) => path === "/evals" },
];
