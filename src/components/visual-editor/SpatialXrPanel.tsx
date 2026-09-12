import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Glasses, LoaderCircle, X } from "lucide-react";
import { tauri } from "../../lib/tauri";
import type { NativeRoomCapabilities } from "../../lib/visual-editor/value-up/spatial-xr/native-room";
import { roomImportErrorFeedback, roomRuntimeGuidance, type RoomImportDevice } from "../../lib/visual-editor/value-up/spatial-xr/room-import-feedback";
import type { OpenXrRoomImportOutcome, OpenXrRoomImportPhase } from "./useOpenXrRoomImport";

const secondaryButton = "rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50";
const primaryButton = "rounded-md bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50";
const phaseLabels: Record<OpenXrRoomImportPhase, string> = {
  idle: "部屋を取り込む",
  acquiring: "部屋を取得中…",
  cancelling: "取得を取り消し中…",
  saving: "素材を保存中…",
};
const devices: Array<{ id: RoomImportDevice; label: string; note: string }> = [
  { id: "quest", label: "Meta Quest", note: "Link / Air Linkなど" },
  { id: "pico", label: "PICO", note: "部屋取得は未対応" },
  { id: "other", label: "その他", note: "OpenXRの機能を確認" },
];

export function SpatialXrPanel({ phase = "idle", outcome = null, disabledReason, onCaptureRoom, onCancelCapture, onFocusImportedRoom }: {
  phase?: OpenXrRoomImportPhase;
  outcome?: OpenXrRoomImportOutcome | null;
  disabledReason?: string;
  onCaptureRoom?: () => Promise<void>;
  onCancelCapture?: () => Promise<void>;
  onFocusImportedRoom?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<RoomImportDevice>("quest");
  const [capabilities, setCapabilities] = useState<NativeRoomCapabilities | null>(null);
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [showPreviousError, setShowPreviousError] = useState(true);
  const busyRef = useRef(false);
  const lifetimeRef = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const reasonId = useId();
  const roomBusy = phase !== "idle" || starting;
  const busy = checking || roomBusy;
  const nativeAvailable = tauri.isAvailable();
  const success = outcome?.status === "success" ? outcome : null;
  const rawError = diagnosticError ?? (showPreviousError && outcome?.status === "error" ? outcome.message : null);
  const error = rawError ? roomImportErrorFeedback(rawError, device) : null;
  const blockReason = !nativeAvailable ? "Windows版のXRift Studioで利用できます。"
    : device === "pico" ? "PICO Connectからの部屋取得は現在未対応です。"
    : disabledReason ?? (!onCaptureRoom ? "現在の画面では部屋を取り込めません。" : undefined);

  useEffect(() => {
    ++lifetimeRef.current;
    return () => { ++lifetimeRef.current; };
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    dialog.showModal();
    return () => { dialog.close(); };
  }, [open]);

  const close = () => {
    dialogRef.current?.close();
    setOpen(false);
    triggerRef.current?.focus();
  };
  const detect = async () => {
    if (busyRef.current || roomBusy || !nativeAvailable || device === "pico") return;
    busyRef.current = true;
    const lifetime = lifetimeRef.current;
    setChecking(true);
    setCapabilities(null);
    setDiagnosticError(null);
    setShowPreviousError(false);
    try {
      const next = await tauri.getOpenXrRoomCapabilities();
      if (lifetime === lifetimeRef.current) setCapabilities(next);
    } catch (cause) {
      if (lifetime === lifetimeRef.current) setDiagnosticError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busyRef.current = false;
      if (lifetime === lifetimeRef.current) setChecking(false);
    }
  };
  const capture = async () => {
    if (busyRef.current || roomBusy || blockReason || !onCaptureRoom || !capabilities?.available) return;
    busyRef.current = true;
    const lifetime = lifetimeRef.current;
    setStarting(true);
    setDiagnosticError(null);
    setShowPreviousError(true);
    try {
      await onCaptureRoom();
    } catch (cause) {
      if (lifetime === lifetimeRef.current) setDiagnosticError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busyRef.current = false;
      if (lifetime === lifetimeRef.current) setStarting(false);
    }
  };

  // The browser/iPad editor cannot import from a PC OpenXR runtime.
  return !nativeAvailable ? null : <>
    <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => {
      setOpen(true);
      if (!capabilities && !diagnosticError) void detect();
    }} className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500" title="OpenXRでヘッドセットに保存された部屋を取り込む">
      {roomBusy ? <LoaderCircle size={13} aria-hidden="true" className="motion-safe:animate-spin" /> : <Glasses size={13} aria-hidden="true" />}
      <span role="status">{phase !== "idle" ? phaseLabels[phase] : starting ? "部屋を取得中…" : success ? "部屋の取り込み結果" : "部屋を取り込む"}</span>
    </button>
    {open ? createPortal(
      <dialog ref={dialogRef} aria-labelledby={headingId} aria-describedby={descriptionId}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-32px)] w-[min(520px,calc(100vw-32px))] max-w-none overflow-hidden rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-brand-lg backdrop:bg-zinc-900/30 backdrop:backdrop-blur-sm"
        onCancel={event => { event.preventDefault(); close(); }}
        onClick={event => { if (event.target === event.currentTarget) close(); }}
        onKeyDown={event => event.stopPropagation()}>
        <div data-app-modal-surface className="flex max-h-[calc(100dvh-32px)] flex-col" onClick={event => event.stopPropagation()}>
          <header data-app-modal-header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
            <div>
              <h2 id={headingId} className="text-base font-semibold">部屋を取り込む</h2>
              <p id={descriptionId} className="mt-1 text-xs leading-relaxed text-zinc-600">ヘッドセットに保存した床・壁・家具をシーンに追加します。</p>
              <p className="mt-1 text-[11px] text-zinc-500">Windows版 / OpenXR · 実機動作は未検証</p>
            </div>
            <button type="button" autoFocus onClick={close} aria-label="部屋の取り込みを閉じる" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-brand-500"><X size={16} aria-hidden="true" /></button>
          </header>
          <div data-app-modal-body className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-xs leading-relaxed">
            {!roomBusy ? <>
              <fieldset disabled={busy}>
                <legend className="mb-2 font-semibold">使用するヘッドセット</legend>
                <div className="grid grid-cols-3 gap-2">
                  {devices.map(item => <label key={item.id} className={`cursor-pointer rounded-lg border px-2 py-2.5 ${device === item.id ? "border-brand-500 bg-brand-50" : "border-zinc-200 hover:bg-zinc-50"}`}>
                    <span className="flex flex-wrap items-center gap-1.5"><input type="radio" name={headingId} value={item.id} checked={device === item.id} onChange={() => { setDevice(item.id); setDiagnosticError(null); setShowPreviousError(false); }} className="accent-brand-600" /><span className="font-semibold">{item.label}</span></span>
                    <span className="mt-1 block text-[10px] text-zinc-500">{item.note}</span>
                  </label>)}
                </div>
              </fieldset>
              {device === "pico" ? <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <h3 className="font-semibold">PICOの部屋取得は現在未対応です</h3>
                <p className="mt-1">PICO 4 UltraをPICO ConnectでPCにつないでも、この機能では部屋データを読み取れません。通常のシーン編集はそのまま使えます。</p>
              </section> : <>
                <section>
                  <h3 className="font-semibold">{device === "quest" ? "Quest側の準備" : "接続前の確認"}</h3>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-zinc-600">
                    <li>{device === "quest" ? "Quest本体でRoom Setupを済ませる。" : "ヘッドセット本体で部屋と境界を設定する。"}</li>
                    <li>{device === "quest" ? "Link / Air LinkなどでPCに接続し、ヘッドセット内でPC側の画面を開く。" : "接続アプリでPCへ接続し、ヘッドセットを装着する。"}</li>
                    <li>空間データの利用を許可し、StudioのPlayを停止する。</li>
                  </ol>
                  <p className="mt-2 text-zinc-500">この画面から新しくルームスキャンを始めることはできません。</p>
                </section>
                <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-3" aria-busy={checking}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">接続環境</h3>
                    <button type="button" disabled={busy || !nativeAvailable} onClick={() => void detect()} className={secondaryButton}>{checking ? "確認中…" : "接続を確認し直す"}</button>
                  </div>
                  <p className="mt-2" role="status">{!nativeAvailable ? "Windows版のXRift Studioで利用できます。" : checking ? "OpenXRの機能を確認しています…" : capabilities ? roomRuntimeGuidance(capabilities, device) : "接続を確認すると、部屋取得に必要な機能が使えるか分かります。"}</p>
                  {capabilities ? <>
                    <p className="mt-1 break-words text-zinc-500">OpenXR Runtime: {capabilities.runtime}</p>
                    <details className="mt-2 text-zinc-500"><summary className="cursor-pointer">診断の詳細</summary>
                      <p className="mt-2 break-words">{capabilities.message}</p>
                      {capabilities.missingExtensions.length ? <ul className="mt-1 space-y-1 break-all font-mono text-[10px]">{capabilities.missingExtensions.map(name => <li key={name}>{name}</li>)}</ul> : null}
                      <p className="mt-2">{capabilities.mesh ? "Mesh取得の拡張あり。実際に取得できる形状は端末と部屋データによります。" : "Mesh取得の拡張なし。取得できる平面と寸法を使います。"}</p>
                    </details>
                  </> : null}
                </section>
              </>}
            </> : <section role="status" className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="flex items-center gap-2 font-semibold"><LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" />{phaseLabels[phase] === phaseLabels.idle ? "部屋を取得中…" : phaseLabels[phase]}</h3>
              <p className="mt-2 text-zinc-600">{phase === "saving" ? "取得した形状を素材として保存しています。保存中は取り消せません。完了を待ってください。" : phase === "cancelling" ? "端末側の処理が終わるのを待っています。取り消した結果はシーンに追加しません。" : "ヘッドセットを装着し、接続アプリの画面を確認してください。一時的に表示が切り替わる場合があります。"}</p>
              <p className="mt-2 text-zinc-500">この画面を閉じても処理は続きます。取り込みが終わるまでシーンの編集やPlayは待ってください。</p>
            </section>}
            {!roomBusy && success ? <section className="rounded-lg border border-brand-200 bg-brand-50 p-3" role="status">
              <h3 className="flex items-center gap-2 font-semibold"><Check size={15} aria-hidden="true" />{success.entityIds.length}件をシーンに追加しました</h3>
              <p className="mt-1 text-zinc-600">部屋を表示して、寸法・向き・床位置を確認してください。調整はInspectorで行えます。</p>
              {success.skippedCount > 0 ? <p className="mt-2">配置できなかった形状: {success.skippedCount}件</p> : null}
              {success.warnings.length ? <details className="mt-2"><summary className="cursor-pointer">取得時の注意（{success.warnings.length}件）</summary><ul className="mt-1 list-disc space-y-1 break-words pl-4">{success.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : null}
              {!onFocusImportedRoom ? <p className="mt-2 text-zinc-500">取り込んだEntityは現在のシーンにありません。</p> : null}
            </section> : null}
            {!roomBusy && outcome?.status === "cancelled" ? <p role="status" className="rounded-lg bg-zinc-50 p-3">{outcome.message}</p> : null}
            {error && device !== "pico" ? <section role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3">
              <h3 className="font-semibold text-red-700">{error.title}</h3>
              <p className="mt-1 text-zinc-700">{error.action}</p>
              <details className="mt-2 text-zinc-500"><summary className="cursor-pointer">エラーの詳細</summary><p className="mt-1 whitespace-pre-wrap break-all font-mono text-[10px]">{error.details}</p></details>
            </section> : null}
          </div>
          <footer data-app-modal-footer className="shrink-0 space-y-2 border-t border-zinc-100 bg-zinc-50/70 px-5 py-3">
            {!roomBusy && blockReason ? <p id={reasonId} className="text-xs text-zinc-600">{blockReason}</p> : null}
            {!roomBusy && !blockReason && capabilities?.available ? <p className="text-[11px] text-zinc-500">取り込むたびに現在のシーンへ追加します。取り込み済みの部屋は残るため、同じ部屋を追加すると重複します。</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={close} className={secondaryButton}>{roomBusy ? "閉じて待つ" : "閉じる"}</button>
              {phase === "acquiring" && onCancelCapture ? <button type="button" onClick={() => { const lifetime = lifetimeRef.current; void onCancelCapture().catch(cause => { if (lifetime === lifetimeRef.current) setDiagnosticError(String(cause)); }); }} className={secondaryButton}>取得を取り消す</button> : null}
              {!roomBusy && device !== "pico" && nativeAvailable ? <button type="button" disabled={busy || Boolean(blockReason) || !capabilities?.available} aria-describedby={blockReason ? reasonId : undefined} onClick={() => void capture()} className={success ? secondaryButton : primaryButton}>{success ? "部屋を追加で取り込む" : outcome?.status === "error" ? "もう一度取り込む" : "保存済みの部屋を取り込む"}</button> : null}
              {!roomBusy && success && onFocusImportedRoom ? <button type="button" disabled={Boolean(disabledReason)} onClick={() => { onFocusImportedRoom(); close(); }} className={primaryButton}>取り込んだ部屋を表示</button> : null}
            </div>
          </footer>
        </div>
      </dialog>, document.body,
    ) : null}
  </>;
}
