/** Persisted, executable geometry data. The fixed Blender runner never evaluates model-written code. */
export type BlenderModelPart = {
  id?: string;
  name: string;
  shape: "box" | "sphere" | "cylinder" | "cone" | "torus" | "mesh" | "tube" | "lathe" | "extrude";
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: [number, number, number, number];
  metallic: number;
  roughness: number;
  vertices?: [number, number, number][];
  faces?: number[][];
  bevel?: number;
  /** Extrude an XY profile symmetrically along Studio Z; scale multiplies local coordinates. */
  depth?: number;
  /** Translation in Studio axes; rotation and scale do not change the offset. Includes the first instance. */
  repeat?: { count: number; offset: [number, number, number] };
};
export type BlenderModelSpec = { name: string; parts: BlenderModelPart[] };
export type BlenderModelBrief = { name: string; brief: string };

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const scalar = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const vector = (value: unknown, size: number, min: number, max: number): value is number[] => Array.isArray(value) && value.length === size && value.every(number => scalar(number, min, max));
const name = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim()) && [...value].length <= 80 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);

export function parseBlenderModelBrief(value: unknown): BlenderModelBrief {
  if (!record(value) || Object.keys(value).some(key => !["name", "brief"].includes(key)) || !name(value.name)
    || typeof value.brief !== "string" || !value.brief.trim() || [...value.brief].length > 1600 || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value.brief)) {
    throw new Error("モデルの制作内容を確認できませんでした。形や寸法を指定して再試行してください");
  }
  return { name: value.name, brief: value.brief };
}

export function parseBlenderModel(value: unknown): BlenderModelSpec | BlenderModelBrief {
  return record(value) && "brief" in value ? parseBlenderModelBrief(value) : parseBlenderModelSpec(value);
}

function simpleExtrudeProfile(vertices: number[][]): boolean {
  const epsilon = 1e-10;
  const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const on = (a: number[], b: number[], p: number[]) => p[0] >= Math.min(a[0], b[0]) - epsilon && p[0] <= Math.max(a[0], b[0]) + epsilon
    && p[1] >= Math.min(a[1], b[1]) - epsilon && p[1] <= Math.max(a[1], b[1]) + epsilon;
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    area += a[0] * b[1] - b[0] * a[1];
    for (let j = i + 1; j < vertices.length; j++) {
      const c = vertices[j];
      if (Math.abs(a[0] - c[0]) <= epsilon && Math.abs(a[1] - c[1]) <= epsilon) return false;
      if (j === i + 1 || (i === 0 && j === vertices.length - 1)) continue;
      const d = vertices[(j + 1) % vertices.length];
      const ac = cross(a, b, c), ad = cross(a, b, d), ca = cross(c, d, a), cb = cross(c, d, b);
      if ((ac * ad < 0 && ca * cb < 0) || (Math.abs(ac) <= epsilon && on(a, b, c)) || (Math.abs(ad) <= epsilon && on(a, b, d))
        || (Math.abs(ca) <= epsilon && on(c, d, a)) || (Math.abs(cb) <= epsilon && on(c, d, b))) return false;
    }
  }
  return Math.abs(area) > epsilon;
}

