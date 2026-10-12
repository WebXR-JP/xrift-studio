import { useMemo, useSyncExternalStore } from "react";
import { FEDERATION_SHARED_VERSIONS, ItemLoadError, type ItemLoaderContextValue, type LoadedItem } from "@xrift/world-components";
import { tauri } from "../tauri";

type FederationScope = Record<string, Record<string, { get: () => Promise<() => unknown>; loaded: boolean; scope: string }>>;
type ItemContainer = { init: (scope: FederationScope) => Promise<void>; get: (name: string) => Promise<() => { Item?: LoadedItem["Item"] }> };
type ImportItem = (url: string) => Promise<ItemContainer>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let shareScope: Promise<FederationScope> | undefined;
async function studioShareScope(): Promise<FederationScope> {
  shareScope ??= (async () => {
    const imports = {
      react: () => import("react"),
      "react-dom": () => import("react-dom"),
      "react/jsx-runtime": () => import("react/jsx-runtime"),
      three: () => import("three"),
      "three/addons/loaders/GLTFLoader.js": () => import("three/examples/jsm/loaders/GLTFLoader.js"),
      "three/addons/loaders/DRACOLoader.js": () => import("three/examples/jsm/loaders/DRACOLoader.js"),
      "three/addons/loaders/KTX2Loader.js": () => import("three/examples/jsm/loaders/KTX2Loader.js"),
      "@react-three/fiber": () => import("@react-three/fiber"),
      "@react-three/rapier": () => import("@react-three/rapier"),
      "@react-three/drei": () => import("@react-three/drei"),
      "@react-three/uikit": () => import("@react-three/uikit"),
      "@pmndrs/uikit": () => import("@pmndrs/uikit"),
      "@xrift/world-components": () => import("@xrift/world-components"),
    };
    // Use the official federation labels, not installed package versions. Old
    // publications rely on these labels while sharing the editor's real modules.
    const entries = await Promise.all(Object.entries(imports).map(async ([name, load]) => {
      const module = await load();
      const version = FEDERATION_SHARED_VERSIONS[name as keyof typeof FEDERATION_SHARED_VERSIONS];
      return [name, { [version]: { get: async () => () => module, loaded: true, scope: "default" } }];
    }));
    const scope: FederationScope = Object.fromEntries(entries);
    const client = await import("react-dom/client");
    scope["react-dom/client"] = { [FEDERATION_SHARED_VERSIONS["react-dom"]]: { get: async () => () => client, loaded: true, scope: "default" } };
    return scope;
  })().catch((error) => { shareScope = undefined; throw error; });
  return shareScope;
}

/** Same remoteEntry.js / ./Item contract as the official DevEnvironment. */
export function createStudioItemLoader(
  resolveSceneUrl: (id: string) => Promise<string>,
  importItem: ImportItem = (url) => import(/* @vite-ignore */ url),
  getScope: () => Promise<FederationScope> = studioShareScope,
): ItemLoaderContextValue {
  const cache = new Map<string, Promise<LoadedItem>>();
  return {
    load(rawId) {
      const id = rawId.trim().toLowerCase();
      if (!UUID.test(id)) return Promise.reject(new ItemLoadError("NOT_FOUND", "Item IDにはアイテムのUUIDを指定してください"));
      const previous = cache.get(id);
      if (previous) return previous;
      const loading = (async () => {
        const sceneUrl = await resolveSceneUrl(id);
        const url = new URL(sceneUrl);
        if (url.protocol !== "https:" || url.username || url.password) throw new ItemLoadError("LOAD_FAILED", "アイテムの配信URLを確認できません");
        const container = await importItem(sceneUrl);
        await container.init(await getScope());
        const module = (await container.get("./Item"))();
        if (!module.Item) throw new ItemLoadError("LOAD_FAILED", "配信物にItem Componentがありません");
        return { Item: module.Item, sceneUrl };
      })().catch((error: unknown) => {
        cache.delete(id);
        throw error;
      });
      cache.set(id, loading);
      return loading;
    },
  };
}

let previewToken = ""; // Browser session only; never saved in a document or Web Storage.
let revision = 0;
const listeners = new Set<() => void>();
export function retryStudioItemLoading(token?: string): void {
  if (token !== undefined) previewToken = token.trim();
  revision++;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
async function resolveStudioItem(id: string): Promise<string> {
  if (tauri.isAvailable()) {
    try { return await tauri.resolveXriftItem(id); }
    catch (error) {
      const message = String(error);
      const code = ["LOGIN_REQUIRED", "NOT_FOUND", "FORBIDDEN", "LOAD_FAILED"] as const;
      const known = code.find((value) => message.startsWith(`${value}:`));
      throw new ItemLoadError(known ?? "LOAD_FAILED", known ? message.slice(known.length + 1) : "アイテムの読み込みに失敗しました。再試行してください");
    }
  }
  if (!previewToken || /\s/.test(previewToken)) throw new ItemLoadError("LOGIN_REQUIRED", "Inspectorでプレビュー用APIキーを入力してください");
  const response = await fetch(`https://api.xrift.net/api/public/v1/items/${id}/resolve`, {
    headers: { Authorization: `Bearer ${previewToken}`, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 401) throw new ItemLoadError("LOGIN_REQUIRED", "APIキーを確認してください");
  if (response.status === 403) throw new ItemLoadError("FORBIDDEN", "このアイテムを使う権利がありません");
  if (response.status === 404) throw new ItemLoadError("NOT_FOUND", "アイテムが見つかりません");
  if (!response.ok) throw new ItemLoadError("LOAD_FAILED", "アイテムを読み込めません。再試行してください");
  const body = await response.json() as { sceneUrl?: unknown };
  if (typeof body.sceneUrl !== "string") throw new ItemLoadError("NOT_FOUND", "このアイテムは審査中、または配信できる版がありません");
  return body.sceneUrl;
}
export function useStudioItemLoader(): ItemLoaderContextValue {
  const currentRevision = useSyncExternalStore(subscribe, () => revision, () => revision);
  return useMemo(() => createStudioItemLoader(resolveStudioItem), [currentRevision]);
}
