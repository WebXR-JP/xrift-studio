import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ImagePlus } from "lucide-react";
import { tauri, type ProjectKind } from "../lib/tauri";
import {
  announceProjectThumbnailChanged,
  imageDataUrlToPng,
} from "../lib/project-thumbnail";

type Props = {
  projectPath: string;
  projectKind: ProjectKind;
  onChanged?: () => void;
  publishPreparation?: boolean;
};

export function ThumbnailEditor({
  projectPath,
  projectKind,
  onChanged,
  publishPreparation = false,
}: Props) {
  const projectLabel = projectKind === "item" ? "アイテム" : "ワールド";
  const recommendedSize = projectKind === "item" ? "512×512" : "1024×576 以上";
  const [thumb, setThumb] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const t = await tauri.readThumbnail(projectPath);
      setThumb(t);
      setJustSaved(false);
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

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("画像ファイルを読み込めませんでした"));
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
    setJustSaved(false);
    try {
      const dataUrl = await imageDataUrlToPng(await fileToDataUrl(file));
      await tauri.writeThumbnail(projectPath, dataUrl);
      setThumb(dataUrl);
      setJustSaved(true);
      announceProjectThumbnailChanged();
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
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-zinc-700">public/thumbnail.png</div>
          {thumb && !loading ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 size={12} aria-hidden="true" />
              設定済み
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 text-xs text-zinc-500">
          {projectLabel}一覧やXRift上で表示されるサムネイル画像（推奨: {recommendedSize}）
        </div>
        {publishPreparation && (
          <div className="mt-1 text-xs text-amber-800">
            公開準備中です。画像を保存すると、公開前の確認を続けます。
          </div>
        )}
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
                <ImagePlus size={48} strokeWidth={1.5} aria-hidden="true" />
                <div className="text-sm">サムネイル未設定</div>
                <div className="text-xs">ドラッグ&ドロップ または下のボタンから画像を追加</div>
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
          {justSaved && (
            <div
              className="mt-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
              role="status"
              aria-live="polite"
            >
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-semibold">サムネイルを設定しました</span>
                <span className="mt-0.5 block text-emerald-700">
                  この画像は保存済みで、一覧と公開情報に使用されます。
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
