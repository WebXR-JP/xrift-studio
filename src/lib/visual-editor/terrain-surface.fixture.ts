import {
  TERRAIN_SURFACE_CATALOG,
  fitTerrainSurfaceToRange,
  getTerrainSurfacePreset,
} from "./terrain-surface-catalog";
import { validateClassicR3fMaterialShader } from "./custom-shader-contract";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/**
 * Terrain surface presets.
 *
 * The blend is pure arithmetic over height and slope, so it can be evaluated
 * here rather than inspected by eye. What the fixture pins is the behaviour an
 * author relies on: bands appear where the thresholds say, steep ground turns
 * to rock, and softness controls the width of the crossing rather than moving
 * where it happens.
 */
export function runTerrainSurfaceFixtureAssertions(): void {
  assertCatalogShape();
  assertBandBehaviour();
  assertSlopeBehaviour();
  assertRangeFitting();
}

/**
 * Fitting a preset to a Terrain must leave all three height bands usable.
 *
 * The failure this pins is subtle and looked like a broken shader: scaling the
 * softness by the elevation range alone let it grow wider than the gap between
 * the two edges, so both bands were part-open everywhere, the middle colour
 * never reached full strength, and a green preset rendered as flat grey.
 */
function assertRangeFitting(): void {
  for (const entry of TERRAIN_SURFACE_CATALOG) {
    // Ranges from a nearly flat field to a tall mountain.
    for (const range of [
      { min: 0, max: 2 },
      { min: -0.3, max: 0.87 },
      { min: -23.24, max: 12.82 },
      { min: 0, max: 120 },
    ]) {
      const values = fitTerrainSurfaceToRange(entry, range);
      const low = Number(values.uLowHeight);
      const high = Number(values.uHighHeight);
      const softness = Number(values.uBlendSoftness);
      assert(
        low > range.min && high < range.max && low < high,
        `${entry.id} の境界が高さの範囲(${range.min}..${range.max})の内側にありません`,
      );
      // The decisive property: somewhere between the edges, the low band is
      // fully open while the high one is still fully closed. That window is
      // where the middle colour is actually visible.
      const middle = (low + high) / 2;
      assert(
        band(middle, low, softness) > 0.999,
        `${entry.id} は範囲 ${range.min}..${range.max} で中間の色が出きりません`,
      );
      assert(
        band(middle, high, softness) < 0.001,
        `${entry.id} は範囲 ${range.min}..${range.max} で高い色が中腹まで降りてきています`,
      );
    }
  }
}

function assertCatalogShape(): void {
  assert(TERRAIN_SURFACE_CATALOG.length >= 3, "表面プリセットが不足しています");
  const ids = new Set<string>();
  for (const entry of TERRAIN_SURFACE_CATALOG) {
    assert(!ids.has(entry.id), `表面プリセットのidが重複しています: ${entry.id}`);
    ids.add(entry.id);

    const errors = validateClassicR3fMaterialShader(entry.shader);
    assert(
      errors.length === 0,
      `表面プリセット ${entry.id} がShader契約に反しています: ${errors.join(", ")}`,
    );

    // Every declared parameter must address a uniform the shader actually has,
    // or the Inspector shows a control that changes nothing.
    for (const parameter of entry.parameters) {
      assert(
        parameter.uniform in entry.shader.uniforms,
        `${entry.id} のパラメータ ${parameter.uniform} に対応するuniformがありません`,
      );
    }
    // And the GLSL must declare it too: a uniform present only in the envelope
    // is silently dropped at compile time.
    for (const uniform of Object.keys(entry.shader.uniforms)) {
      assert(
        entry.shader.fragmentShader.includes(`uniform`) &&
          entry.shader.fragmentShader.includes(uniform),
        `${entry.id} のGLSLがuniform ${uniform} を宣言していません`,
      );
    }
    assert(
      !/\bfloat\s+half\b/.test(entry.shader.fragmentShader),
      `${entry.id} のGLSLが予約語 half を変数名に使っています`,
    );
  }
  assert(
    getTerrainSurfacePreset("meadow-slopes") !== undefined,
    "既定の表面プリセットが引けません",
  );
}

/** A CPU mirror of the shader's band function, used only to pin behaviour. */
function band(value: number, edge: number, softness: number): number {
  const reach = Math.max(softness, 0.0001) * 0.5;
  const low = edge - reach;
  const high = edge + reach;
  const t = Math.min(Math.max((value - low) / (high - low), 0), 1);
  return t * t * (3 - 2 * t);
}

function assertBandBehaviour(): void {
  const lowEdge = 2;
  const highEdge = 10;
  const softness = 4;

  // Below the low edge is entirely the low band; above the high edge is
  // entirely the high one. Anything else means a preset's colours bleed into
  // heights the author did not assign them to.
  assert(
    band(lowEdge - softness, lowEdge, softness) === 0,
    "境界より十分下でも低い色が終わっていません",
  );
  assert(
    band(highEdge + softness, highEdge, softness) === 1,
    "境界より十分上でも高い色になりきっていません",
  );
  // The midpoint of a band is exactly half regardless of softness: softness
  // widens the crossing, it does not move it.
  for (const width of [0.5, 4, 20]) {
    assert(
      Math.abs(band(lowEdge, lowEdge, width) - 0.5) < 1e-9,
      `ぼかし ${width} で境界の位置がずれています`,
    );
  }
  // A wider softness must reach further, or the control does nothing visible.
  const probe = lowEdge + 1;
  assert(
    band(probe, lowEdge, 8) < band(probe, lowEdge, 1),
    "ぼかしを広げても混ざり方が変わっていません",
  );
  // Hard edge: a softness of zero must not produce a gradient.
  assert(
    band(lowEdge + 0.01, lowEdge, 0) === 1 &&
      band(lowEdge - 0.01, lowEdge, 0) === 0,
    "ぼかし0でも境界が硬くなっていません",
  );
}

function assertSlopeBehaviour(): void {
  const preset = getTerrainSurfacePreset("alpine-snow");
  assert(preset !== undefined, "alpine-snow が見つかりません");
  if (!preset) return;
  const start = preset.shader.uniforms.uSlopeStart;
  const blend = preset.shader.uniforms.uSlopeBlend;
  assert(
    start?.kind === "number" && blend?.kind === "number",
    "傾斜のuniformが数値ではありません",
  );
  if (start?.kind !== "number" || blend?.kind !== "number") return;

  // Flat ground (normal.y = 1) has slope 0 and must never read as rock.
  assert(
    band(0, start.value, blend.value) === 0,
    "平らな面にも急斜面の色が出ています",
  );
  // A wall (normal.y = 0) has slope 1 and must be fully rock.
  assert(
    band(1, start.value, blend.value) === 1,
    "垂直な面が急斜面の色になりきっていません",
  );
  // And the threshold has to sit between them, or the control is meaningless.
  assert(
    start.value > 0 && start.value < 1,
    "急斜面の始まりが0と1の間にありません",
  );
}
