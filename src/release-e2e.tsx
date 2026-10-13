import "./lib/react-performance-protection";
import { startApplication } from "./lib/application-bootstrap";
import { installReleaseE2EMock } from "./release-e2e/mock-tauri";

// Fixtures may run as soon as the entry loads, before App's dynamic imports.
// Keep the native environment stable even when the entry runs again during HMR.
if (!window.__XRIFT_RELEASE_E2E__) installReleaseE2EMock();

startApplication(() => import("./release-e2e-bootstrap"));
