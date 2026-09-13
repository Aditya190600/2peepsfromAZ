import { useEffect, useState } from "react";
import Landing from "./Landing";
import Home from "./Home";
import Try from "./Try";
import History from "./History";
import SessionView from "./SessionView";
import { matchRoute } from "./routes";
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

  const route = matchRoute(path, window.location.search);

  useEffect(() => {
    if (!route.redirect || route.redirect === path) return;
    window.history.replaceState({}, "", route.redirect);
    setPath(route.redirect);
  }, [path, route.redirect]);

  const viewPath = route.redirect ?? path;
  const view = route.redirect ? matchRoute(route.redirect) : route;

  if (view.name === "home") return <Home navigate={navigate} path={viewPath} />;
  if (view.name === "try") return <Try navigate={navigate} path={viewPath} />;
  if (view.name === "sessions") return <History navigate={navigate} path={viewPath} />;
  if (view.name === "session") {
    return <SessionView navigate={navigate} path={path} sessionId={view.sessionId} />;
  }
  return <Landing onGetStarted={() => navigate("/home")} navigate={navigate} path={path} />;
}
