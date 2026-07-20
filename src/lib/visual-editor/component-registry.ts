import { createDocumentId } from "./document-id";
import type { VisualProjectKind } from "./project-document";
import type {
  ComponentAuthoringMetadata,
  JsonObject,
  JsonValue,
  RegisteredSceneComponent,
  SceneDocument,
  XRiftComponent,
} from "./scene-document";

export const XRIFT_COMPONENT_MODULE = "@xrift/world-components" as const;
export const XRIFT_COMPONENT_SCHEMA_VERSION = "1.0.0" as const;

/** Stable authoring IDs. Import names remain aliases for prototype documents. */
export const XRIFT_COMPONENT_SCHEMA_IDS = {
  interactable: "xrift.interactable",
  grabbable: "xrift.grabbable",
  mirror: "xrift.mirror",
  skybox: "xrift.skybox",
  videoScreen: "xrift.video-screen",
  videoPlayer: "xrift.video-player",
  liveVideoPlayer: "xrift.live-video-player",
  video180Sphere: "xrift.video-180-sphere",
  screenShareDisplay: "xrift.screen-share-display",
  spawnPoint: "xrift.spawn-point",
  textInput: "xrift.text-input",
  tagBoard: "xrift.tag-board",
  portal: "xrift.portal",
  billboardY: "xrift.billboard-y",
} as const;

export type XriftComponentSchemaId =
  (typeof XRIFT_COMPONENT_SCHEMA_IDS)[keyof typeof XRIFT_COMPONENT_SCHEMA_IDS];

export type XriftComponentCategory =
  | "interaction"
  | "media"
  | "rendering"
  | "world";

export type XriftComponentFieldKind =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "vec2"
  | "vec3"
  | "number-or-vec3"
  | "color-number"
  | "grabbable-transform"
  | "tags";

export type XriftComponentFieldRange = {
  min?: number;
  max?: number;
  step?: number;
};

export type XriftComponentFieldDefinition = {
  name: string;
  label: string;
  description: string;
  kind: XriftComponentFieldKind;
  required: boolean;
  defaultValue?: JsonValue;
  /** Inclusive range documented by XRift. Omitted instead of inferred. */
  range?: XriftComponentFieldRange;
  enumValues?: readonly string[];
  /** Defaults of optional members inside an object-shaped field. */
  nestedDefaults?: JsonObject;
  /** The value is documented as an identifier unique to this component kind. */
  uniqueWithinScene?: boolean;
};

export type XriftComponentAttachBehavior = {
  kind: "leaf" | "wrapper";
  /** Only true when the official Props table explicitly requires children. */
  childrenRequired: boolean;
};

export type XriftRuntimeBindingDefinition = {
  name: string;
  kind: "callback" | "render-callback";
  required: boolean;
  description: string;
  /** Fixed Studio adapter; authoring JSON never contains executable code. */
  generation: "none" | "managed-transform-state" | "managed-text-state";
};

export type XriftComponentDefinition = {
  schemaId: XriftComponentSchemaId;
  schemaVersion: typeof XRIFT_COMPONENT_SCHEMA_VERSION;
  importName: string;
  moduleName: typeof XRIFT_COMPONENT_MODULE;
  label: string;
  description: string;
  category: XriftComponentCategory;
  allowedProjectKinds: readonly VisualProjectKind[];
  attachBehavior: XriftComponentAttachBehavior;
  /** Authoring policy: one component of the same schema per entity. */
  allowMultiplePerEntity: boolean;
  fields: readonly XriftComponentFieldDefinition[];
  /** Runtime-only props never accepted as JSON authoring values. */
  runtimeBindings: readonly XriftRuntimeBindingDefinition[];
};

export type XriftComponentDiagnosticSeverity = "error" | "warning";

export type XriftComponentDiagnostic = {
  severity: XriftComponentDiagnosticSeverity;
  code:
    | "entity-missing"
    | "component-missing"
    | "component-type"
    | "duplicate-component-id"
    | "duplicate-xrift-component"
    | "duplicate-xrift-identifier"
    | "invalid-xrift-component"
    | "invalid-xrift-component-field"
    | "invalid-xrift-component-properties"
    | "missing-xrift-component-field"
    | "unknown-xrift-component-field"
    | "unknown-xrift-component-schema"
    | "unsupported-xrift-component-schema-version"
    | "xrift-component-project-kind"
    | "xrift-component-authoring-locked";
  message: string;
  path: string;
  entityId?: string;
  componentId?: string;
  schemaId?: string;
  fieldName?: string;
};

export type XriftFieldValidationFailure = {
  code: "type" | "range" | "duplicate" | "empty";
  message: string;
};

export type XriftComponentMutationResult = {
  scene: SceneDocument;
  changed: boolean;
  componentId?: string;
  diagnostics: XriftComponentDiagnostic[];
};

export type CreateXriftComponentOptions = {
  componentId?: string;
  enabled?: boolean;
  properties?: JsonObject;
  assetReferences?: readonly string[];
  entityReferences?: readonly string[];
  authoring?: ComponentAuthoringMetadata;
};

export type UpdateXriftComponentPatch = {
  enabled?: boolean;
  /** An undefined patch value removes that property. */
  properties?: Readonly<Record<string, JsonValue | undefined>>;
  assetReferences?: readonly string[];
  entityReferences?: readonly string[];
};

const BOTH_PROJECT_KINDS = ["world", "item"] as const;
const WORLD_PROJECT_KIND = ["world"] as const;

const DEFAULT_TAGS: JsonValue = [
  { color: "#2ECC71", id: "want-talk", label: "話したい" },
  { color: "#3498DB", id: "want-listen", label: "聞きたい" },
  { color: "#95A5A6", id: "silent", label: "無言" },
  { color: "#1ABC9C", id: "developer", label: "開発者" },
  { color: "#2980B9", id: "student", label: "学生" },
  { color: "#F1C40F", id: "beginner", label: "初心者" },
  { color: "#9B59B6", id: "dont-know", label: "なんもわからん" },
  { color: "#8BC34A", id: "working", label: "作業中" },
  { color: "#BF7B41", id: "away", label: "離席中" },
  { color: "#FF9800", id: "cat", label: "ねこ" },
];

