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
} from "./editor-session";
import { BUILTIN_ASSET_IDS } from "./prototype-project";
import type { VisualProjectKind } from "./project-document";
import {
  addBuiltinPrimitiveEntity,
  renameEntity,
  updateEntityTransform,
  type JsonObject,
  type JsonValue,
  type SceneDocument,
  type Vec3,
} from "./scene-document";
import { updateXriftComponent } from "./component-registry";

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
};

export type ComponentCodeImportMaterial = {
  color: string;
  metalness?: number;
  roughness?: number;
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

export type ComponentCodeImportNode = {
  name: string;
  kind: "empty" | "primitive";
  creationId?: BuiltinPrimitiveCreationDefinition["creationId"];
  transform: ComponentCodeImportTransform;
  material?: ComponentCodeImportMaterial;
  xriftComponents: ComponentCodeImportXriftComponent[];
  sourceLine: number;
};

export type ComponentCodeImportPlan = {
  nodes: ComponentCodeImportNode[];
  diagnostics: ComponentCodeImportDiagnostic[];
  imports: {
    xrift: string[];
    drei: string[];
    fiber: string[];
  };
  summary: {
    entityCount: number;
    primitiveCount: number;
    xriftComponentCount: number;
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
};

type ParsedJsxNode = {
  name: string;
  attributes: ParsedAttribute[];
  children: ParsedJsxNode[];
  line: number;
};

type ImportBinding = {
  imported: string;
  local: string;
  module: string;
};

type ConvertContext = {
  transform: ComponentCodeImportTransform;
  wrappers: ComponentCodeImportXriftComponent[];
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
  const diagnostics: ComponentCodeImportDiagnostic[] = [];
  const bindings = parseImports(source);
  const bindingByLocal = new Map(bindings.map((binding) => [binding.local, binding]));
  const roots = parseJsx(source, diagnostics);
  const nodes: ComponentCodeImportNode[] = [];
  const initialContext: ConvertContext = {
    transform: cloneTransform(IDENTITY_TRANSFORM),
    wrappers: [],
  };

  for (const root of roots) {
    convertJsxNode(
      root,
      initialContext,
      bindingByLocal,
      projectKind,
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

  const importsFor = (module: string) =>
    bindings
      .filter((binding) => binding.module === module)
      .map((binding) => binding.imported)
      .filter((value, index, values) => values.indexOf(value) === index)
      .sort();
  return {
    nodes,
    diagnostics,
    imports: {
      xrift: importsFor(XRIFT_COMPONENT_MODULE),
      drei: importsFor("@react-three/drei"),
      fiber: importsFor("@react-three/fiber"),
    },
    summary: {
      entityCount: nodes.length,
      primitiveCount: nodes.filter((node) => node.kind === "primitive").length,
      xriftComponentCount: nodes.reduce(
        (count, node) => count + node.xriftComponents.length,
        0,
      ),
    },
  };
}

export function applyComponentCodeImportPlan(input: {
  scene: SceneDocument;
  assets: AssetManifest;
  projectKind: VisualProjectKind;
  plan: ComponentCodeImportPlan;
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

  for (const node of input.plan.nodes) {
    let entityId: string | undefined;
    if (node.kind === "primitive" && node.creationId) {
      const material = resolveImportedMaterial(assets, node.material, node.name);
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
      }
    } else {
      const created = createEmptyEntity(scene, null, node.name);
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
      });
      continue;
    }

    scene = renameEntity(scene, entityId, node.name);
    scene = updateEntityTransform(scene, entityId, node.transform);
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
          }),
        ),
      );
    }
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

