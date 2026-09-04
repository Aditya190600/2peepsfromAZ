import { useEffect, useState } from "react";
import Landing from "./Landing";
import Dashboard from "./Dashboard";
import "./App.css";

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
    return <Dashboard />;
  }
  return <Landing onGetStarted={() => navigate("/dashboard")} />;
}
