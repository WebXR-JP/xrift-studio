import { memo, useMemo, type ReactNode } from "react";
import type { AssetManifest } from "../../lib/visual-editor/asset-manifest";
import {
  listLightBakeLights,
  listLightBakeMeshes,
  resolveLightBakeStatus,
  type LightBakeLightEntry,
  type LightBakeMeshEntry,
} from "../../lib/visual-editor/light-bake/light-bake-scene";
import type { LightBakeProgress } from "../../lib/visual-editor/light-bake/light-bake-job";
import type { LightBakeMode, SceneDocument } from "../../lib/visual-editor/scene-document";
import {
  resolveSceneSettings,
  SCENE_LIGHT_BAKE_RESOLUTIONS,
  type SceneLightBakeQuality,
  type SceneLightBakeResolution,
  type SceneSettings,
} from "../../lib/visual-editor/scene-settings";
import { GuideLink } from "../guide/GuideLink";
import { EDITOR_ICONS } from "./editor-icons";

/**
 * ライトベイクの操作をまとめたパネル。
 *
 * 上から「今の状態と主操作」「対象のMesh」「ライトの扱い」「設定」の順に並べる。
 * 作者がすることは、対象を選んでベイクを押すことだけにする。細かさは画像の
 * 大きさから自動で決め、UV2も自動で作る。
 */

export type LightBakeJobState =
  | { state: "idle" }
  | { state: "running"; progress: LightBakeProgress }
  | { state: "failed"; message: string };

export type LightBakePanelProps = {
  scene: SceneDocument;
  assets: AssetManifest;
  readOnly: boolean;
  /** プロジェクトを保存していないと、ライトマップを書き出せない。 */
  canBake: boolean;
  cannotBakeReason?: string;
  job: LightBakeJobState;
  /** Scene Viewでクリックして対象を切り替えるモード。 */
  picking: boolean;
  /** Scene Viewがライトマップを貼れたMeshの数。読めなかった場合はその理由。 */
  viewStatus: { applied: number; total: number } | { error: string } | null;
  /** 直前のベイクで作者へ伝える注意。 */
  warnings: readonly string[];
  onTogglePicking: () => void;
  onSetTargets: (entityIds: readonly string[], enabled: boolean) => void;
  onSetLightMode: (entityId: string, componentId: string, mode: LightBakeMode) => void;
  onSettingsChange: (
    patch: Partial<Pick<SceneSettings["lightBake"], "resolution" | "quality" | "softness">>,
  ) => void;
  onBake: () => void;
  onCancel: () => void;
  onRemoveLightmap: () => void;
  onSelectEntity: (entityId: string) => void;
  onOpenLightmapAsset: (assetId: string) => void;
};

const QUALITY_OPTIONS: readonly { value: SceneLightBakeQuality; label: string; hint: string }[] = [
  { value: "draft", label: "下書き", hint: "配置を確かめる速さ優先。ざらつきが残ります" },
  { value: "standard", label: "標準", hint: "ふだんの仕上げ" },
  { value: "high", label: "高品質", hint: "公開前の仕上げ。時間がかかります" },
];

const LIGHT_TYPE_LABELS: Record<LightBakeLightEntry["lightType"], string> = {
  ambient: "Ambient",
  directional: "Directional",
  hemisphere: "Hemisphere",
  point: "Point",
  spot: "Spot",
  rectArea: "Rect Area",
};

function Section({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{description}</p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0 text-[11px] text-slate-500">{aside}</div> : null}
      </div>
      <div className="space-y-2.5 p-3">{children}</div>
    </section>
  );
}

const secondaryButton =
  "rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-50";

function formatBakedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function progressLabel(progress: LightBakeProgress): string {
  if (progress.phase === "preparing") return "ライトマップ用のUVを作っています";
  if (progress.phase === "finishing") return "仕上げて保存しています";
  return `光を計算しています ${Math.round(progress.fraction * 100)}%`;
}

