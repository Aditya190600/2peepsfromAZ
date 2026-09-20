import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App.jsx";

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Matches this app's own tokens (client/src/App.css :root) so Clerk's hosted
// sign-in modal and UserButton menu look like ComplyLine instead of stock Clerk.
const clerkAppearance = {
  variables: {
    colorPrimary: "#1f3a5f",
    colorBackground: "#ffffff",
    colorText: "#14161c",
    colorTextSecondary: "#666e78",
    colorInputBackground: "#ffffff",
    colorInputText: "#14161c",
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    borderRadius: "3px",
  },
  elements: {
    formButtonPrimary: {
      backgroundColor: "#1f3a5f",
      "&:hover": { backgroundColor: "#16294a" },
    },
  },
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {clerkKey ? (
      <ClerkProvider publishableKey={clerkKey} appearance={clerkAppearance}>
        <App />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
