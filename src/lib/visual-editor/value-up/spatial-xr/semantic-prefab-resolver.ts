import { normalizeSpatialSemanticLabel, type SpatialSurface } from "./spatial-capture";

export type SemanticPrefabCandidate = {
  id: string;
  name: string;
  semanticLabels: string[];
  nominalSize?: [number, number, number];
  styleTags?: string[];
};

export type RankedSemanticPrefab = SemanticPrefabCandidate & {
  score: number;
  reasons: string[];
};

function surfaceSize(surface: SpatialSurface): [number, number, number] | null {
  if (!surface.bounds) return null;
  return [
    Math.max(0.01, surface.bounds.max[0] - surface.bounds.min[0]),
    Math.max(0.01, surface.bounds.max[1] - surface.bounds.min[1]),
    Math.max(0.01, surface.bounds.max[2] - surface.bounds.min[2]),
  ];
}

function sizeSimilarity(left: [number, number, number], right: [number, number, number]): number {
  const ratios = left.map((value, index) => Math.min(value, right[index]!) / Math.max(value, right[index]!));
  return ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
}

export function rankSemanticPrefabs(
  surface: SpatialSurface,
  candidates: readonly SemanticPrefabCandidate[],
  options: { styleTags?: readonly string[] } = {},
): RankedSemanticPrefab[] {
  const label = String(normalizeSpatialSemanticLabel(surface.semanticLabel));
  const dimensions = surfaceSize(surface);
  const requestedStyles = new Set((options.styleTags ?? []).map((tag) => tag.toLowerCase()));

  return candidates.filter(candidate => candidate.semanticLabels.some(value => normalizeSpatialSemanticLabel(value) === label)).map((candidate) => {
    let score = 0;
    const reasons: string[] = [];
    const labels = candidate.semanticLabels.map((value) => String(normalizeSpatialSemanticLabel(value)));
    if (labels.includes(label)) {
      score += 70;
      reasons.push(`semantic:${label}`);
    }
    if (dimensions && candidate.nominalSize) {
      const similarity = sizeSimilarity(dimensions, candidate.nominalSize);
      score += similarity * 20;
      reasons.push(`size:${Math.round(similarity * 100)}%`);
    }
    if (requestedStyles.size && candidate.styleTags?.length) {
      const matches = candidate.styleTags.filter((tag) => requestedStyles.has(tag.toLowerCase())).length;
      const styleScore = Math.min(10, matches * 5);
      score += styleScore;
      if (matches) reasons.push(`style:${matches}`);
    }
    return { ...candidate, score: Math.round(score * 10) / 10, reasons };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** Candidates bundled with XRift Studio for every currently documented Meta Scene semantic label. */
export async function bundledSpatialSemanticCandidates(): Promise<readonly SemanticPrefabCandidate[]> {
  const module = await import("./semantic-sample-models");
  return module.SPATIAL_SEMANTIC_SAMPLE_MODELS;
}
