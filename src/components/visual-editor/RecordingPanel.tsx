import {
  RECORDING_ASPECT_RATIO_OPTIONS,
  RECORDING_FRAME_RATES,
  RECORDING_SHORT_EDGES,
  resolveRecordingResolution,
  type RecordingProfile,
  type RecordingViewportSettings,
} from "../../lib/recording/recording-profile";
import {
  describeRecordingStatus,
  formatRecordingBytes,
  formatRecordingDuration,
  isRecordingActive,
} from "../../lib/recording/recording-state";
import type { RecordingCameraPreset } from "../../lib/recording/recording-camera";
import { EDITOR_ICONS } from "./editor-icons";
import { useRecordingSession } from "./useRecordingSession";

export type RecordingPanelProps = {
  /** A start or stop is in flight; the main button waits for it. */
  busy: boolean;
  nativeAvailable: boolean;
  onStart: () => void;
  onStop: () => void;
  onProfileChange: (patch: Partial<RecordingProfile>) => void;
  onViewportChange: (patch: Partial<RecordingViewportSettings>) => void;
  onChooseDirectory: () => void;
  onResetDirectory: () => void;
  onRevealRecording: (path: string) => void;
  onFitCamera: () => void;
  onCameraPreset: (preset: RecordingCameraPreset) => void;
};

const CAMERA_PRESET_LABELS: readonly { value: RecordingCameraPreset; label: string }[] = [
  { value: "iso", label: "斜め" },
  { value: "front", label: "正面" },
  { value: "top", label: "真上" },
];

const sectionHeading = "mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const chipBase =
  "rounded border px-2 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";
const chipOn = "border-brand-400 bg-brand-50 text-brand-700";
const chipOff = "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-100";
const secondaryButton =
  "flex items-center justify-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The recording controls: one take at a time, the frame it records, and where
 * the file goes. The state it shows is the controller's own, so an MCP client
 * starting a take and a person pressing the button see the same thing.
 */
