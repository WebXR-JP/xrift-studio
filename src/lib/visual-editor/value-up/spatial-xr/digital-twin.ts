import { buildSpatialConversionPlan } from "./semantic-conversion";
import type { SpatialCaptureDocument } from "./spatial-capture";

export type DigitalTwinStyle = {
  id: string;
  name: string;
  materialBySemantic?: Record<string, string>;
  prefabStyleTags?: string[];
  hideSemantics?: string[];
  keepRoomGeometry?: boolean;
};

export type DigitalTwinPlan = {
  captureId: string;
  sourceSurfaceCount: number;
  keepRoomGeometry: boolean;
  replacements: Array<{
    surfaceId: string;
    semanticLabel: string;
    materialAssetId?: string;
    prefabStyleTags: string[];
    hidden: boolean;
  }>;
};

export function createDigitalTwinPlan(capture: SpatialCaptureDocument, style: DigitalTwinStyle): DigitalTwinPlan {
  const hidden = new Set((style.hideSemantics ?? []).map((value) => value.toLowerCase()));
  const actions = buildSpatialConversionPlan(capture);
  return {
    captureId: capture.captureId,
    sourceSurfaceCount: capture.surfaces.length,
    keepRoomGeometry: style.keepRoomGeometry !== false,
    replacements: actions.map((action) => ({
      surfaceId: action.sourceSurfaceId,
      semanticLabel: action.semanticLabel,
      materialAssetId: style.materialBySemantic?.[action.semanticLabel],
      prefabStyleTags: [...(style.prefabStyleTags ?? [])],
      hidden: hidden.has(action.semanticLabel),
    })),
  };
}
