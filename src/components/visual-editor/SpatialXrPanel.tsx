import { tauri } from "../../lib/tauri";
import type { NativeRoomCapabilities } from "../../lib/visual-editor/value-up/spatial-xr/native-room";
import { useMemo, useState } from "react";
import {
  getXrHostDiagnostics,
  openXrPreviewUrl,
  type XrHostDiagnostics,
} from "../../lib/visual-editor/value-up/spatial-xr/openxr-client";

const XR_CAPABILITIES_URL = "https://webxr-jp.github.io/xrift-studio/xr-spatial/?mode=capabilities";
const XR_CAPTURE_URL = "https://webxr-jp.github.io/xrift-studio/xr-spatial/?mode=capture";

export function SpatialXrPanel({ nativeRoomAcquiring, onCaptureRoom, onCancelCapture, activePreviewUrl, onStartProjectPreview, onImportCapture, onStopPreview }: {
  nativeRoomAcquiring?: boolean;
  onCaptureRoom?: () => Promise<void>;
  onCancelCapture?: () => Promise<void>;
  activePreviewUrl?: string | null;
  onStartProjectPreview?: () => Promise<void>;
  onImportCapture?: (file: File) => Promise<void>;
  onStopPreview?: () => Promise<void>;
}) {
  const [roomCapabilities, setRoomCapabilities] = useState<NativeRoomCapabilities | null>(null);
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomResult, setRoomResult] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<XrHostDiagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [projectPreviewBusy, setProjectPreviewBusy] = useState(false);

  const detect = async () => {
    setRoomCapabilities(null);
    setBusy(true);
    setError(null);
    try {
      setDiagnostics(await getXrHostDiagnostics());
      setRoomCapabilities(await tauri.getOpenXrRoomCapabilities());
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const runtime = diagnostics?.openxr;
  const readiness = useMemo(() => {
    if (!diagnostics) return "未確認";
    if (!runtime?.active) return "OpenXR Runtimeを有効にしてください";
    if (diagnostics.metaLinkRunning) return "Meta Horizon Link + OpenXR: Runtimeプロセス検出（HMDは未確認）";
    if (diagnostics.steamvrRunning) return "SteamVR + OpenXR: Runtimeプロセス検出（HMDは未確認）";
    return "OpenXR Runtimeは有効。Runtimeアプリを起動してから確認してください";
  }, [diagnostics, runtime]);

  const openUrl = async (url: string) => {
    setError(null);
    try { await openXrPreviewUrl(url); }
    catch (cause) { setError(String(cause)); }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open && !diagnostics) void detect();
        }}
        className="flex h-7 items-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
        title="OpenXR / SteamVR / Quest Link / WebXR / Room Scan"
      >
        XR
      </button>
      {open ? (
        <div className="absolute right-0 top-9 z-50 max-h-[78vh] w-[min(430px,90vw)] overflow-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold">Spatial XR</div>
              <p className="mt-1 text-xs text-slate-500">OpenXRからの部屋取得と、ワールドのVR確認ができます。実機動作は未検証です。</p>
            </div>
            <button type="button" disabled={busy} onClick={() => void detect()} className="rounded-md border px-2 py-1 text-[11px] font-semibold">{busy ? "確認中…" : "再診断"}</button>
          </div>

          <section className="mt-3 rounded-lg border border-slate-200 p-3 text-xs">
            <div className="font-semibold">OpenXR接続中の端末から部屋を取り込む</div>
            <p className="mt-1 text-slate-500">保存済みの床・壁・家具の位置や形状を直接取得します。HTTPSページやファイル転送は不要です。取得中はヘッドセットの表示が一時的に切り替わる場合があります。</p>
            <p className="mt-1 text-slate-500">Meta Air LinkではQuestのRoom Setupを先に済ませ、PC側で空間データの利用を許可してください。SteamVRは必要な拡張を公開している場合だけ取得できます。</p>
            {roomCapabilities ? <p className="mt-2">{roomCapabilities.runtime}: {roomCapabilities.message}</p> : null}
            {roomCapabilities?.missingExtensions.length ? <p className="mt-1 break-words text-amber-700">不足: {roomCapabilities.missingExtensions.join(", ")}</p> : null}
            <button type="button" disabled={roomBusy || projectPreviewBusy || !onCaptureRoom || !!activePreviewUrl || roomCapabilities?.available === false} onClick={() => {
              setRoomBusy(true); setError(null); setRoomResult(null);
              void onCaptureRoom?.().then(() => setRoomResult("部屋を取り込みました。Hierarchyで選択したEntityの寸法・向きを確認してください。")).catch(cause => setError(String(cause))).finally(() => setRoomBusy(false));
            }} className="mt-2 rounded-md bg-slate-800 px-3 py-2 font-semibold text-white disabled:opacity-40">{roomBusy ? (nativeRoomAcquiring ? "部屋を取得中…" : "素材を取り込み中…") : "接続中の端末から部屋を取り込む"}</button>
            {activePreviewUrl ? <p className="mt-1">XR Previewを停止してから部屋を取得してください。</p> : null}
            {roomBusy && nativeRoomAcquiring && onCancelCapture ? <button type="button" onClick={() => { void onCancelCapture().catch(cause => setError(String(cause))); }} className="ml-2 rounded-md border px-2 py-1">取得を取り消す</button> : null}
            {roomResult ? <p className="mt-2" role="status">{roomResult}</p> : null}
          </section>
          <section className="mt-3 rounded-lg bg-slate-50 p-3 text-xs">
            <div className="font-semibold">PC XR</div>
            <div className="mt-1">{readiness}</div>
            {runtime?.runtimeName ? <div className="mt-1 text-slate-500">Runtime: {runtime.runtimeName}</div> : null}
            {runtime?.availableRuntimes?.length ? (
              <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                {runtime.availableRuntimes.map((entry) => (
                  <div key={entry.manifestPath}>{entry.active ? "●" : "○"} {entry.name}{entry.apiVersion ? ` / OpenXR ${entry.apiVersion}` : ""}</div>
                ))}
              </div>
            ) : null}
            <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
              <div>SteamVR: {diagnostics?.steamvrRunning ? "起動中" : "未検出"}</div>
              <div>Meta Link: {diagnostics?.metaLinkRunning ? "起動中" : "未検出"}</div>
              <div>ADB: {diagnostics?.adbInstalled ? "利用可能" : "未検出"}</div>
              <div>Android USB: {diagnostics?.questDevices.length ? `${diagnostics.questDevices.length}台` : "未検出"}</div>
            </div>
          </section>

          <section className="mt-3">
            <div className="text-xs font-semibold">実機テスト</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => void openUrl(XR_CAPABILITIES_URL)} className="rounded-md border px-2 py-1.5 text-xs font-semibold">WebXR機能診断</button>
              <button type="button" onClick={() => void openUrl(XR_CAPTURE_URL)} className="rounded-md border px-2 py-1.5 text-xs font-semibold">Quest Room Scan</button>
            </div>
          </section>

          <section className="mt-3">
            <label className="block text-[11px] font-semibold text-slate-600">現在のWorld Preview URL</label>
            <div className="mt-1 flex gap-2">
              <input aria-label="World Preview URL" readOnly={!!onStartProjectPreview} placeholder={onStartProjectPreview ? "XR Playの起動後に表示します" : "Preview URLを入力"} value={onStartProjectPreview ? activePreviewUrl ?? "" : previewUrl} onChange={(event) => setPreviewUrl(event.target.value)} className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs" />
              <button type="button" disabled={roomBusy || projectPreviewBusy || (!onStartProjectPreview && (!runtime?.active || !previewUrl))} onClick={() => {
                if (onStartProjectPreview) {
                  setProjectPreviewBusy(true);
                  setError(null);
                  void onStartProjectPreview().catch((cause) => setError(String(cause))).finally(() => setProjectPreviewBusy(false));
                } else {
                  void openUrl(previewUrl);
                }
              }} className="rounded-md bg-slate-800 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{projectPreviewBusy ? "準備中…" : "XR Play"}</button>
            </div>
            {activePreviewUrl ? <button type="button" onClick={() => void openUrl(activePreviewUrl)} className="mt-2 rounded-md border px-2 py-1 text-xs">Previewを開き直す</button> : null}
            <p className="mt-1 text-[11px] text-slate-500">XR Playで保存・変換後に外部ブラウザを開きます。VRに入るには対応ブラウザで「Enter VR」を押します。非対応なら上のURLを対応ブラウザへコピーしてください。</p>
            <p className="mt-1 text-[11px] text-slate-500">PICOはPICO ConnectでWindows PCへ接続し、SteamVRでヘッドセットを認識させます。SteamVRを使用するOpenXR Runtimeに設定してください。接続だけではVR表示にならず、部屋のスキャン対応も別に確認が必要です。</p>
          </section>

          {onStopPreview ? <button type="button" disabled={projectPreviewBusy || roomBusy} onClick={() => { void onStopPreview().catch(cause => setError(String(cause))); }} className="mt-2 rounded-md border px-2 py-1 text-xs">XR Previewを停止</button> : null}
          <section className="mt-3 rounded-lg border border-slate-200 p-3">
            {onImportCapture ? <label className="block text-xs">Spatial Captureを読み込む
              <input type="file" accept=".json,.xrift-spatial.json" disabled={projectPreviewBusy || roomBusy} onChange={event => {
                const file = event.target.files?.[0]; event.target.value = "";
                if (!file) return;
                setProjectPreviewBusy(true); setError(null);
                void onImportCapture(file).catch(cause => setError(String(cause))).finally(() => setProjectPreviewBusy(false));
              }} className="my-2 block w-full text-xs" />
            </label> : null}
            <div className="text-xs font-semibold">Spatial Authoring</div>
            <p className="mt-1 text-[11px] text-slate-500">Room Scanのwall / floor / ceiling / table / couch / door / window / global-meshを.xrift-spatial.jsonへ保存し、読み込むと取得形状をGLBとして配置します。形状がない物体には同梱サンプルを使います。MCPのapply_spatial_captureは簡易形状の配置です。</p>
          </section>

          {diagnostics?.notes.map((note) => <p key={note} className="mt-2 text-[11px] text-amber-700">{note}</p>)}
          {error ? <p className="mt-2 text-[11px] text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
