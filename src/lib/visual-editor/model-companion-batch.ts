/**
 * Groups a single import batch so that a `.gltf` or `.obj` selected together
 * with its sidecar files is normalized as one self-contained Model instead of
 * failing on `gltf-external-dependency` and importing the sidecars as unrelated
 * Texture Assets.
 *
 * The grouping is decided from the model source text only. A file is consumed
 * as a companion when the model actually references it, so an unrelated image
 * dropped in the same batch still becomes a standalone Texture Asset.
 */

/** A file offered to the import queue, before any Asset kind is decided. */
export type ModelCompanionBatchFile = {
  /**
   * Path as dropped. `webkitRelativePath` when a folder was dropped, otherwise
   * the plain file name.
   */
  path: string;
  /** Reads the file as UTF-8. Only called for model and MTL sources. */
  readText: () => Promise<string>;
};

export type ModelCompanionBatchPlan = {
  /** Companion paths keyed by the model path that references them. */
  companionsByModelPath: Readonly<Record<string, readonly string[]>>;
  /** Paths consumed as a companion, which must not be imported standalone. */
  consumedPaths: readonly string[];
};

const EMPTY_PLAN: ModelCompanionBatchPlan = {
  companionsByModelPath: {},
  consumedPaths: [],
};

/** Formats whose source can reference sibling files instead of embedding them. */
const COMPANION_AWARE_EXTENSIONS = new Set(["gltf", "obj"]);

/**
 * Normalizes a dropped path or a source URI to the same lookup shape used by
 * `three-model-converter`'s resource resolver, so a plan built here resolves
 * during conversion.
 */
export function normalizeCompanionPath(value: string): string {
  let normalized = value.replace(/\\/g, "/").split(/[?#]/, 1)[0] ?? "";
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep malformed source text so the lookup fails deterministically.
  }
  return normalized.replace(/^(?:\.\.\/|\.\/|\/)+/, "").normalize("NFC");
}

function extensionOf(path: string): string {
  const name = normalizeCompanionPath(path).split("/").pop() ?? "";
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index + 1).toLowerCase();
}

function directoryOf(path: string): string {
  const normalized = normalizeCompanionPath(path);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "" : normalized.slice(0, index + 1);
}

/** Resolves a source URI against the model's own directory. */
function resolveAgainst(directory: string, uri: string): string {
  const normalizedUri = normalizeCompanionPath(uri);
  if (!normalizedUri) return "";
  const segments = `${directory}${normalizedUri}`.split("/");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join("/");
}

/**
 * Matches a requested path against the batch. Falls back to a trailing-segment
 * match so a model exported with a deeper URI prefix than the dropped folder
 * still resolves, which is the same tolerance the converter applies.
 */
function findInBatch(
  candidates: ReadonlyMap<string, string>,
  requested: string,
): string | undefined {
  if (!requested) return undefined;
  const lookup = requested.toLowerCase();
  const direct = candidates.get(lookup);
  if (direct) return direct;
  for (const [candidate, path] of candidates) {
    if (candidate.endsWith(`/${lookup}`) || lookup.endsWith(`/${candidate}`)) {
      return path;
    }
  }
  return undefined;
}

/** Collects non-embedded `buffers[].uri` and `images[].uri` from glTF JSON. */
export function collectGltfCompanionUris(source: string): string[] {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    return [];
  }
  if (!json || typeof json !== "object") return [];
  const uris: string[] = [];
  for (const key of ["buffers", "images"] as const) {
    const entries = (json as Record<string, unknown>)[key];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const uri = (entry as { uri?: unknown }).uri;
      if (typeof uri !== "string") continue;
      const trimmed = uri.trim();
      if (!trimmed || trimmed.toLowerCase().startsWith("data:")) continue;
      uris.push(trimmed);
    }
  }
  return uris;
}

