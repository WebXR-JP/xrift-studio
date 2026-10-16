import { Image } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { AssetManifest } from "../../lib/visual-editor/asset-manifest";
import type { ChatgptChoicePreview } from "../../lib/visual-editor/chatgpt-questions";
import { SKY_SHADER_CATALOG } from "../../lib/visual-editor/sky-shader-catalog";
import { AssetThumbnail } from "./AssetQuickEditor";
import { CatalogThumbnailImage } from "./CatalogThumbnailImage";
import { SkyShaderCatalogPreview } from "./SkyShaderCatalogPreview";

const BuiltinThumbnail = lazy(() => import("./ChatgptBuiltinThumbnail").then(module => ({ default: module.ChatgptBuiltinThumbnail })));
const loading = <span className="flex h-full items-center justify-center bg-slate-100 text-[10px] text-slate-500">読み込み中…</span>;

function VisibleBuiltinThumbnail({ preview }: { preview: Extract<ChatgptChoicePreview, { kind: "builtin" }> }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: "80px" });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  // Release live preview contexts when old conversation cards leave the viewport.
  return <div ref={host} className="h-full w-full">{visible ? <Suspense fallback={loading}><BuiltinThumbnail candidateId={preview.candidateId} name={preview.name} /></Suspense> : loading}</div>;
}

export function ChatgptChoiceThumbnail({ preview, assets, projectPath }: { preview?: ChatgptChoicePreview; assets?: AssetManifest; projectPath?: string }) {
  if (preview?.kind === "builtin") return <VisibleBuiltinThumbnail preview={preview} />;
  if (preview?.kind === "sky") {
    const entry = SKY_SHADER_CATALOG.find(entry => entry.id === preview.catalogId);
    if (entry) return <SkyShaderCatalogPreview shader={entry.shader} thumbnailId={entry.id} label={preview.name} />;
  }
  if (preview?.kind === "project" && assets?.assets[preview.assetId]) return <AssetThumbnail asset={assets.assets[preview.assetId]} assets={assets} projectPath={projectPath} />;
  if (preview?.kind === "remote") return <CatalogThumbnailImage src={preview.thumbnailUrl} alt={`${preview.name}のプレビュー`} fallback={<Image aria-hidden="true" className="size-5" />} />;
  return <span className="flex h-full items-center justify-center bg-slate-100 p-2 text-[10px] text-slate-500">プレビューなし</span>;
}
