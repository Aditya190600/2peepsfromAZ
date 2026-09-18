import { useEffect, useState } from "react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import Landing from "./Landing";
import Home from "./Home";
import Try from "./Try";
import History from "./History";
import SessionView from "./SessionView";
import { matchRoute } from "./routes";
import "./App.css";

const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Gates the product screens behind a Clerk sign-in so each public-demo
// visitor gets their own trial rather than sharing one instance. A no-op
// pass-through when CLERK_ENABLED is false, so a fresh clone/local dev with
// no Clerk keys keeps working exactly as before.
function RequireVisitor({ children }) {
  if (!CLERK_ENABLED) return children;
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div className="signin-gate">
          <h1>Sign in to try ComplyLine</h1>
          <p>Each visitor gets their own trial - your history and reports stay separate from everyone else's.</p>
          <SignInButton mode="modal">
            <button type="button" className="btn btn-primary">
              Sign in
            </button>
          </SignInButton>
        </div>
      </SignedOut>
    </>
  );
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

  if (view.name === "home") {
    return (
      <RequireVisitor>
        <Home navigate={navigate} path={viewPath} />
      </RequireVisitor>
    );
  }
  if (view.name === "try") {
    return (
      <RequireVisitor>
        <Try navigate={navigate} path={viewPath} />
      </RequireVisitor>
    );
  }
  if (view.name === "sessions") {
    return (
      <RequireVisitor>
        <History navigate={navigate} path={viewPath} />
      </RequireVisitor>
    );
  }
  if (view.name === "session") {
    return (
      <RequireVisitor>
        <SessionView navigate={navigate} path={path} sessionId={view.sessionId} />
      </RequireVisitor>
    );
  }
  return <Landing onGetStarted={() => navigate("/home")} navigate={navigate} path={path} />;
}
