import { useCallback, useEffect, useState } from "react";

import type {
  AssetManifest,
  ScriptAsset,
} from "../../lib/visual-editor/asset-manifest";
import type { ScriptContract } from "../../lib/visual-editor/scripting/script-contract";
import { extractScriptContract } from "../../lib/visual-editor/scripting/script-contract";
import { listScriptAssets } from "../../lib/visual-editor/scripting/script-files";
import { tauri } from "../../lib/tauri";

/**
 * Owns Script source reading, saving, and the derived property declarations.
 *
 * Sources are project files rather than manifest content, so they are read and
 * written outside the document save transaction. Keeping the manifest entry
 * unchanged on every keystroke is what stops a Script save from bumping every
 * Entity revision during Play. See docs/SCRIPTING.md.
 */

export type ScriptEditorState = {
  openAssetId: string | null;
  source: string;
  loading: boolean;
  error: string | null;
};

export function useScriptEditor({
  assets,
  projectPath,
  onSaved,
}: {
  assets: AssetManifest;
  projectPath?: string;
  /** Called after a successful write so Play can restart affected Entities. */
  onSaved?: (assetId: string) => void;
}) {
  const [state, setState] = useState<ScriptEditorState>({
    openAssetId: null,
    source: "",
    loading: false,
    error: null,
  });
  const [contracts, setContracts] = useState<
    Readonly<Record<string, ScriptContract>>
  >({});

  /** Declarations for every Script Asset, so the Inspector can render fields. */
  useEffect(() => {
    if (!projectPath) return;
    let active = true;
    const scripts = listScriptAssets(assets);
    void (async () => {
      const next: Record<string, ScriptContract> = {};
      for (const asset of scripts) {
        try {
          const source = await tauri.readTextFile(
            projectPath,
            asset.source.relativePath,
          );
          next[asset.id] = extractScriptContract(source);
        } catch {
          // A missing file surfaces in the editor and at compile time.
        }
      }
      if (active) setContracts(next);
    })();
    return () => {
      active = false;
    };
  }, [assets, projectPath]);

  const open = useCallback(
    async (assetId: string, createdAsset?: ScriptAsset) => {
      const asset = createdAsset ?? assets.assets[assetId];
      if (!asset || asset.kind !== "script") return;
      setState({ openAssetId: assetId, source: "", loading: true, error: null });
      if (!projectPath) {
        setState({
          openAssetId: assetId,
          source: "",
          loading: false,
          error: "プロジェクトを保存するとScriptを編集できます",
        });
        return;
      }
      try {
        const source = await tauri.readTextFile(
          projectPath,
          asset.source.relativePath,
        );
        setState({
          openAssetId: assetId,
          source,
          loading: false,
          error: null,
        });
      } catch (error) {
        setState({
          openAssetId: assetId,
          source: "",
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Scriptを読み込めませんでした",
        });
      }
    },
    [assets, projectPath],
  );

  const close = useCallback(() => {
    setState({ openAssetId: null, source: "", loading: false, error: null });
  }, []);

  const save = useCallback(
    async (source: string) => {
      const assetId = state.openAssetId;
      if (!assetId || !projectPath) {
        throw new Error("プロジェクトを保存するとScriptを保存できます");
      }
      const asset = assets.assets[assetId];
      if (!asset || asset.kind !== "script") {
        throw new Error("Script Assetが見つかりません");
      }
      await tauri.writeTextFile(
        projectPath,
        asset.source.relativePath,
        source,
      );
      setState((previous) => ({ ...previous, source, error: null }));
      setContracts((previous) => ({
        ...previous,
        [assetId]: extractScriptContract(source),
      }));
      onSaved?.(assetId);
    },
    [assets, onSaved, projectPath, state.openAssetId],
  );

  return { state, contracts, open, close, save };
}

export type ScriptEditor = ReturnType<typeof useScriptEditor>;
