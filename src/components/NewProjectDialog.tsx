import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Box,
  Check,
  CircleDot,
  Code2,
  Cuboid,
  Globe2,
  LayoutGrid,
  Lightbulb,
  Package,
  PanelsTopLeft,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { ProjectKind } from "../lib/tauri";
import {
  STARTER_ITEM_TEMPLATES,
  STARTER_WORLD_TEMPLATES,
  defaultVisualStarterTemplateId,
  type VisualStarterTemplateId,
} from "../lib/visual-editor/starter-templates";

type CreationMethod = "classic" | "visual";

type Props = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (kind: ProjectKind, name: string) => void;
  onOpenVisualEditor: (
    kind: ProjectKind,
    name?: string,
    starterTemplateId?: VisualStarterTemplateId,
  ) => void;
};

type CreationChoice = {
  id: `${ProjectKind}-${CreationMethod}`;
  kind: ProjectKind;
  method: CreationMethod;
  title: string;
  description: string;
  detail: string;
  example: string;
  KindIcon: LucideIcon;
  MethodIcon: LucideIcon;
};

const creationChoices: CreationChoice[] = [
  {
    id: "world-classic",
    kind: "world",
    method: "classic",
    title: "ワールドをコードで作る",
    description: "XRiftテンプレートから始め、コードとファイルを直接編集します。",
    detail: "package.json・xrift.json・src が制作データです。",
    example: "my-first-world",
    KindIcon: Globe2,
    MethodIcon: Code2,
  },
  {
    id: "item-classic",
    kind: "item",
    method: "classic",
    title: "アイテムをコードで作る",
    description: "再利用できるXRiftアイテムをコードから組み立てます。",
    detail: "package.json・xrift.json・src が制作データです。",
    example: "my-first-item",
    KindIcon: Box,
    MethodIcon: Code2,
  },
  {
    id: "world-visual",
    kind: "world",
    method: "visual",
    title: "ワールドをビジュアルで作る",
    description: "シーンへ3Dアセットを配置し、見たまま空間を組み立てます。",
    detail: "専用のScene・Asset JSONが制作データです。",
    example: "my-visual-world",
    KindIcon: Globe2,
    MethodIcon: PanelsTopLeft,
  },
  {
    id: "item-visual",
    kind: "item",
    method: "visual",
    title: "アイテムをビジュアルで作る",
    description: "モデル、マテリアル、振る舞いを専用エディターで設定します。",
    detail: "専用のScene・Asset JSONが制作データです。",
    example: "my-visual-item",
    KindIcon: Box,
    MethodIcon: PanelsTopLeft,
  },
];

