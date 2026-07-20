import {
  XRIFT_COMPONENT_SCHEMA_IDS,
  getXriftComponentDefinition,
  type JsonObject,
  type JsonValue,
} from "../../lib/visual-editor";

export type TagBoardPreviewTag = {
  id: string;
  label: string;
  color: string;
};

export type TagBoardPreview = {
  title: string;
  columns: number;
  scale: number;
  tags: TagBoardPreviewTag[];
};

export type PortalPreview = {
  disabled: boolean;
  instanceId: string | null;
  statusLabel: "移動先未設定" | "移動先設定済み" | "Portal 無効";
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function defaultTagBoardValue(name: string): JsonValue | undefined {
  return getXriftComponentDefinition(XRIFT_COMPONENT_SCHEMA_IDS.tagBoard)
    ?.fields.find((field) => field.name === name)?.defaultValue;
}

function parseTag(value: JsonValue): TagBoardPreviewTag | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const { id, label, color } = value;
  return typeof id === "string" &&
    typeof label === "string" &&
    typeof color === "string" &&
    HEX_COLOR.test(color)
    ? { id, label, color }
    : null;
}

function parseTags(value: JsonValue | undefined): TagBoardPreviewTag[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => parseTag(entry))
    .filter((entry): entry is TagBoardPreviewTag => entry !== null);
}

export function resolveTagBoardPreview(properties: JsonObject): TagBoardPreview {
  const defaultTags = defaultTagBoardValue("tags");
  const defaultColumns = defaultTagBoardValue("columns");
  const defaultTitle = defaultTagBoardValue("title");
  const defaultScale = defaultTagBoardValue("scale");
  const columnsValue = properties.columns ?? defaultColumns;
  const scaleValue = properties.scale ?? defaultScale;

  return {
    title:
      typeof properties.title === "string"
        ? properties.title
        : typeof defaultTitle === "string"
          ? defaultTitle
          : "TagBoard",
    columns:
      typeof columnsValue === "number" && Number.isFinite(columnsValue)
        ? Math.max(1, Math.round(columnsValue))
        : 3,
    scale:
      typeof scaleValue === "number" && Number.isFinite(scaleValue)
        ? Math.max(0.01, scaleValue)
        : 1,
    tags: parseTags(properties.tags ?? defaultTags),
  };
}

export function resolvePortalPreview(properties: JsonObject): PortalPreview {
  const instanceId =
    typeof properties.instanceId === "string" && properties.instanceId.trim()
      ? properties.instanceId.trim()
      : null;
  const disabled = properties.disabled === true;
  return {
    disabled,
    instanceId,
    statusLabel: disabled
      ? "Portal 無効"
      : instanceId
        ? "移動先設定済み"
        : "移動先未設定",
  };
}