const LEAF = { kind: "leaf", childrenRequired: false } as const;
const OPTIONAL_WRAPPER = { kind: "wrapper", childrenRequired: false } as const;
const REQUIRED_WRAPPER = { kind: "wrapper", childrenRequired: true } as const;

/**
 * Declarative authoring registry sourced from the official world-components API
 * reference. DevEnvironment is intentionally absent because it is a local-only
 * development helper rather than authoring data.
 */
export const XRIFT_COMPONENT_REGISTRY: readonly XriftComponentDefinition[] = [
  componentDefinition({
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.interactable,
    importName: "Interactable",
    label: "Interactable",
    description: "オブジェクトをクリック／インタラクト可能にします。",
    category: "interaction",
    attachBehavior: OPTIONAL_WRAPPER,
    fields: [
      field("id", "ID", "一意の識別子。", "string", true, {
        uniqueWithinScene: true,
      }),
      field("type", "Type", "インタラクションタイプ。", "enum", false, {
        enumValues: ["button"],
      }),
      field("interactionText", "Interaction text", "ホバー時に表示するテキスト。", "string"),
      field("enabled", "Enabled", "インタラクションを有効にします。", "boolean", false, {
        defaultValue: true,
      }),
    ],
    runtimeBindings: [
      runtimeBinding(
        "onInteract",
        "callback",
        false,
        "インタラクト時にIDを受け取るコールバック。",
        "none",
      ),
    ],
  }),
  componentDefinition({
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.grabbable,
    importName: "Grabbable",
    label: "Grabbable",
    description: "配下のオブジェクトを掴んで移動できる対象にします。",
    category: "interaction",
    attachBehavior: REQUIRED_WRAPPER,
    fields: [
      field("id", "ID", "一意の識別子。", "string", true, {
        uniqueWithinScene: true,
      }),
      field(
        "transform",
        "Transform",
        "親のローカル空間で表す現在の位置・回転・任意の均一スケール。",
        "grabbable-transform",
        true,
        { nestedDefaults: { scale: 1 } },
      ),
      field("enabled", "Enabled", "掴む操作を有効にします。", "boolean", false, {
        defaultValue: true,
      }),
    ],
    runtimeBindings: [
      runtimeBinding(
        "onMove",
        "callback",
        true,
        "配置確定時の姿勢を受け取るコールバック。",
        "managed-transform-state",
      ),
      runtimeBinding(
        "renderGhost",
        "render-callback",
        false,
        "掴み中のゴーストを描画するコールバック。",
        "none",
      ),
    ],
  }),
  componentDefinition({
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.mirror,
    importName: "Mirror",
    label: "Mirror",
    description: "リアルタイム反射面を配置します。",
    category: "rendering",
    attachBehavior: LEAF,
    fields: [
      field("position", "Position", "反射面の位置。", "vec3"),
      field("rotation", "Rotation", "反射面の回転。", "vec3"),
      field("size", "Size", "反射面の幅と高さ。", "vec2"),
      field("color", "Color", "数値形式の反射面カラー。", "color-number"),
      field("textureResolution", "Texture resolution", "反射テクスチャの解像度。", "number"),
      field("lodDistance", "LOD distance", "低解像度へ切り替える距離。", "number", false, {
        defaultValue: 10,
      }),
    ],
  }),
  componentDefinition({
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.skybox,
    importName: "Skybox",
    label: "Skybox",
    description: "上下2色のグラデーションで全天背景を描画します。",
    category: "rendering",
    attachBehavior: LEAF,
    fields: [
      field("topColor", "Top color", "空の上部カラー。", "color-number", false, {
        defaultValue: 0x87ceeb,
      }),
      field("bottomColor", "Bottom color", "地平線側のカラー。", "color-number", false, {
        defaultValue: 0xffffff,
      }),
      field("offset", "Offset", "グラデーションの開始位置。", "number", false, {
        defaultValue: 0,
      }),
      field("exponent", "Exponent", "グラデーションの変化量。", "number", false, {
        defaultValue: 1,
      }),
    ],
  }),
  componentDefinition({
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.videoScreen,
    importName: "VideoScreen",
    label: "Video Screen",
    description: "同期された動画再生用スクリーンを配置します。",
    category: "media",
    attachBehavior: LEAF,
    fields: [
      field("id", "ID", "スクリーンの一意なID。", "string", true, {
        uniqueWithinScene: true,
      }),
      field("position", "Position", "スクリーンの位置。", "vec3", false, {
        defaultValue: [0, 2, -5],
      }),
      field("rotation", "Rotation", "スクリーンの回転。", "vec3", false, {
        defaultValue: [0, 0, 0],
      }),
      field("scale", "Scale", "スクリーンの幅と高さ。", "vec2", false, {
        defaultValue: [16 / 9 * 3, 3],
      }),
      field("url", "URL", "動画のURL。", "string"),
      field("playing", "Playing", "再生状態。", "boolean", false, {
        defaultValue: true,
      }),
      field("currentTime", "Current time", "再生位置（秒）。", "number", false, {
        defaultValue: 0,
      }),
      field("sync", "Sync", "再生状態の同期方法。", "enum", false, {
        defaultValue: "global",
        enumValues: ["global", "local"],
      }),
      field("muted", "Muted", "動画の音声をミュートします。", "boolean", false, {
        defaultValue: false,
      }),
      field("volume", "Volume", "動画の音量。", "number", false, {
        defaultValue: 1,
        range: { min: 0, max: 1 },
      }),
    ],
  }),
  componentDefinition({
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.videoPlayer,
    importName: "VideoPlayer",
    label: "Video Player",
    description: "操作UI付きの録画動画プレイヤーを配置します。",
    category: "media",
    attachBehavior: LEAF,
    fields: mediaPlayerFields({ playing: true, supportsSync: false }),
  }),
  componentDefinition({
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.liveVideoPlayer,
    importName: "LiveVideoPlayer",
    label: "Live Video Player",
    description: "HLS／DASH向けのライブ動画プレイヤーを配置します。",
    category: "media",
    attachBehavior: LEAF,
    fields: mediaPlayerFields({ playing: false, supportsSync: true }),
  }),
  componentDefinition({
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.video180Sphere,
    importName: "Video180Sphere",
    label: "180° Video Sphere",
    description: "Side-by-Side形式の180度ステレオ動画を半球へ表示します。",
    category: "media",
    attachBehavior: LEAF,
    fields: [
      field("url", "URL", "180度動画のURL。", "string", true),
      field("position", "Position", "半球の位置。", "vec3"),
      field("rotation", "Rotation", "半球の回転。", "vec3"),
      field("scale", "Scale", "半球の均一またはXYZスケール。", "number-or-vec3"),
      field("playing", "Playing", "動画の再生状態。", "boolean", false, {
        defaultValue: false,
      }),
      field("muted", "Muted", "動画の音声をミュートします。", "boolean", false, {
        defaultValue: false,
      }),
      field("volume", "Volume", "動画の音量。", "number", false, {
        defaultValue: 1,
        range: { min: 0, max: 1 },
      }),
      field("radius", "Radius", "動画を投影する半球の半径。", "number", false, {
        defaultValue: 5,
      }),
      field("segments", "Segments", "半球ジオメトリのセグメント数。", "number", false, {
        defaultValue: 64,
      }),
      field("loop", "Loop", "動画をループ再生します。", "boolean", false, {
        defaultValue: false,
      }),
      field(
        "placeholderColor",
        "Placeholder color",
        "動画読み込み前に表示するカラー。",
        "string",
        false,
        { defaultValue: "#000000" },
      ),
    ],
    runtimeBindings: [
      runtimeBinding("onEnded", "callback", false, "動画終了時のコールバック。", "none"),
      runtimeBinding(
        "onLoadedMetadata",
        "callback",
        false,
        "メタデータ読み込み時のコールバック。",
        "none",
      ),
      runtimeBinding(
        "onProgress",
        "callback",
        false,
        "再生位置更新時のコールバック。",
        "none",
      ),
    ],
  }),
  componentDefinition({
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.screenShareDisplay,
    importName: "ScreenShareDisplay",
    label: "Screen Share Display",
    description: "画面共有の映像を3D空間に表示します。",
    category: "media",
    attachBehavior: LEAF,
    fields: [
      field("id", "ID", "スクリーンの一意なID。", "string", true, {
        uniqueWithinScene: true,
      }),
      field("position", "Position", "スクリーンの位置。", "vec3", false, {
        defaultValue: [0, 0, 0],
      }),
      field("rotation", "Rotation", "スクリーンの回転。", "vec3", false, {
        defaultValue: [0, 0, 0],
      }),
      field("width", "Width", "スクリーンの幅。高さは映像比率から決まります。", "number", false, {
        defaultValue: 4,
      }),
      field("targetFps", "Target FPS", "テクスチャ更新のターゲットFPS。", "number"),
    ],
  }),
  componentDefinition({
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.spawnPoint,
    importName: "SpawnPoint",
    label: "XRift Spawn Point",
    description: "ワールド内でプレイヤーが出現する地点を指定します。",
    category: "world",
    allowedProjectKinds: WORLD_PROJECT_KIND,
    attachBehavior: LEAF,
    fields: [
      field("position", "Position", "スポーン位置。", "vec3", false, {
        defaultValue: [0, 0, 0],
      }),
      field("yaw", "Yaw", "スポーン時の向き（度）。", "number", false, {
        defaultValue: 0,
        range: { min: 0, max: 360 },
      }),
    ],
  }),
  componentDefinition({
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.textInput,
    importName: "TextInput",
    label: "Text Input",
    description: "配下の3Dオブジェクトからテキストを入力できるようにします。",
    category: "interaction",
    attachBehavior: REQUIRED_WRAPPER,
    fields: [
      field("id", "ID", "入力フィールドの一意なID。", "string", true, {
        uniqueWithinScene: true,
      }),
      field("placeholder", "Placeholder", "未入力時に表示するテキスト。", "string"),
      field("maxLength", "Maximum length", "入力できる最大文字数。", "number"),
      field("value", "Value", "現在の値。", "string"),
      field("interactionText", "Interaction text", "操作時に表示するテキスト。", "string", false, {
        defaultValue: "クリックして入力",
      }),
      field("disabled", "Disabled", "テキスト入力を無効にします。", "boolean", false, {
        defaultValue: false,
      }),
    ],
    runtimeBindings: [
      runtimeBinding(
        "onSubmit",
        "callback",
        false,
        "入力完了時に値を受け取るコールバック。",
        "managed-text-state",
      ),
    ],
  }),
  componentDefinition({
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.tagBoard,
    importName: "TagBoard",
    label: "Tag Board",
    description: "ユーザーがタグを選択するボードを配置します。",
    category: "interaction",
    attachBehavior: LEAF,
    fields: [
      field("tags", "Tags", "表示・選択対象のタグ一覧。", "tags", false, {
        defaultValue: DEFAULT_TAGS,
      }),
      field("columns", "Columns", "表示列数。", "number", false, {
        defaultValue: 3,
      }),
      field("title", "Title", "ボードのタイトル。", "string", false, {
        defaultValue: "タグ選択",
      }),
      field("instanceStateKey", "Instance state key", "ボードを識別するインスタンス状態キー。", "string", true, {
        uniqueWithinScene: true,
      }),
      field("position", "Position", "ボードの位置。", "vec3", false, {
        defaultValue: [0, 0, 0],
      }),
      field("rotation", "Rotation", "ボードの回転。", "vec3", false, {
        defaultValue: [0, 0, 0],
      }),
      field("scale", "Scale", "ボード全体の均一スケール。", "number", false, {
        defaultValue: 1,
      }),
    ],
  }),
  componentDefinition({
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.portal,
    importName: "Portal",
    label: "Portal",
    description: "別のXRiftインスタンスへ移動するポータルを配置します。",
    category: "world",
    attachBehavior: LEAF,
    fields: [
      field("instanceId", "Instance ID", "移動先のインスタンスID。", "string", true),
      field("position", "Position", "ポータルの位置。", "vec3", false, {
        defaultValue: [0, 0, 0],
      }),
      field("rotation", "Rotation", "ポータルの回転。", "vec3", false, {
        defaultValue: [0, 0, 0],
      }),
      field("disabled", "Disabled", "ポータルを無効にします。", "boolean", false, {
        defaultValue: false,
      }),
    ],
  }),
  componentDefinition({
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.billboardY,
    importName: "BillboardY",
    label: "Billboard Y",
    description: "配下のオブジェクトをY軸だけでカメラへ追従させます。",
    category: "rendering",
    attachBehavior: OPTIONAL_WRAPPER,
    fields: [
      field("position", "Position", "group互換の位置。", "vec3"),
      field("rotation", "Rotation", "group互換の回転。", "vec3"),
      field("scale", "Scale", "group互換の均一またはXYZスケール。", "number-or-vec3"),
    ],
  }),
] as const;

