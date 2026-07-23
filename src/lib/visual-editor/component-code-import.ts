import {
  addDefaultMaterialAsset,
  type AssetManifest,
  type MaterialAsset,
} from "./asset-manifest";
import {
  XRIFT_COMPONENT_MODULE,
  getXriftComponentDefinition,
  type XriftComponentSchemaId,
} from "./component-registry";
import {
  BUILTIN_PRIMITIVE_CREATION_IDS,
  type BuiltinPrimitiveCreationDefinition,
} from "./creation-catalog";
import { createDocumentId } from "./document-id";
import {
  addEditorComponent,
  createEmptyEntity,
  reparentEntityHierarchy,
} from "./editor-session";
import { BUILTIN_ASSET_IDS } from "./prototype-project";
import type { VisualProjectKind } from "./project-document";
import {
  addBuiltinPrimitiveEntity,
  createBoxColliderComponent,
  createMeshComponent,
  createRigidBodyComponent,
  createTextComponent,
  renameEntity,
  updateEntityTransform,
  type ColliderComponent,
  type JsonObject,
  type JsonValue,
  type LightComponent,
  type MeshComponent,
  type RigidBodyAutoColliders,
  type SceneDocument,
  type Vec3,
} from "./scene-document";
import { updateXriftComponent } from "./component-registry";
import {
  STUDIO_IMAGE_EXTENSION_PATTERN,
  THREE_EDITOR_MODEL_EXTENSION_PATTERN,
} from "./asset-format-registry";

export const XRIFT_PORTAL_SAMPLE = `import { Portal } from '@xrift/world-components'

export function DestinationPortal() {
  return (
    <Portal
      instanceId="ceffb128-23c7-4120-b4e6-19bf6c604c47"
      position={[5, 0, 0]}
      rotation={[0, Math.PI / 2, 0]}
    />
  )
}`;

export const DREI_R3F_IMPORT_SAMPLE = `import { Billboard, Box, Reflector, Sky } from '@react-three/drei'

export function ExistingScene() {
  return (
    <group>
      <Sky />
      <Billboard position={[0, 2, -3]}>
        <Box args={[2, 0.6, 0.15]}>
          <meshStandardMaterial color="#8b5cf6" roughness={0.55} />
        </Box>
      </Billboard>
      <Reflector
        position={[0, 1.5, -5]}
        args={[3, 2]}
        color="#cbd5e1"
      />
    </group>
  )
}`;

export function createOfficialXriftComponentSample(importName: string): string {
  const samples: Readonly<Record<string, string>> = {
    Interactable: `<Interactable id="sample-button" interactionText="押す" onInteract={() => {}}>
  <mesh>
    <boxGeometry args={[1, 0.35, 0.2]} />
    <meshStandardMaterial color="#8b5cf6" />
  </mesh>
</Interactable>`,
    Grabbable: `<Grabbable
  id="sample-grabbable"
  transform={{ position: { x: 0, y: 1, z: -2 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 }}
  onMove={() => {}}
>
  <mesh>
    <sphereGeometry args={[0.3, 24, 16]} />
    <meshStandardMaterial color="#f59e0b" />
  </mesh>
</Grabbable>`,
    Mirror: `<Mirror position={[0, 1.5, -3]} size={[3, 2]} color={0xcccccc} />`,
    Skybox: `<Skybox topColor={0x87ceeb} bottomColor={0xffffff} offset={0} exponent={1} />`,
    VideoScreen: `<VideoScreen id="sample-video" position={[0, 2, -4]} scale={[5.33, 3]} sync="global" muted />`,
    VideoPlayer: `<VideoPlayer id="sample-player" position={[0, 2, -4]} width={4} playing volume={1} />`,
    LiveVideoPlayer: `<LiveVideoPlayer id="sample-live" position={[0, 2, -4]} width={4} sync="global" />`,
    Video180Sphere: `<Video180Sphere url="/videos/sample-180.mp4" radius={5} muted loop />`,
    ScreenShareDisplay: `<ScreenShareDisplay id="sample-screen-share" position={[0, 2, -4]} width={4} targetFps={30} />`,
    SpawnPoint: `<SpawnPoint position={[0, 0, 0]} yaw={0} />`,
    TextInput: `<TextInput id="sample-input" placeholder="テキストを入力..." onSubmit={() => {}}>
  <mesh>
    <boxGeometry args={[1.8, 0.5, 0.1]} />
    <meshStandardMaterial color="#334155" />
  </mesh>
</TextInput>`,
    TagBoard: `<TagBoard instanceStateKey="sample-tags" position={[0, 1.5, -3]} columns={3} title="タグ選択" />`,
    EntryLogBoard: `<EntryLogBoard stateNamespace="sample-entry-log" maxEntries={10} position={[0, 1.5, -3]} />`,
    Portal: `<Portal
  instanceId="ceffb128-23c7-4120-b4e6-19bf6c604c47"
  position={[0, 0, -3]}
  rotation={[0, 0, 0]}
/>`,
    BillboardY: `<BillboardY position={[0, 2, -3]}>
  <mesh>
    <planeGeometry args={[2, 0.5]} />
    <meshStandardMaterial color="#ffffff" />
  </mesh>
</BillboardY>`,
  };
  const jsx = samples[importName] ?? `<${importName} />`;
  return `import { ${importName} } from '@xrift/world-components'

export function ${importName}Sample() {
  return (
    ${jsx.replace(/\n/g, "\n    ")}
  )
}`;
}

export type ComponentCodeImportDiagnostic = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  line?: number;
  sourcePath?: string;
};

export type ComponentCodeImportMaterial = {
  color: string;
  metalness?: number;
  roughness?: number;
  baseColorTextureSourcePath?: string;
  doubleSided?: boolean;
};

export type ComponentCodeImportModel = {
  sourcePath: string;
  /** Static identifier passed to an R3F primitive object prop. */
  sourceObjectExpression?: string;
};

export type ComponentCodeImportText = {
  text: string;
  color: string;
  fontSize: number;
  maxWidth?: number;
  anchorX: "left" | "center" | "right";
  anchorY: "top" | "middle" | "bottom";
  outlineWidth: number;
  outlineColor: string;
};

export type ComponentCodeImportAssetDependency = {
  sourcePath: string;
  fileName: string;
  kind: "model" | "texture" | "audio" | "unsupported";
  requiredByPlanNodeIds: string[];
  sourceModulePaths: string[];
};

export type ComponentCodeImportTransform = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

export type ComponentCodeImportXriftComponent = {
  schemaId: XriftComponentSchemaId;
  properties: JsonObject;
  sourceName: string;
};

export type ComponentCodeImportCollider = {
  shape: "box";
  center: Vec3;
  halfExtents: Vec3;
  isTrigger: boolean;
  friction: number;
  restitution: number;
  sourceBodyType: "fixed" | "dynamic" | "kinematicPosition" | "kinematicVelocity";
  gravityScale: number;
  linearDamping: number;
  angularDamping: number;
  canSleep: boolean;
  ccd: boolean;
  lockTranslations: boolean;
  lockRotations: boolean;
};

export type ComponentCodeImportRigidBody = {
  sourceBodyType: "fixed" | "dynamic" | "kinematicPosition" | "kinematicVelocity";
  autoColliders: RigidBodyAutoColliders;
  isTrigger: boolean;
  friction: number;
  restitution: number;
  gravityScale: number;
  linearDamping: number;
  angularDamping: number;
  canSleep: boolean;
  ccd: boolean;
  lockTranslations: boolean;
  lockRotations: boolean;
};

export type ComponentCodeImportLight = {
  lightType: LightComponent["lightType"];
  color: string;
  intensity: number;
  castShadow: boolean;
  distance?: number;
  decay?: number;
  angle?: number;
  penumbra?: number;
  width?: number;
  height?: number;
  groundColor?: string;
};

export type ComponentCodeImportNode = {
  planNodeId: string;
  parentPlanNodeId: string | null;
  name: string;
  kind: "empty" | "primitive" | "model" | "light" | "text";
  creationId?: BuiltinPrimitiveCreationDefinition["creationId"];
  transform: ComponentCodeImportTransform;
  material?: ComponentCodeImportMaterial;
  model?: ComponentCodeImportModel;
  text?: ComponentCodeImportText;
  rigidBody?: ComponentCodeImportRigidBody;
  collider?: ComponentCodeImportCollider;
  light?: ComponentCodeImportLight;
  castShadow?: boolean;
  receiveShadow?: boolean;
  xriftComponents: ComponentCodeImportXriftComponent[];
  sourceLine: number;
  sourcePath?: string;
  sourceTag?: string;
  localComponent?: boolean;
};

export type ComponentCodeImportSourceModule = {
  path: string;
  source: string;
};

export type ComponentCodeImportPlan = {
  nodes: ComponentCodeImportNode[];
  diagnostics: ComponentCodeImportDiagnostic[];
  assetDependencies: ComponentCodeImportAssetDependency[];
  imports: {
    xrift: string[];
    drei: string[];
    fiber: string[];
    rapier: string[];
  };
  summary: {
    entityCount: number;
    primitiveCount: number;
    lightCount: number;
    textCount: number;
    rigidBodyCount: number;
    colliderCount: number;
    modelAssetCount: number;
    textureAssetCount: number;
    audioAssetCount: number;
    unsupportedAssetCount: number;
    xriftComponentCount: number;
    moduleCount: number;
    localComponentCount: number;
  };
};

export type ApplyComponentCodeImportResult = {
  scene: SceneDocument;
  assets: AssetManifest;
  entityIds: string[];
  diagnostics: ComponentCodeImportDiagnostic[];
};

type ParsedAttribute = {
  name: string;
  value?: JsonValue;
  dynamic: boolean;
  rawExpression?: string;
};

type ParsedJsxNode = {
  name: string;
  attributes: ParsedAttribute[];
  children: ParsedJsxNode[];
  line: number;
  rawContent?: string;
  contentStart: number;
};

type ImportBinding = {
  imported: string;
  local: string;
  module: string;
};

