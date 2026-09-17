import type { ComponentProps } from "react";
import { HierarchyPanel as HierarchyPanelBase } from "./HierarchyPanelBase";
import "./editor-uiux-overrides.css";

/** Scene and Hierarchy share their menu; no DOM rewriting is needed. */
export function HierarchyPanel(props: ComponentProps<typeof HierarchyPanelBase>) {
  return <div className="xrift-hierarchy-ux" style={{ display: "contents" }}><HierarchyPanelBase {...props} /></div>;
}