export const XRIFT_COMPONENT_REGISTRY_BY_SCHEMA_ID: Readonly<
  Record<XriftComponentSchemaId, XriftComponentDefinition>
> = Object.fromEntries(
  XRIFT_COMPONENT_REGISTRY.map((definition) => [definition.schemaId, definition]),
) as Record<XriftComponentSchemaId, XriftComponentDefinition>;

export const XRIFT_COMPONENT_CATEGORY_LABELS: Readonly<
  Record<XriftComponentCategory, string>
> = {
  interaction: "Interaction",
  media: "Media",
  rendering: "Rendering",
  world: "World",
};

const definitionLookup = new Map<string, XriftComponentDefinition>();
for (const definition of XRIFT_COMPONENT_REGISTRY) {
  definitionLookup.set(definition.schemaId, definition);
  definitionLookup.set(definition.importName, definition);
  definitionLookup.set(`${definition.moduleName}/${definition.importName}`, definition);
}

export function getXriftComponentDefinition(
  schemaId: string,
): XriftComponentDefinition | undefined {
  const candidate = schemaId.trim();
  if (!candidate) return undefined;
  const direct = definitionLookup.get(candidate);
  if (direct) return direct;
  const pathSegments = candidate.split("/").filter(Boolean);
  const importName = pathSegments[pathSegments.length - 1];
  return importName ? definitionLookup.get(importName) : undefined;
}

