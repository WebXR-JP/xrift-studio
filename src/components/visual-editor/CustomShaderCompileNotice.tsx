import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type {
  AssetManifest,
  MaterialAsset,
  ShaderAssetStage,
} from "../../lib/visual-editor";
import {
  collectCustomShaderCompileLines,
  collectCustomShaderLinkMessages,
  compilableCustomShader,
  customShaderCompileStore,
  customShaderSourceKey,
  resolveCustomShaderCompile,
  type CustomShaderCompileIssue,
  type CustomShaderCompileLine,
  type CustomShaderCompileState,
} from "../../lib/visual-editor/custom-shader-compile";

/** Typing pauses longer than this before the Scene View is asked to compile. */
const REQUEST_DELAY_MS = 250;
const VISIBLE_LINES = 4;
/** A GLSL Asset can feed many Materials; the editor follows the first few. */
const MAX_FOLLOWED_MATERIALS = 8;

const STAGE_LABEL: Record<ShaderAssetStage, string> = {
  vertex: "頂点シェーダー",
  fragment: "フラグメントシェーダー",
};

type FollowedCompile = {
  material: MaterialAsset;
  state: CustomShaderCompileState;
};

/**
 * Follows whether the Custom Shaders of `materials` compile.
 *
 * Showing a Material is what asks the Scene View to compile it, so an error
 * appears for a Material no mesh uses yet, and a result for GLSL that has since
 * changed is never shown.
 */