function StarterScenePreview({
  templateId,
  selected,
}: {
  templateId: VisualStarterTemplateId;
  selected: boolean;
}) {
  const iconClass = selected ? "text-brand-700" : "text-zinc-600";
  const surfaceClass = selected
    ? "border-brand-200 bg-brand-100/70"
    : "border-zinc-200 bg-white/90";

  if (templateId === "blank") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2.5 px-5" aria-hidden="true">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-lg border ${surfaceClass}`}>
            <LayoutGrid size={20} className={iconClass} />
          </span>
          <span className={`flex h-8 w-8 items-center justify-center rounded-full border ${surfaceClass}`}>
            <Lightbulb size={16} className={iconClass} />
          </span>
          <span className={`flex h-8 w-8 items-center justify-center rounded-full border ${surfaceClass}`}>
            <CircleDot size={16} className={iconClass} />
          </span>
        </div>
        <span className="text-[10px] font-medium tracking-wide text-zinc-500">
          床・ライト・スポーン
        </span>
      </div>
    );
  }

  if (templateId === "social-space") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-5" aria-hidden="true">
        <div className="flex items-center gap-2.5">
          <CircleDot size={17} className="text-zinc-400" />
          <span className={`relative flex h-12 w-12 items-center justify-center rounded-xl border ${surfaceClass}`}>
            <Cuboid size={24} className={iconClass} />
            <Sparkles size={13} className="absolute -right-1 -top-1 text-amber-500" />
          </span>
          <CircleDot size={17} className="text-zinc-400" />
        </div>
        <span className="text-[10px] font-medium tracking-wide text-zinc-500">
          中央展示・交流マーカー
        </span>
      </div>
    );
  }

  if (templateId === "gallery") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2.5 px-4" aria-hidden="true">
        <div className="grid w-full max-w-[180px] grid-cols-3 gap-2">
          {[Cuboid, Package, Cuboid].map((PreviewIcon, index) => (
            <span
              key={index}
              className={`flex h-12 items-center justify-center rounded-md border border-b-2 ${surfaceClass}`}
            >
              <PreviewIcon size={index === 1 ? 22 : 19} className={iconClass} />
            </span>
          ))}
        </div>
        <span className="text-[10px] font-medium tracking-wide text-zinc-500">
          モデル展示ギャラリー
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-5" aria-hidden="true">
      <span className={`relative flex h-12 w-12 items-center justify-center rounded-xl border ${surfaceClass}`}>
        <Package size={25} className={iconClass} />
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-zinc-100 bg-white">
          <CircleDot size={12} className="text-brand-600" />
        </span>
      </span>
      <span className="text-[10px] font-medium tracking-wide text-zinc-500">
        アイテム・マテリアル
      </span>
    </div>
  );
}

