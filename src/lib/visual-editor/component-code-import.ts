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
  createExtrudeMeshComponent,
  createMeshComponent,
  createRigidBodyComponent,
  createTextComponent,
  renameEntity,
  updateEntityTransform,
  type ColliderComponent,
  type ExtrudeGeometryData,
  type JsonObject,
  type JsonValue,
  type LightComponent,
  type MeshComponent,
  type RigidBodyAutoColliders,
  type SceneDocument,
  type Vec3,
} from "./scene-document";
import { updateXriftComponent } from "./component-registry";
import { foldXriftPlacementIntoTransform } from "./xrift-component-placement";
import {
  createEmbeddedReferencePattern,
  createQuotedReferenceScanPattern,
  kindForPath,
} from "./asset-format-registry";
import { validateXriftExtrudeProfile } from "../../../packages/xrift-studio-runtime/src/extrude-profile";

/** Kinds a JSX component module can reference. */
const COMPONENT_CODE_REFERENCE_KINDS = ["texture", "skybox", "model"] as const;

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
    Item: `<Item itemId="12345678-1234-1234-1234-123456789abc" placementId="sample-item" />`,
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
  unlit?: boolean;
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
  /** Authored extruded profile when kind is "primitive" without a creationId. */
  extrude?: ExtrudeGeometryData;
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
  /** Explicit JSX key, preserved for stable code-authoring identity. */
  sourceKey?: string;
  localComponent?: boolean;
  /** Placement props have been evaluated in the returned JSX, not the boundary. */
  componentPropsResolved?: boolean;
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
  staticEnv?: StaticValueEnv;
  staticShapeSource?: string;
  budget: StaticImportBudget;
};

