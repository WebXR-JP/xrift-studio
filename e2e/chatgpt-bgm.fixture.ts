import { _roots } from "@react-three/fiber";
import { Audio as ThreeAudio } from "three";
import { tauri } from "../src/lib/tauri";
import { parseVisualProjectFiles, serializeVisualProjectDocuments } from "../src/lib/visual-editor/persistence";
import { createAssetImportPlan } from "../src/lib/visual-editor/asset-import";
import { commitAssetImportPlanToDisk } from "../src/lib/visual-editor/asset-import-persistence";
import { createEmptyEntity } from "../src/lib/visual-editor/editor-session";
import { createAudioSourceComponent } from "../src/lib/visual-editor/scene-document";
import { XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY, type XriftAudioSourceRuntimeBridge } from "../packages/xrift-studio-runtime/src/script/audio-source";

function silentWav() {
  const sampleRate = 16_000, samples = 4_000;
  const bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples * 2, true);
  return bytes;
}

/** Real PCM import/decode and Three Audio. Only native project disk is memory. */
export async function installBgmFixture(projectPath: string) {
  const documents = parseVisualProjectFiles(await tauri.readVisualProject(projectPath));
  const bytes = silentWav(), disk = new Map<string, string>();
  const invoke = window.__TAURI_INTERNALS__!.invoke!;
  window.__TAURI_INTERNALS__!.invoke = async (command, args, options) => {
    if (command === "commit_visual_asset_import" && args?.projectPath === projectPath) {
      for (const write of args.writes as { relativePath: string; dataUrl: string }[]) disk.set(write.relativePath, write.dataUrl);
    }
    if (command === "read_audio_data_url" && args?.projectPath === projectPath && disk.has(String(args.rel))) return disk.get(String(args.rel));
    return invoke(command, args, options);
  };
  const imported = await createAssetImportPlan({ fileName: "isolated-bgm.wav", bytes, mimeType: "audio/wav", displayName: "検証用BGM", existingManifest: documents.assets });
  if (!imported.canCommit || imported.asset?.kind !== "audio") throw new Error(JSON.stringify(imported.diagnostics));
  documents.assets = await commitAssetImportPlanToDisk(projectPath, documents.assets, imported);
  const scene = documents.scenes[documents.project.entrySceneId];
  const created = createEmptyEntity(scene, null, "BGMを鳴らすEntity");
  if (!created) throw new Error("BGM fixture Entity unavailable");
  const component = createAudioSourceComponent("component-real-bgm");
  if (!component) throw new Error("BGM fixture Audio Source unavailable");
  created.scene.entities[created.entityId].components.push(component);
  documents.scenes[scene.sceneId] = created.scene;
  await tauri.saveVisualProject(projectPath, serializeVisualProjectDocuments(documents));
  return { entityId: created.entityId, componentId: component.id, assetId: imported.asset.id, relativePath: imported.asset.source.kind === "project" ? imported.asset.source.relativePath : "", byteLength: bytes.length };
}

/** Observes the actual Audio object mounted in the active Editor Canvas. */
export function readBgmRuntime(componentId: string) {
  for (const root of _roots.values()) {
    let result: ReturnType<XriftAudioSourceRuntimeBridge["read"]> & { threePlaying: boolean; contextState: string; gain: number; decodedFrames: number } | undefined;
    root.store.getState().scene.traverse(object => {
      if (!(object instanceof ThreeAudio)) return;
      const bridge = object.userData[XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY] as XriftAudioSourceRuntimeBridge | undefined;
      const state = bridge?.read();
      if (state?.componentId === componentId) result = { ...state, threePlaying: object.isPlaying, contextState: object.context.state, gain: object.gain.gain.value, decodedFrames: object.buffer?.length ?? 0 };
    });
    if (result) return result;
  }
  return null;
}
