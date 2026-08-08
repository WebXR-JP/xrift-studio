import {
  DEFAULT_EDITOR_LAYOUT,
  EDITOR_LAYOUT_BOUNDS,
  clampEditorLayout,
  loadEditorLayout,
  type VisualEditorLayout,
} from "./editor-layout";

/** Storage-free assertions for restoring visual editor panel sizes. */
export function runEditorLayoutFixtureAssertions(): void {
  const layoutKeys = Object.keys(
    DEFAULT_EDITOR_LAYOUT,
  ) as (keyof VisualEditorLayout)[];

  for (const key of layoutKeys) {
    const { min, max } = EDITOR_LAYOUT_BOUNDS[key];
    assert(
      DEFAULT_EDITOR_LAYOUT[key] >= min && DEFAULT_EDITOR_LAYOUT[key] <= max,
      `Default layout ${key} is outside its own bounds`,
    );
    assert(
      clampEditorLayout({ [key]: min - 1000 })[key] === min &&
        clampEditorLayout({ [key]: max + 1000 })[key] === max,
      `Layout ${key} was not clamped into its bounds`,
    );
  }

  assert(
    layoutKeys.every(
      (key) => clampEditorLayout({})[key] === DEFAULT_EDITOR_LAYOUT[key],
    ),
    "An empty layout did not fall back to the default",
  );

  const partial = clampEditorLayout({ inspectorWidth: 400 });
  assert(
    partial.inspectorWidth === 400 &&
      partial.hierarchyWidth === DEFAULT_EDITOR_LAYOUT.hierarchyWidth &&
      partial.assetsHeight === DEFAULT_EDITOR_LAYOUT.assetsHeight,
    "A partial layout must keep the default for the panels it omits",
  );

  for (const broken of [
    { hierarchyWidth: Number.NaN },
    { hierarchyWidth: Number.POSITIVE_INFINITY },
    { hierarchyWidth: "200" as unknown as number },
  ]) {
    assert(
      clampEditorLayout(broken).hierarchyWidth ===
        DEFAULT_EDITOR_LAYOUT.hierarchyWidth,
      "A non-finite layout value must fall back to the default",
    );
  }

  assert(
    loadEditorLayout({ assetsHeight: 10_000 }).assetsHeight ===
      EDITOR_LAYOUT_BOUNDS.assetsHeight.max,
    "A shell-supplied layout must still be clamped",
  );

  const stored = loadEditorLayout();
  assert(
    layoutKeys.every((key) => Number.isFinite(stored[key])),
    "Loading a layout without storage must still resolve finite sizes",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
