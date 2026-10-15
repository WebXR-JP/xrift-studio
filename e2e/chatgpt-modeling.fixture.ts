import { _roots } from "@react-three/fiber";
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from "three";
import type { BlenderModelSpec } from "../src/lib/visual-editor/chatgpt-modeling";

/** Native Blender output is supplied unchanged; import, save and rendering are real. */
export function installBlenderOutput(projectPath: string, dataUrl: string, byteLength: number) {
  const disk = new Map<string, string>();
  const calls: BlenderModelSpec[] = [];
  const invoke = window.__TAURI_INTERNALS__!.invoke!;
  const outputPath = `${projectPath}\\.cache\\xrift-studio-blender\\isolated-native-output\\model.glb`;
  window.__TAURI_INTERNALS__!.invoke = async (command, args, options) => {
    if (command === "get_blender_status") return { available: true, version: "Blender 5.1.2" };
    if (command === "create_blender_model" && args?.projectPath === projectPath) {
      calls.push(args.model as BlenderModelSpec);
      return { path: outputPath, fileName: "model.glb", byteLength };
    }
    if (command === "read_local_model_import_source" && args?.sourcePath === outputPath) return { fileName: "model.glb", byteLength, mimeType: "model/gltf-binary", dataUrl };
    if (command === "commit_visual_asset_import" && args?.projectPath === projectPath) {
      for (const write of args.writes as { relativePath: string; dataUrl: string }[]) disk.set(write.relativePath, write.dataUrl);
    }
    if (command === "read_image_data_url" && args?.projectPath === projectPath && disk.has(String(args.rel))) return disk.get(String(args.rel));
    return invoke(command, args, options);
  };
  return { outputPath, byteLength, calls };
}

/** Inspect Mesh objects mounted by the ordinary Editor/Play renderer. */
export function readModelRuntime(entityId: string) {
  for (const root of _roots.values()) {
    let result: { meshCount: number; vertexCount: number; materials: { name: string; metallic: number; roughness: number }[]; size: number[] } | undefined;
    root.store.getState().scene.traverse(object => {
      if (object.userData.authoringEntityId !== entityId) return;
      let meshCount = 0, vertexCount = 0;
      const materials: { name: string; metallic: number; roughness: number }[] = [];
      object.traverse(child => {
        if (!(child instanceof Mesh) || !child.geometry.attributes.position) return;
        const modelMaterials = (Array.isArray(child.material) ? child.material : [child.material]).filter((material): material is MeshStandardMaterial => material instanceof MeshStandardMaterial);
        // Selection and collider helpers have separate non-PBR Materials.
        if (!modelMaterials.length) return;
        meshCount++; vertexCount += child.geometry.attributes.position.count;
        for (const material of modelMaterials) materials.push({ name: material.name, metallic: material.metalness, roughness: material.roughness });
      });
      if (meshCount) result = { meshCount, vertexCount, materials, size: new Box3().setFromObject(object).getSize(new Vector3()).toArray() };
    });
    if (result) return result;
  }
  return null;
}

/** Observe the active Editor's environment without creating another Scene. */
export function readSceneEnvironmentRuntime() {
  for (const root of _roots.values()) {
    const state = root.store.getState();
    if (!state.gl.domElement.isConnected) continue;
    let hasEditorEntity = false;
    const skies: { exposure?: number; topColor?: string; bottomColor?: string }[] = [];
    state.scene.traverse(object => {
      if (object.userData.authoringEntityId === "starter-floor") hasEditorEntity = true;
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const uniforms = (material as unknown as { uniforms?: Record<string, { value: unknown }> }).uniforms;
        if (!uniforms?.uExposure) continue;
        const color = (value: unknown) => value && typeof (value as { getHexString?: unknown }).getHexString === "function"
          ? `#${(value as { getHexString: () => string }).getHexString()}` : undefined;
        skies.push({ exposure: typeof uniforms.uExposure.value === "number" ? uniforms.uExposure.value : undefined,
          topColor: color(uniforms.uTopColor?.value), bottomColor: color(uniforms.uBottomColor?.value) });
      }
    });
    if (!hasEditorEntity) continue;
    const fog = state.scene.fog as { color: { getHexString: () => string }; near?: number; far?: number } | null;
    return { fog: fog ? { color: `#${fog.color.getHexString()}`, near: fog.near, far: fog.far } : null,
      skies, backgroundIntensity: state.scene.backgroundIntensity, environmentIntensity: state.scene.environmentIntensity,
      environment: Boolean(state.scene.environment), drawCalls: state.gl.info.render.calls, contextLost: state.gl.getContext().isContextLost() };
  }
  return null;
}
