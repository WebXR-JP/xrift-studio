import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import {
  OPEN_BRUSH_CATALOG,
  listXriftComponentDefinitions,
} from "./lib/visual-editor";
import { OpenBrushCatalogPreview } from "./components/visual-editor/OpenBrushCatalogPreview";
import {
  OfficialXriftComponentStaticPreview,
} from "./components/visual-editor/OfficialXriftComponentThumbnail";

declare global {
  interface Window {
    __XRIFT_CATALOG_THUMBNAILS__?: {
      openBrush: Array<{ id: string; label: string }>;
      xriftComponents: Array<{ id: string; importName: string }>;
    };
  }
}

const definitions = [
  ...listXriftComponentDefinitions("world"),
  ...listXriftComponentDefinitions("item"),
].filter(
  (definition, index, all) =>
    all.findIndex((candidate) => candidate.schemaId === definition.schemaId) ===
    index,
);
window.__XRIFT_CATALOG_THUMBNAILS__ = {
  openBrush: OPEN_BRUSH_CATALOG.map((entry) => ({
    id: entry.id,
    label: entry.label,
  })),
  xriftComponents: definitions.map((definition) => ({
    id: definition.schemaId,
    importName: definition.importName,
  })),
};

function Generator() {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get("kind");
  const id = params.get("id");
  if (kind === "open-brush") {
    const entry = OPEN_BRUSH_CATALOG.find((candidate) => candidate.id === id);
    if (!entry) return <GeneratorError text="Open Brush entry not found" />;
    return (
      <div
        id="catalog-thumbnail-capture"
        className="relative h-[180px] w-[320px] overflow-hidden"
      >
        <OpenBrushCatalogPreview
          entry={entry}
          className="h-[180px] w-[320px]"
          compact
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent px-3 pb-2.5 pt-8 text-white">
          <span className="min-w-0 truncate text-xs font-semibold">
            {entry.label}
          </span>
          <span className="ml-2 shrink-0 text-[9px] font-medium tracking-wide text-cyan-100">
            Open Brush
          </span>
        </div>
      </div>
    );
  }
  if (kind === "xrift-component") {
    const definition = definitions.find(
      (candidate) => candidate.schemaId === id,
    );
    if (!definition) {
      return <GeneratorError text="XRift Component definition not found" />;
    }
    return (
      <div id="catalog-thumbnail-capture" className="h-[180px] w-[320px]">
        <OfficialXriftComponentStaticPreview definition={definition} />
      </div>
    );
  }
  return (
    <pre id="catalog-thumbnail-index">
      {JSON.stringify(window.__XRIFT_CATALOG_THUMBNAILS__, null, 2)}
    </pre>
  );
}

function GeneratorError({ text }: { text: string }) {
  return (
    <div
      id="catalog-thumbnail-error"
      className="flex h-[180px] w-[320px] items-center justify-center bg-rose-950 text-sm text-white"
    >
      {text}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Generator />
  </StrictMode>,
);
