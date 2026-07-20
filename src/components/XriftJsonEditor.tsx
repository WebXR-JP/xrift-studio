import { useCallback, useEffect, useState } from "react";
import { Save, Code2, RefreshCw, Info } from "lucide-react";
import { tauri, type ProjectKind } from "../lib/tauri";
import { useToast } from "./Toast";

type Props = {
  projectPath: string;
  projectKind: ProjectKind;
  onOpenRaw: () => void;
  onRefresh?: () => void;
  onSaved?: () => void;
  publishPreparation?: boolean;
};

type Form = {
  title: string;
  description: string;
  thumbnailPath: string;
  distDir: string;
  buildCommand: string;
  gravity: number;
  allowInfiniteJump: boolean;
  cameraNear: number;
  cameraFar: number;
  allowedDomains: string;
  allowedCodeRules: string;
};

const DEFAULTS: Form = {
  title: "",
  description: "",
  thumbnailPath: "thumbnail.png",
  distDir: "./dist",
  buildCommand: "npm run build",
  gravity: 9.81,
  allowInfiniteJump: true,
  cameraNear: 0.1,
  cameraFar: 1000,
  allowedDomains: "",
  allowedCodeRules: "",
};

function toCommaSeparated(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").join(", ")
    : "";
}

function fromJson(
  raw: string,
  projectKind: ProjectKind,
): { form: Form; parsed: any } | null {
  try {
    const parsed = JSON.parse(raw);
    const config = parsed?.[projectKind] ?? {};
    return {
      parsed,
      form: {
        title: config.title ?? "",
        description: config.description ?? "",
        thumbnailPath: config.thumbnailPath ?? DEFAULTS.thumbnailPath,
        distDir: config.distDir ?? DEFAULTS.distDir,
        buildCommand: config.buildCommand ?? DEFAULTS.buildCommand,
        gravity:
          typeof config.physics?.gravity === "number"
            ? config.physics.gravity
            : DEFAULTS.gravity,
        allowInfiniteJump:
          typeof config.physics?.allowInfiniteJump === "boolean"
            ? config.physics.allowInfiniteJump
            : DEFAULTS.allowInfiniteJump,
        cameraNear:
          typeof config.camera?.near === "number" ? config.camera.near : DEFAULTS.cameraNear,
        cameraFar:
          typeof config.camera?.far === "number" ? config.camera.far : DEFAULTS.cameraFar,
        allowedDomains: toCommaSeparated(config.permissions?.allowedDomains),
        allowedCodeRules: toCommaSeparated(config.permissions?.allowedCodeRules),
      },
    };
  } catch {
    return null;
  }
}

