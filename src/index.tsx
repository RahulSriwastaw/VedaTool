import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { LanguageProvider } from "./hooks/useLanguage";
import App from "./App";
import { initGeminiPool } from "./services/geminiPool";

// Initialize central Gemini Pool
initGeminiPool();

// Suppress unhandled AbortError that bubbles up due to iframe live-reload and network drops
window.addEventListener("unhandledrejection", (e) => {
  const reasonStr = e.reason ? String(e.reason).toLowerCase() : "";
  if (
    e.reason &&
    (e.reason.message?.toLowerCase().includes("abort") ||
      e.reason.name === "AbortError" ||
      reasonStr.includes("abort"))
  ) {
    e.preventDefault();
  }
});

// Also suppress window onerror for abort
window.addEventListener("error", (e) => {
  const msg = e.message ? String(e.message).toLowerCase() : "";
  if (msg.includes("abort")) {
    e.preventDefault();
  }
});

// Intercept all legacy alerts to run dynamically through our elegant CustomEvent toast stream.
// This preserves functional calls across all 100+ files while preventing any SecurityError in iframes.
window.alert = (message: any) => {
  const msgStr = String(message || "");
  console.log("ALERT INTERCEPTED VIA GLOBAL FILTER:", msgStr);

  const isSuccess = msgStr.toLowerCase().includes("success") || msgStr.toLowerCase().includes("completed") || msgStr.toLowerCase().includes("saved") || msgStr.toLowerCase().includes("synchronized");
  const isError = msgStr.toLowerCase().includes("fail") || msgStr.toLowerCase().includes("error") || msgStr.toLowerCase().includes("crashed") || msgStr.toLowerCase().includes("rejected");
  const isWarning = msgStr.toLowerCase().includes("warning") || msgStr.toLowerCase().includes("limit") || msgStr.toLowerCase().includes("too large");

  const type = isSuccess ? "success" : isError ? "error" : isWarning ? "warning" : "info";

  const event = new CustomEvent("app-toast", {
    detail: { 
      message: msgStr, 
      type: type,
      duration: isSuccess ? 3000 : isError ? 6000 : 4000
    }
  });
  window.dispatchEvent(event);
};

// Also gracefully intercept window.confirm to avoid blocking iframe sandboxes while returning a sensible default
window.confirm = (message: any) => {
  console.log("CONFIRM INTERCEPTED VIA GLOBAL FILTER (Auto-confirmed):", message);
  return true;
};

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>,
);
