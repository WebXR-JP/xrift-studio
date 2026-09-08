import "./lib/react-performance-protection";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./components/Toast";
import { installVitePreloadRecovery } from "./lib/vite-preload-recovery";
import "./index.css";
import { GuideHost } from "./components/guide/GuideHost";

installVitePreloadRecovery();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
      <GuideHost />
    </ToastProvider>
  </React.StrictMode>,
);