export function NewProjectDialog({
  open,
  busy,
  onClose,
  onCreate,
  onOpenVisualEditor,
}: Props) {
  const [choiceId, setChoiceId] = useState<CreationChoice["id"] | null>(null);
  const [name, setName] = useState("");
  const [starterTemplateId, setStarterTemplateId] =
    useState<VisualStarterTemplateId>("blank");

  useEffect(() => {
    if (!open) return;
    setChoiceId(null);
    setName("");
    setStarterTemplateId("blank");
  }, [open]);

  const choice = useMemo(
    () => creationChoices.find((candidate) => candidate.id === choiceId) ?? null,
    [choiceId],
  );
  const valid = /^[a-z0-9][a-z0-9-]*$/.test(name);
  const starterTemplates =
    choice?.method === "visual"
      ? choice.kind === "world"
        ? STARTER_WORLD_TEMPLATES
        : STARTER_ITEM_TEMPLATES
      : [];
  const starterSelected = starterTemplates.some(
    (template) => template.id === starterTemplateId,
  );

  if (!open) return null;

  const createSelectedProject = () => {
    if (!choice || !valid || busy) return;
    if (choice.method === "visual") {
      if (!starterSelected) return;
      onOpenVisualEditor(choice.kind, name, starterTemplateId);
      return;
    }
    onCreate(choice.kind, name);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-sm animate-fade-in"
      onClick={() => !busy && onClose()}
    >
      <div
        className="max-h-[calc(100vh-2rem)] w-full max-w-[980px] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-brand-lg animate-scale-in"
        onClick={(event) => event.stopPropagation()}
      >
        {choice ? (
          <>
            <button
              type="button"
              onClick={() => !busy && setChoiceId(null)}
              disabled={busy}
              className="mb-4 flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-50"
            >
              <ArrowLeft size={15} strokeWidth={2} />
              4つの作り方へ戻る
            </button>
            <div className="flex items-start gap-3">
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <choice.KindIcon size={22} strokeWidth={1.9} />
                <choice.MethodIcon
                  size={13}
                  strokeWidth={2.2}
                  className="absolute -bottom-1 -right-1 rounded-md border-2 border-white bg-white p-0.5"
                />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">{choice.title}</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-500">{choice.description}</p>
                <p className="mt-1 text-xs text-zinc-400">{choice.detail}</p>
              </div>
            </div>

            {choice.method === "visual" && (
              <fieldset className="mt-6">
                <legend className="text-sm font-medium text-zinc-700">
                  最初のシーン
                </legend>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  作成後は、すべての配置とマテリアルをエディターで変更できます。
                </p>
                <div
                  className={`mt-3 grid gap-3 ${
                    choice.kind === "world" ? "sm:grid-cols-3" : "max-w-sm"
                  }`}
                  role="radiogroup"
                  aria-label={`${choice.kind === "world" ? "ワールド" : "アイテム"}のスターター`}
                >
                  {starterTemplates.map((template) => {
                    const selected = template.id === starterTemplateId;
                    const recommended = template.id === "blank";
                    return (
                      <button
                        key={template.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() =>
                          setStarterTemplateId(
                            template.id as VisualStarterTemplateId,
                          )
                        }
                        disabled={busy}
                        className={`overflow-hidden rounded-xl border text-left transition disabled:opacity-50 ${
                          selected
                            ? "border-brand-500 bg-brand-50/50 ring-2 ring-brand-100"
                            : "border-zinc-200 bg-white hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm"
                        }`}
                      >
                        <div
                          className={`relative aspect-[16/9] overflow-hidden border-b ${
                            selected
                              ? "border-brand-200 bg-gradient-to-b from-brand-50 to-zinc-100"
                              : "border-zinc-200 bg-gradient-to-b from-zinc-50 to-zinc-100"
                          }`}
                        >
                          <StarterScenePreview
                            templateId={template.id as VisualStarterTemplateId}
                            selected={selected}
                          />
                          {recommended && (
                            <span className="absolute left-2 top-2 rounded-full border border-white/80 bg-white/95 px-2 py-1 text-[10px] font-semibold text-brand-700 shadow-sm">
                              おすすめ
                            </span>
                          )}
                          {selected && (
                            <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm">
                              <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                            </span>
                          )}
                        </div>
                        <div className="p-3">
                          <div className="text-sm font-semibold text-zinc-900">
                            {template.name}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-zinc-500">
                            {template.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <label className="mt-6 block">
              <span className="text-sm font-medium text-zinc-700">プロジェクト名</span>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") createSelectedProject();
                }}
                placeholder={choice.example}
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </label>
            {!valid && name.length > 0 && (
              <div className="mt-2 text-sm text-amber-700">
                先頭を小文字英数字にし、小文字英数字とハイフンだけを使ってください。
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={createSelectedProject}
                disabled={!valid || busy || (choice.method === "visual" && !starterSelected)}
                className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50"
              >
                {busy ? "作成中…" : "作成して開く"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-zinc-900">新しいプロジェクトを作る</h2>
            <p className="mt-1 text-sm text-zinc-500">
              作るものと制作方法の組み合わせを選んでください。制作方法はプロジェクトごとに独立しています。
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {creationChoices.map((candidate) => {
                const { KindIcon, MethodIcon } = candidate;
                const visual = candidate.method === "visual";
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => {
                      setChoiceId(candidate.id);
                      if (candidate.method === "visual") {
                        setStarterTemplateId(
                          defaultVisualStarterTemplateId(candidate.kind),
                        );
                      }
                    }}
                    disabled={busy}
                    className="group rounded-xl border border-zinc-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-sm disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 transition group-hover:bg-brand-100 group-hover:text-brand-700">
                        <KindIcon size={20} strokeWidth={1.9} />
                        <MethodIcon
                          size={12}
                          strokeWidth={2.2}
                          className="absolute -bottom-1 -right-1 rounded border-2 border-white bg-white p-0.5"
                        />
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-600">
                        {visual ? "ビジュアル" : "クラシック"}
                      </span>
                    </div>
                    <div className="mt-4 text-base font-semibold text-zinc-900">
                      {candidate.title}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-zinc-500">
                      {candidate.description}
                    </p>
                    <p className="mt-3 text-xs text-zinc-400">{candidate.detail}</p>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                キャンセル
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
