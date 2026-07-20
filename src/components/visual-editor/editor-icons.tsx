import {
  ArrowLeft,
  Box,
  Camera,
  CircleDot,
  CirclePlay,
  CircleHelp,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Cuboid,
  FileBox,
  Folder,
  DoorOpen,
  Image,
  Import,
  Lightbulb,
  List,
  LayoutGrid,
  Keyboard,
  MapPin,
  MonitorPlay,
  Move3D,
  Package,
  Palette,
  PanelsTopLeft,
  Play,
  Plus,
  Puzzle,
  Redo2,
  RadioTower,
  Rotate3D,
  Save,
  Scaling,
  Settings,
  ScreenShare,
  Sparkles,
  Square,
  Trash2,
  Tags,
  TriangleAlert,
  Undo2,
  UploadCloud,
  X,
  Globe,
  Hand,
  Pointer,
  SquarePlay,
  TextCursorInput,
  type LucideIcon,
} from "lucide-react";
import {
  getXriftComponentDefinition,
  type EditorComponentDefinition,
} from "../../lib/visual-editor";

export const EDITOR_ICONS = {
  back: ArrowLeft,
  folder: Folder,
  model: Box,
  material: CircleDot,
  texture: Image,
  prefab: Package,
  particle: Sparkles,
  primitive: Cuboid,
  sceneEntity: FileBox,
  light: Lightbulb,
  camera: Camera,
  save: Save,
  upload: UploadCloud,
  play: Play,
  stop: Square,
  copy: Copy,
  paste: ClipboardPaste,
  duplicate: CopyPlus,
  delete: Trash2,
  create: Plus,
  component: Puzzle,
  import: Import,
  settings: Settings,
  keyboard: Keyboard,
  help: CircleHelp,
  close: X,
  layout: PanelsTopLeft,
  asset: Palette,
  undo: Undo2,
  redo: Redo2,
  move: Move3D,
  rotate: Rotate3D,
  scale: Scaling,
  world: Globe,
  item: Box,
  grid: LayoutGrid,
  list: List,
  spawn: MapPin,
  interactable: Pointer,
  grabbable: Hand,
  mirror: PanelsTopLeft,
  skybox: Image,
  portal: DoorOpen,
  tagBoard: Tags,
  videoScreen: MonitorPlay,
  videoPlayer: SquarePlay,
  liveVideo: RadioTower,
  videoSphere: CirclePlay,
  screenShare: ScreenShare,
  textInput: TextCursorInput,
  billboardY: Rotate3D,
  warning: TriangleAlert,
} satisfies Record<string, LucideIcon>;

export type EditorIconName = keyof typeof EDITOR_ICONS;

export function getEditorComponentIcon(
  definition: EditorComponentDefinition,
): LucideIcon {
  if (definition.componentType === "official-xrift" && definition.schemaId) {
    const icon = getXriftComponentDefinition(definition.schemaId)?.icon;
    if (icon) return EDITOR_ICONS[icon];
  }
  switch (definition.componentType) {
    case "transform":
      return EDITOR_ICONS.move;
    case "builtin-mesh":
    case "mesh":
      return EDITOR_ICONS.model;
    case "collider":
      return EDITOR_ICONS.primitive;
    case "light":
      return EDITOR_ICONS.light;
    case "spawn-point":
      return EDITOR_ICONS.spawn;
    case "particle-emitter":
      return EDITOR_ICONS.particle;
    default:
      return EDITOR_ICONS.component;
  }
}

export function commandTitle(
  label: string,
  _command: string,
  shortcut?: string,
): string {
  return `${label}${shortcut ? ` (${shortcut})` : ""}`;
}
