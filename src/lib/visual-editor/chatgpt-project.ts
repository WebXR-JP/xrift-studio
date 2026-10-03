import type { PrototypeVisualProject } from './prototype-project';
import { visualProjectDocumentCodec, sceneDocumentCodec, assetManifestCodec, prefabDocumentCodec, type VisualDocumentCodec } from './serialization';
/** The remote transformer receives document JSON only, never source asset bytes. */
export function validateBundle(value: unknown): PrototypeVisualProject {
  const json = JSON.stringify(value);
  if (!json || new TextEncoder().encode(json).byteLength > 1024 * 1024) throw new Error('会話で編集するデータは1 MBまでです。大きな作品はStudioで編集してください');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('編集データが不正です');
  const raw = value as Record<string, unknown>;
  function parse<T>(codec: VisualDocumentCodec<T>, input: unknown, section: string): T {
    const result = codec.parse(JSON.stringify(input));
    if (!result.ok) throw new Error(`bundle.${section}を読み取れません: ${result.issues.slice(0, 5).map(issue => `${issue.path} (${issue.code})`).join(', ')}。直前のツール結果のbundleを省略・変更せず引き継いでください`);
    return result.document;
  }
  const project = parse(visualProjectDocumentCodec, raw.project, 'project');
  const scene = parse(sceneDocumentCodec, raw.scene, 'scene');
  const assets = parse(assetManifestCodec, raw.assets, 'assets');
  if (scene.sceneId !== project.entrySceneId) throw new Error('編集対象のSceneが一致しません');
  if (!raw.prefabs || typeof raw.prefabs !== 'object' || Array.isArray(raw.prefabs)) throw new Error('Prefabが不正です。bundle.prefabsはPrefab IDをキーにしたオブジェクトです。空の場合も{}を含め、直前のツール結果のbundleを省略せず引き継いでください');
  const prefabs = Object.fromEntries(Object.entries(raw.prefabs).map(([id, data]) => {
    const prefab = parse(prefabDocumentCodec, data, 'prefabs');
    return [id, prefab];
  }));
  return { project, scene, assets, prefabs };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export async function bundleHash(bundle: PrototypeVisualProject): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(validateBundle(bundle))));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
