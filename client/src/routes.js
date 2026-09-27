export function matchRoute(pathname) {
  if (pathname === "/try") return { name: "try" };
  if (pathname === "/examples") return { name: "examples" };
  if (pathname === "/api-keys") return { name: "api-keys" };
  if (pathname === "/evals") return { name: "evals" };
  if (pathname === "/numbers") return { name: "numbers" };
  if (pathname === "/qualeval") return { name: "qualeval" };
  if (pathname === "/settings") return { name: "settings" };
  if (pathname === "/phone-evals") return { name: "phone-evals" };
  if (pathname.startsWith("/qualeval/")) {
    const evaluationId = decodeURIComponent(pathname.slice("/qualeval/".length));
    if (!evaluationId) return { name: "qualeval" };
    return { name: "qualeval-evaluation", evaluationId };
  }
  if (pathname === "/sessions" || pathname === "/sessions/") {
    return { name: "sessions" };
  }
  if (pathname === "/history") return { name: "sessions", redirect: "/sessions" };
  if (pathname === "/dashboard") return { name: "try", redirect: "/try" };
  if (pathname === "/home") return { name: "try", redirect: "/try" };
  if (pathname.startsWith("/sessions/")) {
    const sessionId = decodeURIComponent(pathname.slice("/sessions/".length));
    if (!sessionId) return { name: "sessions", redirect: "/sessions" };
    return { name: "session", sessionId };
  }
  return { name: "landing" };
}
