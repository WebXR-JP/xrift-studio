import { useEffect, useRef, useState } from "react";
import { getBackend } from "../lib/backend";

type Props = {
  projectPath: string;
  onChanged?: () => void;
};

export function ThumbnailEditor({ projectPath, onChanged }: Props) {
  const backend = getBackend();
  const [thumb, setThumb] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const t = await backend.readThumbnail(projectPath);
      setThumb(t);
    } catch (e) {
      setError(`${e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  const fileToPngDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const target = 1024;
          const ratio = Math.min(target / img.width, target / img.height);
          const w = Math.round(img.width * ratio);
          const h = Math.round(img.height * ratio);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("canvas context failed"));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => reject(new Error("image decode failed"));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error("file read failed"));
      reader.readAsDataURL(file);
    });

  const onPick = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選んでください");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const dataUrl = await fileToPngDataUrl(file);
      await backend.writeThumbnail(projectPath, dataUrl);
      setThumb(dataUrl);
      onChanged?.();
    } catch (e) {
      setError(`${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2">
        <div className="text-xs font-medium text-zinc-700">public/thumbnail.png</div>
        <div className="mt-0.5 text-[11px] text-zinc-500">
          ワールド一覧やXRift上で表示されるサムネイル画像（推奨: 1024×576 以上）
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        <div className="w-full max-w-2xl">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onPick(e.dataTransfer.files?.[0]);
            }}
            className={`group relative aspect-video w-full overflow-hidden rounded-xl border-2 ${
              dragOver
                ? "border-violet-500 bg-violet-50"
                : "border-dashed border-zinc-300 bg-zinc-100"
            }`}
          >
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                読み込み中…
              </div>
            ) : thumb ? (
              <>
                <img src={thumb} alt="thumbnail" className="h-full w-full object-cover" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                  <span className="rounded-md bg-white/90 px-3 py-1.5 text-sm font-medium text-zinc-900">
                    クリック / ドロップで差し替え
                  </span>
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-400">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <div className="text-sm">サムネイル未設定</div>
                <div className="text-[11px]">ドラッグ&ドロップ または下のボタンから画像を追加</div>
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="サムネイルを変更"
            />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              {saving ? "保存中…" : "画像を選択"}
            </button>
            {thumb && (
              <button
                type="button"
                onClick={reload}
                disabled={saving}
                className="text-xs text-zinc-500 hover:text-zinc-700"
              >
                再読み込み
              </button>
            )}
          </div>

          {error && (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
