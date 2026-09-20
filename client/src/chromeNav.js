export const PRODUCT_NAV = [
  { href: "/home", label: "Home", match: (path) => path === "/home" },
  {
    href: "/sessions",
    label: "Sessions",
    match: (path) => path === "/sessions" || path.startsWith("/sessions/"),
  },
  { href: "/try", label: "Try", match: (path) => path === "/try" },
  { href: "/api-keys", label: "API Keys", match: (path) => path === "/api-keys" },
];