const MeshRow = memo(function MeshRow({
  entry,
  disabled,
  onToggle,
  onSelect,
}: {
  entry: LightBakeMeshEntry;
  disabled: boolean;
  onToggle: (entityId: string, enabled: boolean) => void;
  onSelect: (entityId: string) => void;
}) {
  return (
    <li className="flex min-h-8 items-center gap-2 rounded px-1.5 hover:bg-slate-50">
      <input
        type="checkbox"
        checked={entry.target}
        disabled={disabled}
        aria-label={`${entry.name}をベイクの対象にする`}
        onChange={(event) => onToggle(entry.entityId, event.currentTarget.checked)}
        className="h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500 disabled:cursor-not-allowed"
      />
      <button
        type="button"
        onClick={() => onSelect(entry.entityId)}
        title={`${entry.name}を選択する`}
        className="min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-xs text-slate-700 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        {entry.name}
      </button>
      {entry.movableReason ? (
        <span
          className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800"
          title={`${entry.movableReason}。動くと、焼いた陰影は元の場所に残ります`}
        >
          動く
        </span>
      ) : null}
    </li>
  );
});

export function LightBakePanel({
  scene,
  assets,
  readOnly,
  canBake,
  cannotBakeReason,
  job,
  picking,
  viewStatus,
  warnings,
  onTogglePicking,
  onSetTargets,
  onSetLightMode,
  onSettingsChange,
  onBake,
  onCancel,
  onRemoveLightmap,
  onSelectEntity,
  onOpenLightmapAsset,
}: LightBakePanelProps) {
  const settings = useMemo(() => resolveSceneSettings(scene.settings).lightBake, [scene.settings]);
  const meshes = useMemo(() => listLightBakeMeshes(scene, assets), [scene, assets]);
  const lights = useMemo(() => listLightBakeLights(scene), [scene]);
  const status = useMemo(() => resolveLightBakeStatus(scene, assets), [scene, assets]);
  const targetCount = meshes.filter((entry) => entry.target).length;
  const staticCandidates = meshes.filter((entry) => !entry.movableReason);
  const running = job.state === "running";
  const locked = readOnly || running;
  const lightmap = status.state === "none" ? undefined : status.lightmap;
  const bakeDisabled = locked || !canBake || targetCount === 0;
  const bakeDisabledReason = !canBake
    ? cannotBakeReason
    : targetCount === 0
      ? "対象のMeshを1つ以上選んでください"
      : undefined;
  const LightIcon = EDITOR_ICONS.light;

  return (
    <div className="space-y-3">
      <GuideLink page="light-bake" label="ライトベイクの使い方" />
      <section
        className="rounded-md border border-slate-200 bg-white p-3 shadow-sm"
        aria-label="ライトベイクの状態"
      >
        <div className="flex items-start gap-2">
          <LightIcon size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            {running ? (
              <>
                <p className="text-[13px] font-semibold text-slate-800" role="status">
                  {progressLabel(job.progress)}
                </p>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded bg-slate-200"
                  role="progressbar"
                  aria-label="ライトベイクの進捗"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(job.progress.fraction * 100)}
                >
                  <div
                    className="h-full bg-brand-500 transition-[width]"
                    style={{
                      width: `${job.progress.phase === "preparing" ? 4 : Math.max(4, job.progress.fraction * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                  計算中も編集を続けられます。途中で動かした物は、焼き直すまで陰影が合いません。
                </p>
              </>
            ) : status.state === "none" ? (
              <>
                <p className="text-[13px] font-semibold text-slate-800">まだベイクしていません</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                  動かないMeshを対象に選んでベイクすると、やわらかい影と跳ね返った光が
                  1枚の画像（ライトマップ）に焼かれます。公開でも同じ画像を使います。
                </p>
              </>
            ) : (
              <>
                <p className="text-[13px] font-semibold text-slate-800">
                  {status.state === "current" ? "ベイク済み" : "Sceneが変わりました"}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                  {status.state === "stale"
                    ? "ベイクの後に、対象・ライト・配置のどれかを変えています。焼き直すと今のSceneに合います。"
                    : "Scene Viewと公開で、この画像の陰影を使います。"}
                </p>
                {lightmap ? (
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
                    <dt className="text-slate-500">画像</dt>
                    <dd>
                      {lightmap.lightmap.size}px · {formatBytes(lightmap.lightmap.byteLength + lightmap.lightmap.dataByteLength)}
                    </dd>
                    <dt className="text-slate-500">細かさ</dt>
                    <dd>1mあたり {lightmap.lightmap.stats.texelsPerMeter.toFixed(1)}px</dd>
                    <dt className="text-slate-500">対象</dt>
                    <dd>
                      Mesh {lightmap.lightmap.stats.meshCount}件
                      {viewStatus && "applied" in viewStatus && viewStatus.applied < viewStatus.total
                        ? `（表示中 ${viewStatus.applied}件）`
                        : ""}
                    </dd>
                    <dt className="text-slate-500">日時</dt>
                    <dd>
                      {formatBakedAt(lightmap.lightmap.bakedAt)} ·{" "}
                      {(lightmap.lightmap.stats.durationMs / 1000).toFixed(1)}秒
                    </dd>
                  </dl>
                ) : null}
              </>
            )}
            {job.state === "failed" ? (
              <p className="mt-2 rounded bg-rose-50 px-2 py-1.5 text-[11px] leading-4 text-rose-800" role="alert">
                {job.message}
              </p>
            ) : null}
            {viewStatus && "error" in viewStatus ? (
              <p className="mt-2 rounded bg-rose-50 px-2 py-1.5 text-[11px] leading-4 text-rose-800" role="alert">
                ライトマップを読み込めませんでした。焼き直してください。（{viewStatus.error}）
              </p>
            ) : null}
            {!running && warnings.length > 0 ? (
              <ul className="mt-2 space-y-1 rounded bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-800">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {running ? (
            <button type="button" onClick={onCancel} className={secondaryButton}>
              中止
            </button>
          ) : (
            <button
              type="button"
              onClick={onBake}
              disabled={bakeDisabled}
              title={bakeDisabledReason}
              className="min-h-9 rounded-md bg-brand-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {status.state === "none" ? "ベイク" : "焼き直す"}
            </button>
          )}
          {!running && lightmap ? (
            <>
              <button
                type="button"
                onClick={() => onOpenLightmapAsset(lightmap.id)}
                className={secondaryButton}
              >
                Assetsで表示
              </button>
              <button
                type="button"
                onClick={onRemoveLightmap}
                disabled={readOnly}
                title="焼いた陰影をSceneから外します。ライトマップのAssetは残ります"
                className={secondaryButton}
              >
                外す
              </button>
            </>
          ) : null}
        </div>
        {!running && bakeDisabledReason ? (
          <p className="mt-1.5 text-[11px] leading-4 text-slate-500">{bakeDisabledReason}</p>
        ) : null}
      </section>

      <Section
        title="対象のMesh"
        description="対象にしたMeshは、影を落とし、光を跳ね返し、焼いた陰影を受けます。動かす物は外してください。"
        aside={`${targetCount} / ${meshes.length}`}
      >
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onTogglePicking}
            disabled={readOnly}
            aria-pressed={picking}
            title="Scene ViewでMeshをクリックするたびに、対象かどうかを切り替えます"
            className={
              picking
                ? "rounded border border-brand-600 bg-brand-600 px-2 py-1 text-[11px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                : secondaryButton
            }
          >
            {picking ? "クリックで選択中" : "Scene Viewでクリックして選ぶ"}
          </button>
          <button
            type="button"
            onClick={() =>
              onSetTargets(
                staticCandidates.filter((entry) => !entry.target).map((entry) => entry.entityId),
                true,
              )
            }
            disabled={locked || staticCandidates.every((entry) => entry.target)}
            title="物理・Script・アニメーションの付いていないMeshをまとめて対象にします"
            className={secondaryButton}
          >
            動かないMeshを選ぶ
          </button>
          <button
            type="button"
            onClick={() =>
              onSetTargets(
                meshes.filter((entry) => entry.target).map((entry) => entry.entityId),
                false,
              )
            }
            disabled={locked || targetCount === 0}
            className={secondaryButton}
          >
            すべて外す
          </button>
        </div>
        {picking ? (
          <p className="rounded bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-900">
            Scene Viewで、対象のMeshに色が付いています。クリックすると対象と対象外が切り替わります。
          </p>
        ) : null}
        {meshes.length === 0 ? (
          <p className="text-[11px] leading-4 text-slate-500">
            SceneにMeshがありません。床や壁を置いてから対象に選びます。
          </p>
        ) : (
          <ul className="scrollbar-thin max-h-64 overflow-y-auto" aria-label="ベイクの対象にできるMesh">
            {meshes.map((entry) => (
              <MeshRow
                key={`${entry.entityId}:${entry.componentId}`}
                entry={entry}
                disabled={locked}
                onToggle={(entityId, enabled) => onSetTargets([entityId], enabled)}
                onSelect={onSelectEntity}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="ライト"
        description="「ベイク」にしたライトは、影まで焼いて描画から消します。対象でないMeshやアバターには届かなくなります。"
      >
        {lights.length === 0 ? (
          <p className="text-[11px] leading-4 text-slate-500">
            SceneにLightがありません。環境光とSkyboxの光は、物陰で遮られるぶんだけ焼かれます。
          </p>
        ) : (
          <ul className="space-y-1.5" aria-label="ライトの扱い">
            {lights.map((light) => (
              <li
                key={`${light.entityId}:${light.componentId}`}
                className="flex items-center gap-2"
              >
                <button
                  type="button"
                  onClick={() => onSelectEntity(light.entityId)}
                  title={`${light.name}を選択する`}
                  className={`min-w-0 flex-1 rounded px-1 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${light.enabled ? "text-slate-700 hover:text-brand-700" : "text-slate-400"}`}
                >
                  <span className="block truncate">{light.name}</span>
                  <span className="block text-[11px] text-slate-500">
                    {LIGHT_TYPE_LABELS[light.lightType]}
                    {light.enabled ? "" : " · 無効"}
                  </span>
                </button>
                <div
                  className="flex shrink-0 overflow-hidden rounded border border-slate-300"
                  role="group"
                  aria-label={`${light.name}のベイクでの扱い`}
                >
                  {(["realtime", "baked"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={locked}
                      aria-pressed={light.bakeMode === mode}
                      onClick={() => onSetLightMode(light.entityId, light.componentId, mode)}
                      title={
                        mode === "realtime"
                          ? "描画時に照らします。ベイクは跳ね返った光だけを焼きます"
                          : "光と影を焼き、描画からは消します"
                      }
                      className={`px-2 py-1 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 disabled:cursor-not-allowed ${light.bakeMode === mode ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
                    >
                      {mode === "realtime" ? "リアルタイム" : "ベイク"}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="設定">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-xs font-medium text-slate-700">ライトマップの大きさ</span>
            <span className="block text-[11px] leading-4 text-slate-500">
              上限です。細かさはここから自動で決まります
            </span>
          </span>
          <select
            value={settings.resolution}
            disabled={locked}
            onChange={(event) =>
              onSettingsChange({
                resolution: Number(event.currentTarget.value) as SceneLightBakeResolution,
              })
            }
            className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          >
            {SCENE_LIGHT_BAKE_RESOLUTIONS.map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </select>
        </label>
        {settings.resolution >= 4096 ? (
          <p className="rounded bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-800">
            4096pxは、表示にGPUメモリを約128MB使います。スマートフォンやスタンドアロンのVR機器では重くなります。
          </p>
        ) : null}
        <div>
          <span className="block text-xs font-medium text-slate-700">品質</span>
          <div className="mt-1 flex overflow-hidden rounded border border-slate-300" role="group" aria-label="ベイクの品質">
            {QUALITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={locked}
                aria-pressed={settings.quality === option.value}
                title={option.hint}
                onClick={() => onSettingsChange({ quality: option.value })}
                className={`flex-1 px-2 py-1.5 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 disabled:cursor-not-allowed ${settings.quality === option.value ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            {QUALITY_OPTIONS.find((option) => option.value === settings.quality)?.hint}
          </p>
        </div>
        <label className="block">
          <span className="flex items-center justify-between text-xs font-medium text-slate-700">
            <span>影のやわらかさ</span>
            <span className="font-normal text-slate-500">{Math.round(settings.softness * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.softness}
            disabled={locked}
            onChange={(event) => onSettingsChange({ softness: Number(event.currentTarget.value) })}
            className="mt-1 w-full accent-violet-600 disabled:cursor-not-allowed"
            aria-label="影のやわらかさ"
          />
          <span className="block text-[11px] leading-4 text-slate-500">
            「ベイク」にしたライトの影の縁を、どれだけぼかすかを決めます
          </span>
        </label>
      </Section>
    </div>
  );
}
