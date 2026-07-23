import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Box,
  Check,
  CircleDot,
  Code2,
  FolderOpen,
  Globe2,
  GitBranch,
  LayoutGrid,
  Lightbulb,
  Package,
  Paintbrush,
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
import { OFFICIAL_XRIFT_WORLD_TEMPLATE_THUMBNAIL } from "../lib/visual-editor/official-world-template-import";
import type { ClassicProjectCreationSource } from "../lib/visual-editor/classic-project-creation";

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
  onImportClassicProject: (
    kind: ProjectKind,
    name: string,
    source: ClassicProjectCreationSource,
  ) => void;
  onSelectClassicProjectDirectory: (
    kind: ProjectKind,
  ) => Promise<string | null>;
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

const CLASSIC_REPOSITORY_STARTER_ID = "classic-repository";
type ClassicImportMethod = "directory" | "repository";
type StarterSelectionId =
  | VisualStarterTemplateId
  | typeof CLASSIC_REPOSITORY_STARTER_ID;

function isValidClassicRepositoryUrl(value: string): boolean {
  const url = value.trim();
  return (
    url.startsWith("https://") ||
    url.startsWith("ssh://git@") ||
    /^git@[^:\s]+:.+/.test(url)
  );
}

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

  if (templateId === "xrift-official") {
    return (
      <div className="relative h-full overflow-hidden bg-zinc-950" aria-hidden="true">
        <img
          src={OFFICIAL_XRIFT_WORLD_TEMPLATE_THUMBNAIL}
          alt=""
          loading="eager"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/80 to-transparent px-3 pb-2.5 pt-8 text-[10px] font-semibold tracking-wide text-white">
          公式Classic JSXから変換
        </div>
      </div>
    );
  }

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

  if (templateId === "openbrush") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-5" aria-hidden="true">
        <div className="flex items-center gap-3">
          <Sparkles size={16} className="text-amber-500" />
          <span className={`relative flex h-12 w-12 items-center justify-center rounded-xl border ${surfaceClass}`}>
            <Paintbrush size={24} className={iconClass} />
            <span className="absolute -bottom-1 -right-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[8px] font-bold text-white">
              48
            </span>
          </span>
          <Sparkles size={16} className="text-fuchsia-500" />
        </div>
        <span className="text-[10px] font-medium tracking-wide text-zinc-500">
          three-icosa ブラシシェーダー
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
  onImportClassicProject,
  onSelectClassicProjectDirectory,
}: Props) {
  const [choiceId, setChoiceId] = useState<CreationChoice["id"] | null>(null);
  const [name, setName] = useState("");
  const [starterTemplateId, setStarterTemplateId] =
    useState<StarterSelectionId>(
      defaultVisualStarterTemplateId("world"),
    );
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [classicImportMethod, setClassicImportMethod] =
    useState<ClassicImportMethod>("directory");
  const [classicProjectPath, setClassicProjectPath] = useState("");
  const [classicProjectSelectBusy, setClassicProjectSelectBusy] =
    useState(false);
  const [classicProjectSelectError, setClassicProjectSelectError] =
    useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChoiceId(null);
    setName("");
    setStarterTemplateId(defaultVisualStarterTemplateId("world"));
    setRepositoryUrl("");
    setClassicImportMethod("directory");
    setClassicProjectPath("");
    setClassicProjectSelectBusy(false);
    setClassicProjectSelectError(null);
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
  const importingClassic =
    choice?.method === "visual" &&
    starterTemplateId === CLASSIC_REPOSITORY_STARTER_ID;
  const repositoryUrlValid = isValidClassicRepositoryUrl(repositoryUrl);
  const classicSourceValid =
    classicImportMethod === "directory"
      ? classicProjectPath.length > 0
      : repositoryUrlValid;
  const interactionBusy = busy || classicProjectSelectBusy;
  const starterSelected =
    importingClassic ||
    starterTemplates.some((template) => template.id === starterTemplateId);

  if (!open) return null;

  const createSelectedProject = () => {
    if (!choice || !valid || interactionBusy) return;
    if (choice.method === "visual") {
      if (!starterSelected) return;
      if (importingClassic) {
        if (!classicSourceValid) return;
        onImportClassicProject(
          choice.kind,
          name,
          classicImportMethod === "directory"
            ? {
                kind: "directory",
                projectPath: classicProjectPath,
              }
            : {
                kind: "repository",
                repositoryUrl: repositoryUrl.trim(),
              },
        );
        return;
      }
      onOpenVisualEditor(
        choice.kind,
        name,
        starterTemplateId as VisualStarterTemplateId,
      );
      return;
    }
    onCreate(choice.kind, name);
  };

  const selectClassicProjectDirectory = async () => {
    if (
      !choice ||
      choice.method !== "visual" ||
      classicProjectSelectBusy ||
      busy
    ) {
      return;
    }
    setClassicProjectSelectBusy(true);
    setClassicProjectSelectError(null);
    try {
      const selected = await onSelectClassicProjectDirectory(choice.kind);
      if (selected) setClassicProjectPath(selected);
    } catch (error) {
      setClassicProjectSelectError(
        error instanceof Error
          ? error.message
          : "Classicプロジェクトのフォルダーを選択できませんでした。",
      );
    } finally {
      setClassicProjectSelectBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-sm animate-fade-in"
      onClick={() => !interactionBusy && onClose()}
    >
      <div
        className="max-h-[calc(100vh-2rem)] w-full max-w-[980px] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-brand-lg animate-scale-in"
        onClick={(event) => event.stopPropagation()}
      >
        {choice ? (
          <>
            <button
              type="button"
              onClick={() => !interactionBusy && setChoiceId(null)}
              disabled={interactionBusy}
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
                  最初のシーンとAssets
                </legend>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  配置済みのシーンと再利用できる素材をまとめて用意します。作成後はすべて編集できます。
                </p>
                <div
                  className={`mt-3 grid gap-3 ${
                    choice.kind === "world"
                      ? "sm:grid-cols-2 lg:grid-cols-4"
                      : "sm:grid-cols-2"
                  }`}
                  role="radiogroup"
                  aria-label={`${choice.kind === "world" ? "ワールド" : "アイテム"}のスターター`}
                >
                  {starterTemplates.map((template) => {
                    const selected = template.id === starterTemplateId;
                    const recommended =
                      template.id ===
                      defaultVisualStarterTemplateId(choice.kind);
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
                        disabled={interactionBusy}
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
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                            <Package size={12} aria-hidden="true" />
                            {template.id === "xrift-official"
                              ? "公式R3F / Rapierから変換"
                              : template.bundledAssetIds.length > 0
                              ? `${template.bundledAssetIds.length}個の素材をAssetsへ追加`
                              : "基本オブジェクトのみ"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={importingClassic}
                    onClick={() =>
                      setStarterTemplateId(CLASSIC_REPOSITORY_STARTER_ID)
                    }
                    disabled={interactionBusy}
                    className={`overflow-hidden rounded-xl border text-left transition disabled:opacity-50 ${
                      importingClassic
                        ? "border-brand-500 bg-brand-50/50 ring-2 ring-brand-100"
                        : "border-zinc-200 bg-white hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm"
                    }`}
                  >
                    <div
                      className={`relative flex aspect-[16/9] items-center justify-center overflow-hidden border-b ${
                        importingClassic
                          ? "border-brand-200 bg-brand-100/70"
                          : "border-zinc-200 bg-zinc-50"
                      }`}
                    >
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-xl border bg-white ${
                          importingClassic
                            ? "border-brand-300 text-brand-700"
                            : "border-zinc-200 text-zinc-600"
                        }`}
                      >
                        <FolderOpen size={24} aria-hidden="true" />
                      </span>
                      {importingClassic && (
                        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm">
                          <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-semibold text-zinc-900">
                        XRift Classicからインポート
                      </div>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        プロジェクトまたはRepositoryをVisualへ変換します。
                      </p>
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                        <FolderOpen size={12} aria-hidden="true" />
                        コードは実行せず静的に解析
                      </div>
                    </div>
                  </button>
                </div>
                {importingClassic && (
                  <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
                    <div
                      className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1"
                      role="tablist"
                      aria-label="Classicプロジェクトの読み込み元"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={classicImportMethod === "directory"}
                        onClick={() => {
                          setClassicImportMethod("directory");
                          setClassicProjectSelectError(null);
                        }}
                        disabled={interactionBusy}
                        className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
                          classicImportMethod === "directory"
                            ? "bg-white text-brand-700 shadow-sm"
                            : "text-zinc-600 hover:text-zinc-900"
                        }`}
                      >
                        <FolderOpen size={15} aria-hidden="true" />
                        プロジェクトフォルダー
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={classicImportMethod === "repository"}
                        onClick={() => {
                          setClassicImportMethod("repository");
                          setClassicProjectSelectError(null);
                        }}
                        disabled={interactionBusy}
                        className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
                          classicImportMethod === "repository"
                            ? "bg-white text-brand-700 shadow-sm"
                            : "text-zinc-600 hover:text-zinc-900"
                        }`}
                      >
                        <GitBranch size={15} aria-hidden="true" />
                        Repository URL
                      </button>
                    </div>

                    {classicImportMethod === "directory" ? (
                      <div className="mt-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-zinc-700">
                              Classicプロジェクト
                            </div>
                            <p className="mt-1 text-xs text-zinc-500">
                              package.json、xrift.json、srcがあるフォルダーを選択します。
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void selectClassicProjectDirectory()}
                            disabled={interactionBusy}
                            className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 hover:border-brand-300 hover:bg-white disabled:opacity-50"
                          >
                            {classicProjectSelectBusy
                              ? "選択中…"
                              : classicProjectPath
                                ? "選び直す"
                                : "フォルダーを選ぶ"}
                          </button>
                        </div>
                        <div
                          className={`mt-3 rounded-lg border px-3 py-2.5 text-xs ${
                            classicProjectPath
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-zinc-200 bg-white text-zinc-500"
                          }`}
                        >
                          {classicProjectPath ? (
                            <>
                              <div className="font-semibold">選択済み</div>
                              <div className="mt-1 break-all font-mono">
                                {classicProjectPath}
                              </div>
                            </>
                          ) : (
                            "まだプロジェクトフォルダーが選択されていません。"
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4">
                        <label className="block">
                          <span className="text-sm font-medium text-zinc-700">
                            Classic Repository URL
                          </span>
                          <input
                            type="url"
                            value={repositoryUrl}
                            onChange={(event) =>
                              setRepositoryUrl(event.currentTarget.value)
                            }
                            disabled={interactionBusy}
                            placeholder="https://github.com/owner/repository.git"
                            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 font-mono text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:opacity-50"
                          />
                        </label>
                        <p className="mt-2 text-xs leading-5 text-zinc-500">
                          HTTPSまたはgit SSH URLに対応します。
                        </p>
                        {repositoryUrl.length > 0 && !repositoryUrlValid && (
                          <p className="mt-2 text-sm text-amber-700">
                            HTTPSまたはgit SSH形式のRepository URLを入力してください。
                          </p>
                        )}
                      </div>
                    )}
                    <p className="mt-3 text-xs leading-5 text-zinc-500">
                      同種のentryを検査し、対応できない動的処理は変換しません。
                    </p>
                    {classicProjectSelectError && (
                      <p className="mt-2 text-sm text-rose-700">
                        {classicProjectSelectError}
                      </p>
                    )}
                  </div>
                )}
              </fieldset>
            )}

            <label className="mt-6 block">
              <span className="text-sm font-medium text-zinc-700">プロジェクト名</span>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={interactionBusy}
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
                disabled={interactionBusy}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={createSelectedProject}
                disabled={
                  !valid ||
                  interactionBusy ||
                  (choice.method === "visual" &&
                    (!starterSelected ||
                      (importingClassic && !classicSourceValid)))
                }
                className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50"
              >
                {busy
                  ? importingClassic
                    ? "読み込み・変換中…"
                    : "作成中…"
                  : importingClassic
                    ? "インポートして開く"
                    : "作成して開く"}
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
                    disabled={interactionBusy}
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
                disabled={interactionBusy}
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