export function XriftJsonEditor({
  projectPath,
  projectKind,
  onOpenRaw,
  onRefresh,
  onSaved,
  publishPreparation = false,
}: Props) {
  const toast = useToast();
  const projectLabel = projectKind === "item" ? "アイテム" : "ワールド";
  const [form, setForm] = useState<Form>(DEFAULTS);
  const [saved, setSaved] = useState<Form>(DEFAULTS);
  const [parsed, setParsed] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await tauri.readTextFile(projectPath, "xrift.json");
      const result = fromJson(raw, projectKind);
      if (!result) {
        setError("xrift.json の JSON を解析できませんでした。「raw JSON で編集」を試してください。");
      } else {
        setForm(result.form);
        setSaved(result.form);
        setParsed(result.parsed);
      }
    } catch (e) {
      setError(`${e}`);
    } finally {
      setLoading(false);
    }
  }, [projectPath, projectKind]);

  useEffect(() => {
    load();
  }, [load]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(saved);

  const handleSave = async () => {
    setSaving(true);
    try {
      const base = parsed ?? {};
      const current = base[projectKind] ?? {};
      const shared = {
        ...current,
        title: form.title || undefined,
        description: form.description || undefined,
        thumbnailPath: form.thumbnailPath || DEFAULTS.thumbnailPath,
        distDir: form.distDir || DEFAULTS.distDir,
        buildCommand: form.buildCommand || DEFAULTS.buildCommand,
      };
      const projectConfig =
        projectKind === "world"
          ? {
              ...shared,
              physics: {
                ...(current.physics ?? {}),
                gravity: form.gravity,
                allowInfiniteJump: form.allowInfiniteJump,
              },
              camera: {
                ...(current.camera ?? {}),
                near: form.cameraNear,
                far: form.cameraFar,
              },
            }
          : {
              ...shared,
              permissions: {
                ...(current.permissions ?? {}),
                allowedDomains: form.allowedDomains
                  .split(",")
                  .map((domain) => domain.trim())
                  .filter(Boolean),
                allowedCodeRules: form.allowedCodeRules
                  .split(",")
                  .map((rule) => rule.trim())
                  .filter(Boolean),
              },
            };
      const updated = {
        ...base,
        [projectKind]: projectConfig,
      };
      const text = JSON.stringify(updated, null, 2) + "\n";
      await tauri.writeTextFile(projectPath, "xrift.json", text);
      setSaved(form);
      setParsed(updated);
      toast({ kind: "success", title: `${projectLabel}設定を保存しました` });
      onRefresh?.();
      onSaved?.();
    } catch (e) {
      toast({ kind: "error", title: "保存に失敗しました", description: `${e}` });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isDirty && !saving) handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, saving, form]);

  if (loading) {
    return (
      <section className="flex flex-1 items-center justify-center bg-white text-sm text-zinc-400">
        読み込み中…
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-3 bg-white p-8 text-sm">
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          <div className="font-medium">xrift.json を読めませんでした</div>
          <div className="mt-1 font-mono text-[11px]">{error}</div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
          >
            <RefreshCw size={12} strokeWidth={2} />
            再試行
          </button>
          <button
            type="button"
            onClick={onOpenRaw}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
          >
            <Code2 size={12} strokeWidth={2} />
            raw JSON で編集
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 min-h-0 flex-col bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-700">xrift.json</span>
          {isDirty && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="未保存" />
          )}
          <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-700">
            {projectLabel}設定
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenRaw}
            className="flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50"
            title="raw JSON として開く"
          >
            <Code2 size={11} strokeWidth={2} />
            JSON
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-violet-500 disabled:opacity-40"
          >
            <Save size={11} strokeWidth={2.25} />
            保存 (⌘/Ctrl+S)
          </button>
        </div>
      </div>

      {publishPreparation && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800">
          公開準備中です。タイトルと説明を保存すると、次の確認項目へ進みます。
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
          <Section
            title="基本情報"
            hint={`XRift の${projectLabel}一覧で表示されるタイトルと説明文です。アップロード時のデフォルト値として使われます。`}
          >
            <Field label="タイトル" hint={`XRift の${projectLabel}カードに表示されます`}>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={projectKind === "item" ? "My XR Item" : "My XR World"}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </Field>
            <Field label="説明" hint="複数行可。マークダウンは非対応。">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder={`どんな${projectLabel}か簡単に説明しましょう`}
                className="w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </Field>
            <Field label="サムネイル" hint="distDir からの相対パス。通常 public/thumbnail.png がビルドで dist/ に配置される。">
              <input
                type="text"
                value={form.thumbnailPath}
                onChange={(e) => setForm({ ...form, thumbnailPath: e.target.value })}
                placeholder="thumbnail.png"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-[12px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </Field>
          </Section>

          <Section title="ビルド">
            <Field label="出力ディレクトリ" hint="ビルド成果物の出力先。通常は ./dist。">
              <input
                type="text"
                value={form.distDir}
                onChange={(e) => setForm({ ...form, distDir: e.target.value })}
                placeholder="./dist"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-[12px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </Field>
            <Field label="ビルドコマンド" hint={`xrift upload ${projectKind} 実行前に自動実行されます。`}>
              <input
                type="text"
                value={form.buildCommand}
                onChange={(e) => setForm({ ...form, buildCommand: e.target.value })}
                placeholder="npm run build"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-[12px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </Field>
          </Section>

          {projectKind === "world" ? (
            <>
              <Section title="物理">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="重力 (gravity)" hint="地球: 9.81 / 月: 1.62">
                    <input
                      type="number"
                      step="0.01"
                      value={form.gravity}
                      onChange={(e) => setForm({ ...form, gravity: Number(e.target.value) })}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                    />
                  </Field>
                  <Field label="無限ジャンプ" hint="ON で空中でもジャンプ可能（デモ向き）">
                    <label className="inline-flex cursor-pointer items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        checked={form.allowInfiniteJump}
                        onChange={(e) =>
                          setForm({ ...form, allowInfiniteJump: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-sm text-zinc-700">
                        {form.allowInfiniteJump ? "有効" : "無効"}
                      </span>
                    </label>
                  </Field>
                </div>
              </Section>

              <Section title="カメラ">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="near" hint="これより近いオブジェクトは描画されない">
                    <input
                      type="number"
                      step="0.01"
                      value={form.cameraNear}
                      onChange={(e) => setForm({ ...form, cameraNear: Number(e.target.value) })}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                    />
                  </Field>
                  <Field label="far" hint="これより遠いオブジェクトは描画されない">
                    <input
                      type="number"
                      step="1"
                      value={form.cameraFar}
                      onChange={(e) => setForm({ ...form, cameraFar: Number(e.target.value) })}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                    />
                  </Field>
                </div>
              </Section>
            </>
          ) : (
            <Section
              title="権限"
              hint="アイテムが外部サービスや特別な API を使う場合だけ設定します。審査時に考慮されます。"
            >
              <Field label="許可するドメイン" hint="カンマ区切り。例: api.example.com, cdn.example.com">
                <input
                  type="text"
                  value={form.allowedDomains}
                  onChange={(e) => setForm({ ...form, allowedDomains: e.target.value })}
                  placeholder="api.example.com, cdn.example.com"
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-[12px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
              </Field>
              <Field label="緩和するコードルール" hint="カンマ区切り。必要な場合だけ指定します。">
                <input
                  type="text"
                  value={form.allowedCodeRules}
                  onChange={(e) => setForm({ ...form, allowedCodeRules: e.target.value })}
                  placeholder="no-network-without-permission"
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-[12px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
              </Field>
            </Section>
          )}

          <div className="flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-[11px] text-brand-900">
            <Info size={13} className="mt-0.5 shrink-0 text-brand-600" strokeWidth={2} />
            <div>
              より詳細な設定（ignore パターンなど）は「JSON」ボタンから raw 編集できます。このフォームで管理していない項目は保存時に保持されます。
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 border-b border-zinc-100 pb-1.5">
        <div className="text-[13px] font-semibold text-zinc-800">{title}</div>
        {hint && <div className="mt-0.5 text-[11px] text-zinc-500">{hint}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label className="text-[12px] font-medium text-zinc-700">{label}</label>
        {hint && <span className="text-[10px] text-zinc-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
