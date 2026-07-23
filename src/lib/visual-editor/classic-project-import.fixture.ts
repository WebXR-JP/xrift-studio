import {
  applyClassicProjectVisualImportEnhancements,
  augmentClassicProjectVisualImportPlan,
  createClassicProjectVisualImportPreview,
  inspectClassicProjectVisualSource,
  type ClassicProjectVisualImportSource,
} from "./classic-project-import";
import {
  analyzeComponentProject,
  applyComponentCodeImportPlan,
} from "./component-code-import";
import {
  DEFAULT_MODEL_IMPORT_SETTINGS,
  normalizeTextureImportSettings,
  type ModelAsset,
  type TextureAsset,
} from "./asset-manifest";
import {
  createClassicImportBaseProject,
  createPrototypeProject,
} from "./prototype-project";
import { getTransform } from "./scene-document";

/** Static Townscape-like source coverage without cloning or executing a project. */
export function runClassicProjectImportFixtureAssertions(): void {
  for (const kind of ["world", "item"] as const) {
    const base = createClassicImportBaseProject(kind, `classic-${kind}`);
    assert(
      base.scene.rootEntityIds.length === 0 &&
        Object.keys(base.scene.entities).length === 0,
      `Classic ${kind} conversion must start from a completely empty Scene`,
    );
    assert(
      !Object.values(base.scene.entities).some((entity) =>
        entity.components.some(
          (component) =>
            component.type === "spawn-point" ||
            component.type === "light" ||
            (component.type === "xrift-component" &&
              component.schemaId === "xrift.spawn-point"),
        ),
      ),
      `Classic ${kind} conversion must not inject a light or SpawnPoint`,
    );
  }

  const townSource = [
    "import * as THREE from 'three'",
    "const DEEP_COLOR = new THREE.Color(0x3f7280)",
    "const vertexShader = `uniform float uTime; varying vec2 vUV; void main(){vUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`",
    "const fragmentShader = `uniform sampler2D uColorTex; uniform float uTime; varying vec2 vUV; void main(){gl_FragColor=texture2D(uColorTex,vUV);}`",
    "export const Town = ({ position = [0, 2, 0], scale = 1 }) => {",
    "  const sourceObj = useLoader(OBJLoader, `${baseUrl}Town.obj`)",
    "  const [colorTex] = useLoader(THREE.TextureLoader, [`${baseUrl}TownColor.png`])",
    "  configureMagicTexture(colorTex, true)",
    "  const uniforms = () => ({ uColorTex: { value: colorTex }, uTime: { value: 0 }, uDeepColor: { value: DEEP_COLOR } })",
    "  const makeMaterial = (defines, opts = {}) => new THREE.ShaderMaterial({ vertexShader, fragmentShader, defines, ...opts, uniforms: uniforms() })",
    "  const townMaterial = makeMaterial({})",
    "  const waterMaterial = makeMaterial({ WATER: '' }, { transparent: true, depthWrite: false })",
    "  const group = sourceObj.clone(true)",
    "  group.traverse((mesh) => { mesh.geometry = mirrorGeometryX(mesh.geometry) })",
    "  group.position.sub(center)",
    "  const colliderGroup = new THREE.Group()",
    "  for (const name of ['House', 'Sand']) colliderGroup.add(meshes[name])",
    "  useFrame(() => { townMaterial.uniforms.uTime.value = 1 })",
    "  return <group position={position} scale={scale}><primitive object={group} /><RigidBody type='fixed' colliders='trimesh'><primitive object={colliderGroup} visible={false} /></RigidBody></group>",
    "}",
  ].join("\n");
  const worldSource = [
    "import { Town } from './Town'",
    "export interface WorldProps { scale?: number }",
    "const TOWN_SCALE = 3",
    "export const World: React.FC<WorldProps> = () => <Town scale={TOWN_SCALE} />",
  ].join("\n");
  const skySource = [
    "export const SkyDome = () => {",
    "  const texture = useLoader(TextureLoader, `${baseUrl}sky.png`)",
    "  return <mesh><sphereGeometry /><meshBasicMaterial map={texture} side={BackSide} /></mesh>",
    "}",
  ].join("\n");
  const audioSource = [
    "export const AmbientAudio = ({ volume = 0.28 }) => {",
    "  const file = 'ocean.wav'",
    "  const audio = new Audio(`${baseUrl}${file}`)",
    "  audio.loop = true",
    "  audio.volume = volume",
    "  audio.play()",
    "  return null",
    "}",
  ].join("\n");
  const modules = [
    { path: "src/World.tsx", source: worldSource },
    { path: "src/Town.tsx", source: townSource },
    { path: "src/SkyDome.tsx", source: skySource },
    { path: "src/AmbientAudio.tsx", source: audioSource },
  ];
  const inspected = inspectClassicProjectVisualSource(modules);
  const material = inspected.customMaterials[0];
  assert(
    inspected.resources.some(
      (resource) => resource.sourcePath === "public/Town.obj",
    ),
    "baseUrl Model path was not normalized",
  );
  assert(
    inspected.skybox?.sourcePath === "public/sky.png",
    "Sky dome was not converted to a Skybox candidate",
  );
  assert(
    inspected.audioSources[0]?.sourcePath === "public/ocean.wav" &&
      inspected.audioSources[0].volume === 0.28,
    "Ambient WAV source was not inspected",
  );
  assert(
    material?.componentScale === 3 &&
      material.componentPosition.join(",") === "0,2,0" &&
      material.centerModel &&
      material.mirrorX,
    "Classic Model transform profile was not retained",
  );
  assert(
    material?.uniforms.uColorTex?.kind === "texture" &&
      material.uniforms.uColorTex.filter === "nearest",
    "Classic Shader texture uniform was not inspected",
  );
  assert(
    material?.colliderSourceNodeNames.join(",") === "House,Sand",
    "Named collider geometry was not inspected",
  );
  const classicSource = {
    path: "C:/fixture/townscape-lagoon",
    packageName: "townscape-lagoon",
    kind: "world",
    entryFile: "src/World.tsx",
    packageManager: "pnpm",
    canInstallAutomatically: false,
    source: worldSource,
    modules,
    inspection: inspected,
  } satisfies ClassicProjectVisualImportSource;
  const plan = augmentClassicProjectVisualImportPlan(
    analyzeComponentProject({
      entryFile: "src/World.tsx",
      modules,
      projectKind: "world",
    }),
    classicSource,
  );
  assert(
    plan.assetDependencies.length === 4 &&
      plan.assetDependencies.every(
        (dependency) =>
          dependency.sourcePath.startsWith("public/") &&
          !dependency.sourcePath.includes("${baseUrl}"),
      ),
    "baseUrl aliases were not deduplicated in the import plan",
  );
  assert(
    plan.summary.modelAssetCount === 1 &&
      plan.summary.textureAssetCount === 2 &&
      plan.summary.audioAssetCount === 1,
    "normalized Asset summary was not retained",
  );
  assert(
    plan.summary.colliderCount === 2,
    "named collider parts were not included in the preview summary",
  );
  assert(
    plan.nodes.every((node) => node.name !== "WorldProps") &&
      plan.diagnostics.every(
        (diagnostic) => !diagnostic.message.includes("WorldProps"),
      ),
    "TypeScript generic parameters were parsed as JSX",
  );
  assert(
    plan.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "classic-component-scale-recovered" &&
        diagnostic.severity === "info",
    ) &&
      plan.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "classic-component-transform-recovered",
      ),
    "Recovered Classic component transforms remained misleading skip warnings",
  );

  const modelAsset: ModelAsset = {
    id: "fixture-town-model",
    name: "Town",
    kind: "model",
    status: "ready",
    source: { kind: "document" },
    importSettings: {
      ...DEFAULT_MODEL_IMPORT_SETTINGS,
      scale: 2,
    },
    materialSlots: [],
    importMetadata: {
      sourceFormat: "obj",
      sourceFileName: "Town.obj",
      byteLength: 2_478_269,
      nodeCount: 8,
      meshCount: 8,
      primitiveCount: 8,
      bounds: {
        min: [-13.88039, -0.01642, -12.47659],
        max: [11.66871, 5.75573, 10.98315],
        center: [-1.10584, 2.869655, -0.74672],
        size: [25.5491, 5.77215, 23.45974],
        boundingSphereRadius: 17.57,
      },
      animations: [],
      extensionsUsed: [],
      extensionsRequired: [],
    },
  };
  const textureAsset: TextureAsset = {
    id: "fixture-town-color",
    name: "TownColor",
    kind: "texture",
    status: "ready",
    source: { kind: "document" },
    importSettings: normalizeTextureImportSettings({
      generateMipmaps: false,
    }),
    importMetadata: {
      sourceFormat: "png",
      mimeType: "image/png",
      byteLength: 23_338,
      width: 256,
      height: 256,
    },
  };
  const fixtureProject = createPrototypeProject("world", "Classic fixture");
  const fixtureAssets = {
    ...fixtureProject.assets,
    assets: {
      ...fixtureProject.assets.assets,
      [modelAsset.id]: modelAsset,
      [textureAsset.id]: textureAsset,
    },
  };
  const assetIdBySourcePath = {
    "public/Town.obj": modelAsset.id,
    "public/TownColor.png": textureAsset.id,
  };
  const preview = createClassicProjectVisualImportPreview({
    source: classicSource,
    componentPlan: plan,
    manifest: fixtureAssets,
    plans: [],
    assetIdBySourcePath,
    unavailableSourcePaths: [],
    diagnostics: [],
  });
  const modelSize = preview.models[0];
  assert(
    modelSize?.placementScale.join(",") === "3,3,3" &&
      Math.abs(modelSize.effectiveSize[0] - 153.2946) < 0.001,
    "Model import scale and inherited Classic placement scale were not composed",
  );
  assert(
    preview.estimatedTextureMemoryBytes === 256 * 256 * 4 &&
      preview.totalSourceBytes === 2_478_269 + 23_338,
    "Asset source and expanded Texture sizes were not included in preflight",
  );

  const baseResult = applyComponentCodeImportPlan({
    scene: fixtureProject.scene,
    assets: fixtureAssets,
    projectKind: "world",
    plan,
    assetIdBySourcePath,
  });
  const enhancedResult = applyClassicProjectVisualImportEnhancements({
    source: classicSource,
    componentPlan: plan,
    result: baseResult,
    assetIdBySourcePath,
  });
  const townBoundary = Object.values(enhancedResult.scene.entities).find(
    (entity) => entity.name === "Town",
  );
  const namedColliders = Object.values(enhancedResult.scene.entities).filter(
    (entity) => /^(?:House|Sand) Collider$/.test(entity.name),
  );
  assert(
    townBoundary &&
      getTransform(townBoundary)?.scale.join(",") === "-3,3,3",
    "Classic component scale and authored mirror were not retained",
  );
  assert(
    namedColliders.length === 2 &&
      namedColliders.every(
        (entity) => getTransform(entity)?.scale.join(",") === "2,2,2",
      ),
    "named OBJ colliders did not retain the Model import scale",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Classic project import fixture failed: ${message}`);
  }
}
