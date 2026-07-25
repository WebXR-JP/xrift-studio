import { useCallback, useEffect, useRef, useState } from "react";

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
  writeSource,
}: {
  assets: AssetManifest;
  projectPath?: string;
  /**
   * Called after a successful user-initiated write. The exact source is
   * included so the trust layer can approve the bytes the user just saved
   * before Play hot-reloads them.
   */
  onSaved?: (assetId: string, source: string) => void | Promise<void>;
  /** Optional app-level serialization boundary shared with MCP writes. */
  writeSource?: (
    projectPath: string,
    asset: ScriptAsset,
    source: string,
  ) => Promise<void>;
}) {
  const [state, setState] = useState<ScriptEditorState>({
    openAssetId: null,
    source: "",
    loading: false,
    error: null,
  });
  const openAssetIdRef = useRef<string | null>(null);
  const [contracts, setContracts] = useState<
    Readonly<Record<string, ScriptContract>>
  >({});
  const contractVersionsRef = useRef(new Map<string, number>());
  const setContract = useCallback(
    (assetId: string, contract: ScriptContract) => {
      contractVersionsRef.current.set(
        assetId,
        (contractVersionsRef.current.get(assetId) ?? 0) + 1,
      );
      setContracts((previous) => ({
        ...previous,
        [assetId]: contract,
      }));
    },
    [],
  );

  /** Declarations for every Script Asset, so the Inspector can render fields. */
  useEffect(() => {
    if (!projectPath) {
      setContracts({});
      return;
    }
    let active = true;
    const scripts = listScriptAssets(assets);
    const scriptIds = new Set(scripts.map((asset) => asset.id));
    const versions = new Map(
      scripts.map((asset) => [
        asset.id,
        contractVersionsRef.current.get(asset.id) ?? 0,
      ]),
    );
    setContracts((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([assetId]) =>
          scriptIds.has(assetId),
        ),
      ),
    );
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
      if (!active) return;
      setContracts((previous) => {
        const merged: Record<string, ScriptContract> = {};
        for (const asset of scripts) {
          const loaded = next[asset.id];
          const unchangedSinceRead =
            (contractVersionsRef.current.get(asset.id) ?? 0) ===
            versions.get(asset.id);
          if (loaded && unchangedSinceRead) merged[asset.id] = loaded;
          else if (previous[asset.id]) merged[asset.id] = previous[asset.id];
        }
        return merged;
      });
    })();
    return () => {
      active = false;
    };
  }, [assets, projectPath]);

  const open = useCallback(
    async (assetId: string, createdAsset?: ScriptAsset) => {
      const asset = createdAsset ?? assets.assets[assetId];
      if (!asset || asset.kind !== "script") return;
      openAssetIdRef.current = assetId;
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
        const contractVersion =
          contractVersionsRef.current.get(assetId) ?? 0;
        const source = await tauri.readTextFile(
          projectPath,
          asset.source.relativePath,
        );
        if (
          (contractVersionsRef.current.get(assetId) ?? 0) ===
          contractVersion
        ) {
          setContract(assetId, extractScriptContract(source));
        }
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
    [assets, projectPath, setContract],
  );

  const close = useCallback(() => {
    openAssetIdRef.current = null;
    setState({ openAssetId: null, source: "", loading: false, error: null });
  }, []);

  const acceptExternalSource = useCallback(
    (assetId: string, source: string): boolean => {
      if (openAssetIdRef.current !== assetId) return false;
      setState((previous) =>
        previous.openAssetId === assetId
          ? { ...previous, source, loading: false, error: null }
          : previous,
      );
      setContract(assetId, extractScriptContract(source));
      return true;
    },
    [setContract],
  );

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
      if (writeSource) {
        await writeSource(projectPath, asset, source);
      } else {
        await tauri.writeTextFile(
          projectPath,
          asset.source.relativePath,
          source,
        );
      }
      setState((previous) => ({ ...previous, source, error: null }));
      setContract(assetId, extractScriptContract(source));
      await onSaved?.(assetId, source);
    },
    [
      assets,
      onSaved,
      projectPath,
      setContract,
      state.openAssetId,
      writeSource,
    ],
  );

  return {
    state,
    contracts,
    setContract,
    acceptExternalSource,
    open,
    close,
    save,
  };
}

export type ScriptEditor = ReturnType<typeof useScriptEditor>;
