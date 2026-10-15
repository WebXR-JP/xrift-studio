import { Image } from "lucide-react";
import type { AssetManifest } from "../../lib/visual-editor/asset-manifest";
import type { ChatgptChoicePreview } from "../../lib/visual-editor/chatgpt-questions";
import { SKY_SHADER_CATALOG } from "../../lib/visual-editor/sky-shader-catalog";
import { AssetThumbnail } from "./AssetQuickEditor";
import { CatalogThumbnailImage } from "./CatalogThumbnailImage";
import { SkyShaderCatalogPreview } from "./SkyShaderCatalogPreview";

export function ChatgptChoiceThumbnail({ preview, assets, projectPath }: { preview?: ChatgptChoicePreview; assets?: AssetManifest; projectPath?: string }) {
  if (preview?.kind === "sky") {
    const entry = SKY_SHADER_CATALOG.find(entry => entry.id === preview.catalogId);
    if (entry) return <SkyShaderCatalogPreview shader={entry.shader} thumbnailId={entry.id} label={preview.name} />;
  }
  if (preview?.kind === "project" && assets?.assets[preview.assetId]) return <AssetThumbnail asset={assets.assets[preview.assetId]} assets={assets} projectPath={projectPath} />;
  if (preview?.kind === "remote") return <CatalogThumbnailImage src={preview.thumbnailUrl} alt={`${preview.name}のプレビュー`} fallback={<Image aria-hidden="true" className="size-5" />} />;
  return <span className="flex h-full items-center justify-center bg-slate-100 p-2 text-[10px] text-slate-500">プレビューなし</span>;
}