/** Validate and give legacy parts collision-free stable IDs before persisting their source. */
export function parseBlenderModelSpec(value: unknown): BlenderModelSpec {
  if (!record(value) || Object.keys(value).some(key => !["name", "parts"].includes(key)) || !name(value.name)
    || !Array.isArray(value.parts) || !value.parts.length || value.parts.length > 64) {
    throw new Error("モデル名と1〜64個のパーツを指定してください");
  }
  const reservedIds = new Set<string>();
  for (const [index, raw] of value.parts.entries()) {
    if (!record(raw) || raw.id == null) continue;
    if (!validId(raw.id)) throw new Error(`parts[${index}].id: 英数字で始まる1〜64文字の英数字・_・-を指定してください`);
    if (reservedIds.has(raw.id)) throw new Error(`parts[${index}].id: ${raw.id}が重複しています`);
    reservedIds.add(raw.id);
  }
  let instances = 0;
  const parts = value.parts.map((raw, index) => {
    if (!record(raw) || Object.keys(raw).some(key => !["id", "name", "shape", "position", "rotation", "scale", "color", "metallic", "roughness", "vertices", "faces", "bevel", "depth", "repeat"].includes(key))) {
      throw new Error(`parts[${index}]: 対応する形状データを指定してください`);
    }
    const part = { ...raw };
    for (const key of ["id", "vertices", "faces", "bevel", "depth", "repeat"]) if (part[key] === null) delete part[key];
    if (!name(part.name)) throw new Error(`parts[${index}].name: 1〜80文字の名前を指定し、制御文字を除いてください`);
    const label = `parts[${index}]（${part.name}）${part.id ? ` id=${part.id}` : ""}`;
    const invalid = (field: string, detail: string): never => { throw new Error(`${label}.${field}: ${detail}`); };
    if (!["box", "sphere", "cylinder", "cone", "torus", "mesh", "tube", "lathe", "extrude"].includes(String(part.shape))) invalid("shape", "対応する形状を指定してください");
    for (const [field, size, min, max] of [["position", 3, -50, 50], ["rotation", 3, -360, 360], ["scale", 3, 0.02, 50], ["color", 4, 0, 1]] as const) {
      if (!vector(part[field], size, min, max)) invalid(field, `有限の${min}〜${max}の値を${size}個指定してください`);
    }
    for (const field of ["metallic", "roughness"] as const) if (!scalar(part[field], 0, 1)) invalid(field, "有限の0〜1の値を指定してください");
    if (part.bevel !== undefined && !scalar(part.bevel, 0, 1)) invalid("bevel", "有限の0〜1mの値を指定してください");
    if (part.shape !== "extrude" && part.depth !== undefined) invalid("depth", "depthはextrudeだけに指定し、他の形状ではnullにしてください");
    let count = 1;
    if (part.repeat !== undefined) {
      if (!record(part.repeat) || Object.keys(part.repeat).some(key => !["count", "offset"].includes(key))) invalid("repeat", "countとoffsetを指定してください");
      const repeat = part.repeat as Record<string, unknown>;
      if (!scalar(repeat.count, 1, 32) || !Number.isInteger(repeat.count)) invalid("repeat.count", "1〜32の整数を指定してください");
      if (!vector(repeat.offset, 3, -50, 50)) invalid("repeat.offset", "各軸に有限の-50〜50mの値を指定してください");
      count = repeat.count as number;
      const position = part.position as number[], offset = repeat.offset as number[];
      if (position.some((v, axis) => !scalar(v + (count - 1) * offset[axis], -50, 50))) invalid("repeat.offset", "展開後のpositionを各軸-50〜50mにしてください");
    }
    instances += count;
    if (instances > 256) invalid("repeat.count", "モデル全体の展開後のパーツ数を256個以内にしてください");
    if (part.shape === "mesh") {
      if (!Array.isArray(part.vertices) || part.vertices.length < 3 || part.vertices.length > 2048 || !part.vertices.every(vertex => vector(vertex, 3, -50, 50))) invalid("vertices", "meshには-50〜50mの頂点を3〜2048個指定してください");
      const vertices = part.vertices as number[][];
      if (!Array.isArray(part.faces) || !part.faces.length || part.faces.length > 4096 || !part.faces.every(face => Array.isArray(face) && face.length >= 3 && face.length <= 64
        && face.every(index => Number.isInteger(index) && index >= 0 && index < vertices.length))) invalid("faces", `各面に3〜64個の頂点番号（0〜${vertices.length - 1}）を指定し、面を4096個以内にしてください`);
    } else if (part.shape === "tube" || part.shape === "lathe") {
      if (!Array.isArray(part.vertices) || part.vertices.length < 2 || part.vertices.length > 128 || !part.vertices.every(vertex => vector(vertex, 3, -50, 50))) invalid("vertices", "-50〜50mの点を2〜128個指定してください");
      if (part.faces !== undefined) invalid("faces", "tube/latheではnullにしてください");
      if (part.shape === "tube" && !scalar(part.bevel, 0.001, 1)) invalid("bevel", "tubeの半径を0.001〜1mで指定してください");
      if (part.shape === "lathe" && !(part.vertices as number[][]).every(vertex => vertex[0] >= 0 && vertex[2] === 0)) invalid("vertices", "latheの点は[0以上の半径, 高さ, 0]で指定してください");
    } else if (part.shape === "extrude") {
      if (!scalar(part.depth, 0.001, 50)) invalid("depth", "押し出す厚みを0.001〜50mで指定してください");
      if (!Array.isArray(part.vertices) || part.vertices.length < 3 || part.vertices.length > 128 || !part.vertices.every(vertex => vector(vertex, 3, -50, 50) && vertex[2] === 0)) invalid("vertices", "輪郭は3〜128個の[x,y,0]で指定し、各値を-50〜50mにしてください");
      if (part.faces !== undefined) invalid("faces", "extrudeではnullにしてください");
      if (!simpleExtrudeProfile(part.vertices as number[][])) invalid("vertices", "輪郭の重複点・自己交差・面積0を除いてください。閉じる始点の再記載は不要です");
    } else if (part.vertices !== undefined || part.faces !== undefined) invalid("vertices/faces", "この形状ではnullにしてください");
    if (part.id === undefined) {
      let suffix = index + 1;
      do { part.id = `part-${String(suffix++).padStart(3, "0")}`; } while (reservedIds.has(part.id as string));
      reservedIds.add(part.id as string);
    }
    // JSON geometry owns its arrays, so subsequent edits cannot mutate the supplied revision.
    return structuredClone(part) as BlenderModelPart;
  });
  return { name: value.name, parts };
}