export function useCustomShaderCompiles(
  materials: readonly MaterialAsset[],
): FollowedCompile[] {
  const snapshots = useSyncExternalStore(
    customShaderCompileStore.subscribe,
    customShaderCompileStore.getSnapshots,
    customShaderCompileStore.getSnapshots,
  );
  const sceneViewReady = useSyncExternalStore(
    customShaderCompileStore.subscribe,
    customShaderCompileStore.hasChecker,
    customShaderCompileStore.hasChecker,
  );
  const followed = useMemo(
    () =>
      materials.flatMap((material) => {
        const shader = compilableCustomShader(material);
        return shader
          ? [{ material, shader, sourceKey: customShaderSourceKey(shader) }]
          : [];
      }),
    [materials],
  );
  const requestKey = followed
    .map((entry) => `${entry.material.id}\n${entry.sourceKey}`)
    .join("\n\n");
  const followedRef = useRef(followed);
  followedRef.current = followed;
  useEffect(() => {
    if (!sceneViewReady || requestKey === "") return;
    const timer = window.setTimeout(() => {
      for (const entry of followedRef.current) {
        customShaderCompileStore.request(entry.material);
      }
    }, REQUEST_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [requestKey, sceneViewReady]);
  return useMemo(
    () =>
      followed.map((entry) => ({
        material: entry.material,
        state: resolveCustomShaderCompile(
          snapshots[entry.material.id],
          entry.shader,
          entry.sourceKey,
        ),
      })),
    [followed, snapshots],
  );
}

function lineLabel(line: CustomShaderCompileLine): string {
  const stage = STAGE_LABEL[line.stage];
  const place =
    line.line === undefined
      ? stage
      : line.include
        ? `${stage} ${line.line}行目の #include <${line.include}>`
        : `${stage} ${line.line}行目`;
  return line.variants?.length ? `${place}（variant: ${line.variants.join("、")}）` : place;
}

function rawLog(issues: readonly CustomShaderCompileIssue[]): string {
  return issues
    .map((issue) =>
      [
        issue.variants.length > 0 ? `variant: ${issue.variants.join(", ")}` : "",
        issue.instanced ? "instanced mesh" : "",
        issue.skinned ? "skinned mesh" : "",
        issue.programLog ? `Program Info Log:\n${issue.programLog}` : "",
        issue.vertexLog ? `Vertex Shader Log:\n${issue.vertexLog}` : "",
        issue.fragmentLog ? `Fragment Shader Log:\n${issue.fragmentLog}` : "",
      ]
        .filter((part) => part.length > 0)
        .join("\n"),
    )
    .join("\n\n");
}

/**
 * Tells the author, in the Material's Inspector, that its GLSL does not compile
 * and which line the compiler named. Renders nothing while the shader compiles.
 */
export function CustomShaderCompileNotice({ material }: { material: MaterialAsset }) {
  const materials = useMemo(() => [material], [material]);
  const state = useCustomShaderCompiles(materials)[0]?.state;
  if (state?.status !== "error") return null;
  const nameVariants =
    material.shader?.kind === "classic-r3f" && material.shader.variants.length > 1;
  const lines = collectCustomShaderCompileLines(state.issues, { nameVariants });
  const linkMessages = collectCustomShaderLinkMessages(state.issues);
  const hidden = Math.max(0, lines.length - VISIBLE_LINES);
  const log = rawLog(state.issues);
  return (
    <div
      role="alert"
      data-custom-shader-compile="error"
      className="rounded-md border border-rose-200 bg-rose-50 p-2 text-[11px] leading-4 text-rose-800"
    >
      <p className="font-semibold">GLSLをコンパイルできません</p>
      <p className="mt-0.5">
        このマテリアルを割り当てたメッシュは表示されません。
      </p>
      <ul className="mt-1.5 space-y-1">
        {lines.slice(0, VISIBLE_LINES).map((line, index) => (
          <li key={`${line.stage}:${line.reportedLine}:${index}`}>
            <span className="font-semibold">{lineLabel(line)}</span>
            <span className="block select-text font-mono text-[10px] [overflow-wrap:anywhere]">
              {line.message}
            </span>
          </li>
        ))}
        {linkMessages.map((message) => (
          <li key={message}>
            <span className="font-semibold">頂点とフラグメントの組み合わせ</span>
            <span className="block select-text whitespace-pre-wrap font-mono text-[10px] [overflow-wrap:anywhere]">
              {message}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 ? <p className="mt-1">ほかに{hidden}件あります。</p> : null}
      <p className="mt-1.5">
        「シェーダーコード」の「編集」でこの行を直してください。保存すると、この表示は消えます。
      </p>
      {log ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer font-semibold">コンパイラのログ</summary>
          <pre className="mt-1 max-h-40 select-text overflow-auto whitespace-pre-wrap rounded border border-rose-200 bg-white p-1.5 font-mono text-[10px] leading-4 text-slate-700 [overflow-wrap:anywhere]">
            {log}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

/** What the open GLSL editor is editing: a Material's own code, or a GLSL Asset. */
export type ShaderEditorCompileTarget =
  | { kind: "material"; assetId: string }
  | { kind: "asset"; assetId: string };

/**
 * The same failure, shown above the GLSL the author is typing into.
 *
 * A GLSL Asset has no compile result of its own - only the Materials that use
 * it are compiled - so its editor follows those Materials.
 */
export function ShaderEditorCompileNotice({
  assets,
  target,
  stage,
}: {
  assets: AssetManifest;
  target: ShaderEditorCompileTarget;
  stage: ShaderAssetStage;
}) {
  const materials = useMemo(() => {
    if (target.kind === "material") {
      const material = assets.assets[target.assetId];
      return material?.kind === "material" ? [material] : [];
    }
    const users: MaterialAsset[] = [];
    for (const asset of Object.values(assets.assets)) {
      if (users.length >= MAX_FOLLOWED_MATERIALS) break;
      if (asset.kind !== "material" || asset.shader?.kind !== "classic-r3f") continue;
      const source =
        stage === "vertex"
          ? asset.shader.vertexShaderAssetId
          : asset.shader.fragmentShaderAssetId;
      if (source === target.assetId) users.push(asset);
    }
    return users;
  }, [assets, stage, target.assetId, target.kind]);
  const failed = useCustomShaderCompiles(materials).filter(
    (entry) => entry.state.status === "error",
  );
  if (failed.length === 0) return null;
  const issues = failed.flatMap((entry) => entry.state.issues);
  const lines = collectCustomShaderCompileLines(issues);
  const here = lines.filter((line) => line.stage === stage);
  const elsewhere = lines.filter((line) => line.stage !== stage);
  const linkMessages = collectCustomShaderLinkMessages(issues);
  const otherStage = STAGE_LABEL[stage === "vertex" ? "fragment" : "vertex"];
  return (
    <div
      role="alert"
      data-shader-editor-compile="error"
      className="max-h-36 shrink-0 overflow-y-auto border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700"
    >
      <p className="font-semibold">
        {target.kind === "asset"
          ? `マテリアル${failed.map((entry) => `「${entry.material.name}」`).join("")}でGLSLをコンパイルできません。`
          : "GLSLをコンパイルできません。"}
        {here.length > 0
          ? "次の行を直してください。保存すると、この表示は消えます。"
          : elsewhere.length > 0
            ? `エラーは${otherStage}にあります。直して保存すると、この表示は消えます。`
            : "頂点シェーダーとフラグメントシェーダーの組み合わせを確認してください。直して保存すると、この表示は消えます。"}
      </p>
      <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
        {here.map((line, index) => (
          <li key={`here:${line.reportedLine}:${index}`} className="select-text [overflow-wrap:anywhere]">
            {line.line === undefined
              ? line.message
              : line.include
                ? `${line.line}行目の #include <${line.include}>: ${line.message}`
                : `${line.line}行目: ${line.message}`}
          </li>
        ))}
        {elsewhere.map((line, index) => (
          <li key={`elsewhere:${line.reportedLine}:${index}`} className="select-text [overflow-wrap:anywhere]">
            {lineLabel(line)}: {line.message}
          </li>
        ))}
        {linkMessages.map((message) => (
          <li key={message} className="select-text whitespace-pre-wrap [overflow-wrap:anywhere]">
            頂点とフラグメントの組み合わせ: {message}
          </li>
        ))}
      </ul>
    </div>
  );
}
