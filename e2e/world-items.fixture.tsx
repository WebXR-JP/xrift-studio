export * as THREE from "three";
import React from "react";
export { React };
export { createRoot, extend } from "@react-three/fiber";
export { createRoot as createDomRoot } from "react-dom/client";
export { XRiftComponentInspector } from "../src/components/visual-editor/XRiftComponentInspector";
export { XriftJsonEditor } from "../src/components/XriftJsonEditor";
export { ToastProvider } from "../src/components/Toast";
export { tauri } from "../src/lib/tauri";
export { OfficialXriftComponentRenderer } from "../src/components/visual-editor/OfficialXriftComponentRenderer";
export { ItemLoaderProvider, XRiftProvider } from "@xrift/world-components";
import { useItem, useXRift } from "@xrift/world-components";

// An actual local Item for rendering tests. No platform resolve or upload runs.
export function LocalTestItem() {
  const identity = useItem();
  const context = useXRift();
  return <mesh name={`${identity.id}|${identity.placedBy}|${context.baseUrl}`}>
    <boxGeometry args={[0.8, 0.8, 0.8]} />
    <meshBasicMaterial color="#ff0000" />
  </mesh>;
}
