import { CheckCircle2, CircleAlert, ExternalLink, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import {
  XRIFT_COMPONENT_API_SOURCE,
  XRIFT_COMPONENT_API_VERSION,
  listXriftComponentDefinitions,
  xriftComponentCatalogThumbnailUrl,
  type VisualProjectKind,
  type XriftComponentDefinition,
} from "../../lib/visual-editor";
import { CatalogThumbnailImage } from "./CatalogThumbnailImage";
import { EDITOR_ICONS } from "./editor-icons";

export function OfficialXriftComponentStore({
  projectKind,
  disabledReason,
  onAdd,
}: {
  projectKind: VisualProjectKind;
  disabledReason?: string | null;
  onAdd: (definition: XriftComponentDefinition) => Promise<boolean>;
}) {
  const definitions = useMemo(
    () => listXriftComponentDefinitions(projectKind),
    [projectKind],
  );
  const initial =
    definitions.find((definition) => definition.importName === "Portal") ??
    definitions[0];
  const [selectedSchemaId, setSelectedSchemaId] = useState(
    initial?.schemaId ?? "",
  );
  const [adding, setAdding] = useState(false);
  const [addedName, setAddedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected =
    definitions.find((definition) => definition.schemaId === selectedSchemaId) ??
    initial;
  const developerOnly = selected?.importName === "DevEnvironment";

  const addSelected = async () => {
    if (!selected || adding || developerOnly || disabledReason) return;
    setAdding(true);
    setAddedName(null);
    setError(null);
    try {
      if (await onAdd(selected)) setAddedName(selected.label);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setAdding(false);
    }
  };

  return (
      <div className="flex h-full min-h-0 min-w-0 flex-1">
        <section
          className="flex min-w-0 flex-1 flex-col border-r border-slate-200"
          aria-label="XRift公式Component一覧"
        >
          <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-slate-900">
                  XRift公式Component一覧
                </h3>
                <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                  @xrift/world-components {XRIFT_COMPONENT_API_VERSION} の公式rendererから作成した保存済み画像です
                </p>
              </div>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">
                {definitions.length} components
              </span>
            </div>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {definitions.map((definition) => {
                const active = definition.schemaId === selected?.schemaId;
                const Icon = EDITOR_ICONS[definition.icon];
                return (
                  <button
                    key={definition.schemaId}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedSchemaId(definition.schemaId);
                      setAddedName(null);
                      setError(null);
                    }}
                    className={`rounded-lg border p-2 text-left transition-colors ${
                      active
                        ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100"
                        : "border-slate-200 bg-white hover:border-violet-300 hover:bg-slate-50"
                    }`}
                  >
                    <CatalogThumbnailImage
                      src={xriftComponentCatalogThumbnailUrl(
                        definition.importName,
                      )}
                      alt={`${definition.label}の公式プレビュー`}
                      className="h-28 w-full rounded-md"
                      fallback={<Icon size={22} aria-hidden="true" />}
                    />
                    <span className="mt-2 block truncate text-xs font-semibold text-slate-800">
                      {definition.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      {definition.category}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
            公開package本体から作成した保存済みプレビューを表示しています。
          </footer>
        </section>

        <aside
          className="scrollbar-thin w-[340px] shrink-0 overflow-auto bg-white p-4"
          aria-label="選択した公式Componentの詳細"
        >
          {selected ? (
            <div className="space-y-4">
              {(() => {
                const Icon = EDITOR_ICONS[selected.icon];
                return (
                  <CatalogThumbnailImage
                    src={xriftComponentCatalogThumbnailUrl(
                      selected.importName,
                    )}
                    alt={`${selected.label}の公式プレビュー`}
                    className="h-44 w-full rounded-lg"
                    fallback={<Icon size={28} aria-hidden="true" />}
                  />
                );
              })()}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      {selected.label}
                    </h3>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                      {selected.category}
                    </p>
                  </div>
                  <a
                    href={XRIFT_COMPONENT_API_SOURCE}
                    target="_blank"
                    rel="noreferrer"
                    title="公式ソースを開く"
                    className="relative z-30 rounded p-1.5 text-slate-500 hover:bg-slate-100"
                  >
                    <ExternalLink size={15} aria-hidden="true" />
                  </a>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {selected.description}
                </p>
              </div>
              <dl className="grid grid-cols-[76px_1fr] gap-x-2 gap-y-1.5 text-xs">
                <dt className="text-slate-400">Package</dt>
                <dd className="font-medium text-slate-700">
                  @xrift/world-components
                </dd>
                <dt className="text-slate-400">Version</dt>
                <dd className="text-slate-700">{XRIFT_COMPONENT_API_VERSION}</dd>
                <dt className="text-slate-400">Import</dt>
                <dd className="font-mono text-[11px] text-slate-700">
                  {selected.importName}
                </dd>
              </dl>
              {developerOnly ? (
                <Notice text="DevEnvironmentは公式の開発用wrapperです。Sceneへ配置せず、XRiftのdev entryでStudioが管理します。" />
              ) : (
                <Notice text="追加時はScene dataへ変換し、追加したEntityを選択してInspectorを開きます。" />
              )}
              {disabledReason ? <Notice warning text={disabledReason} /> : null}
              {error ? (
                <div
                  className="flex gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800"
                  role="alert"
                >
                  <CircleAlert size={15} className="shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
              {addedName ? (
                <div
                  className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800"
                  role="status"
                >
                  <CheckCircle2 size={15} className="shrink-0" />
                  <span>「{addedName}」をSceneへ追加しました。</span>
                </div>
              ) : null}
              {!developerOnly ? (
                <button
                  type="button"
                  disabled={adding || Boolean(disabledReason)}
                  onClick={() => void addSelected()}
                  className="relative z-30 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {adding ? (
                    <>
                      <LoaderCircle size={16} className="animate-spin" />
                      追加中
                    </>
                  ) : (
                    `${selected.label}をSceneへ追加`
                  )}
                </button>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
  );
}

function Notice({
  text,
  warning = false,
}: {
  text: string;
  warning?: boolean;
}) {
  return (
    <p
      className={`rounded-md border px-2.5 py-2 text-xs leading-5 ${
        warning
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {text}
    </p>
  );
}