export function normalizeXriftComponentSchemaId(
  schemaId: string,
): XriftComponentSchemaId | null {
  return getXriftComponentDefinition(schemaId)?.schemaId ?? null;
}

export function listXriftComponentDefinitions(
  projectKind?: VisualProjectKind,
): readonly XriftComponentDefinition[] {
  return projectKind
    ? XRIFT_COMPONENT_REGISTRY.filter((definition) =>
        definition.allowedProjectKinds.includes(projectKind),
      )
    : XRIFT_COMPONENT_REGISTRY;
}

export type XriftComponentMenuGroup = {
  category: XriftComponentCategory;
  label: string;
  components: readonly XriftComponentDefinition[];
};

export function getXriftComponentMenuGroups(
  projectKind: VisualProjectKind,
): readonly XriftComponentMenuGroup[] {
  const definitions = listXriftComponentDefinitions(projectKind);
  const order: readonly XriftComponentCategory[] = [
    "interaction",
    "media",
    "rendering",
    "world",
  ];
  return order.flatMap((category) => {
    const components = definitions.filter(
      (definition) => definition.category === category,
    );
    return components.length > 0
      ? [{ category, label: XRIFT_COMPONENT_CATEGORY_LABELS[category], components }]
      : [];
  });
}

export function createDefaultXriftComponentProperties(
  schemaId: string,
): JsonObject | null {
  const definition = getXriftComponentDefinition(schemaId);
  if (!definition) return null;
  return Object.fromEntries(
    definition.fields.flatMap((fieldDefinition) =>
      fieldDefinition.defaultValue === undefined
        ? []
        : [[fieldDefinition.name, cloneJsonValue(fieldDefinition.defaultValue)]],
    ),
  );
}

export function isXriftComponentAuthoringLocked(
  component: XRiftComponent,
): boolean {
  return component.authoring?.source === "builtin-prefab" && component.authoring.readOnly;
}

export function createXriftComponent(
  schemaId: string,
  options: CreateXriftComponentOptions = {},
): XRiftComponent | null {
  const definition = getXriftComponentDefinition(schemaId);
  if (!definition) return null;
  const defaults = createDefaultXriftComponentProperties(definition.schemaId) ?? {};
  return {
    id: options.componentId?.trim() || createDocumentId("component"),
    type: "xrift-component",
    enabled: options.enabled ?? true,
    schemaId: definition.schemaId,
    schemaVersion: definition.schemaVersion,
    properties: {
      ...defaults,
      ...(options.properties ? cloneJsonObject(options.properties) : {}),
    },
    assetReferences: [...(options.assetReferences ?? [])],
    entityReferences: [...(options.entityReferences ?? [])],
    ...(options.authoring
      ? {
          authoring: {
            source: options.authoring.source,
            recipeId: options.authoring.recipeId,
            readOnly: true,
          },
        }
      : {}),
  };
}

