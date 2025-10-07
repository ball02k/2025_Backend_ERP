import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  const el = document.createElement("div");
  el.id = "root";
  document.body.appendChild(el);
}

// Bump local API catalog hash to current to acknowledge latest changes
try {
  localStorage.setItem('lastSeenCatalogHash', '4c21fbecfae0a8e21a1332757ed5e706c380c320');
} catch {}

// Simple demo-mode link guard: if on /demo, keep navigation within /demo
try {
  const isDemo = window.location.pathname.startsWith('/demo');
  if (isDemo) {
    document.addEventListener('click', (e) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const a = (t.closest && t.closest('a')) as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) return;
      if (href.startsWith('/demo')) return; // already prefixed
      if (!href.startsWith('/')) return; // relative links fine
      e.preventDefault();
      const url = `/demo${href}`;
      window.history.pushState({}, '', url);
      // Trigger popstate so Router picks up navigation if needed
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, true);
  }
} catch {}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
