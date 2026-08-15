import React from "react";
import ReactDOM from "react-dom/client";
import WikiApp from "./WikiApp";
import { installVitePreloadRecovery } from "./lib/vite-preload-recovery";
import "./index.css";
import "./wiki.css";

installVitePreloadRecovery();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <WikiApp />
  </React.StrictMode>,
);
