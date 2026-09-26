import primitiveGeometrySource from "../../../../packages/xrift-studio-runtime/src/primitive-geometry.tsx?raw";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "../creation-catalog";
import { BUILTIN_ASSET_IDS, createPrototypeProject } from "../prototype-project";
import { addBuiltinPrimitiveEntity } from "../scene-document";
import { compileVisualProject } from "./compile";

/** Primitive-only output cannot rely on a Model or Script to supply its renderer. */
export function runPrimitiveGeometryCompilerFixtureAssertions() {
  const prototype = createPrototypeProject("world", "primitive-geometry-only");
  const primitives = ["box", "sphere", "cylinder", "cone", "plane"] as const;
  let scene = { ...prototype.scene, rootEntityIds: [] as string[], entities: {} };
  for (const primitive of primitives) {
    const creationId = BUILTIN_PRIMITIVE_CREATION_IDS[primitive];
    const placed = addBuiltinPrimitiveEntity(scene, prototype.assets, creationId, BUILTIN_ASSET_IDS.material.blue);
    assert(placed, `Primitive placement failed for ${creationId}`);
    scene = placed.scene;
  }
  const result = compileVisualProject({
    project: prototype.project,
    scenes: { [scene.sceneId]: scene },
    assets: prototype.assets,
    prefabs: prototype.prefabs,
  });
  assert(result.canStage, "The primitive-only World must compile");
  const source = result.overlayFiles.find((file) => file.relativePath === "src/World.tsx")?.content ?? "";
  for (const primitive of primitives) {
    assert(source.includes(`<XriftPrimitiveGeometry primitive="${primitive}" />`),
      `The World must use the shared renderer for ${primitive}`);
  }
  const geometryFiles = result.overlayFiles.filter((file) => file.relativePath === "src/xrift-studio/primitive-geometry.tsx");
  assert(geometryFiles.length === 1 && geometryFiles[0].content === primitiveGeometrySource,
    "Publication must ship the exact primitive renderer used by the editor, once");
  assert(!/<(?:box|sphere|cylinder|cone|plane)Geometry\b/.test(source),
    "The compiler must not redefine primitive topology inside the generated World");
  return result;
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