export function addXriftComponent(
  scene: SceneDocument,
  entityId: string,
  schemaId: string,
  projectKind: VisualProjectKind,
  options: CreateXriftComponentOptions = {},
): XriftComponentMutationResult {
  const entity = scene.entities[entityId];
  if (!entity) {
    return mutationFailure(scene, "entity-missing", "Entityが見つかりません。", entityPath(entityId), {
      entityId,
      schemaId,
    });
  }
  const definition = getXriftComponentDefinition(schemaId);
  if (!definition) {
    return mutationFailure(
      scene,
      "unknown-xrift-component-schema",
      `未登録のXRift component schemaです: ${schemaId}`,
      `${entityPath(entityId)}.components`,
      { entityId, schemaId },
    );
  }
  if (!definition.allowedProjectKinds.includes(projectKind)) {
    return mutationFailure(
      scene,
      "xrift-component-project-kind",
      `${definition.label}は${projectKind}プロジェクトでは使用できません。`,
      `${entityPath(entityId)}.components`,
      { entityId, schemaId: definition.schemaId },
    );
  }
  const duplicate = entity.components.find(
    (component) =>
      component.type === "xrift-component" &&
      normalizeXriftComponentSchemaId(component.schemaId) === definition.schemaId,
  );
  if (!definition.allowMultiplePerEntity && duplicate) {
    return mutationFailure(
      scene,
      "duplicate-xrift-component",
      `${definition.label}は同じEntityへ複数追加できません。`,
      `${entityPath(entityId)}.components`,
      {
        entityId,
        componentId: duplicate.id,
        schemaId: definition.schemaId,
      },
    );
  }

  const component = createXriftComponent(definition.schemaId, options);
  if (!component) {
    return mutationFailure(
      scene,
      "unknown-xrift-component-schema",
      `未登録のXRift component schemaです: ${schemaId}`,
      `${entityPath(entityId)}.components`,
      { entityId, schemaId },
    );
  }
  if (entity.components.some((candidate) => candidate.id === component.id)) {
    return mutationFailure(
      scene,
      "duplicate-component-id",
      `Component ID「${component.id}」はこのEntity内ですでに使用されています。`,
      `${entityPath(entityId)}.components`,
      { entityId, componentId: component.id, schemaId: definition.schemaId },
    );
  }

  const nextScene: SceneDocument = {
    ...scene,
    entities: {
      ...scene.entities,
      [entityId]: {
        ...entity,
        components: [...entity.components, component],
      },
    },
  };
  return {
    scene: nextScene,
    changed: true,
    componentId: component.id,
    diagnostics: validateXriftComponents(nextScene, projectKind).filter(
      (diagnostic) => diagnostic.componentId === component.id,
    ),
  };
}

export function removeXriftComponent(
  scene: SceneDocument,
  entityId: string,
  componentId: string,
): XriftComponentMutationResult {
  const entity = scene.entities[entityId];
  if (!entity) {
    return mutationFailure(scene, "entity-missing", "Entityが見つかりません。", entityPath(entityId), {
      entityId,
      componentId,
    });
  }
  const component = entity.components.find((candidate) => candidate.id === componentId);
  if (!component) {
    return mutationFailure(
      scene,
      "component-missing",
      "Componentが見つかりません。",
      `${entityPath(entityId)}.components`,
      { entityId, componentId },
    );
  }
  if (component.type !== "xrift-component") {
    return mutationFailure(
      scene,
      "component-type",
      "指定されたComponentはXRift componentではありません。",
      `${entityPath(entityId)}.components`,
      { entityId, componentId },
    );
  }
  if (component.authoring?.readOnly) {
    return mutationFailure(
      scene,
      "xrift-component-authoring-locked",
      "Builtin PrefabのXRift Componentは読み取り専用です。Entityを削除するか、通常のComponentを追加してください。",
      `${entityPath(entityId)}.components`,
      { entityId, componentId, schemaId: component.schemaId },
    );
  }
  return {
    scene: {
      ...scene,
      entities: {
        ...scene.entities,
        [entityId]: {
          ...entity,
          components: entity.components.filter(
            (candidate) => candidate.id !== componentId,
          ),
        },
      },
    },
    changed: true,
    componentId,
    diagnostics: [],
  };
}

export function updateXriftComponent(
  scene: SceneDocument,
  entityId: string,
  componentId: string,
  patch: UpdateXriftComponentPatch,
  projectKind?: VisualProjectKind,
): XriftComponentMutationResult {
  const entity = scene.entities[entityId];
  if (!entity) {
    return mutationFailure(scene, "entity-missing", "Entityが見つかりません。", entityPath(entityId), {
      entityId,
      componentId,
    });
  }
  const componentIndex = entity.components.findIndex(
    (candidate) => candidate.id === componentId,
  );
  const component = entity.components[componentIndex];
  if (!component) {
    return mutationFailure(
      scene,
      "component-missing",
      "Componentが見つかりません。",
      `${entityPath(entityId)}.components`,
      { entityId, componentId },
    );
  }
  if (component.type !== "xrift-component") {
    return mutationFailure(
      scene,
      "component-type",
      "指定されたComponentはXRift componentではありません。",
      `${entityPath(entityId)}.components[${componentIndex}]`,
      { entityId, componentId },
    );
  }
  if (component.authoring?.readOnly) {
    return mutationFailure(
      scene,
      "xrift-component-authoring-locked",
      "Builtin PrefabのXRift Componentは読み取り専用です。TransformはEntity側で編集できます。",
      `${entityPath(entityId)}.components[${componentIndex}]`,
      { entityId, componentId, schemaId: component.schemaId },
    );
  }

  const properties = cloneJsonObject(component.properties);
  for (const [name, value] of Object.entries(patch.properties ?? {})) {
    if (value === undefined) delete properties[name];
    else properties[name] = cloneJsonValue(value);
  }
  const updated: XRiftComponent = {
    ...component,
    enabled: patch.enabled ?? component.enabled,
    properties,
    assetReferences: patch.assetReferences
      ? [...patch.assetReferences]
      : [...component.assetReferences],
    entityReferences: patch.entityReferences
      ? [...patch.entityReferences]
      : [...component.entityReferences],
  };
  const components: RegisteredSceneComponent[] = entity.components.map(
    (candidate, index) => (index === componentIndex ? updated : candidate),
  );
  const nextScene: SceneDocument = {
    ...scene,
    entities: {
      ...scene.entities,
      [entityId]: { ...entity, components },
    },
  };
  return {
    scene: nextScene,
    changed: true,
    componentId,
    diagnostics: validateXriftComponents(nextScene, projectKind).filter(
      (diagnostic) => diagnostic.componentId === componentId,
    ),
  };
}

