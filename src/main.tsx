import "./lib/react-performance-protection";
import { startApplication } from "./lib/application-bootstrap";

// Shared React/R3F bundles must evaluate after the development capability guard.
startApplication(() => import("./main-bootstrap"));
