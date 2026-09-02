import { useEffect, useState } from "react";
import { ExternalLink, Upload } from "lucide-react";

/** Documents the editor hands over when the author asks to publish. */
export type WebUploadBundle = {
  project: { metadata: { title: string; description: string } };
  scene: { sceneId: string };
  assets: unknown;
  prefabs: unknown;
};

type WebUploadState =
  | { phase: "form" }
  | { phase: "running"; label: string; percent: number; detail?: string }
  | { phase: "done"; worldId: string; versionNumber: number }
  | { phase: "failed"; message: string };

/**
 * Publishes the browser editor's scene straight to XRift.
 *
 * The desktop build hands this job to the official CLI, which needs a shell
 * and a filesystem. Here the scene travels as data (`xrift/runtime.json`)
 * alongside the prebuilt runtime shell, so no build step is involved. The
 * token is typed in each time rather than stored: this page keeps no account
 * state, and an upload-capable credential should not outlive the tab by
 * accident.
 */
export function WebUploadDialog({
  bundle,
  onClose,
}: {
  bundle: WebUploadBundle | null;
  onClose: () => void;
}) {
  const [token, setToken] = useState("");
  const [state, setState] = useState<WebUploadState>({ phase: "form" });

  useEffect(() => {
    if (bundle) setState({ phase: "form" });
  }, [bundle]);

  if (!bundle) return null;

  const running = state.phase === "running";

  const start = async () => {
    setState({ phase: "running", label: "準備しています", percent: 4 });
    try {
      // Loaded on demand so the landing page does not carry the SDK.
      const [{ uploadVisualProjectFromWeb, loadRuntimeShell }] =
        await Promise.all([import("../lib/visual-editor/web-upload")]);
      setState({
        phase: "running",
        label: "ランタイムシェルを読み込んでいます",
        percent: 12,
      });
      const shellFiles = await loadRuntimeShell();

      const result = await uploadVisualProjectFromWeb({
        kind: "world",
        documents: {
          project: bundle.project,
          scenes: { [bundle.scene.sceneId]: bundle.scene },
          assets: bundle.assets,
          prefabs: bundle.prefabs,
        } as never,
        token,
        shellFiles,
        // The browser editor has no Asset storage: imports are written to disk
        // over Tauri IPC, so a scene built here can only reference built-ins.
        readAssetBytes: async (relativePath) => {
          throw new Error(
            `素材「${relativePath}」はブラウザ版では読み取れません。素材を含むワールドはデスクトップ版から公開してください。`,
          );
        },
        report: (progress) =>
          setState({
            phase: "running",
            label: progress.label,
            percent: progress.percent ?? 0,
            detail: progress.detail,
          }),
        signal: new AbortController().signal,
      });

      setState({
        phase: "done",
        worldId: result.worldId ?? result.contentId ?? "",
        versionNumber: result.versionNumber ?? 0,
      });
    } catch (error) {
      setState({
        phase: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className="preview-web-upload-backdrop" role="dialog" aria-modal="true">
      <div className="preview-web-upload">
        <h2 className="preview-web-upload-title">XRiftへ公開</h2>

        {state.phase === "form" ? (
          <>
            <p className="preview-web-upload-lead">
              ブラウザから直接アップロードします。
              <code>xrift login</code>
              で取得したCLIトークン（xrf_）か、
              <code>write:worlds</code>
              スコープを付けて発行したAPIキー（xrift_sk_）を入力してください。
            </p>
            <label className="preview-web-upload-field">
              <span>XRiftトークン</span>
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="xrf_..."
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <p className="preview-web-upload-note">
              素材を取り込んだワールドと、Scriptを含むワールドは、いまのところデスクトップ版から公開してください。
            </p>
          </>
        ) : null}

        {running ? (
          <div className="preview-web-upload-progress">
            <p className="preview-web-upload-label">{state.label}</p>
            <div className="preview-web-upload-track">
              <div
                className="preview-web-upload-bar"
                style={{ width: `${state.percent}%` }}
              />
            </div>
            {state.detail ? (
              <p className="preview-web-upload-detail">{state.detail}</p>
            ) : null}
          </div>
        ) : null}

        {state.phase === "done" ? (
          <div className="preview-web-upload-result">
            <p className="preview-web-upload-label">アップロードが完了しました</p>
            <p className="preview-web-upload-detail">
              ワールドID {state.worldId} / バージョン {state.versionNumber}
            </p>
            {/*
              Links to the app root rather than a per-world path. The SDK's
              completion response carries no URL, and XRift's site answers 200
              for every path, so a deep link cannot be confirmed from here —
              guessing one risks sending the author to a page that is not
              their world. The id above is what identifies it.
            */}
            <a
              className="preview-button preview-button-primary"
              href="https://app.xrift.net"
              target="_blank"
              rel="noreferrer"
            >
              XRiftを開く
              <ExternalLink size={14} />
            </a>
          </div>
        ) : null}

        {state.phase === "failed" ? (
          <p className="preview-web-upload-error">{state.message}</p>
        ) : null}

        <div className="preview-web-upload-actions">
          <button
            type="button"
            className="preview-button preview-button-light"
            onClick={onClose}
            disabled={running}
          >
            {state.phase === "done" ? "閉じる" : "やめる"}
          </button>
          {state.phase === "form" || state.phase === "failed" ? (
            <button
              type="button"
              className="preview-button preview-button-primary"
              onClick={() => void start()}
              disabled={!token.trim()}
            >
              <Upload size={15} />
              {state.phase === "failed" ? "もう一度試す" : "アップロード"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