export function validateXriftComponents(
  scene: SceneDocument,
  projectKind?: VisualProjectKind,
): XriftComponentDiagnostic[] {
  return validateSerializedXriftComponents(scene, projectKind);
}

/** Runtime-safe validation entry point for JSON before it is cast to SceneDocument. */
export function validateSerializedXriftComponents(
  value: unknown,
  projectKind?: VisualProjectKind,
): XriftComponentDiagnostic[] {
  if (!isRecord(value) || !isRecord(value.entities)) return [];

  const diagnostics: XriftComponentDiagnostic[] = [];
  const uniqueValues = new Map<
    string,
    { entityId: string; componentId: string; path: string }
  >();

  for (const [entityId, entityValue] of Object.entries(value.entities)) {
    if (!isRecord(entityValue) || !Array.isArray(entityValue.components)) continue;
    const componentIds = new Map<string, number>();
    const schemas = new Map<XriftComponentSchemaId, number>();

    entityValue.components.forEach((componentValue, componentIndex) => {
      if (!isRecord(componentValue)) return;
      const path = `${entityPath(entityId)}.components[${componentIndex}]`;
      const componentId =
        typeof componentValue.id === "string" ? componentValue.id : undefined;
      if (componentId) {
        const firstIndex = componentIds.get(componentId);
        if (firstIndex !== undefined) {
          diagnostics.push(
            makeDiagnostic(
              "error",
              "duplicate-component-id",
              `Component ID「${componentId}」が同じEntity内で重複しています（先頭: ${firstIndex}）。`,
              `${path}.id`,
              { entityId, componentId },
            ),
          );
        } else {
          componentIds.set(componentId, componentIndex);
        }
      }
      if (componentValue.type !== "xrift-component") return;

      diagnostics.push(
        ...validateXriftComponent(componentValue, {
          projectKind,
          entityId,
          componentIndex,
          path,
        }),
      );

      const schemaId =
        typeof componentValue.schemaId === "string"
          ? componentValue.schemaId
          : "";
      const definition = getXriftComponentDefinition(schemaId);
      if (!definition) return;

      const firstSchemaIndex = schemas.get(definition.schemaId);
      if (!definition.allowMultiplePerEntity && firstSchemaIndex !== undefined) {
        diagnostics.push(
          makeDiagnostic(
            "error",
            "duplicate-xrift-component",
            `${definition.label}が同じEntityに重複しています（先頭: ${firstSchemaIndex}）。`,
            `${path}.schemaId`,
            {
              entityId,
              componentId,
              schemaId: definition.schemaId,
            },
          ),
        );
      } else {
        schemas.set(definition.schemaId, componentIndex);
      }

      if (!isRecord(componentValue.properties)) return;
      for (const fieldDefinition of definition.fields) {
        if (!fieldDefinition.uniqueWithinScene) continue;
        const fieldValue = componentValue.properties[fieldDefinition.name];
        if (typeof fieldValue !== "string" || !fieldValue.trim()) continue;
        const key = `${definition.schemaId}\u0000${fieldDefinition.name}\u0000${fieldValue}`;
        const first = uniqueValues.get(key);
        if (first) {
          diagnostics.push(
            makeDiagnostic(
              "error",
              "duplicate-xrift-identifier",
              `${definition.label}.${fieldDefinition.name}「${fieldValue}」が重複しています（${first.entityId} / ${first.componentId}）。`,
              `${path}.properties.${fieldDefinition.name}`,
              {
                entityId,
                componentId,
                schemaId: definition.schemaId,
                fieldName: fieldDefinition.name,
              },
            ),
          );
        } else {
          uniqueValues.set(key, { entityId, componentId: componentId ?? "", path });
        }
      }
    });
  }
  return diagnostics;
}

export type ValidateXriftComponentContext = {
  projectKind?: VisualProjectKind;
  entityId?: string;
  componentIndex?: number;
  path?: string;
};

