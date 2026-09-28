import { useEffect, useState, useSyncExternalStore } from "react";
import { SignedIn, SignedOut, SignInButton, useClerk, useUser } from "@clerk/clerk-react";
import { productNav } from "./chromeNav.js";
import { getQualevalConfig } from "./qualevalClient.js";
import ThemeToggle from "./ThemeToggle.jsx";

const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

// TEMP: hidden for demo recording, restore after (flip back to true)
const SHOW_USER_IDENTITY = false;

function go(navigate, href, event) {
  event.preventDefault();
  navigate(href);
}

let navAccess = { isOperator: false, canAccessPhoneEvals: false };
let configPromise = null;
let configGeneration = 0;
const navAccessListeners = new Set();

function publishNavAccess(generation, next) {
  if (generation !== configGeneration) return navAccess;
  navAccess = next;
  for (const listener of navAccessListeners) listener();
  return navAccess;
}

function loadNavAccess() {
  if (configPromise) return configPromise;
  const generation = configGeneration;
  let promise;
  promise = getQualevalConfig()
    .then((config) => publishNavAccess(generation, navFlags(config)))
    .catch(() => {
      if (generation === configGeneration && configPromise === promise) configPromise = null;
      return publishNavAccess(generation, navFlags(null));
    });
  configPromise = promise;
  return promise;
}

function navFlags(config) {
  return {
    isOperator: Boolean(config?.isOperator),
    canAccessPhoneEvals: Boolean(config?.canAccessPhoneEvals),
  };
}

// Operator flag and Phone Evals access from /v1/qualeval/config. Cached once
// known; a failure (e.g. signed out) counts as no access and is retried on
// the next subscribe. refreshProductNav() replaces that cache from a config
// the caller already loaded, so a Twilio import can reveal Phone Evals
// without a full reload.
export function refreshProductNav(config) {
  configGeneration += 1;
  const next = navFlags(config);
  configPromise = Promise.resolve(publishNavAccess(configGeneration, next));
  return configPromise;
}

function subscribeNavAccess(listener) {
  navAccessListeners.add(listener);
  loadNavAccess();
  return () => navAccessListeners.delete(listener);
}

function useProductNav() {
  const access = useSyncExternalStore(subscribeNavAccess, () => navAccess);
  return productNav(access);
}

function ProductLinks({ path, navigate }) {
  const nav = useProductNav();
  return (
    <>
      {nav.map((item) => (
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

// Signed-in top-right navbar: Sign out, plus (on the splash page only) a
// "Get started" link back into the app - the splash page has no other route
// back in for a signed-in visitor. The product pages still live in the app
// shell's left rail (see AppShell below) once inside the app, so this stays
// a single link rather than duplicating that nav.
function SignedInNav({ navigate, splash }) {
  const { signOut } = useClerk();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      {splash ? (
        <a className="site-nav-link" href="/try" onClick={(e) => go(navigate, "/try", e)}>
          Get started
        </a>
      ) : null}
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
// Signed-in: a Sign out control (plus "Get started" on the splash page).
// Shared by the splash-page top nav and the product app-shell topbar so both
// render the same auth slot. No-op pass-through when Clerk isn't configured.
export function AuthNav({ path, navigate, splash }) {
  if (!CLERK_ENABLED) {
    return <ProductLinks path={path} navigate={navigate} />;
  }
  return (
    <>
      <SignedOut>
        <SignInButton mode="modal" forceRedirectUrl="/try">
          <button type="button" className="site-nav-link">
            Get started
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <SignedInNav navigate={navigate} splash={splash} />
      </SignedIn>
    </>
  );
}

export function Nav({ path, navigate }) {
  return (
    <nav className="site-nav">
      <a className="brand" href="/" onClick={(e) => go(navigate, "/", e)}>
        <h1>ComplyLine</h1>
      </a>
      <div className="site-nav-links">
        <ThemeToggle />
        <AuthNav path={path} navigate={navigate} splash />
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <p className="site-footer-links">
        <a href="https://github.com/Aditya190600/2peepsfromAZ" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
        <span aria-hidden="true"> · </span>
        <span>ComplyLine is automated pattern-based screening. Consult counsel for legal advice.</span>
      </p>
    </footer>
  );
}

// Shows who is signed in, from the real Clerk user only. There is no org or
// tenant concept in this app, so nothing renders without a signed-in user.
function TenantIdentity({ name, email }) {
  if (!SHOW_USER_IDENTITY) return null;
  if (!email) return null;
  return (
    <p className="app-tenant">
      {name ? <span className="app-tenant-name">{name}</span> : null}
      <span className="app-tenant-mail">{email}</span>
    </p>
  );
}

// useUser() only mounts when Clerk is configured, so this component only
// renders in that case - keeps the hook call unconditional within it.
function ClerkTenantIdentity() {
  const { user } = useUser();
  return (
    <TenantIdentity
      name={user?.fullName}
      email={user?.primaryEmailAddress?.emailAddress}
    />
  );
}

// Without Clerk every visitor is the same anonymous user, so there is no
// identity to show.
function AppTenantIdentity() {
  return CLERK_ENABLED ? <ClerkTenantIdentity /> : null;
}

export function AppShell({ path, navigate, title, actions, rail, children }) {
  const nav = useProductNav();
  return (
    <div className={`app-shell ${rail ? "has-rail" : ""}`}>
      <header className="app-topbar">
        <a className="app-brand" href="/" onClick={(e) => go(navigate, "/", e)}>
          <span>ComplyLine</span>
        </a>
        <div className="site-nav-links">
          <ThemeToggle />
          {CLERK_ENABLED ? <AuthNav path={path} navigate={navigate} /> : null}
        </div>
      </header>
      <div className="app-body">
        <aside className="app-sidebar">
          <AppTenantIdentity />
          <nav className="app-nav" aria-label="Product">
            {nav.map((item) => (
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