const MAX_STATIC_IMPORT_NODES = 4096;
const MAX_STATIC_IMPORT_CHARACTERS = 2_000_000;
type StaticImportBudget = { characters: number; expansions: number };
class StaticImportLimitError extends Error {}
function consumeStaticText(budget: StaticImportBudget, count: number): void {
  budget.characters += count;
  if (budget.characters > MAX_STATIC_IMPORT_CHARACTERS) {
    throw new StaticImportLimitError("コードの静的展開が上限を超えました。繰り返しやComponentの数を減らしてください。");
  }
}

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
      message: `${normalizedEntryFile}を元データmodule一覧から読み取れませんでした。`,
      sourcePath: normalizedEntryFile,
    });
  }
  const bindings = parseImports(source);
  const bindingByLocal = new Map(bindings.map((binding) => [binding.local, binding]));
  const nodes: ComponentCodeImportNode[] = [];
  const budget: StaticImportBudget = { characters: 0, expansions: 0 };
  let roots: ParsedJsxNode[] = [];
  const initialContext: ConvertContext = {
    parentPlanNodeId: null,
    sourcePath: normalizedEntryFile,
    moduleSources,
    expansionStack: [`${normalizedEntryFile}#<entry>`],
    budget,
  };
  try {
    if (input.modules.reduce((count, module) => count + module.source.length, 0) > MAX_STATIC_IMPORT_CHARACTERS) {
      throw new StaticImportLimitError("取り込むコードの文字数が上限を超えました。");
    }
    const entry = findEntryComponent(source);
    if (entry) {
      const extracted = extractComponentJsxRoots(source, entry, entry, normalizedEntryFile, diagnostics, {}, budget);
      roots = extracted.roots;
      initialContext.staticEnv = extracted.env;
      initialContext.staticShapeSource = extracted.shapeSource;
    } else {
      // A pasted JSX fragment remains supported; module declarations must have
      // an identifiable entry so helper implementations never become roots.
      if (/\b(?:function|const)\s+[A-Z]/.test(source)) {
        diagnostics.push({ severity: "error", code: "entry-component-ambiguous", message: "取り込む入口をexport defaultまたはWorld / Itemとして指定してください。", sourcePath: normalizedEntryFile });
      } else {
        const env = collectStaticConstEnv(source);
        const expanded = expandStaticMapCalls(source, env, count => diagnostics.push({ severity: "info", code: "static-map-expanded", message: `静的な繰り返しを${count}件へ展開しました。` }), budget);
        diagnoseUnresolvedCollections(expanded, diagnostics, normalizedEntryFile);
        roots = parseJsx(expanded, diagnostics, env);
        initialContext.staticEnv = env;
      }
    }
    for (const root of roots) {
      convertJsxNode(root, initialContext, bindingByLocal, input.projectKind, nodes, diagnostics);
    }
  } catch (error) {
    if (!(error instanceof StaticImportLimitError)) throw error;
    nodes.length = 0;
    diagnostics.push({ severity: "error", code: "static-expansion-limit", message: error.message, sourcePath: normalizedEntryFile });
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
  const kind = kindForPath(sourcePath, {
    preferModel: preferredKind === "model",
  });
  if (kind === "model") return "model";
  // HDRI still becomes a Texture Asset on this import path.
  if (kind === "texture" || kind === "skybox") return "texture";
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
  const stringPattern = createQuotedReferenceScanPattern(
    COMPONENT_CODE_REFERENCE_KINDS,
  );
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
    createEmbeddedReferencePattern(COMPONENT_CODE_REFERENCE_KINDS),
  );
  if (!embedded) return undefined;
  candidate = embedded[1].replace(/[?#].*$/, "").replace(/\\/g, "/");
  const kind = kindForPath(candidate);
  if (kind !== "model" && kind !== "texture" && kind !== "skybox") {
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
  diagnostics: ComponentCodeImportDiagnostic[],
  env: StaticValueEnv = new Map(),
): ComponentCodeImportText {
  let literalContent = "";
  const content = node.rawContent ?? "";
  for (let index = 0; index < content.length;) {
    if (content[index] === "{") {
      const end = scanBalanced(content, index, "{", "}");
      const expression = content.slice(index + 1, end - 1);
      if (/^\s*\/\*[\s\S]*\*\/\s*$/u.test(expression)) { index = end; continue; }
      const evaluated = evaluateStaticExpression(expression, env);
      const value = evaluated.ok ? staticTextChild(evaluated.value) : undefined;
      if (value === undefined) unsupportedImportValue(node, diagnostics, "children", "Textの文字列を静的に確定できません", "static-text-unresolved");
      else literalContent += value;
      index = end;
    } else if (content[index] === "<") {
      const child = extractJsxElementText(content, index);
      if (!child) { unsupportedImportValue(node, diagnostics, "children", "Textの子要素を確定できません", "static-text-unresolved"); break; }
      index = child.end;
    } else {
      const nextExpression = content.indexOf("{", index), nextElement = content.indexOf("<", index);
      const end = Math.min(...[nextExpression, nextElement, content.length].filter(value => value >= 0));
      literalContent += content.slice(index, end).replace(/\s+/g, " ");
      index = end;
    }
  }
  for (const [field, valid] of [
    ["text", attributes.text === undefined || typeof attributes.text === "string"],
    ["color", attributes.color === undefined || Boolean(normalizeColor(attributes.color))],
    ["outlineColor", attributes.outlineColor === undefined || Boolean(normalizeColor(attributes.outlineColor))],
    ["fontSize", attributes.fontSize === undefined || positiveFiniteNumber(attributes.fontSize) !== undefined],
    ["maxWidth", attributes.maxWidth === undefined || positiveFiniteNumber(attributes.maxWidth) !== undefined],
    ["outlineWidth", attributes.outlineWidth === undefined || nonNegativeFiniteNumber(attributes.outlineWidth) !== undefined],
    ["anchorX", attributes.anchorX === undefined || ["left", "center", "right"].includes(String(attributes.anchorX))],
    ["anchorY", attributes.anchorY === undefined || ["top", "middle", "bottom"].includes(String(attributes.anchorY))],
  ] as const) if (!valid) unsupportedImportValue(node, diagnostics, field, "Textの対応する値を指定してください");
  const text =
    typeof attributes.text === "string"
      ? attributes.text
      : content
        ? literalContent.trim()
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

function staticTextChild(value: JsonValue): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value === null || typeof value === "boolean") return "";
  if (!Array.isArray(value)) return undefined;
  const children = value.map(staticTextChild);
  return children.every(child => child !== undefined) ? children.join("") : undefined;
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
    if (node.kind === "primitive" && node.extrude) {
      const material = resolveImportedMaterial(
        assets,
        node.material,
        node.name,
        input.assetIdBySourcePath,
      );
      assets = material.assets;
      const materialId =
        material.materialId && assets.assets[material.materialId]
          ? material.materialId
          : BUILTIN_ASSET_IDS.material.slate;
      const created = createEmptyEntity(scene, parentEntityId, node.name);
      if (created) {
        scene = created.scene;
        entityId = created.entityId;
        const entity = scene.entities[entityId];
        if (entity) {
          scene = {
            ...scene,
            entities: {
              ...scene.entities,
              [entityId]: {
                ...entity,
                components: [
                  ...entity.components,
                  createExtrudeMeshComponent(
                    createDocumentId("component-mesh"),
                    materialId,
                    node.extrude,
                    {
                      castShadow: node.castShadow,
                      receiveShadow: node.receiveShadow,
                    },
                  ),
                ],
              },
            },
          };
        }
      }
    } else if (node.kind === "primitive" && node.creationId) {
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
        message: `${node.name}をシーンへ作成できませんでした。`,
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
  if (output.length >= MAX_STATIC_IMPORT_NODES) throw new StaticImportLimitError("Entityの静的展開が4096件を超えました。繰り返しやComponentの数を減らしてください。");
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
  const isDreiExtrude =
    binding?.module === "@react-three/drei" && binding.imported === "Extrude";
  const attributes = attributesToObject(
    isDreiExtrude
      ? {
          ...node,
          attributes: node.attributes.filter(
            (attribute) => attribute.name !== "args",
          ),
        }
      : node,
    diagnostics,
  );
  const sourceFields = { sourceLine: node.line, sourceTag: node.name, ...sourceKeyFields(attributes) };
  diagnoseTransform(attributes, node, diagnostics);
  if (node.name === "group" || node.name === "mesh" || R3F_LIGHTS[node.name]) {
    const lightFields: Record<string, string[]> = { ambientLight: [], directionalLight: ["castShadow"], hemisphereLight: ["groundColor"], pointLight: ["castShadow", "distance", "decay"], spotLight: ["castShadow", "distance", "decay", "angle", "penumbra"], rectAreaLight: ["width", "height"] };
    diagnoseNativeAttributes(node, new Set(["key", "name", "position", "rotation", "scale", ...(node.name === "mesh" ? ["castShadow", "receiveShadow"] : []), ...(R3F_LIGHTS[node.name] ? ["color", "intensity", ...lightFields[node.name]] : [])]), diagnostics);
  }
  if (binding?.module === "@react-three/drei" && DREI_PRIMITIVES[binding.imported]) diagnoseNativeAttributes(node, new Set(["key", "name", "position", "rotation", "scale", "args", "color", "metalness", "roughness", "side", "castShadow", "receiveShadow"]), diagnostics);
  if (binding?.module === "@react-three/drei") {
    const common = ["key", "name", "position", "rotation", "scale"];
    const supported: Record<string, string[]> = {
      Extrude: [...common, "args", "castShadow", "receiveShadow", "color", "metalness", "roughness", "side"],
      Text: [...common, "text", "color", "fontSize", "maxWidth", "anchorX", "anchorY", "outlineWidth", "outlineColor"],
      Billboard: common, Reflector: ["key", "name", "position", "rotation", "args", "color"], Sky: ["key", "name"], Environment: ["key", "name"],
    };
    if (supported[binding.imported]) diagnoseNativeAttributes(node, new Set(supported[binding.imported]), diagnostics);
  }
  for (const field of ["castShadow", "receiveShadow"]) if (attributes[field] !== undefined && typeof attributes[field] !== "boolean") unsupportedImportValue(node, diagnostics, field, "booleanで指定してください");

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
    for (const field of ["color", "groundColor"]) if (attributes[field] !== undefined && !normalizeColor(attributes[field])) unsupportedImportValue(node, diagnostics, field, "#rrggbb、#rgb、または有限な色の数値で指定してください");
    for (const [field, min, max] of [["intensity", 0, 1_000_000], ["distance", 0, 10_000], ["decay", 0, 1000], ["angle", 0.0001, Math.PI / 2], ["penumbra", 0, 1], ["width", 0.0001, 1000], ["height", 0.0001, 1000]] as const) if (attributes[field] !== undefined && (typeof attributes[field] !== "number" || !Number.isFinite(attributes[field]) || (attributes[field] as number) < min || (attributes[field] as number) > max)) unsupportedImportValue(node, diagnostics, field, `${min}〜${max}の有限な値で指定してください`);
    const color = normalizeColor(attributes.color) ?? "#ffffff";
    const groundColor = normalizeColor(attributes.groundColor);
    const light = appendImportNode(output, context, {
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
    visitChildren(node, { ...context, parentPlanNodeId: light.planNodeId }, bindings, projectKind, output, diagnostics);
    return output.length - before;
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
        message: `${definition.importName}の子要素を変換できなかったため、ComponentEntityだけを保持します。`,
        line: node.line,
        sourcePath: context.sourcePath,
      });
    }
    // The official Component's own position/rotation/scale become the Entity's
    // Transform instead of a second origin inside it, so the transform gizmo
    // lands on the screen, mirror or board the author selected and a rotation
    // drag turns it in place. Skipped when something else on the Entity is
    // drawn at the Entity origin - a Collider from an enclosing RigidBody, or
    // a leaf Component's converted children - because that content would move
    // with the origin. `<ScreenShareDisplay position={[-19.72, 2, 0]} .../>`
    // in the official world template is the shape this exists for.
    const movesOtherContent =
      Boolean(context.rigidBody) ||
      (definition.attachBehavior.kind === "leaf" && added > 0);
    if (!movesOtherContent) {
      const folded = foldXriftPlacementIntoTransform(
        definition.schemaId,
        componentNode.transform,
        component.properties,
      );
      componentNode.transform = folded.transform;
      component.properties = folded.properties;
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
      const text = textFromJsx(node, attributes, diagnostics, context.staticEnv);
      const textNode = appendImportNode(output, context, {
        ...sourceFields,
        name: staticNodeName(attributes, text.text.slice(0, 40) || "Text"),
        kind: "text",
        transform: transformFromProps(attributes),
        text,
        ...(context.rigidBody ? { collider: context.rigidBody } : {}),
        xriftComponents: [],
      });
      visitChildren(node, { ...context, parentPlanNodeId: textNode.planNodeId }, bindings, projectKind, output, diagnostics);
      return output.length - before;
    }
    if (binding.imported === "Billboard") {
      const definition = getXriftComponentDefinition("BillboardY");
      if (!definition) return 0;
      // The group props become the Entity's Transform rather than an offset
      // inside the Component, so the Entity origin is where the wrapper draws.
      const billboardPlacement = foldXriftPlacementIntoTransform(
        definition.schemaId,
        cloneTransform(IDENTITY_TRANSFORM),
        pickProperties(attributes, ["position", "rotation", "scale"]),
      );
      const billboard = appendImportNode(output, context, {
        ...sourceFields,
        name: staticNodeName(attributes, "BillboardY"),
        kind: "empty",
        transform: billboardPlacement.transform,
        xriftComponents: [{
          schemaId: definition.schemaId,
          properties: billboardPlacement.properties,
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
      if (node.children.length) unsupportedImportValue(node, diagnostics, "children", "Reflectorの子要素は保持できません。共通のgroupへ配置してください");
      const definition = getXriftComponentDefinition("Mirror");
      if (!definition) return 0;
      const args = asNumberArray(attributes.args);
      // Same as above: the reflector's place in the world is the Entity's, so
      // the props become the Transform unless an enclosing RigidBody put a
      // Collider on the Entity origin that the move would drag along with it.
      const mirrorPlacement = context.rigidBody
        ? {
            transform: cloneTransform(IDENTITY_TRANSFORM),
            properties: pickProperties(attributes, ["position", "rotation"]),
          }
        : foldXriftPlacementIntoTransform(
            definition.schemaId,
            cloneTransform(IDENTITY_TRANSFORM),
            pickProperties(attributes, ["position", "rotation"]),
          );
      const properties: JsonObject = {
        ...mirrorPlacement.properties,
        ...(args.length >= 2 ? { size: [args[0], args[1]] } : {}),
        ...(toColorNumber(attributes.color) !== undefined
          ? { color: toColorNumber(attributes.color)! }
          : {}),
      };
      appendImportNode(output, context, {
        ...sourceFields,
        name: staticNodeName(attributes, "Mirror"),
        kind: "empty",
        transform: mirrorPlacement.transform,
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
      if (node.children.length) unsupportedImportValue(node, diagnostics, "children", "空の子要素は保持できません。共通のgroupへ配置してください");
      const definition = getXriftComponentDefinition("Skybox");
      if (!definition) return 0;
      appendImportNode(output, context, {
        ...sourceFields,
        name: staticNodeName(attributes, "Skybox"),
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
            ? "Drei EnvironmentをSkyboxへ変換します。HDRIは別途Assetsへ読み込んでください。"
            : "Drei SkyをSkyboxへ変換します。",
        line: node.line,
        sourcePath: context.sourcePath,
      });
      return 1;
    }
    if (binding.imported === "Extrude") {
      const built = extrudeNodeFromJsx(node, node, attributes, context, diagnostics);
      if (built) {
        return appendPrimitiveAndChildren(built, node, attributes, context, bindings, projectKind, output, diagnostics);
      }
      return preserveUnsupportedNode(
        node,
        context,
        bindings,
        projectKind,
        output,
        diagnostics,
      );
    }
    const creationId = DREI_PRIMITIVES[binding.imported];
    if (creationId) {
      return appendPrimitiveAndChildren(primitiveNodeFromJsx(node, creationId, binding.imported, attributes, context, diagnostics), node, attributes, context, bindings, projectKind, output, diagnostics);
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
      const extrudeGeometryNode = node.children.find(
        (child) => child.name === "extrudeGeometry",
      );
      if (extrudeGeometryNode) {
        const built = extrudeNodeFromJsx(
          node,
          extrudeGeometryNode,
          attributes,
          context,
          diagnostics,
        );
        if (built) {
          return appendPrimitiveAndChildren(built, node, attributes, context, bindings, projectKind, output, diagnostics);
        }
        return preserveUnsupportedNode(
          node,
          context,
          bindings,
          projectKind,
          output,
          diagnostics,
        );
      }
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
        message: "メッシュ内に対応する標準Geometryがないため、メッシュEntityと子構造だけを保持します。",
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
    diagnoseNativeAttributes(geometry, new Set(["args", "attach"]), diagnostics);
    if (geometryAttributes.attach !== undefined && geometryAttributes.attach !== "geometry") unsupportedImportValue(geometry, diagnostics, "attach", "geometry以外へのattachは保持できません");
    return appendPrimitiveAndChildren(primitiveNodeFromJsx(
        node,
        GEOMETRY_PRIMITIVES[geometry.name],
        primitiveLabel(geometry.name),
        { ...attributes, args: geometryAttributes.args },
        context,
        diagnostics,
      ), node, attributes, context, bindings, projectKind, output, diagnostics);
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
    if (GEOMETRY_PRIMITIVES[child.name] || child.name === "extrudeGeometry" || /Material$/.test(child.name)) continue;
    convertJsxNode(child, context, bindings, projectKind, output, diagnostics);
  }
  return output.length - before;
}

/** Geometry constructor dimensions belong to the Mesh surface, not its child
 * Object3Ds. A separate surface Entity keeps nonuniform dimensions out of the
 * inherited Transform, including when a child has a rotation. */
function appendPrimitiveAndChildren(
  built: Omit<ComponentCodeImportNode, "planNodeId" | "parentPlanNodeId" | "sourcePath">,
  node: ParsedJsxNode, attributes: JsonObject, context: ConvertContext,
  bindings: ReadonlyMap<string, ImportBinding>, projectKind: VisualProjectKind,
  output: ComponentCodeImportNode[], diagnostics: ComponentCodeImportDiagnostic[],
): number {
  const before = output.length;
  const declarations = node.children.filter(child => GEOMETRY_PRIMITIVES[child.name] || child.name === "extrudeGeometry" || /Material$/.test(child.name));
  if (declarations.filter(child => !/Material$/.test(child.name)).length > 1 || declarations.filter(child => /Material$/.test(child.name)).length > 1) {
    unsupportedImportValue(node, diagnostics, "children", "複数のGeometryやMaterialは保持できません。Meshを分けてください");
  }
  if (node.children.length === declarations.length) { appendImportNode(output, context, built); return 1; }
  const transform = transformFromProps(attributes);
  const owner = appendImportNode(output, context, {
    name: built.name, kind: "empty", transform, xriftComponents: [], sourceLine: built.sourceLine,
    sourceTag: built.sourceTag, ...(built.sourceKey !== undefined ? { sourceKey: built.sourceKey } : {}),
    ...(built.collider ? { collider: built.collider } : {}),
  });
  appendImportNode(output, { ...context, parentPlanNodeId: owner.planNodeId }, {
    ...built, name: `${built.name} Geometry`, sourceKey: "$xrift-geometry", collider: undefined,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: built.transform.scale.map((value, index) => transform.scale[index] ? value / transform.scale[index] : 1) as Vec3 },
  });
  visitChildren(node, { ...context, parentPlanNodeId: owner.planNodeId, rigidBody: undefined }, bindings, projectKind, output, diagnostics);
  return output.length - before;
}

function extrudeNodeFromJsx(
  node: ParsedJsxNode,
  argsNode: ParsedJsxNode,
  attributes: JsonObject,
  context: ConvertContext,
  diagnostics: ComponentCodeImportDiagnostic[],
): Omit<
  ComponentCodeImportNode,
  "planNodeId" | "parentPlanNodeId" | "sourcePath"
> | null {
  if (argsNode !== node) {
    diagnoseNativeAttributes(argsNode, new Set(["args", "attach"]), diagnostics);
    const attach = argsNode.attributes.find(attribute => attribute.name === "attach");
    if (attach && attach.value !== "geometry") unsupportedImportValue(argsNode, diagnostics, "attach", "geometry以外へのattachは保持できません");
  }
  const argsAttribute = argsNode.attributes.find(
    (attribute) => attribute.name === "args",
  );
  const source =
    context.staticShapeSource ?? (context.sourcePath && context.moduleSources
      ? context.moduleSources.get(context.sourcePath)
      : undefined);
  const extrude =
    argsAttribute?.rawExpression && source
      ? extrudeFromRawArgs(
          argsAttribute.rawExpression,
          source,
          context.staticEnv ?? collectStaticConstEnv(source),
        )
      : null;
  if (!extrude) {
    diagnostics.push({
      severity: "warning",
      code: "extrude-shape-unresolved",
      message:
        "押し出し形状の輪郭や深さを静的に確定できないため、メッシュEntityと子構造だけを保持します。THREE.ShapeのmoveTo/lineToとリテラルの深さで書くと変換できます。",
      line: node.line,
      sourcePath: context.sourcePath,
    });
    return null;
  }
  if (extrude.bevelEnabled) {
    diagnostics.push({
      severity: "warning",
      code: "extrude-bevel-unsupported",
      message: "押し出しのbevelは変換できません。bevelEnabled: falseを明示してください。",
      line: node.line,
      sourcePath: context.sourcePath,
    });
    return null;
  }
  const invalidProfile = validateXriftExtrudeProfile({ points: extrude.points, depth: extrude.depth });
  if (invalidProfile) {
    diagnostics.push({ severity: "warning", code: "extrude-profile-invalid", message: invalidProfile, line: node.line, sourcePath: context.sourcePath });
    return null;
  }
  diagnostics.push({
    severity: "info",
    code: "extrude-geometry-converted",
    message: "押し出し形状を編集可能な押し出しMeshへ変換します。",
    line: node.line,
    sourcePath: context.sourcePath,
  });
  const built = primitiveNodeFromJsx(
    node,
    BUILTIN_PRIMITIVE_CREATION_IDS.box,
    "Extrude",
    { ...attributes, args: [] },
    context,
    diagnostics,
  );
  return {
    ...built,
    creationId: undefined,
    extrude: { points: extrude.points, depth: extrude.depth },
  };
}

function primitiveNodeFromJsx(
  node: ParsedJsxNode,
  creationId: string,
  name: string,
  attributes: JsonObject,
  context: ConvertContext,
  diagnostics: ComponentCodeImportDiagnostic[],
): Omit<
  ComponentCodeImportNode,
  "planNodeId" | "parentPlanNodeId" | "sourcePath"
> {
  diagnoseGeometryArgs(creationId, attributes.args, node, diagnostics);
  const localTransform = transformFromProps(attributes);
  localTransform.scale = multiplyVec3(
    localTransform.scale,
    geometryScale(creationId, Array.isArray(attributes.args) ? attributes.args.map(value => typeof value === "number" ? value : Number.NaN) : []),
  );
  const materialNode = node.children.find((child) => /Material$/.test(child.name));
  const materialProps = materialNode
    ? attributesToObject(materialNode, diagnostics)
    : attributes;
  const color = normalizeColor(materialProps.color);
  const metalness = finiteNumber(materialProps.metalness);
  const roughness = finiteNumber(materialProps.roughness);
  const unlit = materialNode?.name === "meshBasicMaterial";
  if (materialNode) {
    diagnoseNativeAttributes(materialNode, new Set(["color", "side", "attach", ...(unlit ? [] : ["metalness", "roughness"])]), diagnostics);
    if (materialProps.attach !== undefined && materialProps.attach !== "material") unsupportedImportValue(materialNode, diagnostics, "attach", "material以外へのattachは保持できません");
    if (materialProps.color !== undefined && (!color || typeof materialProps.color === "number" && (materialProps.color < 0 || materialProps.color > 0xffffff))) unsupportedImportValue(materialNode, diagnostics, "color", "色は#rrggbb、#rgb、または0〜0xffffffの数値で指定してください");
    for (const field of ["roughness", "metalness"] as const) if (materialProps[field] !== undefined && (typeof materialProps[field] !== "number" || materialProps[field] < 0 || materialProps[field] > 1)) unsupportedImportValue(materialNode, diagnostics, field, "0〜1の有限な値で指定してください");
    if (materialProps.side !== undefined && ![0, 2, "FrontSide", "DoubleSide"].includes(materialProps.side as string | number)) unsupportedImportValue(materialNode, diagnostics, "side", "FrontSideまたはDoubleSideだけを保持できます");
  }
  const textureSourcePath =
    assetSourcePathFromJsx(
      materialNode ?? node,
      ["map", "src", "url", "texture"],
      context.sourcePath,
    ) ?? context.fallbackTextureSourcePath;
  const doubleSided =
    materialProps.side === "BackSide" ||
    materialProps.side === "DoubleSide" ||
    materialProps.side === 2 || materialProps.side === 1 ||
    (creationId === BUILTIN_PRIMITIVE_CREATION_IDS.sphere &&
      textureSourcePath !== undefined);
  return {
    name: staticNodeName(attributes, name),
    kind: "primitive",
    creationId,
    transform: localTransform,
    ...(color || textureSourcePath || materialNode
      ? {
          material: {
            color: color ?? "#ffffff",
            ...(unlit ? { unlit: true } : {}),
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
    ...sourceKeyFields(attributes),
  };
}

function unsupportedImportValue(node: ParsedJsxNode, diagnostics: ComponentCodeImportDiagnostic[], field: string, message: string, code = "invalid-static-value"): void {
  diagnostics.push({ severity: "warning", code, message: `${node.name}.${field}: ${message}`, line: node.line });
}

function diagnoseNativeAttributes(node: ParsedJsxNode, supported: ReadonlySet<string>, diagnostics: ComponentCodeImportDiagnostic[]): void {
  for (const attribute of node.attributes) if (!supported.has(attribute.name)) unsupportedImportValue(node, diagnostics, attribute.name, "この属性はSceneへ保持できません。対応する属性だけを指定してください。", "unsupported-native-prop");
}

function diagnoseTransform(values: JsonObject, node: ParsedJsxNode, diagnostics: ComponentCodeImportDiagnostic[]): void {
  for (const field of ["position", "rotation", "scale"] as const) {
    const value = values[field];
    if (value === undefined) continue;
    const entries = field === "scale" && typeof value === "number" ? [value, value, value] : value;
    const bound = field === "position" ? 10_000 : 1000;
    if (!Array.isArray(entries) || entries.length !== 3 || entries.some(entry => typeof entry !== "number" || !Number.isFinite(entry) || Math.abs(entry) > bound || field === "scale" && Math.abs(entry) < 0.0001)) {
      unsupportedImportValue(node, diagnostics, field, `${field === "scale" ? "絶対値0.0001以上、" : ""}絶対値${bound}以下の有限な3要素で指定してください。`);
    }
  }
}

/** The shared Studio primitives have fixed topology. Dimensions can scale,
 * but explicitly requested topology and partial surfaces must match it. */
function diagnoseGeometryArgs(creationId: string, value: JsonValue | undefined, node: ParsedJsxNode, diagnostics: ComponentCodeImportDiagnostic[]): void {
  if (value !== undefined && !Array.isArray(value)) {
    unsupportedImportValue(node, diagnostics, "args", "寸法を配列で指定してください。", "unsupported-geometry-args"); return;
  }
  const args = Array.isArray(value) ? value : [];
  const kind = Object.entries(DREI_PRIMITIVES).find(([, id]) => id === creationId)?.[0];
  if (!kind) return;
  const dimensions = kind === "Box" ? 3 : kind === "Cylinder" ? 3 : kind === "Plane" || kind === "Cone" ? 2 : 1;
  for (let index = 0; index < dimensions; index++) {
    const dimension = args[index] ?? 1;
    if (typeof dimension !== "number" || !Number.isFinite(dimension) || dimension <= 0 || dimension > 1000) unsupportedImportValue(node, diagnostics, `args[${index}]`, "寸法は0より大きく1000以下の有限な値で指定してください。", "unsupported-geometry-args");
  }
  if (kind === "Cylinder" && (args[0] ?? 1) !== (args[1] ?? 1)) unsupportedImportValue(node, diagnostics, "args", "Cylinderの上下の半径は同じ値だけを保持できます。円すいはConeを使ってください。", "unsupported-geometry-args");
  const topology: Record<string, JsonValue[]> = {
    Box: [1,1,1], Sphere: [32,20,0,Math.PI * 2,0,Math.PI],
    Cylinder: [32,1,false,0,Math.PI * 2], Cone: [32,1,false,0,Math.PI * 2], Plane: [1,1],
  };
  const expected = topology[kind];
  for (let index = dimensions; index < args.length; index++) {
    const next = expected[index - dimensions];
    if (next === undefined || typeof next === "number" && (typeof args[index] !== "number" || Math.abs((args[index] as number) - next) > 1e-9) || typeof next !== "number" && args[index] !== next) {
      unsupportedImportValue(node, diagnostics, `args[${index}]`, `分割・開口・角度はStudioの固定形状だけを保持できます（${kind}: ${JSON.stringify(expected)}）。`, "unsupported-geometry-args");
    }
  }
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
  if (node.children.length) unsupportedImportValue(node, diagnostics, "children", "ローカルComponentへのJSX childrenは保持できません。子要素をComponent内で構成するか、外側のgroupへ配置してください");
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
    // Calling a React component does not itself create an Object3D. Its
    // returned JSX consumes placement props, so applying them here as well
    // would double positions/scales for <group {...props}> implementations.
    transform: cloneTransform(IDENTITY_TRANSFORM),
    ...(context.rigidBody ? { collider: context.rigidBody } : {}),
    xriftComponents: [],
    sourceLine: node.line,
    sourceTag: node.name,
    ...sourceKeyFields(attributes),
    localComponent: true,
  });
  if (!targetPath || !context.moduleSources) {
    diagnostics.push({
      severity: "warning",
      code: "local-module-missing",
      message: `${node.name}のローカルモジュールを読み取れないため、Component境界だけを保持します。`,
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
      const extracted = targetSource
        ? extractComponentJsxRoots(
            targetSource,
            exportName,
            node.name,
            targetPath,
            diagnostics,
            attributes,
            context.budget,
          )
        : { roots: [], env: new Map<string, JsonValue>(), shapeSource: "" };
      const roots = extracted.roots;
      const unresolvedPlacement = (items: ParsedJsxNode[]): boolean => items.some(item => item.attributes.some(attribute => attribute.dynamic && ["position", "rotation", "scale", "spread"].includes(attribute.name)) || unresolvedPlacement(item.children));
      boundary.componentPropsResolved = !unresolvedPlacement(roots);
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
          staticEnv: extracted.env,
          staticShapeSource: extracted.shapeSource,
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

function sourceKeyFields(values: JsonObject): { sourceKey?: string } {
  return typeof values.key === "string" || typeof values.key === "number"
    ? { sourceKey: String(values.key) } : {};
}

/** Masks nested scopes and strings without changing offsets. */
function topLevelCode(source: string): string {
  const chars = source.split("");
  let depth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (c === '"' || c === "'" || c === "`") {
      const end = scanQuoted(source, i, c);
      for (let j = i; j < end; j += 1) if (chars[j] !== "\n") chars[j] = " ";
      i = end - 1;
    } else if (source.startsWith("//", i) || source.startsWith("/*", i)) {
      const end = source.startsWith("//", i) ? source.indexOf("\n", i) : source.indexOf("*/", i + 2) + 2;
      const stop = end < i ? source.length : end;
      for (let j = i; j < stop; j += 1) if (chars[j] !== "\n") chars[j] = " ";
      i = stop - 1;
    } else if ("({[".includes(c)) { depth += 1; chars[i] = " "; }
    else if (")}]".includes(c)) { depth -= 1; chars[i] = " "; }
    else if (depth > 0 && c !== "\n") chars[i] = " ";
  }
  return chars.join("");
}

function findEntryComponent(source: string): string | null {
  const top = topLevelCode(source);
  const defaultFunction = /export\s+default\s+function\s*([A-Za-z_$][\w$]*)?/.exec(top);
  if (defaultFunction) return defaultFunction[1] ?? "default";
  const defaultName = /export\s+default\s+([A-Za-z_$][\w$]*)/.exec(top);
  if (defaultName && hasComponentDeclaration(source, defaultName[1])) return defaultName[1];
  if (/export\s+default\s*/.test(top)) return "default";
  for (const preferred of ["World", "Item"]) if (hasComponentDeclaration(top, preferred)) return preferred;
  const exported = [...top.matchAll(/export\s+(?:function|const)\s+([A-Z][\w$]*)/g)].map(match => match[1]);
  if (exported.length === 1) return exported[0];
  const declared = [...top.matchAll(/(?:function|const)\s+([A-Z][\w$]*)/g)].map(match => match[1]);
  return declared.length === 1 ? declared[0] : null;
}

type ComponentBodyRange = { start: number; end: number; parameters: string; expression: boolean };
function extractComponentJsxRoots(
  source: string, exportName: string, localName: string, sourcePath: string,
  diagnostics: ComponentCodeImportDiagnostic[], props: JsonObject,
  budget: StaticImportBudget,
): { roots: ParsedJsxNode[]; env: Map<string, JsonValue>; shapeSource: string } {
  const componentName = exportName === "default" ? localName : exportName;
  const range = findComponentBodyRange(source, componentName, exportName === "default");
  let env = collectStaticConstEnv(source);
  if (!range) return { roots: [], env, shapeSource: "" };
  const parameter = splitTopLevel(range.parameters, ",")[0]?.trim();
  // React consumes key for identity; it is not a value passed to the function.
  const componentProps = Object.fromEntries(Object.entries(props).filter(([name]) => name !== "key" && name !== "ref"));
  if (parameter && !bindStaticPattern(env, parameter, componentProps)) {
    diagnostics.push({ severity: "warning", code: "component-parameters-unresolved", message: `${localName}の引数を静的に確定できません。`, sourcePath });
  }
  const body = source.slice(range.start, range.end);
  const returned = range.expression ? { start: 0, end: body.length } : findReturnedJsxRange(body);
  if (!returned) return { roots: [], env, shapeSource: "" };
  const prelude = body.slice(0, returned.start);
  env = collectStaticConstEnv(prelude, env);
  if (/\b(?:if|for|while|switch|try)\s*\(/.test(topLevelCode(prelude))) {
    diagnostics.push({ severity: "warning", code: "component-control-flow-unsupported", message: `${localName}の条件分岐やループを実行せず、returnの静的構造だけを読み取ります。`, sourcePath });
  }
  const jsx = body.slice(returned.start, returned.end);
  consumeStaticText(budget, jsx.length);
  const expanded = expandStaticMapCalls(jsx, env, count => diagnostics.push({ severity: "info", code: "static-map-expanded", message: `静的な繰り返しを${count}件へ展開しました。`, sourcePath }), budget);
  diagnoseUnresolvedCollections(expanded, diagnostics, sourcePath);
  const prefix = "\n".repeat(Math.max(0, lineNumber(source, range.start + returned.start) - 1));
  const before = diagnostics.length;
  const roots = parseJsx(prefix + expanded, diagnostics, env);
  for (const diagnostic of diagnostics.slice(before)) diagnostic.sourcePath ??= sourcePath;
  const scopedSource = source.split("");
  for (const match of topLevelCode(source).matchAll(/(?:function|const)\s+([A-Z][\w$]*)/g)) {
    const componentRange = findComponentBodyRange(source, match[1], false);
    if (componentRange) for (let i = componentRange.start; i < componentRange.end; i += 1) if (scopedSource[i] !== "\n") scopedSource[i] = " ";
  }
  return { roots, env, shapeSource: scopedSource.join("") + "\n" + prelude };
}

function diagnoseUnresolvedCollections(source: string, diagnostics: ComponentCodeImportDiagnostic[], sourcePath: string): void {
  if (/\.map\s*\(|\bArray\.from\s*\(/.test(source)) diagnostics.push({ severity: "warning", code: "static-collection-unresolved", message: "繰り返しの件数や値を静的に確定できません。未展開のtemplateが残っています。", sourcePath });
  if (/\{[^{}]*(?:\?|&&|\|\|)[^{}]*</.test(source)) diagnostics.push({ severity: "warning", code: "conditional-jsx-unsupported", message: "JSXの条件分岐は静的変換の対象外です。必要な要素を明示してください。", sourcePath });
}

function findComponentBodyRange(source: string, componentName: string, allowDefault: boolean): ComponentBodyRange | null {
  const escaped = escapeRegExp(componentName);
  const top = topLevelCode(source);
  const functionPatterns = [new RegExp(`(?:export\\s+)?(?:default\\s+)?function\\s+${escaped}\\s*\\(`), ...(allowDefault ? [/export\s+default\s+function(?:\s+[A-Za-z_$][\w$]*)?\s*\(/] : [])];
  for (const pattern of functionPatterns) {
    const match = pattern.exec(source);
    if (!match || !top.slice(match.index, match.index + match[0].indexOf("(")).trim()) continue;
    const openParams = match.index + match[0].lastIndexOf("(");
    const endParams = scanBalanced(source, openParams, "(", ")");
    const open = source.indexOf("{", endParams);
    if (open < 0) continue;
    const end = scanBalanced(source, open, "{", "}");
    return { start: open + 1, end: end - 1, parameters: source.slice(openParams + 1, endParams - 1), expression: false };
  }
  const patterns = [new RegExp(`(?:export\\s+)?const\\s+${escaped}\\b[^=]*=`), ...(allowDefault ? [/export\s+default\s+/] : [])];
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (!match || !top.slice(match.index, match.index + match[0].length).trim()) continue;
    let at = match.index + match[0].length;
    while (/\s/.test(source[at] ?? "")) at += 1;
    let parameters = "";
    if (source[at] === "(") { const end = scanBalanced(source, at, "(", ")"); parameters = source.slice(at + 1, end - 1); at = end; }
    else { const name = /^[A-Za-z_$][\w$]*/.exec(source.slice(at)); if (!name) continue; parameters = name[0]; at += name[0].length; }
    while (/\s/.test(source[at] ?? "")) at += 1;
    if (!source.startsWith("=>", at)) continue;
    at += 2; while (/\s/.test(source[at] ?? "")) at += 1;
    if (source[at] === "{") { const end = scanBalanced(source, at, "{", "}"); return { start: at + 1, end: end - 1, parameters, expression: false }; }
    if (source[at] === "(") { const end = scanBalanced(source, at, "(", ")"); return { start: at, end, parameters, expression: true }; }
    if (source[at] === "<") { const jsx = extractJsxElementText(source, at); if (jsx) return { start: at, end: jsx.end, parameters, expression: true }; }
  }
  return null;
}

function bindStaticPattern(env: Map<string, JsonValue>, rawPattern: string, rawValue: JsonValue | undefined): boolean {
  let pattern = rawPattern.trim();
  const typeAt = findTopLevel(pattern, ":");
  if (typeAt >= 0) pattern = pattern.slice(0, typeAt).trim();
  const defaultAt = findTopLevel(pattern, "=");
  let value = rawValue;
  if (defaultAt >= 0) {
    if (value === undefined) { const fallback = evaluateStaticExpression(pattern.slice(defaultAt + 1), env); if (!fallback.ok) return false; value = fallback.value; }
    pattern = pattern.slice(0, defaultAt).trim();
  }
  if (/^[A-Za-z_$][\w$]*$/.test(pattern)) { env.delete(pattern); if (value !== undefined) env.set(pattern, value); return true; }
  if (pattern.startsWith("{") && pattern.endsWith("}") && value && typeof value === "object" && !Array.isArray(value)) {
    const used = new Set<string>();
    for (const entry of splitTopLevel(pattern.slice(1, -1), ",")) {
      if (!entry.trim()) continue;
      if (entry.trim().startsWith("...")) { const rest = Object.fromEntries(Object.entries(value).filter(([key]) => !used.has(key))); if (!bindStaticPattern(env, entry.trim().slice(3), rest)) return false; continue; }
      const colon = findTopLevel(entry, ":");
      const equals = findTopLevel(entry, "=");
      const key = (colon >= 0 ? entry.slice(0, colon) : equals >= 0 ? entry.slice(0, equals) : entry).trim().replace(/^["']|["']$/g, "");
      used.add(key);
      const member = Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
      if (!bindStaticPattern(env, colon >= 0 ? entry.slice(colon + 1) : entry, member)) return false;
    }
    return true;
  }
  if (pattern.startsWith("[") && pattern.endsWith("]") && Array.isArray(value)) return splitTopLevel(pattern.slice(1, -1), ",").every((entry, index) => !entry.trim() || bindStaticPattern(env, entry, value[index]));
  return false;
}
function findReturnedJsxRange(
  body: string,
): { start: number; end: number } | null {
  const returned = /\breturn[ \t]*(?=[(<])/.exec(body);
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
      message: "VideoScreenのsrcを公開型のurlプロパティへ変換しました。",
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
  env: StaticValueEnv = new Map(),
): ParsedJsxNode[] {
  const roots: ParsedJsxNode[] = [];
  const stack: ParsedJsxNode[] = [];
  let parsedCount = 0;
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf("<", cursor);
    if (open < 0) break;
    // TypeScript generics such as React.FC<WorldProps> are not JSX tags.
    // A real JSX opening tag is not directly attached to an identifier,
    // member expression, call, or indexed expression.
    if (!source.startsWith("</", open) && open > 0 && /[\w$.)\]]/.test(source[open - 1])) {
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
        stack[matching].rawContent = substituteStaticExpressions(source.slice(stack[matching].contentStart, open), env);
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
    if (++parsedCount > MAX_STATIC_IMPORT_NODES) throw new StaticImportLimitError("JSXの静的構造が4096要素を超えました。");
    const node: ParsedJsxNode = {
      name: scanned.name,
      attributes: parseAttributes(scanned.attributes, env),
      children: [],
      line: lineNumber(source, open),
      contentStart: scanned.end,
    };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    if (!scanned.selfClosing) {
      if (stack.length >= 128) throw new StaticImportLimitError("JSXの入れ子が128段を超えました。");
      stack.push(node);
    }
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

function parseAttributes(source: string, env: StaticValueEnv = new Map()): ParsedAttribute[] {
  const attributes: ParsedAttribute[] = [];
  let index = 0;
  while (index < source.length) {
    while (/\s/.test(source[index] ?? "")) index += 1;
    if (index >= source.length) break;
    if (source.startsWith("{...", index)) {
      const end = scanBalanced(source, index, "{", "}");
      const spread = evaluateStaticExpression(source.slice(index + 4, end - 1), env);
      if (spread.ok && spread.value !== null && typeof spread.value === "object" && !Array.isArray(spread.value)) {
        for (const [name, value] of Object.entries(spread.value)) attributes.push({ name, value, dynamic: false });
      } else attributes.push({
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
      const parsed = evaluateStaticExpression(expression, env);
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

type StaticExpressionResult = { ok: true; value: JsonValue } | { ok: false };
type StaticValueEnv = ReadonlyMap<string, JsonValue>;

const STATIC_MATH_SENTINEL: JsonObject = { __xriftStaticMath: true };

type StaticToken =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "template"; segments: string[]; expressions: string[] }
  | { kind: "identifier"; value: string }
  | { kind: "punct"; value: string };

function tokenizeStaticExpression(source: string): StaticToken[] | null {
  const tokens: StaticToken[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      const end = scanQuoted(source, index, character);
      tokens.push({
        kind: "string",
        value: unescapeStaticString(source.slice(index + 1, Math.max(index + 1, end - 1))),
      });
      index = end;
      continue;
    }
    if (character === "`") {
      const template = scanTemplateLiteral(source, index);
      if (!template) return null;
      tokens.push({
        kind: "template",
        segments: template.segments,
        expressions: template.expressions,
      });
      index = template.end;
      continue;
    }
    const numberMatch = source
      .slice(index)
      .match(/^(?:0x[0-9a-f]+|\d*\.?\d+(?:e[+-]?\d+)?)/i);
    if (numberMatch?.[0]) {
      const raw = numberMatch[0];
      tokens.push({
        kind: "number",
        value: /^0x/i.test(raw)
          ? Number.parseInt(raw.slice(2), 16)
          : Number(raw),
      });
      index += raw.length;
      continue;
    }
    const identifierMatch = source.slice(index).match(/^[A-Za-z_$][\w$]*/);
    if (identifierMatch) {
      tokens.push({ kind: "identifier", value: identifierMatch[0] });
      index += identifierMatch[0].length;
      continue;
    }
    const three = source.slice(index, index + 3);
    if (three === "===" || three === "!==") {
      tokens.push({ kind: "punct", value: three });
      index += 3;
      continue;
    }
    const two = source.slice(index, index + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) {
      tokens.push({ kind: "punct", value: two });
      index += 2;
      continue;
    }
    if ("()[]{}.,?:+-*/%!<>".includes(character)) {
      tokens.push({ kind: "punct", value: character });
      index += 1;
      continue;
    }
    return null;
  }
  return tokens;
}

function scanTemplateLiteral(
  source: string,
  start: number,
): { segments: string[]; expressions: string[]; end: number } | null {
  const segments: string[] = [];
  const expressions: string[] = [];
  let segmentStart = start + 1;
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "`" && source[index - 1] !== "\\") {
      segments.push(source.slice(segmentStart, index));
      return { segments, expressions, end: index + 1 };
    }
    if (source[index] === "$" && source[index + 1] === "{") {
      segments.push(source.slice(segmentStart, index));
      const end = scanBalanced(source, index + 1, "{", "}");
      expressions.push(source.slice(index + 2, Math.max(index + 2, end - 1)));
      index = end;
      segmentStart = end;
      continue;
    }
    index += 1;
  }
  return null;
}

function unescapeStaticString(raw: string): string {
  return raw.replace(/\\(.)/g, (_match, escaped: string) => {
    if (escaped === "n") return "\n";
    if (escaped === "t") return "\t";
    if (escaped === "r") return "\r";
    return escaped;
  });
}

/**
 * Evaluates the small static subset generated world code is allowed to use:
 * literals, const references, member/index access, arithmetic, comparisons,
 * ternaries, template literals and Math helpers. Anything else fails closed
 * so callers keep their existing dynamic-expression diagnostics.
 */
function evaluateStaticExpression(
  source: string,
  env: StaticValueEnv,
): StaticExpressionResult {
  const tokenList = tokenizeStaticExpression(source);
  if (!tokenList || tokenList.length === 0) return { ok: false };
  let nesting = 0;
  for (const token of tokenList) {
    if (token.kind !== "punct") continue;
    if (["(", "[", "{"].includes(token.value) && ++nesting > 64) return { ok: false };
    if ([")", "]", "}"].includes(token.value)) nesting -= 1;
  }
  const tokens: StaticToken[] = tokenList;
  let index = 0;
  const isPunct = (token: StaticToken | undefined, value: string): boolean =>
    token?.kind === "punct" && token.value === value;
  const takePunct = (value: string): boolean => {
    if (!isPunct(tokens[index], value)) return false;
    index += 1;
    return true;
  };

  function parseTernary(): JsonValue | undefined {
    const condition = parseOr();
    if (condition === undefined) return undefined;
    if (!takePunct("?")) return condition;
    const whenTrue = parseTernary();
    if (whenTrue === undefined || !takePunct(":")) return undefined;
    const whenFalse = parseTernary();
    if (whenFalse === undefined) return undefined;
    return isStaticTruthy(condition) ? whenTrue : whenFalse;
  }

  function parseBinary(
    next: () => JsonValue | undefined,
    operators: readonly string[],
  ): JsonValue | undefined {
    let left = next();
    if (left === undefined) return undefined;
    while (
      tokens[index]?.kind === "punct" &&
      operators.includes((tokens[index] as { value: string }).value)
    ) {
      const operator = (tokens[index] as { value: string }).value;
      index += 1;
      const right = next();
      if (right === undefined) return undefined;
      left = applyStaticBinary(operator, left, right);
      if (left === undefined) return undefined;
    }
    return left;
  }

  function parseOr(): JsonValue | undefined {
    return parseBinary(parseAnd, ["||"]);
  }
  function parseAnd(): JsonValue | undefined {
    return parseBinary(parseEquality, ["&&"]);
  }
  function parseEquality(): JsonValue | undefined {
    return parseBinary(parseComparison, ["===", "!==", "==", "!="]);
  }
  function parseComparison(): JsonValue | undefined {
    return parseBinary(parseAdditive, ["<", ">", "<=", ">="]);
  }
  function parseAdditive(): JsonValue | undefined {
    return parseBinary(parseMultiplicative, ["+", "-"]);
  }
  function parseMultiplicative(): JsonValue | undefined {
    return parseBinary(parseUnary, ["*", "/", "%"]);
  }

  function parseUnary(): JsonValue | undefined {
    if (takePunct("-")) {
      const value = parseUnary();
      return typeof value === "number" ? -value : undefined;
    }
    if (takePunct("+")) {
      const value = parseUnary();
      return typeof value === "number" ? value : undefined;
    }
    if (takePunct("!")) {
      const value = parseUnary();
      return value === undefined ? undefined : !isStaticTruthy(value);
    }
    return parsePostfix();
  }

  function parsePostfix(): JsonValue | undefined {
    let value = parsePrimary();
    if (value === undefined) return undefined;
    for (;;) {
      if (takePunct(".")) {
        const member = tokens[index];
        if (member?.kind !== "identifier") return undefined;
        index += 1;
        if (value === STATIC_MATH_SENTINEL) {
          if (member.value === "PI") {
            value = Math.PI;
            continue;
          }
          if (!takePunct("(")) return undefined;
          const args = parseArguments();
          if (!args) return undefined;
          value = applyStaticMath(member.value, args);
          if (value === undefined) return undefined;
          continue;
        }
        value = staticMemberValue(value, member.value);
        if (value === undefined) return undefined;
        continue;
      }
      if (takePunct("[")) {
        const key = parseTernary();
        if (key === undefined || !takePunct("]")) return undefined;
        value = staticIndexValue(value, key);
        if (value === undefined) return undefined;
        continue;
      }
      return value;
    }
  }

  function parseArguments(): JsonValue[] | undefined {
    const args: JsonValue[] = [];
    if (takePunct(")")) return args;
    for (;;) {
      const value = parseTernary();
      if (value === undefined) return undefined;
      args.push(value);
      if (takePunct(")")) return args;
      if (!takePunct(",")) return undefined;
    }
  }

  function parsePrimary(): JsonValue | undefined {
    const token = tokens[index];
    if (!token) return undefined;
    if (token.kind === "number") {
      index += 1;
      return token.value;
    }
    if (token.kind === "string") {
      index += 1;
      return token.value;
    }
    if (token.kind === "template") {
      index += 1;
      let text = token.segments[0] ?? "";
      for (let part = 0; part < token.expressions.length; part += 1) {
        const evaluated = evaluateStaticExpression(token.expressions[part], env);
        if (!evaluated.ok) return undefined;
        const literal = staticTextValue(evaluated.value);
        if (literal === undefined) return undefined;
        text += literal + (token.segments[part + 1] ?? "");
      }
      return text;
    }
    if (token.kind === "identifier") {
      if (token.value === "true") {
        index += 1;
        return true;
      }
      if (token.value === "false") {
        index += 1;
        return false;
      }
      if (token.value === "null") {
        index += 1;
        return null;
      }
      if (token.value === "Math") {
        index += 1;
        return STATIC_MATH_SENTINEL;
      }
      if (token.value === "new") {
        index += 1;
        return parseNewExpression();
      }
      index += 1;
      return env.get(token.value);
    }
    if (takePunct("(")) {
      const value = parseTernary();
      if (value === undefined || !takePunct(")")) return undefined;
      return value;
    }
    if (takePunct("[")) {
      const entries: JsonValue[] = [];
      if (takePunct("]")) return entries;
      for (;;) {
        if (
          isPunct(tokens[index], ".") &&
          isPunct(tokens[index + 1], ".") &&
          isPunct(tokens[index + 2], ".")
        ) {
          index += 3;
          const spread = parseTernary();
          if (!Array.isArray(spread)) return undefined;
          entries.push(...spread);
        } else {
          const entry = parseTernary();
          if (entry === undefined) return undefined;
          entries.push(entry);
        }
        if (takePunct("]")) return entries;
        if (!takePunct(",")) return undefined;
        if (takePunct("]")) return entries;
      }
    }
    if (takePunct("{")) {
      const object: JsonObject = Object.create(null) as JsonObject;
      if (takePunct("}")) return object;
      for (;;) {
        const keyToken = tokens[index];
        if (keyToken?.kind !== "identifier" && keyToken?.kind !== "string") {
          return undefined;
        }
        index += 1;
        const key = keyToken.value;
        if (takePunct(":")) {
          const value = parseTernary();
          if (value === undefined) return undefined;
          object[key] = value;
        } else {
          const value = env.get(key);
          if (value === undefined) return undefined;
          object[key] = value;
        }
        if (takePunct("}")) return object;
        if (!takePunct(",")) return undefined;
        if (takePunct("}")) return object;
      }
    }
    return undefined;
  }

  function parseNewExpression(): JsonValue | undefined {
    const names: string[] = [];
    for (;;) {
      const part = tokens[index];
      if (part?.kind !== "identifier") return undefined;
      names.push(part.value);
      index += 1;
      if (!takePunct(".")) break;
    }
    if (!takePunct("(")) return undefined;
    const args = parseArguments();
    if (!args) return undefined;
    const last = names[names.length - 1];
    if (
      (last === "Vector2" && args.length === 2) ||
      (last === "Vector3" && args.length === 3)
    ) {
      return args.every((arg) => typeof arg === "number") ? args : undefined;
    }
    return undefined;
  }

  const result = parseTernary();
  if (result === undefined || index !== tokens.length) return { ok: false };
  if (!finiteStaticValue(result)) return { ok: false };
  if (result === STATIC_MATH_SENTINEL) return { ok: false };
  return { ok: true, value: result };
}

function finiteStaticValue(value: JsonValue): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteStaticValue);
  if (value && typeof value === "object") return Object.values(value).every(finiteStaticValue);
  return true;
}

function isStaticTruthy(value: JsonValue): boolean {
  return value !== false && value !== null && value !== 0 && value !== "";
}

function staticTextValue(value: JsonValue): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) return "null";
  return undefined;
}

function applyStaticBinary(
  operator: string,
  left: JsonValue,
  right: JsonValue,
): JsonValue | undefined {
  if (operator === "||") return isStaticTruthy(left) ? left : right;
  if (operator === "&&") return isStaticTruthy(left) ? right : left;
  if (operator === "===" || operator === "==") {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  if (operator === "!==" || operator === "!=") {
    return JSON.stringify(left) !== JSON.stringify(right);
  }
  if (["<", ">", "<=", ">="].includes(operator)) {
    if (typeof left !== typeof right) return undefined;
    if (typeof left !== "number" && typeof left !== "string") return undefined;
    if (operator === "<") return (left as number) < (right as number);
    if (operator === ">") return (left as number) > (right as number);
    if (operator === "<=") return (left as number) <= (right as number);
    return (left as number) >= (right as number);
  }
  if (operator === "+") {
    if (typeof left === "string" || typeof right === "string") {
      const leftText = staticTextValue(left);
      const rightText = staticTextValue(right);
      return leftText === undefined || rightText === undefined
        ? undefined
        : leftText + rightText;
    }
    return typeof left === "number" && typeof right === "number"
      ? left + right
      : undefined;
  }
  if (typeof left !== "number" || typeof right !== "number") return undefined;
  if (operator === "-") return left - right;
  if (operator === "*") return left * right;
  if (operator === "/") return right === 0 ? undefined : left / right;
  if (operator === "%") return right === 0 ? undefined : left % right;
  return undefined;
}

function applyStaticMath(name: string, args: JsonValue[]): number | undefined {
  if (!args.every((arg) => typeof arg === "number")) return undefined;
  const numbers = args as number[];
  switch (name) {
    case "floor":
      return numbers.length === 1 ? Math.floor(numbers[0]) : undefined;
    case "ceil":
      return numbers.length === 1 ? Math.ceil(numbers[0]) : undefined;
    case "round":
      return numbers.length === 1 ? Math.round(numbers[0]) : undefined;
    case "trunc":
      return numbers.length === 1 ? Math.trunc(numbers[0]) : undefined;
    case "abs":
      return numbers.length === 1 ? Math.abs(numbers[0]) : undefined;
    case "sign":
      return numbers.length === 1 ? Math.sign(numbers[0]) : undefined;
    case "min":
      return numbers.length > 0 ? Math.min(...numbers) : undefined;
    case "max":
      return numbers.length > 0 ? Math.max(...numbers) : undefined;
    case "pow":
      return numbers.length === 2 ? Math.pow(numbers[0], numbers[1]) : undefined;
    case "sqrt":
      return numbers.length === 1 ? Math.sqrt(numbers[0]) : undefined;
    default:
      return undefined;
  }
}

function staticMemberValue(
  value: JsonValue,
  name: string,
): JsonValue | undefined {
  if (Array.isArray(value)) {
    return name === "length" ? value.length : undefined;
  }
  if (typeof value === "string") {
    return name === "length" ? value.length : undefined;
  }
  if (typeof value === "object" && value !== null) {
    return Object.prototype.hasOwnProperty.call(value, name) ? (value as JsonObject)[name] : undefined;
  }
  return undefined;
}

function staticIndexValue(
  value: JsonValue,
  key: JsonValue,
): JsonValue | undefined {
  if (Array.isArray(value) && typeof key === "number") {
    return Number.isInteger(key) ? value[key] : undefined;
  }
  if (typeof value === "string" && typeof key === "number") {
    return Number.isInteger(key) ? value[key] : undefined;
  }
  if (typeof value === "object" && value !== null && typeof key === "string") {
    return Object.prototype.hasOwnProperty.call(value, key) ? (value as JsonObject)[key] : undefined;
  }
  return undefined;
}

function collectStaticConstEnv(
  source: string,
  base?: StaticValueEnv,
): Map<string, JsonValue> {
  const env = new Map<string, JsonValue>(base);
  const top = topLevelCode(source);
  const pattern =
    /\bconst\s+([A-Za-z_$][\w$]*|\{[^{}]*\}|\[[^\[\]]*\])(?:\s*:[^=;\n]+)?\s*=\s*/g;
  for (const match of source.matchAll(pattern)) {
    if (top[match.index] !== "c") continue;
    const start = match.index + match[0].length;
    const expression = captureStaticExpressionText(source, start);
    if (!expression) continue;
    const evaluated = evaluateStaticExpression(expression, env);
    if (evaluated.ok) bindStaticPattern(env, match[1], evaluated.value);
  }
  return env;
}

function captureStaticExpressionText(
  source: string,
  start: number,
): string | null {
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
    } else if ("([{".includes(character)) {
      depth += 1;
    } else if (")]}".includes(character)) {
      if (depth === 0) {
        const candidate = source.slice(start, index).trim();
        return candidate || null;
      }
      depth -= 1;
    } else if (depth === 0 && character === ";") {
      const candidate = source.slice(start, index).trim();
      return candidate || null;
    } else if (depth === 0 && character === "\n") {
      const candidate = source.slice(start, index).trim();
      if (!candidate) continue;
      if (evaluateStaticExpression(candidate, new Map()).ok) return candidate;
      const rest = source.slice(index + 1).trimStart();
      if (
        /^(?:export\s+)?(?:const|let|var|function|import|return|if|for|while)\b/.test(
          rest,
        ) ||
        rest.startsWith("}")
      ) {
        return candidate;
      }
    }
  }
  const tail = source.slice(start).trim();
  return tail || null;
}

const MAX_STATIC_MAP_ITEMS = 2048;

/**
 * Expands `.map()` calls whose receiver and callback are statically known
 * into repeated JSX before parsing, so generated repetition survives as
 * individual Entities. Unexpandable calls stay untouched and keep the
 * existing dynamic-collection diagnostics.
 */
function expandStaticMapCalls(
  source: string,
  baseEnv: StaticValueEnv,
  onExpanded: (count: number) => void,
  budget: StaticImportBudget,
): string {
  let result = source;
  for (;;) {
    const env = collectStaticConstEnv(result, baseEnv);
    const expansion = findStaticMapExpansion(result, env, budget);
    if (!expansion) break;
    result =
      result.slice(0, expansion.start) +
      expansion.replacement +
      result.slice(expansion.end);
    onExpanded(expansion.count);
  }
  return result;
}

function findStaticMapExpansion(
  source: string,
  env: Map<string, JsonValue>,
  budget: StaticImportBudget,
): { start: number; end: number; replacement: string; count: number } | null {
  const pattern = /\.map\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const receiver = readMapReceiver(source, match.index);
    if (!receiver) continue;
    const items = mapReceiverItems(receiver.text, env);
    if (!items) continue;
    const callback = readMapCallback(source, match.index + match[0].length);
    if (!callback) continue;
    const expanded: string[] = [];
    let failed = false;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const bindings = new Map(env);
      if (!bindMapParameter(bindings, callback.itemParam, items[itemIndex])) {
        failed = true;
        break;
      }
      if (callback.indexParam) bindings.set(callback.indexParam, itemIndex);
      const text = substituteStaticExpressions(callback.jsxText, collectStaticConstEnv(callback.prelude ?? "", bindings));
      consumeStaticText(budget, text.length);
      expanded.push(text);
    }
    if (failed) continue;
    if (++budget.expansions > MAX_STATIC_IMPORT_NODES) throw new StaticImportLimitError("繰り返しの静的展開数が4096回を超えました。");
    return {
      start: receiver.start,
      end: callback.end,
      replacement: expanded.join("\n"),
      count: items.length,
    };
  }
  const fromPattern = /\bArray\.from\s*\(/g;
  while ((match = fromPattern.exec(source)) !== null) {
    const openParen = match.index + match[0].length - 1;
    const callEnd = scanBalanced(source, openParen, "(", ")");
    const parts = splitTopLevel(
      source.slice(openParen + 1, Math.max(openParen + 1, callEnd - 1)),
      ",",
    );
    if (parts.length < 2) continue;
    const items = arrayFromItems(parts[0], env);
    if (!items) continue;
    const callback = parseMapCallbackText(parts.slice(1).join(","));
    if (!callback) continue;
    const expanded: string[] = [];
    let failed = false;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const bindings = new Map(env);
      if (!bindMapParameter(bindings, callback.itemParam, items[itemIndex])) {
        failed = true;
        break;
      }
      if (callback.indexParam) bindings.set(callback.indexParam, itemIndex);
      const text = substituteStaticExpressions(callback.jsxText, collectStaticConstEnv(callback.prelude ?? "", bindings));
      consumeStaticText(budget, text.length);
      expanded.push(text);
    }
    if (failed) continue;
    if (++budget.expansions > MAX_STATIC_IMPORT_NODES) throw new StaticImportLimitError("繰り返しの静的展開数が4096回を超えました。");
    return {
      start: match.index,
      end: callEnd,
      replacement: expanded.join("\n"),
      count: items.length,
    };
  }
  return null;
}

function arrayFromItems(
  sourceArg: string,
  env: StaticValueEnv,
): JsonValue[] | null {
  const trimmed = sourceArg.trim();
  if (trimmed.startsWith("{")) {
    const evaluated = evaluateStaticExpression(trimmed, env);
    if (
      !evaluated.ok ||
      typeof evaluated.value !== "object" ||
      evaluated.value === null ||
      Array.isArray(evaluated.value)
    ) {
      return null;
    }
    const length = (evaluated.value as JsonObject).length;
    if (typeof length === "number" && length > MAX_STATIC_MAP_ITEMS) throw new StaticImportLimitError("1回の繰り返しが2048件を超えました。");
    if (
      typeof length !== "number" ||
      !Number.isInteger(length) ||
      length < 0 ||
      length > MAX_STATIC_MAP_ITEMS
    ) {
      return null;
    }
    return Array.from({ length }, () => null);
  }
  const evaluated = evaluateStaticExpression(trimmed, env);
  if (!evaluated.ok || !Array.isArray(evaluated.value)) return null;
  if (evaluated.value.length > MAX_STATIC_MAP_ITEMS) throw new StaticImportLimitError("1回の繰り返しが2048件を超えました。");
  return evaluated.value;
}

function readMapReceiver(
  source: string,
  mapStart: number,
): { start: number; text: string } | null {
  let end = mapStart - 1;
  while (end >= 0 && /\s/.test(source[end])) end -= 1;
  if (end < 0) return null;
  const character = source[end];
  if (character === "]") {
    const open = scanBackwardBalanced(source, end, "[", "]");
    return open < 0 ? null : { start: open, text: source.slice(open, end + 1) };
  }
  if (character === ")") {
    const open = scanBackwardBalanced(source, end, "(", ")");
    if (open < 0) return null;
    const prefix = source.slice(0, open);
    const fromMatch = /Array\.from\s*$/.exec(prefix);
    if (!fromMatch) return null;
    return {
      start: fromMatch.index,
      text: source.slice(fromMatch.index, end + 1),
    };
  }
  if (/[\w$]/.test(character)) {
    let start = end;
    for (;;) {
      while (start >= 0 && /[\w$]/.test(source[start])) start -= 1;
      if (source[start] === ".") {
        start -= 1;
        continue;
      }
      if (source[start] === "]") {
        const open = scanBackwardBalanced(source, start, "[", "]");
        if (open < 0) return null;
        start = open - 1;
        continue;
      }
      break;
    }
    return { start: start + 1, text: source.slice(start + 1, end + 1) };
  }
  return null;
}

function scanBackwardBalanced(
  source: string,
  closeIndex: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  let quote: string | null = null;
  for (let index = closeIndex; index >= 0; index -= 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if (character === close) {
      depth += 1;
    } else if (character === open) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function mapReceiverItems(
  receiverText: string,
  env: StaticValueEnv,
): JsonValue[] | null {
  const trimmed = receiverText.trim();
  if (/^Array\.from\s*\(/.test(trimmed)) {
    const open = trimmed.indexOf("(");
    const end = scanBalanced(trimmed, open, "(", ")");
    const args = splitTopLevel(trimmed.slice(open + 1, end - 1), ",");
    // A mapping callback here would change the values; never pretend they
    // were the null placeholders produced by Array.from({ length }).
    return args.length === 1 ? arrayFromItems(args[0], env) : null;
  }
  const evaluated = evaluateStaticExpression(trimmed, env);
  if (!evaluated.ok || !Array.isArray(evaluated.value)) return null;
  if (evaluated.value.length > MAX_STATIC_MAP_ITEMS) throw new StaticImportLimitError("1回の繰り返しが2048件を超えました。");
  return evaluated.value;
}

function readMapCallback(
  source: string,
  start: number,
): {
  itemParam: string;
  indexParam: string | null;
  jsxText: string;
  prelude?: string;
  end: number;
} | null {
  const parsed = parseMapCallbackText(source.slice(start));
  if (!parsed) return null;
  let index = start + parsed.end;
  while (/\s/.test(source[index] ?? "")) index += 1;
  if (source[index] !== ")") return null;
  return { ...parsed, end: index + 1 };
}

function parseMapCallbackText(
  source: string,
): {
  itemParam: string;
  indexParam: string | null;
  jsxText: string;
  prelude?: string;
  end: number;
} | null {
  let index = 0;
  while (/\s/.test(source[index] ?? "")) index += 1;
  let itemParam = "";
  let indexParam: string | null = null;
  if (source[index] === "(") {
    const end = scanBalanced(source, index, "(", ")");
    const parts = splitTopLevel(source.slice(index + 1, Math.max(index + 1, end - 1)), ",");
    itemParam = parts[0]?.trim() ?? "";
    const rawIndex = parts[1]?.trim();
    if (rawIndex !== undefined && rawIndex !== "") {
      if (!/^[A-Za-z_$][\w$]*$/.test(rawIndex)) return null;
      indexParam = rawIndex;
    }
    index = end;
  } else {
    const identifier = source.slice(index).match(/^[A-Za-z_$][\w$]*/);
    if (!identifier) return null;
    itemParam = identifier[0];
    index += identifier[0].length;
  }
  while (/\s/.test(source[index] ?? "")) index += 1;
  if (!source.startsWith("=>", index)) return null;
  index += 2;
  while (/\s/.test(source[index] ?? "")) index += 1;
  let jsxText: string | null = null;
  let prelude = "";
  if (source[index] === "(") {
    const end = scanBalanced(source, index, "(", ")");
    jsxText = source.slice(index + 1, Math.max(index + 1, end - 1)).trim();
    index = end;
  } else if (source[index] === "<") {
    const jsx = extractJsxElementText(source, index);
    if (!jsx) return null;
    jsxText = jsx.text;
    index = jsx.end;
  } else if (source[index] === "{") {
    const end = scanBalanced(source, index, "{", "}");
    const body = source.slice(index + 1, Math.max(index + 1, end - 1));
    const returned = /\breturn\s*/.exec(body);
    if (!returned) return null;
    prelude = body.slice(0, returned.index);
    if (/\b(?:if|for|while|switch|try)\b/.test(topLevelCode(prelude))) return null;
    let bodyIndex = returned.index + returned[0].length;
    while (/\s/.test(body[bodyIndex] ?? "")) bodyIndex += 1;
    if (body[bodyIndex] === "(") {
      const bodyEnd = scanBalanced(body, bodyIndex, "(", ")");
      jsxText = body.slice(bodyIndex + 1, Math.max(bodyIndex + 1, bodyEnd - 1)).trim();
    } else if (body[bodyIndex] === "<") {
      const jsx = extractJsxElementText(body, bodyIndex);
      if (!jsx) return null;
      jsxText = jsx.text;
    }
    index = end;
  }
  if (!jsxText || !jsxText.startsWith("<")) return null;
  return { itemParam, indexParam, jsxText, prelude, end: index };
}

function extractJsxElementText(
  source: string,
  start: number,
): { text: string; end: number } | null {
  let depth = 0;
  let index = start;
  let started = false;
  while (index < source.length) {
    const open = source.indexOf("<", index);
    if (open < 0) return null;
    const scanned = scanTag(source, open);
    if (!scanned) {
      index = open + 1;
      continue;
    }
    if (scanned.kind === "close" || scanned.kind === "fragment-close") {
      depth -= 1;
      index = scanned.end;
      if (started && depth === 0) {
        return { text: source.slice(start, scanned.end), end: scanned.end };
      }
      if (depth < 0) return null;
      continue;
    }
    started = true;
    if (scanned.selfClosing) {
      if (depth === 0) {
        return { text: source.slice(start, scanned.end), end: scanned.end };
      }
    } else {
      depth += 1;
    }
    index = scanned.end;
  }
  return null;
}

function bindMapParameter(bindings: Map<string, JsonValue>, param: string, item: JsonValue): boolean {
  return !param.trim() || bindStaticPattern(bindings, param, item);
}
function substituteStaticExpressions(
  text: string,
  env: StaticValueEnv,
): string {
  let result = "";
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (character === '"' || character === "'") {
      const end = scanQuoted(text, index, character);
      result += text.slice(index, end);
      index = end;
      continue;
    }
    if (character === "`") {
      const template = scanTemplateLiteral(text, index);
      if (template) {
        result += text.slice(index, template.end);
        index = template.end;
        continue;
      }
    }
    if (character === "{") {
      const end = scanBalanced(text, index, "{", "}");
      const inner = text.slice(index + 1, Math.max(index + 1, end - 1));
      const evaluated = evaluateStaticExpression(inner, env);
      result += evaluated.ok
        ? `{${staticLiteralText(evaluated.value)}}`
        : `{${replaceStaticMemberChains(inner, env)}}`;
      index = end;
      continue;
    }
    result += character;
    index += 1;
  }
  return result;
}

function replaceStaticMemberChains(
  expression: string,
  env: StaticValueEnv,
): string {
  return expression.replace(
    /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[(?:\d+|"[^"]*"|'[^']*')\])+/g,
    (chain) => {
      let candidate = chain;
      let suffix = "";
      while (candidate) {
        const evaluated = evaluateStaticExpression(candidate, env);
        if (evaluated.ok) return staticLiteralText(evaluated.value) + suffix;
        const cutAt = Math.max(
          candidate.lastIndexOf("."),
          candidate.lastIndexOf("["),
        );
        if (cutAt <= 0) break;
        suffix = candidate.slice(cutAt) + suffix;
        candidate = candidate.slice(0, cutAt);
      }
      return chain;
    },
  );
}

function staticLiteralText(value: JsonValue): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  return JSON.stringify(value);
}

function asStaticPointPairs(value: JsonValue | undefined): [number, number][] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const points: [number, number][] = [];
  for (const entry of value) {
    if (
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === "number" &&
      typeof entry[1] === "number" &&
      Number.isFinite(entry[0]) &&
      Number.isFinite(entry[1])
    ) {
      points.push([entry[0], entry[1]]);
      continue;
    }
    if (
      typeof entry === "object" &&
      entry !== null &&
      !Array.isArray(entry) &&
      typeof (entry as JsonObject).x === "number" &&
      typeof (entry as JsonObject).y === "number"
    ) {
      points.push([
        (entry as JsonObject).x as number,
        (entry as JsonObject).y as number,
      ]);
      continue;
    }
    return null;
  }
  return points;
}

function collectStaticShapes(
  source: string,
  env: StaticValueEnv,
): Map<string, [number, number][]> {
  const shapes = new Map<string, [number, number][]>();
  const declaration =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+(?:THREE\.)?Shape\s*\(/g;
  for (const match of source.matchAll(declaration)) {
    const argsStart = match.index + match[0].length;
    const argsEnd = scanBalanced(source, argsStart - 1, "(", ")");
    const argsText = source.slice(argsStart, Math.max(argsStart, argsEnd - 1));
    const argsValue = argsText.trim()
      ? evaluateStaticExpression(argsText, env)
      : null;
    const fromArgs =
      argsValue?.ok === true ? asStaticPointPairs(argsValue.value) : null;
    const points =
      fromArgs ?? shapePointsFromPathCalls(source, match[1], env, argsEnd);
    if (points) shapes.set(match[1], points);
  }
  const memoDeclaration =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*useMemo\s*\(/g;
  for (const match of source.matchAll(memoDeclaration)) {
    if (shapes.has(match[1])) continue;
    const bodyStart = match.index + match[0].length;
    const bodyEnd = scanBalanced(source, bodyStart - 1, "(", ")");
    const body = source.slice(bodyStart, Math.max(bodyStart, bodyEnd - 1));
    const inner = /new\s+(?:THREE\.)?Shape\s*\(/.exec(body);
    if (!inner) continue;
    const variable = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/.exec(
      body.slice(0, inner.index),
    );
    if (!variable) continue;
    const points = shapePointsFromPathCalls(body, variable[1], env, inner.index);
    if (points) shapes.set(match[1], points);
  }
  return shapes;
}

function shapePointsFromPathCalls(
  source: string,
  name: string,
  env: StaticValueEnv,
  fromIndex: number,
): [number, number][] | null {
  if (new RegExp(`\\b${escapeRegExp(name)}\\.holes\\b`).test(source)) return null;
  const pattern = new RegExp(
    `\\b${escapeRegExp(name)}\\.(moveTo|lineTo|quadraticCurveTo|bezierCurveTo|absarc|absellipse|ellipse|arc|splineThru|closePath)\\s*\\(`,
    "g",
  );
  pattern.lastIndex = fromIndex;
  const points: [number, number][] = [];
  let sawMove = false;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const method = match[1];
    if (method === "closePath") continue;
    if (method !== "moveTo" && method !== "lineTo") return null;
    const argsStart = match.index + match[0].length;
    const argsEnd = scanBalanced(source, argsStart - 1, "(", ")");
    const args = splitTopLevel(
      source.slice(argsStart, Math.max(argsStart, argsEnd - 1)),
      ",",
    ).map((arg) => evaluateStaticExpression(arg, env));
    if (
      args.length !== 2 ||
      !args.every(
        (arg) => arg.ok && typeof (arg as { value: JsonValue }).value === "number",
      )
    ) {
      return null;
    }
    points.push([
      (args[0] as { value: number }).value,
      (args[1] as { value: number }).value,
    ]);
    sawMove = sawMove || method === "moveTo";
  }
  if (!sawMove || points.length < 3) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 3 && first[0] === last[0] && first[1] === last[1]) {
    points.pop();
  }
  return points;
}

function extrudeFromRawArgs(
  rawExpression: string,
  source: string,
  env: StaticValueEnv,
): { points: [number, number][]; depth: number; bevelEnabled: boolean } | null {
  const trimmed = rawExpression.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const parts = splitTopLevel(trimmed.slice(1, -1), ",").filter(
    (part) => part.trim() !== "",
  );
  if (parts.length === 0 || parts.length > 2) return null;
  const shapeText = parts[0].trim();
  let points: [number, number][] | null = null;
  if (/^[A-Za-z_$][\w$]*$/.test(shapeText)) {
    points =
      collectStaticShapes(source, env).get(shapeText) ??
      asStaticPointPairs(env.get(shapeText));
  } else if (/^new\s/.test(shapeText)) {
    const open = shapeText.indexOf("(");
    const close = open < 0 ? -1 : scanBalanced(shapeText, open, "(", ")");
    if (close > open) {
      const inner = shapeText.slice(open + 1, close - 1).trim();
      const evaluated = evaluateStaticExpression(inner, env);
      points = evaluated.ok
        ? asStaticPointPairs(evaluated.value)
        : /^[A-Za-z_$][\w$]*$/.test(inner)
          ? asStaticPointPairs(env.get(inner))
          : null;
    }
  } else {
    const evaluated = evaluateStaticExpression(shapeText, env);
    points = evaluated.ok ? asStaticPointPairs(evaluated.value) : null;
  }
  if (!points) return null;
  points = points.map(point => [point[0], point[1]]);
  if (points.length > 3 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]) points.pop();
  let depth = 1;
  let bevelEnabled = true;
  if (parts[1]) {
    const options = evaluateStaticExpression(parts[1], env);
    if (!options.ok || typeof options.value !== "object" || options.value === null || Array.isArray(options.value)) {
      return null;
    }
    const record = options.value as JsonObject;
    if (Object.keys(record).some(key => !["depth", "amount", "bevelEnabled"].includes(key))) return null;
    if (record.bevelEnabled !== undefined && typeof record.bevelEnabled !== "boolean") return null;
    const rawDepth = finiteNumber(record.depth) ?? finiteNumber(record.amount);
    if (rawDepth !== undefined) depth = rawDepth;
    bevelEnabled = record.bevelEnabled !== false;
  }
  if (!Number.isFinite(depth) || depth <= 0) return null;
  return { points, depth, bevelEnabled };
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
      Boolean(asset.properties.extensions.KHR_materials_unlit) === Boolean(material.unlit) &&
      asset.properties.metalness === (material.metalness ?? 0) &&
      asset.properties.roughness === (material.roughness ?? 1) &&
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
      roughness: material.roughness ?? 1,
      ...(material.unlit ? { extensions: { KHR_materials_unlit: {} } } : {}),
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