export function validateXriftComponent(
  value: unknown,
  context: ValidateXriftComponentContext = {},
): XriftComponentDiagnostic[] {
  const path = context.path ?? "$";
  if (!isRecord(value) || value.type !== "xrift-component") {
    return [
      makeDiagnostic(
        "error",
        "invalid-xrift-component",
        "XRift componentはオブジェクトで、typeはxrift-componentである必要があります。",
        path,
        { entityId: context.entityId },
      ),
    ];
  }

  const diagnostics: XriftComponentDiagnostic[] = [];
  const componentId = typeof value.id === "string" ? value.id : undefined;
  const schemaId = typeof value.schemaId === "string" ? value.schemaId : undefined;
  const common = { entityId: context.entityId, componentId, schemaId };
  if (!componentId?.trim()) {
    diagnostics.push(
      makeDiagnostic("error", "invalid-xrift-component", "Component IDが必要です。", `${path}.id`, common),
    );
  }
  if (typeof value.enabled !== "boolean") {
    diagnostics.push(
      makeDiagnostic("error", "invalid-xrift-component", "enabledはbooleanである必要があります。", `${path}.enabled`, common),
    );
  }
  if (!schemaId?.trim()) {
    diagnostics.push(
      makeDiagnostic("error", "invalid-xrift-component", "schemaIdが必要です。", `${path}.schemaId`, common),
    );
  }
  if (typeof value.schemaVersion !== "string" || !value.schemaVersion.trim()) {
    diagnostics.push(
      makeDiagnostic("error", "invalid-xrift-component", "schemaVersionが必要です。", `${path}.schemaVersion`, common),
    );
  }
  if (!isRecord(value.properties) || !isSerializableJsonValue(value.properties)) {
    diagnostics.push(
      makeDiagnostic(
        "error",
        "invalid-xrift-component-properties",
        "propertiesは有限数値だけを含むJSON objectである必要があります。",
        `${path}.properties`,
        common,
      ),
    );
  }
  if (!isStringArray(value.assetReferences)) {
    diagnostics.push(
      makeDiagnostic(
        "error",
        "invalid-xrift-component",
        "assetReferencesはstring配列である必要があります。",
        `${path}.assetReferences`,
        common,
      ),
    );
  }
  if (!isStringArray(value.entityReferences)) {
    diagnostics.push(
      makeDiagnostic(
        "error",
        "invalid-xrift-component",
        "entityReferencesはstring配列である必要があります。",
        `${path}.entityReferences`,
        common,
      ),
    );
  }
  if (
    value.authoring !== undefined &&
    (!isRecord(value.authoring) ||
      value.authoring.source !== "builtin-prefab" ||
      typeof value.authoring.recipeId !== "string" ||
      !value.authoring.recipeId.trim() ||
      value.authoring.readOnly !== true)
  ) {
    diagnostics.push(
      makeDiagnostic(
        "error",
        "invalid-xrift-component",
        "authoringは有効なBuiltin Prefab保護情報である必要があります。",
        `${path}.authoring`,
        common,
      ),
    );
  }

  const definition = schemaId ? getXriftComponentDefinition(schemaId) : undefined;
  if (!definition) {
    if (schemaId?.trim()) {
      diagnostics.push(
        makeDiagnostic(
          "warning",
          "unknown-xrift-component-schema",
          `未登録のXRift component schemaを保持しています: ${schemaId}`,
          `${path}.schemaId`,
          common,
        ),
      );
    }
    return diagnostics;
  }

  if (value.schemaVersion !== definition.schemaVersion) {
    diagnostics.push(
      makeDiagnostic(
        "warning",
        "unsupported-xrift-component-schema-version",
        `${definition.label}のschemaVersion ${String(value.schemaVersion)} は未対応です。`,
        `${path}.schemaVersion`,
        { ...common, schemaId: definition.schemaId },
      ),
    );
  }
  if (
    context.projectKind &&
    !definition.allowedProjectKinds.includes(context.projectKind)
  ) {
    diagnostics.push(
      makeDiagnostic(
        "warning",
        "xrift-component-project-kind",
        `${definition.label}は${context.projectKind}プロジェクトでは使用できません。`,
        `${path}.schemaId`,
        { ...common, schemaId: definition.schemaId },
      ),
    );
  }
  if (!isRecord(value.properties)) return diagnostics;

  const fields = new Map(
    definition.fields.map((fieldDefinition) => [fieldDefinition.name, fieldDefinition]),
  );
  for (const fieldDefinition of definition.fields) {
    const fieldValue = value.properties[fieldDefinition.name];
    if (fieldValue === undefined) {
      if (fieldDefinition.required) {
        diagnostics.push(
          makeDiagnostic(
            "error",
            "missing-xrift-component-field",
            `${definition.label}.${fieldDefinition.name}は必須です。`,
            `${path}.properties.${fieldDefinition.name}`,
            {
              ...common,
              schemaId: definition.schemaId,
              fieldName: fieldDefinition.name,
            },
          ),
        );
      }
      continue;
    }
    const failure = validateXriftComponentFieldValue(fieldValue, fieldDefinition);
    if (failure) {
      diagnostics.push(
        makeDiagnostic(
          "error",
          "invalid-xrift-component-field",
          `${definition.label}.${fieldDefinition.name}: ${failure.message}`,
          `${path}.properties.${fieldDefinition.name}`,
          {
            ...common,
            schemaId: definition.schemaId,
            fieldName: fieldDefinition.name,
          },
        ),
      );
    }
  }
  for (const fieldName of Object.keys(value.properties)) {
    if (fields.has(fieldName)) continue;
    diagnostics.push(
      makeDiagnostic(
        "warning",
        "unknown-xrift-component-field",
        `${definition.label}.${fieldName}はauthoring registryに未登録のため、値を保持したまま編集対象外にします。`,
        `${path}.properties.${fieldName}`,
        {
          ...common,
          schemaId: definition.schemaId,
          fieldName,
        },
      ),
    );
  }
  return diagnostics;
}

