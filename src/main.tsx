import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./components/Toast";
import { setBackend } from "./lib/backend";
import "./index.css";

// Detect runtime: if window.__TAURI_INTERNALS__ exists we're in Tauri, otherwise Electron
async function initBackend() {
  if ("__TAURI_INTERNALS__" in window) {
    const { TauriBackend } = await import("./lib/backend-tauri");
    setBackend(new TauriBackend());
  } else {
    const { ElectronBackend } = await import("./lib/backend-electron");
    setBackend(new ElectronBackend());
  }
}

initBackend().then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ToastProvider>
        <App />
      </ToastProvider>
    </React.StrictMode>,
  );
});
