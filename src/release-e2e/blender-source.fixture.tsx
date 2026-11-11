import { createRoot } from "react-dom/client";
import { ModelAssetInspector } from "../components/visual-editor/ModelAssetInspector";
import type { AssetManifest, ModelAsset } from "../lib/visual-editor/asset-manifest";

export function mountBlenderSourceInspector(asset: ModelAsset, assets: AssetManifest, projectPath: string, reimport: () => void) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:20px 20px 20px auto;width:420px;overflow:auto;z-index:99999;background:#f8fafc;padding:12px";
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<ModelAssetInspector asset={asset} assets={assets} projectPath={projectPath}
    preview={null} readOnly={false} canReimport reimportState={{ phase: "idle" }}
    onChange={() => {}} onOpenMaterial={() => {}} onReimport={reimport} />);
  return () => { root.unmount(); host.remove(); };
}
