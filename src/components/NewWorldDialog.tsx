import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
};

export function NewWorldDialog({ open, busy, onClose, onCreate }: Props) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  if (!open) return null;

  const valid = /^[a-z0-9][a-z0-9-]*$/i.test(name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 backdrop-blur-sm">
      <div className="w-[440px] rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-zinc-900">新規ワールドを作成</h2>
        <p className="mt-1 text-sm text-zinc-500">
          プロジェクト名を入力してください。半角英数字とハイフンが使えます。
        </p>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-first-world"
          className="mt-4 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
        />
        {!valid && name.length > 0 && (
          <div className="mt-2 text-xs text-amber-700">
            小文字英数字とハイフンのみ使用できます。
          </div>
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
            onClick={() => valid && onCreate(name)}
            disabled={!valid || busy}
            className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 disabled:opacity-50"
          >
            {busy ? "作成中…" : "作成"}
          </button>
        </div>
      </div>
    </div>
  );
}
