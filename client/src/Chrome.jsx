import { useState } from "react";
import { SignedIn, SignedOut, SignInButton, useClerk } from "@clerk/clerk-react";
import { PRODUCT_NAV } from "./chromeNav.js";

const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

function go(navigate, href, event) {
  event.preventDefault();
  navigate(href);
}

function ProductLinks({ path, navigate }) {
  return (
    <>
      {PRODUCT_NAV.map((item) => (
        <a
          key={item.href}
          className={`site-nav-link ${item.match(path) ? "is-active" : ""}`}
          href={item.href}
          aria-current={item.match(path) ? "page" : undefined}
          onClick={(e) => go(navigate, item.href, e)}
        >
          {item.label}
        </a>
      ))}
    </>
  );
}

function SignOutConfirm({ onCancel, onConfirm }) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm sign out"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Sign out?</h2>
        <p>You'll need to sign in again to access your reports.</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function SignedInNav({ path, navigate }) {
  const { signOut } = useClerk();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <ProductLinks path={path} navigate={navigate} />
      <button type="button" className="site-nav-link" onClick={() => setConfirming(true)}>
        Sign out
      </button>
      {confirming ? (
        <SignOutConfirm
          onCancel={() => setConfirming(false)}
          onConfirm={() => signOut(() => navigate("/"))}
        />
      ) : null}
    </>
  );
}

// Signed-out: a "Get started" CTA that opens Clerk's sign-in modal.
// Signed-in: Home/Sessions/Try links plus a Sign out control.
// Shared by the splash-page top nav and the product app-shell topbar so both
// render the same auth slot. No-op pass-through when Clerk isn't configured.
export function AuthNav({ path, navigate }) {
  if (!CLERK_ENABLED) {
    return <ProductLinks path={path} navigate={navigate} />;
  }
  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className="site-nav-link">
            Get started
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <SignedInNav path={path} navigate={navigate} />
      </SignedIn>
    </>
  );
}

export function Nav({ path, navigate }) {
  return (
    <nav className="site-nav">
      <a className="brand" href="/" onClick={(e) => go(navigate, "/", e)}>
        <span className="brand-mark" aria-hidden="true" />
        <h1>ComplyLine</h1>
      </a>
      <div className="site-nav-links">
        <AuthNav path={path} navigate={navigate} />
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <p className="site-footer-handling">
        Live call audio is never written to disk. Transcripts exist only in your browser's memory
        and are discarded on reload. Your AssemblyAI API key never leaves the server.
      </p>
      <p className="site-footer-links">
        <a href="https://github.com/Aditya190600/2peepsfromAZ" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
        <span aria-hidden="true"> · </span>
        <span>ComplyLine — automated pattern-based screening, not legal advice.</span>
      </p>
    </footer>
  );
}

export function AppShell({ path, navigate, title, actions, rail, children }) {
  return (
    <div className={`app-shell ${rail ? "has-rail" : ""}`}>
      <header className="app-topbar">
        <a className="app-brand" href="/" onClick={(e) => go(navigate, "/", e)}>
          <span className="brand-mark" aria-hidden="true" />
          <span>ComplyLine</span>
        </a>
        {CLERK_ENABLED ? (
          <div className="site-nav-links">
            <AuthNav path={path} navigate={navigate} />
          </div>
        ) : null}
      </header>
      <div className="app-body">
        <aside className="app-sidebar">
          <p className="app-tenant">
            Northstar Voice
            <span className="app-tenant-mail">legal@northstarvoice.com</span>
          </p>
          <nav className="app-nav" aria-label="Product">
            {PRODUCT_NAV.map((item) => (
              <a
                key={item.href}
                className={`app-nav-link ${item.match(path) ? "is-active" : ""}`}
                href={item.href}
                aria-current={item.match(path) ? "page" : undefined}
                onClick={(e) => go(navigate, item.href, e)}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>
        <div className="app-main">
          <header className="app-pagehead">
            <h1>{title}</h1>
            {actions}
          </header>
          <div className="app-content">{children}</div>
          <Footer />
        </div>
        {rail}
      </div>
    </div>
  );
}

export function OpenTasksRail({ items, onHide, onOpen }) {
  return (
    <aside className="app-rail" aria-label="Open tasks">
      <div className="app-rail-head">
        <h2>Open Tasks</h2>
        <button type="button" className="app-rail-close" onClick={onHide} aria-label="Hide tasks">
          ×
        </button>
      </div>
      <p className="app-rail-meta">Flagged sessions</p>
      {items.length === 0 ? (
        <p className="app-rail-empty">No flagged sessions in this program.</p>
      ) : (
        <ul className="app-rail-list">
          {items.map((item) => (
            <li key={item.sessionId ?? item.key}>
              <button type="button" onClick={() => onOpen(item.sessionId)}>
                <span className="app-rail-label">{item.label}</span>
                <span className="app-rail-id">{item.sessionId}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
