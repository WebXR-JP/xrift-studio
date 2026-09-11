import { useRef, useState } from "react";
import { tauri } from "../../lib/tauri";
import type { NativeRoomCapabilities } from "../../lib/visual-editor/value-up/spatial-xr/native-room";

export function SpatialXrPanel({ nativeRoomAcquiring, onCaptureRoom, onCancelCapture }: {
  nativeRoomAcquiring?: boolean;
  onCaptureRoom?: () => Promise<void>;
  onCancelCapture?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [capabilities, setCapabilities] = useState<NativeRoomCapabilities | null>(null);
  const [checking, setChecking] = useState(false);
  const [roomBusy, setRoomBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const detect = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setChecking(true);
    setCapabilities(null);
    setError(null);
    setResult(null);
    try {
      setCapabilities(await tauri.getOpenXrRoomCapabilities());
    } catch (cause) {
      setError(String(cause));
    } finally {
      busyRef.current = false;
      setChecking(false);
    }
  };

  const capture = async () => {
    if (busyRef.current || !onCaptureRoom || !capabilities?.available) return;
    busyRef.current = true;
    setRoomBusy(true);
    setError(null);
    setResult(null);
    try {
      await onCaptureRoom();
      setResult("部屋を取り込みました。Hierarchyで選択したEntityの寸法・向き・床位置を確認してください。");
    } catch (cause) {
      setError(String(cause));
    } finally {
      busyRef.current = false;
      setRoomBusy(false);
    }
  };

  return (
    <div className="relative">
      <button type="button" aria-expanded={open} onClick={() => {
        setOpen(value => !value);
        if (!open && !capabilities) void detect();
      }} className="flex h-7 items-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100" title="OpenXRで保存済みの部屋を取り込む">
        OpenXR
      </button>
      {open ? (
        <div className="absolute right-0 top-9 z-50 max-h-[78vh] w-[min(430px,90vw)] overflow-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold">部屋の取り込み</div>
              <p className="mt-1 text-xs text-slate-500">接続中の端末から保存済みの床・壁・家具を取得します。実機動作は未検証です。</p>
            </div>
            <button type="button" disabled={checking || roomBusy} onClick={() => void detect()} className="rounded-md border px-2 py-1 text-[11px] font-semibold">{checking ? "確認中…" : "再診断"}</button>
          </div>
          <section className="mt-3 rounded-lg border border-slate-200 p-3 text-xs">
            <p>Meta Air Linkでは、Quest本体でRoom Setupを済ませてから接続してください。接続中に新しいスキャンを開始する機能はありません。</p>
            <p className="mt-2 text-slate-500">SteamVRは必要な部屋取得の拡張が使える場合のみ対象です。PICO 4 Ultra＋PICO Connectの部屋取得は未対応です。</p>
            {capabilities ? <p className="mt-2" role="status">{capabilities.runtime}: {capabilities.message}</p> : <p className="mt-2" role="status">{checking ? "接続環境を確認しています…" : "再診断で接続環境を確認してください。"}</p>}
            {capabilities?.missingExtensions.length ? <p className="mt-1 break-words text-amber-700">不足: {capabilities.missingExtensions.join(", ")}</p> : null}
            <button type="button" disabled={checking || roomBusy || !onCaptureRoom || !capabilities?.available} onClick={() => void capture()} className="mt-3 rounded-md bg-slate-800 px-3 py-2 font-semibold text-white disabled:opacity-40">
              {roomBusy ? (nativeRoomAcquiring ? "部屋を取得中…" : "素材を取り込み中…") : "保存済みの部屋を取り込む"}
            </button>
            {roomBusy && nativeRoomAcquiring && onCancelCapture ? (
              <button type="button" onClick={() => { void onCancelCapture().catch(cause => setError(String(cause))); }} className="ml-2 rounded-md border px-2 py-1">取得を取り消す</button>
            ) : null}
            <p className="mt-2 text-slate-500">Playを停止してから取り込んでください。取得中はヘッドセットの表示が切り替わる場合があります。素材の保存が始まった後は完了を待ってください。</p>
            {result ? <p className="mt-2" role="status">{result}</p> : null}
          </section>
          {error ? <p className="mt-2 text-xs text-red-600" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
