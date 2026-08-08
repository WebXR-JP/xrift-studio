/**
 * Panel sizes for the visual editor shell.
 *
 * Layout is Editor State, not authoring data: it never enters the
 * SceneDocument, AssetManifest, or the authoring Undo history, and a failed
 * save must not stop editing.
 */
export type VisualEditorLayout = {
  hierarchyWidth: number;
  inspectorWidth: number;
  assetsHeight: number;
};

export const DEFAULT_EDITOR_LAYOUT: VisualEditorLayout = {
  hierarchyWidth: 185,
  inspectorWidth: 320,
  assetsHeight: 220,
};

export const EDITOR_LAYOUT_STORAGE_KEY = "xrift-studio.visual-editor.layout.v1";

/**
 * Minimum and maximum panel sizes. Each panel keeps its main surface readable
 * at both ends of the range, so a restored layout never hides Hierarchy,
 * Inspector, or Assets.
 */
export const EDITOR_LAYOUT_BOUNDS: Readonly<
  Record<keyof VisualEditorLayout, { min: number; max: number }>
> = {
  hierarchyWidth: { min: 150, max: 280 },
  inspectorWidth: { min: 280, max: 460 },
  assetsHeight: { min: 160, max: 340 },
};

const LAYOUT_KEYS = Object.keys(
  DEFAULT_EDITOR_LAYOUT,
) as (keyof VisualEditorLayout)[];

/** Normalizes a stored or supplied layout into the supported range. */
export function clampEditorLayout(
  candidate: Partial<VisualEditorLayout>,
): VisualEditorLayout {
  const layout = { ...DEFAULT_EDITOR_LAYOUT };
  for (const key of LAYOUT_KEYS) {
    const value = candidate[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const { min, max } = EDITOR_LAYOUT_BOUNDS[key];
    layout[key] = Math.max(min, Math.min(max, value));
  }
  return layout;
}

/**
 * Resolves the layout to start from. A layout supplied by the shell wins over
 * the browser-stored one, and unreadable storage falls back to the default
 * instead of failing to open the editor.
 */
export function loadEditorLayout(
  preferred?: Partial<VisualEditorLayout>,
): VisualEditorLayout {
  if (preferred) return clampEditorLayout(preferred);
  if (typeof window === "undefined") return DEFAULT_EDITOR_LAYOUT;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(EDITOR_LAYOUT_STORAGE_KEY) ?? "null",
    ) as Partial<VisualEditorLayout> | null;
    return parsed ? clampEditorLayout(parsed) : DEFAULT_EDITOR_LAYOUT;
  } catch {
    return DEFAULT_EDITOR_LAYOUT;
  }
}