type ConvertContext = {
  parentPlanNodeId: string | null;
  rigidBody?: ComponentCodeImportCollider | null;
  sourcePath?: string;
  moduleSources?: ReadonlyMap<string, string>;
  fallbackModelSourcePath?: string;
  fallbackTextureSourcePath?: string;
  fallbackUnsupportedSourcePath?: string;
  expansionStack: readonly string[];
};

const IDENTITY_TRANSFORM: ComponentCodeImportTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

const DREI_PRIMITIVES: Readonly<Record<string, string>> = {
  Box: BUILTIN_PRIMITIVE_CREATION_IDS.box,
  Sphere: BUILTIN_PRIMITIVE_CREATION_IDS.sphere,
  Cylinder: BUILTIN_PRIMITIVE_CREATION_IDS.cylinder,
  Cone: BUILTIN_PRIMITIVE_CREATION_IDS.cone,
  Plane: BUILTIN_PRIMITIVE_CREATION_IDS.plane,
};

const GEOMETRY_PRIMITIVES: Readonly<Record<string, string>> = {
  boxGeometry: BUILTIN_PRIMITIVE_CREATION_IDS.box,
  sphereGeometry: BUILTIN_PRIMITIVE_CREATION_IDS.sphere,
  cylinderGeometry: BUILTIN_PRIMITIVE_CREATION_IDS.cylinder,
  coneGeometry: BUILTIN_PRIMITIVE_CREATION_IDS.cone,
  planeGeometry: BUILTIN_PRIMITIVE_CREATION_IDS.plane,
};

const R3F_LIGHTS: Readonly<
  Record<string, { label: string; lightType: LightComponent["lightType"] }>
> = {
  ambientLight: { label: "Ambient Light", lightType: "ambient" },
  directionalLight: { label: "Directional Light", lightType: "directional" },
  hemisphereLight: { label: "Hemisphere Light", lightType: "hemisphere" },
  pointLight: { label: "Point Light", lightType: "point" },
  spotLight: { label: "Spot Light", lightType: "spot" },
  rectAreaLight: { label: "Rect Area Light", lightType: "rectArea" },
};

const FALLBACK_MATERIALS: Readonly<Record<string, string>> = {
  [BUILTIN_PRIMITIVE_CREATION_IDS.box]: BUILTIN_ASSET_IDS.material.blue,
  [BUILTIN_PRIMITIVE_CREATION_IDS.sphere]: BUILTIN_ASSET_IDS.material.violet,
  [BUILTIN_PRIMITIVE_CREATION_IDS.cylinder]: BUILTIN_ASSET_IDS.material.green,
  [BUILTIN_PRIMITIVE_CREATION_IDS.cone]: BUILTIN_ASSET_IDS.material.orange,
  [BUILTIN_PRIMITIVE_CREATION_IDS.plane]: BUILTIN_ASSET_IDS.material.slate,
};

export function analyzeComponentCode(
  source: string,
  projectKind: VisualProjectKind,
): ComponentCodeImportPlan {
  return analyzeComponentSources({
    entryFile: "<pasted>.tsx",
    modules: [{ path: "<pasted>.tsx", source }],
    projectKind,
  });
}

export function analyzeComponentProject(input: {
  entryFile: string;
  modules: readonly ComponentCodeImportSourceModule[];
  projectKind: VisualProjectKind;
}): ComponentCodeImportPlan {
  return analyzeComponentSources(input);
}

function analyzeComponentSources(input: {
  entryFile: string;
  modules: readonly ComponentCodeImportSourceModule[];
  projectKind: VisualProjectKind;
}): ComponentCodeImportPlan {
  const diagnostics: ComponentCodeImportDiagnostic[] = [];
  const normalizedEntryFile = normalizeModulePath(input.entryFile);
  const moduleSources = new Map(
    input.modules.map((module) => [normalizeModulePath(module.path), module.source]),
  );
  const source = moduleSources.get(normalizedEntryFile);
  if (source === undefined) {
    return emptyImportPlan({
      severity: "error",
      code: "entry-module-missing",
      message: `${normalizedEntryFile}をsource module一覧から読み取れませんでした。`,
      sourcePath: normalizedEntryFile,
    });
  }
  const bindings = parseImports(source);
  const bindingByLocal = new Map(bindings.map((binding) => [binding.local, binding]));
  const roots = parseJsx(source, diagnostics);
  const nodes: ComponentCodeImportNode[] = [];
  const initialContext: ConvertContext = {
    parentPlanNodeId: null,
    sourcePath: normalizedEntryFile,
    moduleSources,
    expansionStack: [`${normalizedEntryFile}#<entry>`],
  };

  for (const root of roots) {
    convertJsxNode(
      root,
      initialContext,
      bindingByLocal,
      input.projectKind,
      nodes,
      diagnostics,
    );
  }

  if (roots.length === 0) {
    diagnostics.push({
      severity: "error",
      code: "jsx-not-found",
      message: "変換できるJSXが見つかりませんでした。return内のComponentを貼り付けてください。",
    });
  } else if (nodes.length === 0) {
    diagnostics.push({
      severity: "error",
      code: "convertible-node-not-found",
      message: "対応するXRift、Drei、React Three Fiberの要素が見つかりませんでした。",
    });
  }

  const allBindings = [...moduleSources.values()].flatMap(parseImports);
  const importsFor = (module: string) =>
    allBindings
      .filter((binding) => binding.module === module)
      .map((binding) => binding.imported)
      .filter((value, index, values) => values.indexOf(value) === index)
      .sort();
  const assetDependencies = collectPlanAssetDependencies(nodes);
  return {
    nodes,
    diagnostics,
    assetDependencies,
    imports: {
      xrift: importsFor(XRIFT_COMPONENT_MODULE),
      drei: importsFor("@react-three/drei"),
      fiber: importsFor("@react-three/fiber"),
      rapier: importsFor("@react-three/rapier"),
    },
    summary: {
      entityCount: nodes.length,
      primitiveCount: nodes.filter((node) => node.kind === "primitive").length,
      lightCount: nodes.filter((node) => node.kind === "light").length,
      textCount: nodes.filter((node) => node.kind === "text").length,
      rigidBodyCount: nodes.filter((node) => node.rigidBody !== undefined).length,
      colliderCount: nodes.filter((node) => node.collider !== undefined).length,
      modelAssetCount: assetDependencies.filter(
        (dependency) => dependency.kind === "model",
      ).length,
      textureAssetCount: assetDependencies.filter(
        (dependency) => dependency.kind === "texture",
      ).length,
      audioAssetCount: assetDependencies.filter(
        (dependency) => dependency.kind === "audio",
      ).length,
      unsupportedAssetCount: assetDependencies.filter(
        (dependency) => dependency.kind === "unsupported",
      ).length,
      xriftComponentCount: nodes.reduce(
        (count, node) => count + node.xriftComponents.length,
        0,
      ),
      moduleCount: moduleSources.size,
      localComponentCount: nodes.filter((node) => node.localComponent).length,
    },
  };
}

function emptyImportPlan(
  diagnostic: ComponentCodeImportDiagnostic,
): ComponentCodeImportPlan {
  return {
    nodes: [],
    diagnostics: [diagnostic],
    assetDependencies: [],
    imports: { xrift: [], drei: [], fiber: [], rapier: [] },
    summary: {
      entityCount: 0,
      primitiveCount: 0,
      lightCount: 0,
      textCount: 0,
      rigidBodyCount: 0,
      colliderCount: 0,
      modelAssetCount: 0,
      textureAssetCount: 0,
      audioAssetCount: 0,
      unsupportedAssetCount: 0,
      xriftComponentCount: 0,
      moduleCount: 0,
      localComponentCount: 0,
    },
  };
}

function collectPlanAssetDependencies(
  nodes: readonly ComponentCodeImportNode[],
): ComponentCodeImportAssetDependency[] {
  const dependencies = new Map<
    string,
    ComponentCodeImportAssetDependency
  >();
  const register = (
    sourcePath: string | undefined,
    node: ComponentCodeImportNode,
    expectedKind: "model" | "texture",
  ) => {
    if (!sourcePath) return;
    const normalized = normalizeModulePath(sourcePath);
    const current = dependencies.get(normalized) ?? {
      sourcePath: normalized,
      fileName: normalized.split("/").pop() ?? normalized,
      kind: importedAssetKind(normalized, expectedKind),
      requiredByPlanNodeIds: [],
      sourceModulePaths: [],
    };
    if (!current.requiredByPlanNodeIds.includes(node.planNodeId)) {
      current.requiredByPlanNodeIds.push(node.planNodeId);
    }
    if (node.sourcePath && !current.sourceModulePaths.includes(node.sourcePath)) {
      current.sourceModulePaths.push(node.sourcePath);
    }
    dependencies.set(normalized, current);
  };
  for (const node of nodes) {
    register(node.model?.sourcePath, node, "model");
    register(node.material?.baseColorTextureSourcePath, node, "texture");
  }
  return [...dependencies.values()].sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath),
  );
}

function importedAssetKind(
  sourcePath: string,
  preferredKind?: "model" | "texture",
): ComponentCodeImportAssetDependency["kind"] {
  if (
    preferredKind === "model" &&
    THREE_EDITOR_MODEL_EXTENSION_PATTERN.test(sourcePath)
  ) {
    return "model";
  }
  if (STUDIO_IMAGE_EXTENSION_PATTERN.test(sourcePath)) return "texture";
  if (THREE_EDITOR_MODEL_EXTENSION_PATTERN.test(sourcePath)) return "model";
  if (/\.(?:hdr|exr)$/i.test(sourcePath)) return "texture";
  return "unsupported";
}

function assetSourcePathFromJsx(
  node: ParsedJsxNode,
  attributeNames: readonly string[],
  sourceModulePath: string | undefined,
): string | undefined {
  for (const attributeName of attributeNames) {
    const attribute = node.attributes.find((entry) => entry.name === attributeName);
    if (!attribute) continue;
    const candidate =
      typeof attribute.value === "string"
        ? attribute.value
        : attribute.rawExpression;
    const resolved = resolveAssetReference(candidate, sourceModulePath);
    if (resolved) return resolved;
  }
  return undefined;
}

