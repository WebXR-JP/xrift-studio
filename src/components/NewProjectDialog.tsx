import { useEffect, useState } from "react";
import { Box, Globe2, ArrowLeft } from "lucide-react";
import type { ProjectKind } from "../lib/tauri";

type Props = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (kind: ProjectKind, name: string) => void;
};

const projectTypes: Array<{
  kind: ProjectKind;
  title: string;
  description: string;
  example: string;
  Icon: typeof Globe2;
}> = [
  {
    kind: "world",
    title: "ワールド",
    description: "人が集まり、歩き回れる XR 空間を作ります。",
    example: "my-first-world",
    Icon: Globe2,
  },
  {
    kind: "item",
    title: "アイテム",
    description: "ワールドに配置して使える再利用可能な 3D コンポーネントを作ります。",
    example: "my-first-item",
    Icon: Box,
  },
];

export function NewProjectDialog({ open, busy, onClose, onCreate }: Props) {
  const [kind, setKind] = useState<ProjectKind | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) {
      setKind(null);
      setName("");
    }
  }, [open]);

  if (!open) return null;

  const selected = projectTypes.find((type) => type.kind === kind);
  const valid = /^[a-z0-9][a-z0-9-]*$/.test(name);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-sm animate-fade-in"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-[680px] rounded-2xl border border-zinc-200 bg-white p-6 shadow-brand-lg animate-scale-in"
        onClick={(event) => event.stopPropagation()}
      >
        {selected ? (
          <>
            <button
              type="button"
              onClick={() => !busy && setKind(null)}
              disabled={busy}
              className="mb-4 flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-50"
            >
              <ArrowLeft size={13} strokeWidth={2} />
              種別を選び直す
            </button>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <selected.Icon size={20} strokeWidth={1.9} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">新しい{selected.title}を作る</h2>
                <p className="mt-0.5 text-sm text-zinc-500">{selected.description}</p>
              </div>
            </div>
            <label className="mt-6 block">
              <span className="text-xs font-medium text-zinc-700">プロジェクト名</span>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={selected.example}
                className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </label>
            {!valid && name.length > 0 && (
              <div className="mt-2 text-xs text-amber-700">小文字英数字とハイフンのみ使用できます。</div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => valid && onCreate(selected.kind, name)}
                disabled={!valid || busy}
                className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50"
              >
                {busy ? "作成中…" : `${selected.title}を作成`}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-zinc-900">新しいプロジェクトを作る</h2>
            <p className="mt-1 text-sm text-zinc-500">何を作り始めますか？ テンプレートを用意してエディターを開きます。</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {projectTypes.map((type) => {
                const Icon = type.Icon;
                return (
                  <button
                    key={type.kind}
                    type="button"
                    onClick={() => setKind(type.kind)}
                    className="group rounded-xl border border-zinc-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-sm"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 transition group-hover:bg-brand-100 group-hover:text-brand-700">
                      <Icon size={20} strokeWidth={1.9} />
                    </span>
                    <div className="mt-4 text-sm font-semibold text-zinc-900">{type.title}</div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{type.description}</p>
                    <span className="mt-4 inline-block text-xs font-medium text-brand-700">この{type.title}を作る</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
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
