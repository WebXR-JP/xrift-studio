import React from "react";
import ReactDOM from "react-dom/client";
import PreviewApp from "./PreviewApp";
import { installVitePreloadRecovery } from "./lib/vite-preload-recovery";
import "./index.css";
import "./preview.css";

installVitePreloadRecovery();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PreviewApp />
  </React.StrictMode>,
);