function scanModuleAssetReferences(
  source: string,
  sourceModulePath: string,
): Array<{
  sourcePath: string;
  kind: ComponentCodeImportAssetDependency["kind"];
}> {
  const references = new Map<
    string,
    ComponentCodeImportAssetDependency["kind"]
  >();
  const stringPattern = /["'`]([^"'`\r\n]*?\.(?:glb|gltf|obj|vrm|png|jpe?g|webp|ktx2|hdr|exr|drc)(?:[?#][^"'`\r\n]*)?)["'`]/gi;
  for (const match of source.matchAll(stringPattern)) {
    const sourcePath = resolveAssetReference(match[1], sourceModulePath);
    if (sourcePath) references.set(sourcePath, importedAssetKind(sourcePath));
  }
  return [...references].map(([sourcePath, kind]) => ({ sourcePath, kind }));
}

function resolveAssetReference(
  value: string | undefined,
  sourceModulePath: string | undefined,
): string | undefined {
  if (!value) return undefined;
  let candidate = value.trim();
  if (!candidate || /^(?:data:|https?:|blob:)/i.test(candidate)) return undefined;
  const embedded = candidate.match(
    /([^${}\s"'`]+\.(?:glb|gltf|obj|vrm|png|jpe?g|webp|ktx2|hdr|exr|drc)(?:[?#][^\s"'`]*)?)/i,
  );
  if (!embedded) return undefined;
  candidate = embedded[1].replace(/[?#].*$/, "").replace(/\\/g, "/");
  if (
    !THREE_EDITOR_MODEL_EXTENSION_PATTERN.test(candidate) &&
    !STUDIO_IMAGE_EXTENSION_PATTERN.test(candidate) &&
    !/\.(?:hdr|exr)(?:[?#].*)?$/i.test(candidate)
  ) {
    return undefined;
  }
  if (candidate.startsWith("/")) return normalizeModulePath(`public/${candidate}`);
  if (candidate.startsWith("public/")) return normalizeModulePath(candidate);
  if (candidate.startsWith("./") || candidate.startsWith("../")) {
    const slash = sourceModulePath?.lastIndexOf("/") ?? -1;
    const parent = slash >= 0 ? sourceModulePath!.slice(0, slash) : "";
    return normalizeModulePath(`${parent}/${candidate}`);
  }
  // Classic XRift templates resolve bare public files through baseUrl.
  return normalizeModulePath(`public/${candidate}`);
}

function textFromJsx(
  node: ParsedJsxNode,
  attributes: JsonObject,
): ComponentCodeImportText {
  const literalContent = (node.rawContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const text =
    typeof attributes.text === "string"
      ? attributes.text
      : literalContent && !/[{}<>]/.test(literalContent)
        ? literalContent
        : staticNodeName(attributes, "Text");
  const anchorX =
    attributes.anchorX === "left" || attributes.anchorX === "right"
      ? attributes.anchorX
      : "center";
  const anchorY =
    attributes.anchorY === "top" || attributes.anchorY === "bottom"
      ? attributes.anchorY
      : "middle";
  return {
    text,
    color: normalizeColor(attributes.color) ?? "#ffffff",
    fontSize: positiveFiniteNumber(attributes.fontSize) ?? 0.2,
    ...(positiveFiniteNumber(attributes.maxWidth) !== undefined
      ? { maxWidth: positiveFiniteNumber(attributes.maxWidth) }
      : {}),
    anchorX,
    anchorY,
    outlineWidth: nonNegativeFiniteNumber(attributes.outlineWidth) ?? 0,
    outlineColor: normalizeColor(attributes.outlineColor) ?? "#000000",
  };
}

export function applyComponentCodeImportPlan(input: {
  scene: SceneDocument;
  assets: AssetManifest;
  projectKind: VisualProjectKind;
  plan: ComponentCodeImportPlan;
  assetIdBySourcePath?: Readonly<Record<string, string>>;
}): ApplyComponentCodeImportResult {
  const planErrors = input.plan.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (planErrors.length > 0) {
    return {
      scene: input.scene,
      assets: input.assets,
      entityIds: [],
      diagnostics: planErrors,
    };
  }

  let scene = input.scene;
  let assets = input.assets;
  const entityIds: string[] = [];
  const diagnostics: ComponentCodeImportDiagnostic[] = [];
  const entityIdByPlanNodeId = new Map<string, string>();

  for (const node of input.plan.nodes) {
    const parentEntityId = node.parentPlanNodeId
      ? entityIdByPlanNodeId.get(node.parentPlanNodeId)
      : null;
    if (node.parentPlanNodeId && !parentEntityId) {
      diagnostics.push({
        severity: "error",
        code: "import-parent-missing",
        message: `${node.name}の親Entityを復元できませんでした。`,
        line: node.sourceLine,
        sourcePath: node.sourcePath,
      });
      continue;
    }
    let entityId: string | undefined;
    if (node.kind === "primitive" && node.creationId) {
      const material = resolveImportedMaterial(
        assets,
        node.material,
        node.name,
        input.assetIdBySourcePath,
      );
      assets = material.assets;
      const fallbackMaterialId =
        FALLBACK_MATERIALS[node.creationId] ?? BUILTIN_ASSET_IDS.material.slate;
      const materialId =
        material.materialId && assets.assets[material.materialId]
          ? material.materialId
          : fallbackMaterialId;
      const created = addBuiltinPrimitiveEntity(
        scene,
        assets,
        node.creationId,
        materialId,
        node.transform.position,
      );
      if (created) {
        scene = created.scene;
        entityId = created.entityId;
        if (parentEntityId) {
          scene = reparentEntityHierarchy(scene, entityId, parentEntityId);
        }
      }
    } else {
      const created = createEmptyEntity(scene, parentEntityId, node.name);
      if (created) {
        scene = created.scene;
        entityId = created.entityId;
      }
    }

    if (!entityId) {
      diagnostics.push({
        severity: "error",
        code: "entity-create-failed",
        message: `${node.name}をSceneへ作成できませんでした。`,
        line: node.sourceLine,
        sourcePath: node.sourcePath,
      });
      continue;
    }

    scene = renameEntity(scene, entityId, node.name);
    scene = updateEntityTransform(scene, entityId, node.transform);
    scene = applyImportedCoreComponents(
      scene,
      assets,
      entityId,
      node,
      input.assetIdBySourcePath,
    );
    for (const component of node.xriftComponents) {
      const added = addEditorComponent(
        scene,
        assets,
        entityId,
        component.schemaId,
        input.projectKind,
      );
      if (!added.added || !added.componentId) {
        diagnostics.push({
          severity: "error",
          code: "xrift-component-add-failed",
          message: `${component.sourceName}を${node.name}へ追加できませんでした。`,
          line: node.sourceLine,
        });
        continue;
      }
      scene = added.scene;
      const updated = updateXriftComponent(
        scene,
        entityId,
        added.componentId,
        { properties: component.properties },
        input.projectKind,
      );
      scene = updated.scene;
      diagnostics.push(
        ...updated.diagnostics.map(
          (diagnostic): ComponentCodeImportDiagnostic => ({
            severity: diagnostic.severity === "error" ? "error" : "warning",
            code: diagnostic.code,
            message: diagnostic.message,
            line: node.sourceLine,
            sourcePath: node.sourcePath,
          }),
        ),
      );
    }
    entityIdByPlanNodeId.set(node.planNodeId, entityId);
    entityIds.push(entityId);
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return {
      scene: input.scene,
      assets: input.assets,
      entityIds: [],
      diagnostics,
    };
  }
  return { scene, assets, entityIds, diagnostics };
}

function appendImportNode(
  output: ComponentCodeImportNode[],
  context: ConvertContext,
  node: Omit<
    ComponentCodeImportNode,
    "planNodeId" | "parentPlanNodeId" | "sourcePath"
  >,
): ComponentCodeImportNode {
  const created: ComponentCodeImportNode = {
    ...node,
    planNodeId: `import-node-${output.length + 1}`,
    parentPlanNodeId: context.parentPlanNodeId,
    ...(context.sourcePath ? { sourcePath: context.sourcePath } : {}),
  };
  output.push(created);
  return created;
}

function convertJsxNode(
  node: ParsedJsxNode,
  context: ConvertContext,
  bindings: ReadonlyMap<string, ImportBinding>,
  projectKind: VisualProjectKind,
  output: ComponentCodeImportNode[],
  diagnostics: ComponentCodeImportDiagnostic[],
): number {
  const before = output.length;
  const binding = bindings.get(node.name);
  const attributes = attributesToObject(node, diagnostics);
  const sourceFields = { sourceLine: node.line, sourceTag: node.name };

  if (node.name === "Fragment" || node.name === "React.Fragment") {
    return visitChildren(node, context, bindings, projectKind, output, diagnostics);
  }

  if (node.name === "group") {
    const group = appendImportNode(output, context, {
      ...sourceFields,
      name: staticNodeName(attributes, "Group"),
      kind: "empty",
      transform: transformFromProps(attributes),
      xriftComponents: [],
    });
    visitChildren(
      node,
      { ...context, parentPlanNodeId: group.planNodeId },
      bindings,
      projectKind,
      output,
      diagnostics,
    );
    return output.length - before;
  }

  if (
    binding?.module === "@react-three/rapier" &&
    binding.imported === "RigidBody"
  ) {
    const rigidBody = rigidBodyFromJsx(attributes, node, diagnostics);
    const body = appendImportNode(output, context, {
      ...sourceFields,
      name: staticNodeName(attributes, "RigidBody"),
      kind: "empty",
      transform: transformFromProps(attributes),
      rigidBody,
      xriftComponents: [],
    });
    const added = visitChildren(
      node,
      { ...context, parentPlanNodeId: body.planNodeId, rigidBody: null },
      bindings,
      projectKind,
      output,
      diagnostics,
    );
    if (added === 0) {
      diagnostics.push({
        severity: "warning",
        code: "rigid-body-children-missing",
        message: "RigidBodyに変換可能な子要素がありません。構造だけを保持します。",
        line: node.line,
        sourcePath: context.sourcePath,
      });
    }
    return output.length - before;
  }

  if (
    binding?.module === "@react-three/rapier" &&
    binding.imported === "CuboidCollider"
  ) {
    const halfExtents = asNumberArray(attributes.args);
    const center = asNumberArray(attributes.position);
    if (
      halfExtents.length !== 3 ||
      halfExtents.some((value) => !Number.isFinite(value) || value <= 0) ||
      (center.length !== 0 &&
        (center.length !== 3 || center.some((value) => !Number.isFinite(value))))
    ) {
      diagnostics.push({
        severity: "warning",
        code: "rapier-cuboid-collider-dynamic",
        message:
          "CuboidColliderのargs/positionを静的に確定できないため、誤ったColliderを作らず構造だけ保持します。",
        line: node.line,
        sourcePath: context.sourcePath,
      });
      return preserveUnsupportedNode(
        node,
        context,
        bindings,
        projectKind,
        output,
        diagnostics,
      );
    }
    appendImportNode(output, context, {
      ...sourceFields,
      name: staticNodeName(attributes, "Cuboid Collider"),
      kind: "empty",
      transform: cloneTransform(IDENTITY_TRANSFORM),
      collider: {
        shape: "box",
        center:
          center.length === 3
            ? [center[0], center[1], center[2]]
            : [0, 0, 0],
        halfExtents: [halfExtents[0], halfExtents[1], halfExtents[2]],
        isTrigger: attributes.sensor === true,
        friction: nonNegativeFiniteNumber(attributes.friction) ?? 0.5,
        restitution: unitFiniteNumber(attributes.restitution) ?? 0,
        sourceBodyType: "fixed",
        gravityScale: 1,
        linearDamping: 0,
        angularDamping: 0,
        canSleep: true,
        ccd: false,
        lockTranslations: false,
        lockRotations: false,
      },
      xriftComponents: [],
    });
    return 1;
  }

  const lightDefinition = R3F_LIGHTS[node.name];
  if (lightDefinition) {
    const color = normalizeColor(attributes.color) ?? "#ffffff";
    const groundColor = normalizeColor(attributes.groundColor);
    appendImportNode(output, context, {
      ...sourceFields,
      name: staticNodeName(attributes, lightDefinition.label),
      kind: "light",
      transform: transformFromProps(attributes),
      light: {
        lightType: lightDefinition.lightType,
        color,
        intensity: finiteNumber(attributes.intensity) ?? 1,
        castShadow: attributes.castShadow === true,
        ...(groundColor ? { groundColor } : {}),
        ...optionalFiniteLightProperties(attributes),
      },
      ...(context.rigidBody ? { collider: context.rigidBody } : {}),
      xriftComponents: [],
    });
    return 1;
  }

  if (binding?.module === XRIFT_COMPONENT_MODULE) {
    const definition = getXriftComponentDefinition(binding.imported);
    if (!definition) {
      diagnostics.push({
        severity: "warning",
        code: "unknown-xrift-export",
        message: `${binding.imported}はStudioの公式Component Registryに未登録です。`,
        line: node.line,
        sourcePath: context.sourcePath,
      });
      return preserveUnsupportedNode(
        node,
        context,
        bindings,
        projectKind,
        output,
        diagnostics,
      );
    }
    if (!definition.allowedProjectKinds.includes(projectKind)) {
      diagnostics.push({
        severity: "error",
        code: "xrift-project-kind",
        message: `${definition.importName}は${projectKind}プロジェクトへ追加できません。`,
        line: node.line,
        sourcePath: context.sourcePath,
      });
      return 0;
    }
    const component: ComponentCodeImportXriftComponent = {
      schemaId: definition.schemaId,
      properties: filterXriftProperties(
        definition.schemaId,
        attributes,
        node,
        diagnostics,
      ),
      sourceName: definition.importName,
    };
    const componentNode = appendImportNode(output, context, {
      ...sourceFields,
      name: staticNodeName(attributes, definition.label),
      kind: "empty",
      transform: cloneTransform(IDENTITY_TRANSFORM),
      ...(context.rigidBody ? { collider: context.rigidBody } : {}),
      xriftComponents: [component],
    });
    const added = visitChildren(
      node,
      {
        ...context,
        parentPlanNodeId: componentNode.planNodeId,
        rigidBody: undefined,
      },
      bindings,
      projectKind,
      output,
      diagnostics,
    );
    if (definition.attachBehavior.childrenRequired && added === 0) {
      diagnostics.push({
        severity: "warning",
        code: "wrapper-children-missing",
        message: `${definition.importName}の子要素を変換できなかったため、Component Entityだけを保持します。`,
        line: node.line,
        sourcePath: context.sourcePath,
      });
    }
    return output.length - before;
  }

  if (binding?.module === "@react-three/drei") {
    if (binding.imported === "Gltf") {
      const sourcePath = assetSourcePathFromJsx(
        node,
        ["src", "url", "path"],
        context.sourcePath,
      ) ?? context.fallbackModelSourcePath;
      if (!sourcePath) {
        diagnostics.push({
          severity: "warning",
          code: "gltf-source-missing",
          message: "Drei Gltfの参照先を静的に特定できないため、Component境界だけを保持します。",
          line: node.line,
          sourcePath: context.sourcePath,
        });
        return preserveUnsupportedNode(
          node,
          context,
          bindings,
          projectKind,
          output,
          diagnostics,
        );
      }
      appendImportNode(output, context, {
        ...sourceFields,
        name: staticNodeName(
          attributes,
          sourcePath.split("/").pop()?.replace(/\.[^.]+$/, "") || "Model",
        ),
        kind: "model",
        transform: transformFromProps(attributes),
        model: { sourcePath },
        ...(context.rigidBody ? { collider: context.rigidBody } : {}),
        ...(typeof attributes.castShadow === "boolean"
          ? { castShadow: attributes.castShadow }
          : {}),
        ...(typeof attributes.receiveShadow === "boolean"
          ? { receiveShadow: attributes.receiveShadow }
          : {}),
        xriftComponents: [],
      });
      return 1;
    }
    if (binding.imported === "Text") {
      const text = textFromJsx(node, attributes);
      appendImportNode(output, context, {
        ...sourceFields,
        name: staticNodeName(attributes, text.text.slice(0, 40) || "Text"),
        kind: "text",
        transform: transformFromProps(attributes),
        text,
        ...(context.rigidBody ? { collider: context.rigidBody } : {}),
        xriftComponents: [],
      });
      return 1;
    }
    if (binding.imported === "Billboard") {
      const definition = getXriftComponentDefinition("BillboardY");
      if (!definition) return 0;
      const billboard = appendImportNode(output, context, {
        ...sourceFields,
        name: staticNodeName(attributes, "BillboardY"),
        kind: "empty",
        transform: cloneTransform(IDENTITY_TRANSFORM),
        xriftComponents: [{
          schemaId: definition.schemaId,
          properties: pickProperties(attributes, ["position", "rotation", "scale"]),
          sourceName: "BillboardY",
        }],
      });
      diagnostics.push({
        severity: "info",
        code: "drei-billboard-converted",
        message: "Drei BillboardをXRiftのBillboardYへ変換します。",
        line: node.line,
        sourcePath: context.sourcePath,
      });
      visitChildren(
        node,
        { ...context, parentPlanNodeId: billboard.planNodeId },
        bindings,
        projectKind,
        output,
        diagnostics,
      );
      return output.length - before;
    }
    if (binding.imported === "Reflector") {
      const definition = getXriftComponentDefinition("Mirror");
      if (!definition) return 0;
      const args = asNumberArray(attributes.args);
      const properties: JsonObject = {
        ...pickProperties(attributes, ["position", "rotation"]),
        ...(args.length >= 2 ? { size: [args[0], args[1]] } : {}),
        ...(toColorNumber(attributes.color) !== undefined
          ? { color: toColorNumber(attributes.color)! }
          : {}),
      };
      appendImportNode(output, context, {
        ...sourceFields,
        name: "Mirror",
        kind: "empty",
        transform: cloneTransform(IDENTITY_TRANSFORM),
        ...(context.rigidBody ? { collider: context.rigidBody } : {}),
        xriftComponents: [
          { schemaId: definition.schemaId, properties, sourceName: "Mirror" },
        ],
      });
      diagnostics.push({
        severity: "info",
        code: "drei-reflector-converted",
        message: "Drei Reflectorを公式XRift Mirrorへ変換します。",
        line: node.line,
        sourcePath: context.sourcePath,
      });
      return 1;
    }
    if (binding.imported === "Sky" || binding.imported === "Environment") {
      const definition = getXriftComponentDefinition("Skybox");
      if (!definition) return 0;
      appendImportNode(output, context, {
        ...sourceFields,
        name: "Skybox",
        kind: "empty",
        transform: cloneTransform(IDENTITY_TRANSFORM),
        ...(context.rigidBody ? { collider: context.rigidBody } : {}),
        xriftComponents: [
          { schemaId: definition.schemaId, properties: {}, sourceName: "Skybox" },
        ],
      });
      diagnostics.push({
        severity: binding.imported === "Environment" ? "warning" : "info",
        code: "drei-sky-converted",
        message:
          binding.imported === "Environment"
            ? "Drei EnvironmentをXRift Skyboxへ変換します。HDRI参照は別途Assetsへインポートしてください。"
            : "Drei SkyをXRift Skyboxへ変換します。",
        line: node.line,
        sourcePath: context.sourcePath,
      });
      return 1;
    }
    const creationId = DREI_PRIMITIVES[binding.imported];
    if (creationId) {
      appendImportNode(
        output,
        context,
        primitiveNodeFromJsx(node, creationId, binding.imported, attributes, context),
      );
      return 1;
    }
    diagnostics.push({
      severity: "warning",
      code: "unsupported-drei-component",
      message: `Drei ${binding.imported}は見た目を変換できないため、Component境界と変換できる子要素を保持します。`,
      line: node.line,
      sourcePath: context.sourcePath,
    });
    return preserveUnsupportedNode(
      node,
      context,
      bindings,
      projectKind,
      output,
      diagnostics,
    );
  }

  if (node.name === "mesh") {
    const geometry = node.children.find((child) => GEOMETRY_PRIMITIVES[child.name]);
    if (!geometry) {
      const sourcePath =
        context.fallbackModelSourcePath ??
        context.fallbackUnsupportedSourcePath;
      if (sourcePath) {
        appendImportNode(output, context, {
          ...sourceFields,
          name: staticNodeName(
            attributes,
            sourcePath.split("/").pop()?.replace(/\.[^.]+$/, "") || "Model",
          ),
          kind: "model",
          transform: transformFromProps(attributes),
          model: { sourcePath },
          ...(context.rigidBody ? { collider: context.rigidBody } : {}),
          ...(typeof attributes.castShadow === "boolean"
            ? { castShadow: attributes.castShadow }
            : {}),
          ...(typeof attributes.receiveShadow === "boolean"
            ? { receiveShadow: attributes.receiveShadow }
            : {}),
          xriftComponents: [],
        });
        return 1;
      }
      diagnostics.push({
        severity: "warning",
        code: "unsupported-mesh-geometry",
        message: "mesh内に対応する標準Geometryがないため、Mesh Entityと子構造だけを保持します。",
        line: node.line,
        sourcePath: context.sourcePath,
      });
      return preserveUnsupportedNode(
        node,
        context,
        bindings,
        projectKind,
        output,
        diagnostics,
      );
    }
    const geometryAttributes = attributesToObject(geometry, diagnostics);
    appendImportNode(
      output,
      context,
      primitiveNodeFromJsx(
        node,
        GEOMETRY_PRIMITIVES[geometry.name],
        primitiveLabel(geometry.name),
        { ...attributes, args: geometryAttributes.args },
        context,
      ),
    );
    return 1;
  }

  if (isLocalComponentBinding(binding, node.name, context)) {
    return convertLocalComponent(
      node,
      binding,
      attributes,
      context,
      bindings,
      projectKind,
      output,
      diagnostics,
    );
  }

  if (binding || /^[A-Z]/.test(node.name) || node.name === "primitive") {
    if (node.name === "primitive") {
      const sourcePath =
        context.fallbackModelSourcePath ??
        context.fallbackUnsupportedSourcePath;
      if (sourcePath) {
        const objectExpression = node.attributes.find(
          (attribute) => attribute.name === "object",
        )?.rawExpression;
        appendImportNode(output, context, {
          ...sourceFields,
          name: staticNodeName(
            attributes,
            sourcePath.split("/").pop()?.replace(/\.[^.]+$/, "") || "Model",
          ),
          kind: "model",
          transform: transformFromProps(attributes),
          model: {
            sourcePath,
            ...(objectExpression
              ? { sourceObjectExpression: objectExpression.trim() }
              : {}),
          },
          ...(context.rigidBody ? { collider: context.rigidBody } : {}),
          xriftComponents: [],
        });
        return 1;
      }
    }
    diagnostics.push({
      severity: "warning",
      code: "unsupported-react-component",
      message: `${node.name}の実装は変換できないため、Component境界と変換できる子要素を保持します。`,
      line: node.line,
      sourcePath: context.sourcePath,
    });
    return preserveUnsupportedNode(
      node,
      context,
      bindings,
      projectKind,
      output,
      diagnostics,
    );
  }
  return visitChildren(node, context, bindings, projectKind, output, diagnostics);
}

function preserveUnsupportedNode(
  node: ParsedJsxNode,
  context: ConvertContext,
  bindings: ReadonlyMap<string, ImportBinding>,
  projectKind: VisualProjectKind,
  output: ComponentCodeImportNode[],
  diagnostics: ComponentCodeImportDiagnostic[],
): number {
  const before = output.length;
  const attributes = attributesToObject(node, diagnostics);
  const preserved = appendImportNode(output, context, {
    name: staticNodeName(attributes, node.name),
    kind: "empty",
    transform: transformFromProps(attributes),
    ...(context.rigidBody ? { collider: context.rigidBody } : {}),
    xriftComponents: [],
    sourceLine: node.line,
    sourceTag: node.name,
  });
  visitChildren(
    node,
    {
      ...context,
      parentPlanNodeId: preserved.planNodeId,
      rigidBody: undefined,
    },
    bindings,
    projectKind,
    output,
    diagnostics,
  );
  return output.length - before;
}

function visitChildren(
  node: ParsedJsxNode,
  context: ConvertContext,
  bindings: ReadonlyMap<string, ImportBinding>,
  projectKind: VisualProjectKind,
  output: ComponentCodeImportNode[],
  diagnostics: ComponentCodeImportDiagnostic[],
): number {
  const before = output.length;
  for (const child of node.children) {
    if (GEOMETRY_PRIMITIVES[child.name] || /Material$/.test(child.name)) continue;
    convertJsxNode(child, context, bindings, projectKind, output, diagnostics);
  }
  return output.length - before;
}

function primitiveNodeFromJsx(
  node: ParsedJsxNode,
  creationId: string,
  name: string,
  attributes: JsonObject,
  context: ConvertContext,
): Omit<
  ComponentCodeImportNode,
  "planNodeId" | "parentPlanNodeId" | "sourcePath"
> {
  const localTransform = transformFromProps(attributes);
  localTransform.scale = multiplyVec3(
    localTransform.scale,
    geometryScale(creationId, asNumberArray(attributes.args)),
  );
  const materialNode = node.children.find((child) => /Material$/.test(child.name));
  const materialProps = materialNode
    ? attributesToObject(materialNode, [])
    : attributes;
  const color = normalizeColor(materialProps.color);
  const metalness = finiteNumber(materialProps.metalness);
  const roughness = finiteNumber(materialProps.roughness);
  const textureSourcePath =
    assetSourcePathFromJsx(
      materialNode ?? node,
      ["map", "src", "url", "texture"],
      context.sourcePath,
    ) ?? context.fallbackTextureSourcePath;
  const doubleSided =
    materialProps.side === "BackSide" ||
    materialProps.side === "DoubleSide" ||
    (creationId === BUILTIN_PRIMITIVE_CREATION_IDS.sphere &&
      textureSourcePath !== undefined);
  return {
    name: staticNodeName(attributes, name),
    kind: "primitive",
    creationId,
    transform: localTransform,
    ...(color || textureSourcePath
      ? {
          material: {
            color: color ?? "#ffffff",
            ...(metalness !== undefined ? { metalness } : {}),
            ...(roughness !== undefined ? { roughness } : {}),
            ...(textureSourcePath
              ? { baseColorTextureSourcePath: textureSourcePath }
              : {}),
            ...(doubleSided ? { doubleSided: true } : {}),
          },
        }
      : {}),
    ...(context.rigidBody ? { collider: context.rigidBody } : {}),
    ...(typeof attributes.castShadow === "boolean"
      ? { castShadow: attributes.castShadow }
      : {}),
    ...(typeof attributes.receiveShadow === "boolean"
      ? { receiveShadow: attributes.receiveShadow }
      : {}),
    xriftComponents: [],
    sourceLine: node.line,
    sourceTag: node.name,
  };
}

function isLocalComponentBinding(
  binding: ImportBinding | undefined,
  nodeName: string,
  context: ConvertContext,
): boolean {
  if (binding?.module.startsWith(".")) return true;
  if (!context.sourcePath || !context.moduleSources) return false;
  const source = context.moduleSources.get(context.sourcePath);
  return source !== undefined && hasComponentDeclaration(source, nodeName);
}

function convertLocalComponent(
  node: ParsedJsxNode,
  binding: ImportBinding | undefined,
  attributes: JsonObject,
  context: ConvertContext,
  bindings: ReadonlyMap<string, ImportBinding>,
  projectKind: VisualProjectKind,
  output: ComponentCodeImportNode[],
  diagnostics: ComponentCodeImportDiagnostic[],
): number {
  const before = output.length;
  const targetPath = binding?.module.startsWith(".")
    ? resolveLocalModulePath(
        context.sourcePath,
        binding.module,
        context.moduleSources,
      )
    : context.sourcePath;
  const exportName = binding?.imported ?? node.name;
  const boundary = appendImportNode(output, context, {
    name: staticNodeName(attributes, node.name),
    kind: "empty",
    transform: transformFromProps(attributes),
    ...(context.rigidBody ? { collider: context.rigidBody } : {}),
    xriftComponents: [],
    sourceLine: node.line,
    sourceTag: node.name,
    localComponent: true,
  });
  if (!targetPath || !context.moduleSources) {
    diagnostics.push({
      severity: "warning",
      code: "local-module-missing",
      message: `${node.name}のlocal moduleを読み取れないため、Component境界だけを保持します。`,
      line: node.line,
      sourcePath: context.sourcePath,
    });
  } else {
    const expansionKey = `${targetPath}#${exportName}`;
    if (context.expansionStack.includes(expansionKey)) {
      diagnostics.push({
        severity: "warning",
        code: "local-component-cycle",
        message: `${node.name}の循環参照を検出したため、Component境界で展開を止めました。`,
        line: node.line,
        sourcePath: context.sourcePath,
      });
    } else if (context.expansionStack.length >= 24) {
      diagnostics.push({
        severity: "warning",
        code: "local-component-depth",
        message: `${node.name}の展開が深すぎるため、Component境界で停止しました。`,
        line: node.line,
        sourcePath: context.sourcePath,
      });
    } else {
      const targetSource = context.moduleSources.get(targetPath);
      const roots = targetSource
        ? extractComponentJsxRoots(
            targetSource,
            exportName,
            node.name,
            targetPath,
            diagnostics,
          )
        : [];
      if (roots.length === 0) {
        diagnostics.push({
          severity: "warning",
          code: "local-component-jsx-missing",
          message: `${node.name}のreturn JSXを静的に見つけられないため、Component境界だけを保持します。`,
          line: node.line,
          sourcePath: targetPath,
        });
      } else if (targetSource) {
        const targetBindings = new Map(
          parseImports(targetSource).map((entry) => [entry.local, entry]),
        );
        const assetReferences = scanModuleAssetReferences(targetSource, targetPath);
        const targetContext: ConvertContext = {
          ...context,
          parentPlanNodeId: boundary.planNodeId,
          rigidBody: undefined,
          sourcePath: targetPath,
          fallbackModelSourcePath: assetReferences.find(
            (reference) => reference.kind === "model",
          )?.sourcePath,
          fallbackTextureSourcePath: assetReferences.find(
            (reference) => reference.kind === "texture",
          )?.sourcePath,
          fallbackUnsupportedSourcePath: assetReferences.find(
            (reference) => reference.kind === "unsupported",
          )?.sourcePath,
          expansionStack: [...context.expansionStack, expansionKey],
        };
        for (const root of roots) {
          convertJsxNode(
            root,
            targetContext,
            targetBindings,
            projectKind,
            output,
            diagnostics,
          );
        }
      }
    }
  }
  visitChildren(
    node,
    {
      ...context,
      parentPlanNodeId: boundary.planNodeId,
      rigidBody: undefined,
    },
    bindings,
    projectKind,
    output,
    diagnostics,
  );
  return output.length - before;
}

function resolveLocalModulePath(
  fromPath: string | undefined,
  specifier: string,
  moduleSources: ReadonlyMap<string, string> | undefined,
): string | undefined {
  if (!fromPath || !moduleSources || !specifier.startsWith(".")) return undefined;
  const slash = fromPath.lastIndexOf("/");
  const parent = slash >= 0 ? fromPath.slice(0, slash) : "";
  const base = normalizeModulePath(`${parent}/${specifier}`);
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    `${base}/index.tsx`,
    `${base}/index.ts`,
    `${base}/index.jsx`,
    `${base}/index.js`,
  ];
  return candidates.find((candidate) => moduleSources.has(candidate));
}

function normalizeModulePath(value: string): string {
  if (value.startsWith("<") && value.endsWith(".tsx")) return value;
  const normalized: string[] = [];
  for (const segment of value.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  return normalized.join("/");
}

function hasComponentDeclaration(source: string, componentName: string): boolean {
  const escaped = escapeRegExp(componentName);
  return new RegExp(
    `(?:function|const)\\s+${escaped}\\b`,
  ).test(source);
}

function extractComponentJsxRoots(
  source: string,
  exportName: string,
  localName: string,
  sourcePath: string,
  diagnostics: ComponentCodeImportDiagnostic[],
): ParsedJsxNode[] {
  const componentName = exportName === "default" ? localName : exportName;
  const range = findComponentBodyRange(source, componentName, exportName === "default");
  if (!range) return [];
  const body = source.slice(range.start, range.end);
  if (/\.map\s*\(/.test(body)) {
    diagnostics.push({
      severity: "warning",
      code: "local-component-dynamic-collection",
      message: `${localName}内のmapによる動的な繰り返しは件数を確定できません。静的に読めるtemplate構造だけを保持します。`,
      sourcePath,
      line: lineNumber(source, range.start),
    });
  }
  const returned = findReturnedJsxRange(body);
  if (!returned) return [];
  const absoluteStart = range.start + returned.start;
  const prefix = "\n".repeat(Math.max(0, lineNumber(source, absoluteStart) - 1));
  const before = diagnostics.length;
  const roots = parseJsx(`${prefix}${body.slice(returned.start, returned.end)}`, diagnostics);
  for (const diagnostic of diagnostics.slice(before)) {
    diagnostic.sourcePath ??= sourcePath;
  }
  return roots;
}

function findComponentBodyRange(
  source: string,
  componentName: string,
  allowDefault: boolean,
): { start: number; end: number } | null {
  const escaped = escapeRegExp(componentName);
  const functionPatterns = [
    new RegExp(`(?:export\\s+)?(?:default\\s+)?function\\s+${escaped}\\s*\\(`),
    ...(allowDefault
      ? [new RegExp("export\\s+default\\s+function(?:\\s+[A-Za-z_$][\\w$]*)?\\s*\\(")]
      : []),
  ];
  for (const pattern of functionPatterns) {
    const match = pattern.exec(source);
    if (!match) continue;
    const open = source.indexOf("{", match.index + match[0].length);
    if (open < 0) continue;
    const end = scanBalanced(source, open, "{", "}");
    if (end > open) return { start: open + 1, end: end - 1 };
  }

  const declarationPatterns = [
    new RegExp(`(?:export\\s+)?const\\s+${escaped}\\b`),
    ...(allowDefault ? [new RegExp("export\\s+default\\s+")] : []),
  ];
  for (const pattern of declarationPatterns) {
    const match = pattern.exec(source);
    if (!match) continue;
    const arrow = source.indexOf("=>", match.index + match[0].length);
    if (arrow < 0) continue;
    let start = arrow + 2;
    while (/\s/.test(source[start] ?? "")) start += 1;
    if (source[start] === "{") {
      const end = scanBalanced(source, start, "{", "}");
      if (end > start) return { start: start + 1, end: end - 1 };
    }
    if (source[start] === "(") {
      const end = scanBalanced(source, start, "(", ")");
      if (end > start) return { start, end };
    }
  }
  return null;
}

function findReturnedJsxRange(
  body: string,
): { start: number; end: number } | null {
  const returned = /\breturn\s*(?=[(<])/.exec(body);
  if (!returned) {
    const trimmed = body.trimStart();
    if (trimmed.startsWith("(")) {
      const start = body.length - trimmed.length;
      const end = scanBalanced(body, start, "(", ")");
      return end > start ? { start, end } : null;
    }
    return null;
  }
  let start = returned.index + returned[0].length;
  while (/\s/.test(body[start] ?? "")) start += 1;
  if (body[start] === "(") {
    const end = scanBalanced(body, start, "(", ")");
    return end > start ? { start, end } : null;
  }
  if (body[start] === "<") return { start, end: body.length };
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rigidBodyFromJsx(
  values: JsonObject,
  node: ParsedJsxNode,
  diagnostics: ComponentCodeImportDiagnostic[],
): ComponentCodeImportRigidBody {
  const sourceBodyType =
    values.type === "dynamic" ||
    values.type === "kinematicPosition" ||
    values.type === "kinematicVelocity"
      ? values.type
      : "fixed";
  const sourceAutoColliders =
    values.colliders === false
      ? "none"
      : typeof values.colliders === "string"
        ? values.colliders
        : "cuboid";
  const autoColliders: RigidBodyAutoColliders =
    sourceAutoColliders === "none" ||
    sourceAutoColliders === "ball" ||
    sourceAutoColliders === "cuboid" ||
    sourceAutoColliders === "hull" ||
    sourceAutoColliders === "trimesh"
      ? sourceAutoColliders
      : "cuboid";
  if (autoColliders !== sourceAutoColliders) {
    diagnostics.push({
      severity: "warning",
      code: "rapier-auto-collider-unsupported",
      message: `Rapier colliders=${sourceAutoColliders}は未対応のためcuboidとして保持します。`,
      line: node.line,
    });
  }
  return {
    sourceBodyType,
    autoColliders,
    isTrigger: values.sensor === true,
    friction: nonNegativeFiniteNumber(values.friction) ?? 0.5,
    restitution: unitFiniteNumber(values.restitution) ?? 0,
    gravityScale: finiteNumber(values.gravityScale) ?? 1,
    linearDamping: nonNegativeFiniteNumber(values.linearDamping) ?? 0,
    angularDamping: nonNegativeFiniteNumber(values.angularDamping) ?? 0,
    canSleep: values.canSleep !== false,
    ccd: values.ccd === true,
    lockTranslations: values.lockTranslations === true,
    lockRotations: values.lockRotations === true,
  };
}

function optionalFiniteLightProperties(
  values: JsonObject,
): Pick<
  ComponentCodeImportLight,
  "distance" | "decay" | "angle" | "penumbra" | "width" | "height"
> {
  return Object.fromEntries(
    (["distance", "decay", "angle", "penumbra", "width", "height"] as const)
      .map((name) => [name, finiteNumber(values[name])] as const)
      .filter((entry): entry is readonly [typeof entry[0], number] =>
        entry[1] !== undefined,
      ),
  );
}

function staticNodeName(values: JsonObject, fallback: string): string {
  return typeof values.name === "string" && values.name.trim()
    ? values.name.trim().slice(0, 80)
    : fallback;
}

function applyImportedCoreComponents(
  scene: SceneDocument,
  assets: AssetManifest,
  entityId: string,
  node: ComponentCodeImportNode,
  assetIdBySourcePath?: Readonly<Record<string, string>>,
): SceneDocument {
  const entity = scene.entities[entityId];
  if (!entity) return scene;
  let components = entity.components;
  if (
    node.rigidBody &&
    !components.some((component) => component.type === "rigid-body")
  ) {
    components = [
      ...components,
      createRigidBodyComponent(createDocumentId("component-rigid-body"), {
        bodyType: node.rigidBody.sourceBodyType,
        autoColliders: node.rigidBody.autoColliders,
        isTrigger: node.rigidBody.isTrigger,
        friction: node.rigidBody.friction,
        restitution: node.rigidBody.restitution,
        gravityScale: node.rigidBody.gravityScale,
        linearDamping: node.rigidBody.linearDamping,
        angularDamping: node.rigidBody.angularDamping,
        canSleep: node.rigidBody.canSleep,
        ccd: node.rigidBody.ccd,
        lockTranslations: node.rigidBody.lockTranslations,
        lockRotations: node.rigidBody.lockRotations,
      }),
    ];
  }
  if (node.kind === "primitive") {
    components = components
      .filter((component) => component.type !== "collider" || node.collider)
      .map((component) => {
        if (component.type === "mesh") {
          const mesh: MeshComponent = {
            ...component,
            ...(node.castShadow !== undefined
              ? { castShadow: node.castShadow }
              : {}),
            ...(node.receiveShadow !== undefined
              ? { receiveShadow: node.receiveShadow }
              : {}),
          };
          return mesh;
        }
        if (component.type === "collider" && node.collider) {
          const surface = {
            isTrigger: node.collider.isTrigger,
            friction: node.collider.friction,
            restitution: node.collider.restitution,
            bodyType: node.collider.sourceBodyType,
            gravityScale: node.collider.gravityScale,
            linearDamping: node.collider.linearDamping,
            angularDamping: node.collider.angularDamping,
            canSleep: node.collider.canSleep,
            ccd: node.collider.ccd,
            lockTranslations: node.collider.lockTranslations,
            lockRotations: node.collider.lockRotations,
          };
          if (component.shape === "box") {
            const collider: ColliderComponent = {
              ...component,
              ...surface,
              center: node.collider.center,
              halfExtents: node.collider.halfExtents,
              fitMode: "manual",
            };
            return collider;
          }
          const collider: ColliderComponent = {
            ...component,
            ...surface,
          };
          return collider;
        }
        return component;
      });
  }
  if (
    node.kind !== "primitive" &&
    node.collider &&
    !components.some((component) => component.type === "collider")
  ) {
    components = [
      ...components,
      createBoxColliderComponent(createDocumentId("component-collider"), {
        center: node.collider.center,
        halfExtents: node.collider.halfExtents,
        fitMode: "manual",
        isTrigger: node.collider.isTrigger,
        friction: node.collider.friction,
        restitution: node.collider.restitution,
        bodyType: node.collider.sourceBodyType,
        gravityScale: node.collider.gravityScale,
        linearDamping: node.collider.linearDamping,
        angularDamping: node.collider.angularDamping,
        canSleep: node.collider.canSleep,
        ccd: node.collider.ccd,
        lockTranslations: node.collider.lockTranslations,
        lockRotations: node.collider.lockRotations,
      }),
    ];
  }
  if (node.kind === "light" && node.light) {
    components = [
      ...components,
      {
        id: createDocumentId("component-light"),
        type: "light",
        enabled: true,
        ...node.light,
      },
    ];
  }
  if (node.kind === "model" && node.model) {
    const modelAssetId = resolveImportedAssetId(
      assets,
      node.model.sourcePath,
      "model",
      assetIdBySourcePath,
    );
    const model = modelAssetId ? assets.assets[modelAssetId] : undefined;
    if (model?.kind === "model") {
      components = [
        ...components,
        createMeshComponent(
          createDocumentId("component-mesh"),
          model.id,
          model.materialSlots.flatMap((slot) =>
            slot.defaultMaterialAssetId
              ? [
                  {
                    slot: slot.slot,
                    materialAssetId: slot.defaultMaterialAssetId,
                  },
                ]
              : [],
          ),
          {
            castShadow: node.castShadow,
            receiveShadow: node.receiveShadow,
          },
        ),
      ];
    }
  }
  if (node.kind === "text" && node.text) {
    const text = createTextComponent(
      createDocumentId("component-text"),
      node.text,
    );
    if (text) components = [...components, text];
  }
  if (components === entity.components) return scene;
  return {
    ...scene,
    entities: {
      ...scene.entities,
      [entityId]: { ...entity, components },
    },
  };
}

function filterXriftProperties(
  schemaId: string,
  values: JsonObject,
  node: ParsedJsxNode,
  diagnostics: ComponentCodeImportDiagnostic[],
): JsonObject {
  const definition = getXriftComponentDefinition(schemaId);
  if (!definition) return {};
  const fields = new Set(definition.fields.map((field) => field.name));
  const normalized = { ...values };
  if (
    definition.importName === "VideoScreen" &&
    normalized.url === undefined &&
    typeof normalized.src === "string"
  ) {
    normalized.url = normalized.src;
    diagnostics.push({
      severity: "warning",
      code: "video-screen-src-alias",
      message: "VideoScreenのsrcを公開型で使用されるurlへ変換しました。",
      line: node.line,
    });
  }
  return Object.fromEntries(
    Object.entries(normalized).filter(([name]) => fields.has(name)),
  );
}

function attributesToObject(
  node: ParsedJsxNode,
  diagnostics: ComponentCodeImportDiagnostic[],
): JsonObject {
  const values: JsonObject = {};
  for (const attribute of node.attributes) {
    if (attribute.dynamic) {
      diagnostics.push({
        severity: "warning",
        code: "dynamic-prop-skipped",
        message: `${node.name}.${attribute.name}は式を実行せずスキップします。リテラル値にすると変換できます。`,
        line: node.line,
      });
      continue;
    }
    if (attribute.value !== undefined) values[attribute.name] = attribute.value;
  }
  return values;
}

function parseImports(source: string): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  const defaultPattern =
    /import\s+(?!type\b)([A-Za-z_$][\w$]*)\s*(?:,\s*\{[\s\S]*?\})?\s+from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(defaultPattern)) {
    bindings.push({ imported: "default", local: match[1], module: match[2] });
  }
  const pattern = /import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const module = match[2];
    for (const specifier of splitTopLevel(match[1], ",")) {
      const cleaned = specifier.trim().replace(/^type\s+/, "");
      if (!cleaned) continue;
      const alias = cleaned.split(/\s+as\s+/);
      const imported = alias[0]?.trim();
      const local = (alias[1] ?? alias[0])?.trim();
      if (imported && local) bindings.push({ imported, local, module });
    }
  }
  return bindings;
}

function parseJsx(
  source: string,
  diagnostics: ComponentCodeImportDiagnostic[],
): ParsedJsxNode[] {
  const roots: ParsedJsxNode[] = [];
  const stack: ParsedJsxNode[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf("<", cursor);
    if (open < 0) break;
    // TypeScript generics such as React.FC<WorldProps> are not JSX tags.
    // A real JSX opening tag is not directly attached to an identifier,
    // member expression, call, or indexed expression.
    if (open > 0 && /[\w$.)\]]/.test(source[open - 1])) {
      cursor = open + 1;
      continue;
    }
    if (source.startsWith("<!--", open)) {
      cursor = Math.max(open + 4, source.indexOf("-->", open + 4) + 3);
      continue;
    }
    const scanned = scanTag(source, open);
    if (!scanned) {
      cursor = open + 1;
      continue;
    }
    cursor = scanned.end;
    if (scanned.kind === "close") {
      const matching = findLastNodeIndex(stack, scanned.name);
      if (matching >= 0) {
        stack[matching].rawContent = source.slice(stack[matching].contentStart, open);
        stack.splice(matching);
      }
      continue;
    }
    if (scanned.kind === "fragment-close") {
      const matching = findLastNodeIndex(stack, "Fragment");
      if (matching >= 0) {
        stack[matching].rawContent = source.slice(stack[matching].contentStart, open);
        stack.splice(matching);
      }
      continue;
    }
    const node: ParsedJsxNode = {
      name: scanned.name,
      attributes: parseAttributes(scanned.attributes),
      children: [],
      line: lineNumber(source, open),
      contentStart: scanned.end,
    };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    if (!scanned.selfClosing) stack.push(node);
  }
  if (stack.length > 0) {
    diagnostics.push({
      severity: "warning",
      code: "jsx-unclosed-tag",
      message: `閉じタグを確認してください: ${stack[stack.length - 1].name}`,
      line: stack[stack.length - 1].line,
    });
  }
  return roots;
}

function scanTag(
  source: string,
  start: number,
):
  | {
      kind: "open" | "close" | "fragment-close";
      name: string;
      attributes: string;
      selfClosing: boolean;
      end: number;
    }
  | null {
  let index = start + 1;
  if (source[index] === "!") return null;
  if (source[index] === ">") {
    return {
      kind: "open",
      name: "Fragment",
      attributes: "",
      selfClosing: false,
      end: index + 1,
    };
  }
  let kind: "open" | "close" | "fragment-close" = "open";
  if (source[index] === "/") {
    index += 1;
    if (source[index] === ">") {
      return {
        kind: "fragment-close",
        name: "Fragment",
        attributes: "",
        selfClosing: true,
        end: index + 1,
      };
    }
    kind = "close";
  }
  const nameMatch = source.slice(index).match(/^[A-Za-z_$][\w$.-]*/);
  if (!nameMatch) return null;
  const name = nameMatch[0];
  index += name.length;
  const attributesStart = index;
  let quote: string | null = null;
  let braceDepth = 0;
  while (index < source.length) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") quote = null;
    } else if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if (character === "{") {
      braceDepth += 1;
    } else if (character === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (character === ">" && braceDepth === 0) {
      const rawAttributes = source.slice(attributesStart, index);
      const selfClosing = /\/\s*$/.test(rawAttributes);
      return {
        kind,
        name,
        attributes: rawAttributes.replace(/\/\s*$/, ""),
        selfClosing,
        end: index + 1,
      };
    }
    index += 1;
  }
  return null;
}

function parseAttributes(source: string): ParsedAttribute[] {
  const attributes: ParsedAttribute[] = [];
  let index = 0;
  while (index < source.length) {
    while (/\s/.test(source[index] ?? "")) index += 1;
    if (index >= source.length) break;
    if (source.startsWith("{...", index)) {
      const end = scanBalanced(source, index, "{", "}");
      attributes.push({
        name: "spread",
        dynamic: true,
        rawExpression: source.slice(index + 1, Math.max(index + 1, end - 1)),
      });
      index = end > index ? end : source.length;
      continue;
    }
    const nameMatch = source.slice(index).match(/^[A-Za-z_$][\w$:-]*/);
    if (!nameMatch) {
      index += 1;
      continue;
    }
    const name = nameMatch[0];
    index += name.length;
    while (/\s/.test(source[index] ?? "")) index += 1;
    if (source[index] !== "=") {
      attributes.push({ name, value: true, dynamic: false });
      continue;
    }
    index += 1;
    while (/\s/.test(source[index] ?? "")) index += 1;
    const quote = source[index];
    if (quote === '"' || quote === "'") {
      const end = scanQuoted(source, index, quote);
      attributes.push({
        name,
        value: source.slice(index + 1, Math.max(index + 1, end - 1)),
        dynamic: false,
      });
      index = end;
      continue;
    }
    if (source[index] === "{") {
      const end = scanBalanced(source, index, "{", "}");
      const expression = source.slice(index + 1, Math.max(index + 1, end - 1));
      const parsed = parseStaticExpression(expression);
      attributes.push({
        name,
        ...(parsed.ok ? { value: parsed.value } : {}),
        dynamic: !parsed.ok,
        rawExpression: expression,
      });
      index = end;
      continue;
    }
    attributes.push({ name, dynamic: true });
  }
  return attributes;
}

function parseStaticExpression(
  source: string,
): { ok: true; value: JsonValue } | { ok: false } {
  const value = source.trim();
  if (value === "true") return { ok: true, value: true };
  if (value === "false") return { ok: true, value: false };
  if (value === "null") return { ok: true, value: null };
  if (/^0x[0-9a-f]+$/i.test(value)) {
    return { ok: true, value: Number.parseInt(value.slice(2), 16) };
  }
  if (/^(["']).*\1$/s.test(value)) {
    return { ok: true, value: value.slice(1, -1) };
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const entries = splitTopLevel(value.slice(1, -1), ",");
    const parsed: JsonValue[] = [];
    for (const entry of entries) {
      if (!entry.trim()) continue;
      const result = parseStaticExpression(entry);
      if (!result.ok) return { ok: false };
      parsed.push(result.value);
    }
    return { ok: true, value: parsed };
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    const object: JsonObject = {};
    for (const entry of splitTopLevel(value.slice(1, -1), ",")) {
      if (!entry.trim()) continue;
      const colon = findTopLevel(entry, ":");
      if (colon < 0) return { ok: false };
      const key = entry.slice(0, colon).trim().replace(/^["']|["']$/g, "");
      if (!/^[A-Za-z_$][\w$-]*$/.test(key)) return { ok: false };
      const parsed = parseStaticExpression(entry.slice(colon + 1));
      if (!parsed.ok) return { ok: false };
      object[key] = parsed.value;
    }
    return { ok: true, value: object };
  }
  const numeric = parseNumericExpression(value);
  return numeric === null ? { ok: false } : { ok: true, value: numeric };
}

function parseNumericExpression(source: string): number | null {
  const tokens = source.match(/Math\.PI|\d*\.\d+(?:e[+-]?\d+)?|\d+(?:e[+-]?\d+)?|[()+\-*/]/gi);
  if (!tokens || tokens.join("").replace(/\s/g, "") !== source.replace(/\s/g, "")) {
    return null;
  }
  let index = 0;
  const expression = (): number | null => {
    let value = term();
    if (value === null) return null;
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index++];
      const right = term();
      if (right === null) return null;
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  const term = (): number | null => {
    let value = factor();
    if (value === null) return null;
    while (tokens[index] === "*" || tokens[index] === "/") {
      const operator = tokens[index++];
      const right = factor();
      if (right === null || (operator === "/" && right === 0)) return null;
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };
  const factor = (): number | null => {
    const token = tokens[index++];
    if (token === "+") return factor();
    if (token === "-") {
      const value = factor();
      return value === null ? null : -value;
    }
    if (token === "(") {
      const value = expression();
      if (tokens[index++] !== ")") return null;
      return value;
    }
    if (token === "Math.PI") return Math.PI;
    const value = Number(token);
    return Number.isFinite(value) ? value : null;
  };
  const result = expression();
  return result !== null && index === tokens.length && Number.isFinite(result)
    ? result
    : null;
}

function transformFromProps(values: JsonObject): ComponentCodeImportTransform {
  return {
    position: asVec3(values.position, [0, 0, 0]),
    rotation: asVec3(values.rotation, [0, 0, 0]),
    scale: asScale(values.scale),
  };
}

function geometryScale(creationId: string, args: number[]): Vec3 {
  switch (creationId) {
    case BUILTIN_PRIMITIVE_CREATION_IDS.box:
      return [args[0] ?? 1, args[1] ?? 1, args[2] ?? 1];
    case BUILTIN_PRIMITIVE_CREATION_IDS.sphere: {
      const diameter = (args[0] ?? 1) * 2;
      return [diameter, diameter, diameter];
    }
    case BUILTIN_PRIMITIVE_CREATION_IDS.cylinder: {
      const radius = Math.max(args[0] ?? 1, args[1] ?? 1) * 2;
      return [radius, args[2] ?? 1, radius];
    }
    case BUILTIN_PRIMITIVE_CREATION_IDS.cone: {
      const diameter = (args[0] ?? 1) * 2;
      return [diameter, args[1] ?? 1, diameter];
    }
    case BUILTIN_PRIMITIVE_CREATION_IDS.plane:
      return [args[0] ?? 1, args[1] ?? 1, 1];
    default:
      return [1, 1, 1];
  }
}

function resolveImportedMaterial(
  assets: AssetManifest,
  material: ComponentCodeImportMaterial | undefined,
  nodeName: string,
  assetIdBySourcePath?: Readonly<Record<string, string>>,
): { assets: AssetManifest; materialId?: string } {
  if (!material) return { assets };
  const textureAssetId = material.baseColorTextureSourcePath
    ? resolveImportedAssetId(
        assets,
        material.baseColorTextureSourcePath,
        "texture",
        assetIdBySourcePath,
      )
    : undefined;
  const existing = Object.values(assets.assets).find(
    (asset): asset is MaterialAsset =>
      asset.kind === "material" &&
      asset.properties.color.toLowerCase() === material.color.toLowerCase() &&
      (material.metalness === undefined ||
        asset.properties.metalness === material.metalness) &&
      (material.roughness === undefined ||
        asset.properties.roughness === material.roughness) &&
      (textureAssetId === undefined ||
        asset.properties.baseColorTextureId === textureAssetId) &&
      (material.doubleSided === undefined ||
        asset.properties.doubleSided === material.doubleSided),
  );
  if (existing) return { assets, materialId: existing.id };
  const materialId = createDocumentId("asset-material");
  const added = addDefaultMaterialAsset(assets, {
    id: materialId,
    name: `${nodeName} ${material.color.toUpperCase()}`,
    folderId: null,
    source: { kind: "document" },
    properties: {
      color: material.color,
      metalness: material.metalness ?? 0,
      roughness: material.roughness ?? 0.65,
      ...(textureAssetId ? { baseColorTextureId: textureAssetId } : {}),
      ...(material.doubleSided !== undefined
        ? { doubleSided: material.doubleSided }
        : {}),
    },
  });
  return added.added
    ? { assets: added.manifest, materialId: added.assetId }
    : { assets };
}

function resolveImportedAssetId(
  assets: AssetManifest,
  sourcePath: string,
  expectedKind: "model" | "texture",
  assetIdBySourcePath?: Readonly<Record<string, string>>,
): string | undefined {
  const normalized = normalizeModulePath(sourcePath);
  const mapped = assetIdBySourcePath?.[normalized];
  if (mapped && assets.assets[mapped]?.kind === expectedKind) return mapped;
  const fileName = normalized.split("/").pop()?.toLowerCase();
  return Object.values(assets.assets).find((asset) => {
    if (asset.kind !== expectedKind) return false;
    if (
      asset.source.kind === "project" &&
      normalizeModulePath(asset.source.relativePath) === normalized
    ) {
      return true;
    }
    return (
      expectedKind === "model" &&
      asset.kind === "model" &&
      asset.importMetadata?.sourceFileName?.toLowerCase() === fileName
    );
  })?.id;
}

function normalizeColor(value: JsonValue | undefined): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `#${Math.max(0, Math.min(0xffffff, Math.round(value)))
      .toString(16)
      .padStart(6, "0")}`;
  }
  if (typeof value !== "string") return undefined;
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex
      .slice(1)
      .split("")
      .map((entry) => `${entry}${entry}`)
      .join("")}`.toLowerCase();
  }
  return undefined;
}

function toColorNumber(value: JsonValue | undefined): number | undefined {
  const color = normalizeColor(value);
  return color ? Number.parseInt(color.slice(1), 16) : undefined;
}

function pickProperties(values: JsonObject, names: readonly string[]): JsonObject {
  return Object.fromEntries(
    names.flatMap((name) =>
      values[name] === undefined ? [] : [[name, values[name]]],
    ),
  );
}

function asNumberArray(value: JsonValue | undefined): number[] {
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    ? (value as number[])
    : [];
}

function asVec3(value: JsonValue | undefined, fallback: Vec3): Vec3 {
  const entries = asNumberArray(value);
  return entries.length === 3
    ? [entries[0], entries[1], entries[2]]
    : [...fallback];
}

function asScale(value: JsonValue | undefined): Vec3 {
  if (typeof value === "number" && Number.isFinite(value)) {
    return [value, value, value];
  }
  return asVec3(value, [1, 1, 1]);
}

function finiteNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveFiniteNumber(value: JsonValue | undefined): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function nonNegativeFiniteNumber(
  value: JsonValue | undefined,
): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function unitFiniteNumber(value: JsonValue | undefined): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed >= 0 && parsed <= 1
    ? parsed
    : undefined;
}

function multiplyVec3(left: Vec3, right: Vec3): Vec3 {
  return [left[0] * right[0], left[1] * right[1], left[2] * right[2]];
}

function cloneTransform(
  transform: ComponentCodeImportTransform,
): ComponentCodeImportTransform {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
    scale: [...transform.scale],
  };
}

function primitiveLabel(geometryName: string): string {
  return geometryName.replace(/Geometry$/, "").replace(/^./, (value) => value.toUpperCase());
}

function splitTopLevel(source: string, separator: string): string[] {
  const values: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if ("[({".includes(character)) {
      depth += 1;
    } else if ("])}".includes(character)) {
      depth -= 1;
    } else if (character === separator && depth === 0) {
      values.push(source.slice(start, index));
      start = index + 1;
    }
  }
  values.push(source.slice(start));
  return values;
}

function findTopLevel(source: string, target: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if ("[({".includes(character)) {
      depth += 1;
    } else if ("])}".includes(character)) {
      depth -= 1;
    } else if (character === target && depth === 0) {
      return index;
    }
  }
  return -1;
}

function scanQuoted(source: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === quote && source[index - 1] !== "\\") return index + 1;
    index += 1;
  }
  return source.length;
}

function scanBalanced(
  source: string,
  start: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  let quote: string | null = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return source.length;
}

function lineNumber(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function findLastNodeIndex(nodes: ParsedJsxNode[], name: string): number {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (nodes[index].name === name) return index;
  }
  return -1;
}
