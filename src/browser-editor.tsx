import React from "react";
import ReactDOM from "react-dom/client";
import BrowserEditorApp from "./BrowserEditorApp";
import { installVitePreloadRecovery } from "./lib/vite-preload-recovery";
import "./index.css";
import "./preview.css";

installVitePreloadRecovery();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserEditorApp />
  </React.StrictMode>,
);
