export function matchRoute(pathname, search = "") {
  const query = new URLSearchParams(search);

  if (pathname === "/home") return { name: "home" };
  if (pathname === "/try") return { name: "try" };
  if (pathname === "/api-keys") return { name: "api-keys" };
  if (pathname === "/evals") return { name: "evals" };
  if (pathname === "/numbers") return { name: "numbers" };
  if (pathname === "/sessions" || pathname === "/sessions/") {
    return { name: "sessions" };
  }
  if (pathname === "/history") return { name: "sessions", redirect: "/sessions" };
  if (pathname === "/dashboard") {
    if (query.get("view") === "summary") return { name: "home", redirect: "/home" };
    return { name: "try", redirect: "/try" };
  }
  if (pathname.startsWith("/sessions/")) {
    const sessionId = decodeURIComponent(pathname.slice("/sessions/".length));
    if (!sessionId) return { name: "sessions", redirect: "/sessions" };
    return { name: "session", sessionId };
  }
  return { name: "landing" };
}