function convertJsxNode(
  node: ParsedJsxNode,
  context: ConvertContext,
  bindings: ReadonlyMap<string, ImportBinding>,
  projectKind: VisualProjectKind,
  output: ComponentCodeImportNode[],
  diagnostics: ComponentCodeImportDiagnostic[],
): number {
  const binding = bindings.get(node.name);
  const attributes = attributesToObject(node, diagnostics);

  if (node.name === "Fragment" || node.name === "React.Fragment") {
    return visitChildren(node, context, bindings, projectKind, output, diagnostics);
  }

  if (node.name === "group") {
    const nextContext = {
      ...context,
      transform: combineTransforms(
        context.transform,
        transformFromProps(attributes),
      ),
    };
    return visitChildren(node, nextContext, bindings, projectKind, output, diagnostics);
  }

  if (binding?.module === XRIFT_COMPONENT_MODULE) {
    const definition = getXriftComponentDefinition(binding.imported);
    if (!definition) {
      diagnostics.push({
        severity: "warning",
        code: "unknown-xrift-export",
        message: `${binding.imported}はStudioの公式Component Registryに未登録です。`,
        line: node.line,
      });
      return visitChildren(node, context, bindings, projectKind, output, diagnostics);
    }
    if (!definition.allowedProjectKinds.includes(projectKind)) {
      diagnostics.push({
        severity: "error",
        code: "xrift-project-kind",
        message: `${definition.importName}は${projectKind}プロジェクトへ追加できません。`,
        line: node.line,
      });
      return 0;
    }
    const properties = filterXriftProperties(
      definition.schemaId,
      attributes,
      node,
      diagnostics,
    );
    const component: ComponentCodeImportXriftComponent = {
      schemaId: definition.schemaId,
      properties,
      sourceName: definition.importName,
    };
    if (definition.attachBehavior.kind === "wrapper") {
      const before = output.length;
      const added = visitChildren(
        node,
        { ...context, wrappers: [...context.wrappers, component] },
        bindings,
        projectKind,
        output,
        diagnostics,
      );
      if (added === 0) {
        output.push({
          name: definition.label,
          kind: "empty",
          transform: cloneTransform(context.transform),
          xriftComponents: [...context.wrappers, component],
          sourceLine: node.line,
        });
        if (definition.attachBehavior.childrenRequired) {
          diagnostics.push({
            severity: "warning",
            code: "wrapper-children-missing",
            message: `${definition.importName}の子要素を変換できなかったため、空のEntityとして追加します。`,
            line: node.line,
          });
        }
      }
      return output.length - before;
    }
    output.push({
      name: definition.label,
      kind: "empty",
      transform: cloneTransform(context.transform),
      xriftComponents: [...context.wrappers, component],
      sourceLine: node.line,
    });
    return 1;
  }

  if (binding?.module === "@react-three/drei") {
    if (binding.imported === "Billboard") {
      const definition = getXriftComponentDefinition("BillboardY");
      if (!definition) return 0;
      const component: ComponentCodeImportXriftComponent = {
        schemaId: definition.schemaId,
        properties: pickProperties(attributes, ["position", "rotation", "scale"]),
        sourceName: "BillboardY",
      };
      diagnostics.push({
        severity: "info",
        code: "drei-billboard-converted",
        message: "Drei BillboardをXRiftのBillboardYへ変換します。",
        line: node.line,
      });
      return visitChildren(
        node,
        { ...context, wrappers: [...context.wrappers, component] },
        bindings,
        projectKind,
        output,
        diagnostics,
      );
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
      output.push({
        name: "Mirror",
        kind: "empty",
        transform: cloneTransform(context.transform),
        xriftComponents: [
          ...context.wrappers,
          { schemaId: definition.schemaId, properties, sourceName: "Mirror" },
        ],
        sourceLine: node.line,
      });
      diagnostics.push({
        severity: "info",
        code: "drei-reflector-converted",
        message: "Drei Reflectorを公式XRift Mirrorへ変換します。",
        line: node.line,
      });
      return 1;
    }
    if (binding.imported === "Sky" || binding.imported === "Environment") {
      const definition = getXriftComponentDefinition("Skybox");
      if (!definition) return 0;
      output.push({
        name: "Skybox",
        kind: "empty",
        transform: cloneTransform(context.transform),
        xriftComponents: [
          ...context.wrappers,
          { schemaId: definition.schemaId, properties: {}, sourceName: "Skybox" },
        ],
        sourceLine: node.line,
      });
      diagnostics.push({
        severity: binding.imported === "Environment" ? "warning" : "info",
        code: "drei-sky-converted",
        message:
          binding.imported === "Environment"
            ? "Drei EnvironmentをXRift Skyboxへ変換します。HDRI参照は別途Assetsへインポートしてください。"
            : "Drei SkyをXRift Skyboxへ変換します。",
        line: node.line,
      });
      return 1;
    }
    const creationId = DREI_PRIMITIVES[binding.imported];
    if (creationId) {
      output.push(
        primitiveNodeFromJsx(
          node,
          creationId,
          binding.imported,
          attributes,
          context,
        ),
      );
      return 1;
    }
    diagnostics.push({
      severity: "warning",
      code: "unsupported-drei-component",
      message: `Drei ${binding.imported}は自動変換せず、変換できる子要素だけを取り込みます。`,
      line: node.line,
    });
    return visitChildren(node, context, bindings, projectKind, output, diagnostics);
  }

  if (node.name === "mesh") {
    const geometry = node.children.find((child) => GEOMETRY_PRIMITIVES[child.name]);
    if (!geometry) {
      diagnostics.push({
        severity: "warning",
        code: "unsupported-mesh-geometry",
        message: "mesh内に対応する標準Geometryがないため、このmeshはスキップします。",
        line: node.line,
      });
      return visitChildren(node, context, bindings, projectKind, output, diagnostics);
    }
    const geometryAttributes = attributesToObject(geometry, diagnostics);
    output.push(
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

  if (binding || /^[A-Z]/.test(node.name)) {
    diagnostics.push({
      severity: "warning",
      code: "unsupported-react-component",
      message: `${node.name}は自動変換せず、変換できる子要素だけを取り込みます。`,
      line: node.line,
    });
  }
  return visitChildren(node, context, bindings, projectKind, output, diagnostics);
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
    convertJsxNode(
      child,
      context,
      bindings,
      projectKind,
      output,
      diagnostics,
    );
  }
  return output.length - before;
}

function primitiveNodeFromJsx(
  node: ParsedJsxNode,
  creationId: string,
  name: string,
  attributes: JsonObject,
  context: ConvertContext,
): ComponentCodeImportNode {
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
  return {
    name,
    kind: "primitive",
    creationId,
    transform: combineTransforms(context.transform, localTransform),
    ...(color
      ? {
          material: {
            color,
            ...(metalness !== undefined ? { metalness } : {}),
            ...(roughness !== undefined ? { roughness } : {}),
          },
        }
      : {}),
    xriftComponents: [...context.wrappers],
    sourceLine: node.line,
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
      if (matching >= 0) stack.splice(matching);
      continue;
    }
    if (scanned.kind === "fragment-close") {
      const matching = findLastNodeIndex(stack, "Fragment");
      if (matching >= 0) stack.splice(matching);
      continue;
    }
    const node: ParsedJsxNode = {
      name: scanned.name,
      attributes: parseAttributes(scanned.attributes),
      children: [],
      line: lineNumber(source, open),
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
      attributes.push({ name: "spread", dynamic: true });
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

function combineTransforms(
  parent: ComponentCodeImportTransform,
  child: ComponentCodeImportTransform,
): ComponentCodeImportTransform {
  return {
    position: [
      parent.position[0] + child.position[0] * parent.scale[0],
      parent.position[1] + child.position[1] * parent.scale[1],
      parent.position[2] + child.position[2] * parent.scale[2],
    ],
    rotation: [
      parent.rotation[0] + child.rotation[0],
      parent.rotation[1] + child.rotation[1],
      parent.rotation[2] + child.rotation[2],
    ],
    scale: multiplyVec3(parent.scale, child.scale),
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
): { assets: AssetManifest; materialId?: string } {
  if (!material) return { assets };
  const existing = Object.values(assets.assets).find(
    (asset): asset is MaterialAsset =>
      asset.kind === "material" &&
      asset.properties.color.toLowerCase() === material.color.toLowerCase() &&
      (material.metalness === undefined ||
        asset.properties.metalness === material.metalness) &&
      (material.roughness === undefined ||
        asset.properties.roughness === material.roughness),
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
    },
  });
  return added.added
    ? { assets: added.manifest, materialId: added.assetId }
    : { assets };
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
