import { useEffect, useState } from "react";
import Landing from "./Landing";
import Dashboard from "./Dashboard";
import History from "./History";
import SessionView from "./SessionView";
import "./App.css";

const SESSIONS_PREFIX = "/sessions/";

function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (path === "/dashboard") {
    const initialView = new URLSearchParams(window.location.search).get("view");
    return <Dashboard navigate={navigate} path={path} initialView={initialView} />;
  }
  if (path === "/history") {
    return <History navigate={navigate} path={path} />;
  }
  if (path.startsWith(SESSIONS_PREFIX)) {
    const sessionId = decodeURIComponent(path.slice(SESSIONS_PREFIX.length));
    return <SessionView navigate={navigate} path={path} sessionId={sessionId} />;
  }
  return <Landing onGetStarted={() => navigate("/dashboard?view=summary")} navigate={navigate} path={path} />;
}
