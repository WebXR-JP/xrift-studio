import "./lib/react-performance-protection";
import { startApplication } from "./lib/application-bootstrap";

startApplication(() => import("./browser-editor-bootstrap"));
