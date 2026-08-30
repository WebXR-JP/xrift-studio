import {
  AUTOMATIC_TEXT_FONT_ID,
  TEXT_FONT_CATALOG,
  TEXT_FONT_DIRECTORY,
  getTextFontDefinition,
  resolveTextFontUrl,
  resolveTextFontWeight,
  textFontWeightOptions,
} from "./text-font-catalog.js";
import {
  DEFAULT_TEXT_BACKGROUND,
  resolveTextPanelPlate,
  type XriftTextBackground,
} from "./text-panel-layout.js";

/** Assertions for the Text font catalog and the background plate layout. */
export function runTextPanelFixtureAssertions(): void {
  assertFontCatalogResolvesPinnedFiles();
  assertPlateFitsMeasuredText();
  assertFixedPlateFollowsAnchor();
}

function assertFontCatalogResolvesPinnedFiles(): void {
  assert(TEXT_FONT_CATALOG.length > 0, "the font catalog must not be empty");

  const ids = new Set<string>();
  for (const font of TEXT_FONT_CATALOG) {
    assert(!ids.has(font.id), `duplicate font id in the catalog: ${font.id}`);
    ids.add(font.id);
    assert(
      font.weights.length > 0,
      `${font.id} must publish at least one weight`,
    );
    assert(
      font.id !== AUTOMATIC_TEXT_FONT_ID,
      "no catalog entry may shadow the automatic font id",
    );
    // troika rejects WOFF2 outright, so a catalog entry that resolved to one
    // would render nothing at all rather than falling back.
    const url = resolveTextFontUrl(font.id);
    assert(
      url?.endsWith(".woff") === true,
      `${font.id} must resolve to a WOFF 1.0 file, got ${url ?? "(none)"}`,
    );
    // The whole point of bundling: a world that reaches off-origin for its
    // font is rejected by the platform's security check, and the permission
    // that would allow it cannot be narrowed to a host.
    assert(
      url?.includes("://") === false,
      `${font.id} must resolve to a bundled file, got ${url ?? "(none)"}`,
    );
    assert(
      url?.includes(TEXT_FONT_DIRECTORY) === true,
      `${font.id} must resolve inside ${TEXT_FONT_DIRECTORY}`,
    );
  }

  assert(
    resolveTextFontUrl(undefined) === undefined &&
      resolveTextFontUrl(AUTOMATIC_TEXT_FONT_ID) === undefined,
    "the automatic font must resolve to no explicit file",
  );
  assert(
    resolveTextFontUrl("not-a-real-family") === undefined,
    "an unknown font id must not produce a URL",
  );

  const notoSansJp = getTextFontDefinition("noto-sans-jp");
  assert(notoSansJp !== undefined, "noto-sans-jp must stay in the catalog");
  assert(
    resolveTextFontUrl("noto-sans-jp", 700) ===
      `/${TEXT_FONT_DIRECTORY}/noto-sans-jp-japanese-700-normal.woff`,
    "a weighted Japanese font must resolve to its bundled file",
  );
  // A published world is served under a base XRift decides at load time, so the
  // same catalog has to answer for a host that is not Studio.
  assert(
    resolveTextFontUrl("noto-sans-jp", 400, "https://worlds.example.test/w/1/") ===
      `https://worlds.example.test/w/1/${TEXT_FONT_DIRECTORY}/noto-sans-jp-japanese-400-normal.woff`,
    "a published world must resolve the font under its own base",
  );
  assert(
    resolveTextFontUrl("noto-sans-jp", 400, "https://worlds.example.test/w/1") ===
      resolveTextFontUrl("noto-sans-jp", 400, "https://worlds.example.test/w/1/"),
    "a base without a trailing slash must not lose a path segment",
  );

  // A weight the family never published must snap rather than request a file
  // that is not there, which troika would never recover from.
  assert(
    resolveTextFontWeight(notoSansJp, 900) === 700 &&
      resolveTextFontWeight(notoSansJp, 100) === 400,
    "a weight the family does not publish must snap to one it does",
  );
  assert(
    textFontWeightOptions("noto-sans-jp").length === notoSansJp.weights.length,
    "the picker must only offer weights the family publishes",
  );
  assert(
    textFontWeightOptions(AUTOMATIC_TEXT_FONT_ID).length === 2,
    "the automatic font must still offer regular and bold",
  );
}

function assertPlateFitsMeasuredText(): void {
  const background: XriftTextBackground = {
    ...DEFAULT_TEXT_BACKGROUND,
    mode: "color",
    paddingX: 0.1,
    paddingY: 0.05,
  };

  assert(
    resolveTextPanelPlate(DEFAULT_TEXT_BACKGROUND, [0, 0, 1, 1], "center", "middle") ===
      null,
    "a background of mode none must not produce a plate",
  );
  assert(
    resolveTextPanelPlate(background, null, "center", "middle") === null,
    "a text-fitted plate must wait for troika's measured bounds",
  );

  const plate = resolveTextPanelPlate(
    background,
    [-0.5, -0.2, 0.5, 0.2],
    "center",
    "middle",
  );
  assert(plate !== null, "measured bounds must produce a plate");
  assert(
    Math.abs(plate.width - 1.2) < 1e-9 && Math.abs(plate.height - 0.5) < 1e-9,
    "the plate must be the measured block grown by the padding",
  );
  assert(
    plate.centerX === 0 && plate.centerY === 0,
    "a centred block must produce a centred plate",
  );

  // Anchoring shifts troika's own bounds, so the plate follows without any
  // extra anchor maths in the fitted case.
  const anchored = resolveTextPanelPlate(
    background,
    [0, -0.4, 2, 0],
    "left",
    "top",
  );
  assert(anchored !== null, "anchored bounds must produce a plate");
  assert(
    Math.abs(anchored.centerX - 1) < 1e-9 &&
      Math.abs(anchored.centerY + 0.2) < 1e-9,
    "the fitted plate must centre on the measured block, not the origin",
  );
}

function assertFixedPlateFollowsAnchor(): void {
  const background: XriftTextBackground = {
    ...DEFAULT_TEXT_BACKGROUND,
    mode: "color",
    fit: "fixed",
    width: 2,
    height: 1,
  };

  const centered = resolveTextPanelPlate(background, null, "center", "middle");
  assert(
    centered?.centerX === 0 && centered.centerY === 0,
    "a fixed plate anchored centre/middle must sit on the origin",
  );

  const topLeft = resolveTextPanelPlate(background, null, "left", "top");
  assert(
    topLeft?.centerX === 1 && topLeft.centerY === -0.5,
    "a fixed plate must hang from the Text's anchor corner",
  );

  const bottomRight = resolveTextPanelPlate(background, null, "right", "bottom");
  assert(
    bottomRight?.centerX === -1 && bottomRight.centerY === 0.5,
    "a fixed plate must mirror for the opposite anchor corner",
  );

  const degenerate = resolveTextPanelPlate(
    { ...background, width: 0, height: -1 },
    null,
    "center",
    "middle",
  );
  assert(
    degenerate !== null && degenerate.width > 0 && degenerate.height > 0,
    "a zero or negative size must still produce drawable geometry",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
