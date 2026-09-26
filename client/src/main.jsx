import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App.jsx";
import { ThemeProvider, useTheme } from "./ThemeProvider.jsx";
import { getClerkAppearance, initTheme } from "./theme.js";

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

initTheme();

function ThemedClerkProvider({ children }) {
  const { resolved } = useTheme();
  const appearance = useMemo(() => getClerkAppearance(resolved), [resolved]);
  return (
    <ClerkProvider publishableKey={clerkKey} appearance={appearance}>
      {children}
    </ClerkProvider>
  );
}

function Root() {
  return (
    <ThemeProvider>
      {clerkKey ? (
        <ThemedClerkProvider>
          <App />
        </ThemedClerkProvider>
      ) : (
        <App />
      )}
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
