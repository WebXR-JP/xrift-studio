import { useCallback, useRef, useState } from "react";
import type { AssetManifest } from "../../lib/visual-editor";
import { tauri } from "../../lib/tauri";

export type ShaderEditorState = {
  openAssetId: string | null;
  source: string;
  loading: boolean;
  error: string | null;
};

/** Reads and writes imported GLSL files using the same project-file boundary as Scripts. */
export function useShaderEditor({
  assets,
  projectPath,
  onSaved,
}: {
  assets: AssetManifest;
  projectPath?: string;
  onSaved?: (assetId: string, source: string) => void | Promise<void>;
}) {
  const [state, setState] = useState<ShaderEditorState>({
    openAssetId: null,
    source: "",
    loading: false,
    error: null,
  });
  const openAssetIdRef = useRef<string | null>(null);
  const readRevisionRef = useRef(0);

  const open = useCallback(
    async (assetId: string) => {
      const asset = assets.assets[assetId];
      if (!asset || asset.kind !== "shader") return;
      const readRevision = ++readRevisionRef.current;
      openAssetIdRef.current = assetId;
      setState({ openAssetId: assetId, source: "", loading: true, error: null });
      if (!projectPath) {
        setState({
          openAssetId: assetId,
          source: "",
          loading: false,
          error: "自動保存が完了するとGLSLを編集できます",
        });
        return;
      }
      try {
        const source = await tauri.readTextFile(
          projectPath,
          asset.source.relativePath,
        );
        if (readRevisionRef.current !== readRevision) return;
        setState({
          openAssetId: assetId,
          source,
          loading: false,
          error: null,
        });
      } catch (cause) {
        if (readRevisionRef.current !== readRevision) return;
        setState({
          openAssetId: assetId,
          source: "",
          loading: false,
          error:
            cause instanceof Error
              ? cause.message
              : "GLSLを読み込めませんでした",
        });
      }
    },
    [assets, projectPath],
  );

  const close = useCallback(() => {
    ++readRevisionRef.current;
    openAssetIdRef.current = null;
    setState({ openAssetId: null, source: "", loading: false, error: null });
  }, []);

  const save = useCallback(
    async (source: string) => {
      const assetId = state.openAssetId;
      if (!assetId || !projectPath) {
        throw new Error("自動保存が完了するとGLSLを保存できます");
      }
      const asset = assets.assets[assetId];
      if (!asset || asset.kind !== "shader") {
        throw new Error("シェーダー素材が見つかりません");
      }
      await tauri.writeTextFile(projectPath, asset.source.relativePath, source);
      setState((previous) => previous.openAssetId === assetId
        ? { ...previous, source, error: null }
        : previous);
      await onSaved?.(assetId, source);
    },
    [assets, onSaved, projectPath, state.openAssetId],
  );

  return { state, open, close, save };
}

export type ShaderEditor = ReturnType<typeof useShaderEditor>;
