import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./components/Toast";
import "./index.css";
import { GuideHost } from "./components/guide/GuideHost";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
      <GuideHost />
    </ToastProvider>
  </React.StrictMode>,
);