/** Collects `mtllib` names from an OBJ source. */
export function collectObjMaterialLibraries(source: string): string[] {
  const libraries: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*mtllib\s+(.+?)\s*$/i.exec(line);
    if (!match) continue;
    // A single mtllib line may list several libraries.
    for (const name of match[1].split(/\s+/)) {
      if (name) libraries.push(name);
    }
  }
  return libraries;
}

/** Collects texture map paths from an MTL source. */
export function collectMtlTexturePaths(source: string): string[] {
  const paths: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*(map_\w+|bump|disp|decal|refl)\s+(.+?)\s*$/i.exec(line);
    if (!match) continue;
    // Drop MTL option flags such as `-s 1 1 1` and keep the trailing path.
    const tokens = match[2].split(/\s+/);
    const path: string[] = [];
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token.startsWith("-")) {
        // Options take a variable number of values; skip until the next option
        // or the final token run, which is the path.
        continue;
      }
      path.push(token);
    }
    const candidate = path[path.length - 1];
    if (candidate) paths.push(candidate);
  }
  return paths;
}

/**
 * Builds the companion grouping for one import batch. Reads only the model and
 * MTL sources, never the referenced binaries.
 */
export async function planModelCompanionBatch(
  files: readonly ModelCompanionBatchFile[],
): Promise<ModelCompanionBatchPlan> {
  const models = files.filter((file) =>
    COMPANION_AWARE_EXTENSIONS.has(extensionOf(file.path)),
  );
  if (models.length === 0 || files.length < 2) return EMPTY_PLAN;

  const modelPaths = new Set(
    files
      .filter((file) => COMPANION_AWARE_EXTENSIONS.has(extensionOf(file.path)))
      .map((file) => normalizeCompanionPath(file.path).toLowerCase()),
  );
  const candidates = new Map<string, string>();
  for (const file of files) {
    const normalized = normalizeCompanionPath(file.path).toLowerCase();
    // A companion-aware model is never consumed as another model's sidecar.
    if (modelPaths.has(normalized)) continue;
    if (!candidates.has(normalized)) candidates.set(normalized, file.path);
  }
  if (candidates.size === 0) return EMPTY_PLAN;

  const byPath = new Map(
    files.map((file) => [
      normalizeCompanionPath(file.path).toLowerCase(),
      file,
    ]),
  );
  const companionsByModelPath: Record<string, string[]> = {};
  const consumedPaths = new Set<string>();

  for (const model of models) {
    const directory = directoryOf(model.path);
    const companions = new Set<string>();
    const requested: string[] = [];

    let source: string;
    try {
      source = await model.readText();
    } catch {
      continue;
    }

    if (extensionOf(model.path) === "gltf") {
      requested.push(...collectGltfCompanionUris(source));
    } else {
      const libraries = collectObjMaterialLibraries(source);
      requested.push(...libraries);
      for (const library of libraries) {
        const resolved = findInBatch(
          candidates,
          resolveAgainst(directory, library),
        );
        if (!resolved) continue;
        const mtl = byPath.get(normalizeCompanionPath(resolved).toLowerCase());
        if (!mtl) continue;
        let mtlSource: string;
        try {
          mtlSource = await mtl.readText();
        } catch {
          continue;
        }
        // MTL texture paths are relative to the MTL, not to the OBJ.
        const mtlDirectory = directoryOf(resolved);
        for (const texture of collectMtlTexturePaths(mtlSource)) {
          const match = findInBatch(
            candidates,
            resolveAgainst(mtlDirectory, texture),
          );
          if (match) companions.add(match);
        }
      }
    }

    for (const uri of requested) {
      const match = findInBatch(candidates, resolveAgainst(directory, uri));
      if (match) companions.add(match);
    }

    if (companions.size === 0) continue;
    companionsByModelPath[model.path] = [...companions];
    for (const companion of companions) consumedPaths.add(companion);
  }

  if (consumedPaths.size === 0) return EMPTY_PLAN;
  return {
    companionsByModelPath,
    consumedPaths: [...consumedPaths],
  };
}
