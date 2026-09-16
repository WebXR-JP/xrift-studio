import type { ComponentProps } from "react";
import { AssetsPanel as AssetsPanelBase } from "./AssetsPanelBase";
import "./editor-uiux-overrides.css";

type AssetsPanelProps = ComponentProps<typeof AssetsPanelBase>;

export function AssetsPanel(props: AssetsPanelProps) {
  return (
    <div className="xrift-assets-ux" style={{ display: "contents" }}>
      <AssetsPanelBase {...props} />
    </div>
  );
}