export function validateXriftComponentFieldValue(
  value: unknown,
  definition: XriftComponentFieldDefinition,
): XriftFieldValidationFailure | null {
  if (definition.kind === "string") {
    if (typeof value !== "string") return typeFailure("string");
    if (definition.required && !value.trim()) {
      return { code: "empty", message: "空文字にはできません。" };
    }
    return null;
  }
  if (definition.kind === "boolean") {
    return typeof value === "boolean" ? null : typeFailure("boolean");
  }
  if (definition.kind === "number" || definition.kind === "color-number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return typeFailure("有限のnumber");
    }
    if (
      definition.range?.min !== undefined &&
      value < definition.range.min
    ) {
      return {
        code: "range",
        message: `${definition.range.min}以上である必要があります。`,
      };
    }
    if (
      definition.range?.max !== undefined &&
      value > definition.range.max
    ) {
      return {
        code: "range",
        message: `${definition.range.max}以下である必要があります。`,
      };
    }
    return null;
  }
  if (definition.kind === "enum") {
    return typeof value === "string" && definition.enumValues?.includes(value)
      ? null
      : {
          code: "type",
          message: `次の値から選択してください: ${(definition.enumValues ?? []).join(", ")}`,
        };
  }
  if (definition.kind === "vec2") {
    return isFiniteNumberArray(value, 2) ? null : typeFailure("[number, number]");
  }
  if (definition.kind === "vec3") {
    return isFiniteNumberArray(value, 3)
      ? null
      : typeFailure("[number, number, number]");
  }
  if (definition.kind === "number-or-vec3") {
    return (typeof value === "number" && Number.isFinite(value)) ||
      isFiniteNumberArray(value, 3)
      ? null
      : typeFailure("number または [number, number, number]");
  }
  if (definition.kind === "grabbable-transform") {
    if (!isRecord(value)) return typeFailure("GrabbableTransform");
    if (!isXYZ(value.position) || !isXYZ(value.rotation)) {
      return typeFailure("positionとrotationを持つGrabbableTransform");
    }
    if (
      value.scale !== undefined &&
      (typeof value.scale !== "number" || !Number.isFinite(value.scale))
    ) {
      return typeFailure("scaleが有限数値のGrabbableTransform");
    }
    return null;
  }
  if (definition.kind === "tags") {
    if (!Array.isArray(value)) return typeFailure("Tag[]");
    const ids = new Set<string>();
    for (const tag of value) {
      if (
        !isRecord(tag) ||
        typeof tag.id !== "string" ||
        typeof tag.label !== "string" ||
        typeof tag.color !== "string" ||
        !/^#[0-9a-f]{6}$/i.test(tag.color)
      ) {
        return typeFailure("id、label、HEX colorを持つTag[]");
      }
      if (ids.has(tag.id)) {
        return { code: "duplicate", message: `Tag ID「${tag.id}」が重複しています。` };
      }
      ids.add(tag.id);
    }
    return null;
  }
  return typeFailure("対応するJSON値");
}

function componentDefinition(
  definition: Omit<
    XriftComponentDefinition,
    | "schemaVersion"
    | "moduleName"
    | "allowedProjectKinds"
    | "allowMultiplePerEntity"
    | "runtimeBindings"
  > &
    Partial<
      Pick<
        XriftComponentDefinition,
        "allowedProjectKinds" | "allowMultiplePerEntity" | "runtimeBindings"
      >
    >,
): XriftComponentDefinition {
  return {
    ...definition,
    schemaVersion: XRIFT_COMPONENT_SCHEMA_VERSION,
    moduleName: XRIFT_COMPONENT_MODULE,
    allowedProjectKinds:
      definition.allowedProjectKinds ?? BOTH_PROJECT_KINDS,
    allowMultiplePerEntity: definition.allowMultiplePerEntity ?? false,
    runtimeBindings: definition.runtimeBindings ?? [],
  };
}

function field(
  name: string,
  label: string,
  description: string,
  kind: XriftComponentFieldKind,
  required = false,
  options: Partial<
    Pick<
      XriftComponentFieldDefinition,
      | "defaultValue"
      | "enumValues"
      | "nestedDefaults"
      | "range"
      | "uniqueWithinScene"
    >
  > = {},
): XriftComponentFieldDefinition {
  return { name, label, description, kind, required, ...options };
}

function runtimeBinding(
  name: string,
  kind: XriftRuntimeBindingDefinition["kind"],
  required: boolean,
  description: string,
  generation: XriftRuntimeBindingDefinition["generation"],
): XriftRuntimeBindingDefinition {
  return { name, kind, required, description, generation };
}

function mediaPlayerFields(options: {
  playing: boolean;
  supportsSync: boolean;
}): readonly XriftComponentFieldDefinition[] {
  const fields: XriftComponentFieldDefinition[] = [
    field("id", "ID", "スクリーンの一意なID。", "string", true, {
      uniqueWithinScene: true,
    }),
    field("position", "Position", "スクリーンの位置。", "vec3", false, {
      defaultValue: [0, 2, -5],
    }),
    field("rotation", "Rotation", "スクリーンの回転。", "vec3", false, {
      defaultValue: [0, 0, 0],
    }),
    field("width", "Width", "スクリーンの幅。高さは16:9で計算されます。", "number", false, {
      defaultValue: 4,
    }),
    field("url", "URL", "動画またはストリームのURL。", "string"),
    field("playing", "Playing", "初期再生状態。", "boolean", false, {
      defaultValue: options.playing,
    }),
    field("volume", "Volume", "初期音量。", "number", false, {
      defaultValue: 1,
      range: { min: 0, max: 1 },
    }),
  ];
  if (options.supportsSync) {
    fields.push(
      field("sync", "Sync", "再生状態の同期方法。", "enum", false, {
        defaultValue: "global",
        enumValues: ["global", "local"],
      }),
    );
  }
  return fields;
}

function mutationFailure(
  scene: SceneDocument,
  code: XriftComponentDiagnostic["code"],
  message: string,
  path: string,
  context: Partial<XriftComponentDiagnostic>,
): XriftComponentMutationResult {
  return {
    scene,
    changed: false,
    componentId: context.componentId,
    diagnostics: [makeDiagnostic("error", code, message, path, context)],
  };
}

function makeDiagnostic(
  severity: XriftComponentDiagnosticSeverity,
  code: XriftComponentDiagnostic["code"],
  message: string,
  path: string,
  context: Partial<XriftComponentDiagnostic> = {},
): XriftComponentDiagnostic {
  return { ...context, severity, code, message, path };
}

function typeFailure(expected: string): XriftFieldValidationFailure {
  return { code: "type", message: `${expected}である必要があります。` };
}

function isFiniteNumberArray(value: unknown, length: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function isXYZ(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    typeof value.z === "number" &&
    Number.isFinite(value.z)
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSerializableJsonValue(
  value: unknown,
  ancestors = new Set<object>(),
): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isSerializableJsonValue(entry, ancestors))
    : isRecord(value) &&
      Object.values(value).every((entry) =>
        isSerializableJsonValue(entry, ancestors),
      );
  ancestors.delete(value);
  return valid;
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry)]),
  );
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (typeof value === "object" && value !== null) return cloneJsonObject(value);
  return value;
}

function entityPath(entityId: string): string {
  return `$.entities[${JSON.stringify(entityId)}]`;
}