export function RecordingPanel({
  busy,
  nativeAvailable,
  onStart,
  onStop,
  onProfileChange,
  onViewportChange,
  onChooseDirectory,
  onResetDirectory,
  onRevealRecording,
  onFitCamera,
  onCameraPreset,
}: RecordingPanelProps) {
  // Read directly: the elapsed time ticks every second, and only this panel
  // and the badges need to follow it.
  const state = useRecordingSession();
  const { snapshot, profile, viewport, camera } = state;
  const active = isRecordingActive(snapshot);
  const resolution = resolveRecordingResolution(profile);
  const statusTone =
    snapshot.status === "recording"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : snapshot.status === "failed"
        ? "border-rose-200 bg-white text-rose-700"
        : snapshot.status === "completed"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className="scrollbar-thin max-h-[min(32rem,calc(100vh-10rem))] space-y-4 overflow-y-auto p-3.5 text-xs text-slate-600">
      <section aria-label="録画の状態">
        <div className={`rounded-md border px-3 py-2 ${statusTone}`} role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold">
              {snapshot.status === "recording" ? (
                <span className="size-2 rounded-full bg-rose-500" aria-hidden="true" />
              ) : null}
              {describeRecordingStatus(snapshot)}
            </span>
            {snapshot.startedAt !== null ? (
              <span className="font-mono text-[11px] tabular-nums">
                {formatRecordingDuration(snapshot.durationMs)}
                {snapshot.bytesWritten > 0 ? ` · ${formatRecordingBytes(snapshot.bytesWritten)}` : ""}
              </span>
            ) : null}
          </div>
          {snapshot.status === "idle" ? (
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              録画ビューの内容を {resolution.width}x{resolution.height} の動画として保存します。MCP からも同じ録画を開始・停止できます。
            </p>
          ) : null}
          {snapshot.status === "recording" && !state.sourceAvailable ? (
            <p className="mt-1 text-[11px] leading-4">
              Scene View が表示されていません。表示されるまで最後のフレームが続きます。
            </p>
          ) : null}
          {snapshot.status === "failed" && snapshot.message ? (
            <p className="mt-1 text-[11px] leading-4">{snapshot.message}</p>
          ) : null}
          {(snapshot.status === "completed" || snapshot.status === "failed") && snapshot.path ? (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-[10px]" title={snapshot.path}>
                {snapshot.path}
              </span>
              {nativeAvailable ? (
                <button
                  type="button"
                  onClick={() => onRevealRecording(snapshot.path!)}
                  className="shrink-0 rounded border border-current/30 px-1.5 py-0.5 text-[10px] font-semibold hover:bg-white/60"
                >
                  フォルダーを開く
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy || snapshot.status === "stopping"}
          onClick={active ? onStop : onStart}
          aria-pressed={active}
          className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            active ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-600 hover:bg-brand-700"
          }`}
        >
          {active ? <EDITOR_ICONS.stop size={13} aria-hidden="true" /> : <EDITOR_ICONS.record size={13} aria-hidden="true" />}
          {snapshot.status === "stopping"
            ? "保存しています"
            : busy
              ? active
                ? "停止しています"
                : "開始しています"
              : active
                ? "録画を停止"
                : "録画を開始"}
        </button>
        {!nativeAvailable ? (
          <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
            ブラウザでは 60 秒までのサンプル録画をダウンロードします。長時間録画はデスクトップ版で行います。
          </p>
        ) : null}
      </section>

      <section aria-labelledby="recording-profile-heading">
        <h3 id="recording-profile-heading" className={sectionHeading}>
          フレーム
        </h3>
        <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="アスペクト比">
          {RECORDING_ASPECT_RATIO_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={profile.aspectRatio === option.value}
              title={option.description}
              onClick={() => onProfileChange({ aspectRatio: option.value })}
              className={`${chipBase} ${profile.aspectRatio === option.value ? chipOn : chipOff}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">短辺の解像度</span>
            <select
              value={profile.shortEdge}
              onChange={(event) =>
                onProfileChange({ shortEdge: Number(event.target.value) as RecordingProfile["shortEdge"] })
              }
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800"
            >
              {RECORDING_SHORT_EDGES.map((edge) => (
                <option key={edge} value={edge}>
                  {edge}p
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">フレームレート</span>
            <select
              value={profile.frameRate}
              onChange={(event) =>
                onProfileChange({ frameRate: Number(event.target.value) as RecordingProfile["frameRate"] })
              }
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800"
            >
              {RECORDING_FRAME_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate} fps
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
          {resolution.width}x{resolution.height} · {profile.frameRate}fps
          {active ? "。変更は次の録画から反映されます" : ""}
        </p>
      </section>

      <section aria-labelledby="recording-viewport-heading">
        <h3 id="recording-viewport-heading" className={sectionHeading}>
          録画ビュー
        </h3>
        <button
          type="button"
          aria-pressed={viewport.visible}
          onClick={() => onViewportChange({ visible: !viewport.visible })}
          className={`${secondaryButton} w-full ${viewport.visible ? "border-brand-400 bg-brand-50 text-brand-700" : ""}`}
        >
          <EDITOR_ICONS.camera size={13} aria-hidden="true" />
          {viewport.visible ? "編集表示へ戻る" : "録画ビューを表示"}
        </button>
        <div className="mt-2 grid grid-cols-2 gap-1" role="radiogroup" aria-label="録画に使うカメラ">
          {(
            [
              { value: "recording", label: "録画用カメラ" },
              { value: "editor", label: "編集中の視点" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={viewport.cameraSource === option.value}
              onClick={() => onViewportChange({ cameraSource: option.value })}
              className={`${chipBase} ${viewport.cameraSource === option.value ? chipOn : chipOff}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-2 space-y-1">
          {(
            [
              { key: "showEditorUi", label: "パネルを残す" },
              { key: "showEditorHelpers", label: "グリッドやギズモを映す" },
              { key: "showRecordingIndicator", label: "REC 表示（動画には入りません）" },
            ] as const
          ).map((option) => (
            <label key={option.key} className="flex items-center gap-2 text-[11px] text-slate-700">
              <input
                type="checkbox"
                checked={viewport[option.key]}
                onChange={(event) => onViewportChange({ [option.key]: event.target.checked })}
                className="size-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              {option.label}
            </label>
          ))}
        </div>
      </section>

      <section aria-labelledby="recording-camera-heading">
        <h3 id="recording-camera-heading" className={sectionHeading}>
          録画用カメラ
        </h3>
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={onFitCamera}
            title="Scene の全 Entity が収まる位置へ移動"
            className={`${chipBase} ${chipOff}`}
          >
            全体
          </button>
          {CAMERA_PRESET_LABELS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onCameraPreset(preset.value)}
              className={`${chipBase} ${chipOff}`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 font-mono text-[10px] leading-4 text-slate-500">
          位置 {camera.position.map((value) => value.toFixed(1)).join(", ")} · 注視{" "}
          {camera.target.map((value) => value.toFixed(1)).join(", ")} · FOV {Math.round(camera.fov)}
        </p>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">
          録画ビューでドラッグした視点はそのまま保存されます。
        </p>
      </section>

      {nativeAvailable ? (
        <section aria-labelledby="recording-directory-heading">
          <h3 id="recording-directory-heading" className={sectionHeading}>
            保存先
          </h3>
          <p className="truncate font-mono text-[10px] text-slate-600" title={state.outputDirectory ?? "既定の保存先"}>
            {state.outputDirectory ?? "既定（ビデオ / XRift Studio）"}
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button type="button" onClick={onChooseDirectory} disabled={active} className={secondaryButton}>
              <EDITOR_ICONS.folder size={13} aria-hidden="true" />
              フォルダーを選ぶ
            </button>
            <button
              type="button"
              onClick={onResetDirectory}
              disabled={active || state.outputDirectory === null}
              className={secondaryButton}
            >
              既定に戻す
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
