import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { registerServiceWorker } from "./ui/swUpdate";
import "./themes/themes.css";
import "./ui/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Hors ligne : seulement sur un vrai hébergement (pas dans un aperçu intégré).
if ("serviceWorker" in navigator && import.meta.env.PROD && window.top === window.self && !import.meta.env.VITE_SINGLEFILE) {
  registerServiceWorker();
}
