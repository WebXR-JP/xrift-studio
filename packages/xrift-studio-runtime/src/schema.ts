export const XRIFT_STUDIO_RUNTIME_FORMAT = "xrift-studio.runtime" as const;
export const XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION = "1.0.0" as const;

export type XriftRuntimeDiagnostic = {
  severity: "warning" | "error";
  code: string;
  message: string;
  entityId?: string;
  componentId?: string;
  assetId?: string;
};

export type XriftRuntimeTransform = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

export type XriftRuntimeGeometry =
  | {
      kind: "primitive";
      primitive: "box" | "sphere" | "cylinder" | "cone" | "plane";
    }
  | { kind: "model"; assetId: string };

export type XriftRuntimeMaterialBinding = {
  slot: string;
  materialAssetId: string;
};

export type XriftRuntimeComponent =
  | {
      id: string;
      type: "mesh";
      enabled: boolean;
      geometry: XriftRuntimeGeometry;
      materialBindings: XriftRuntimeMaterialBinding[];
      castShadow: boolean;
      receiveShadow: boolean;
      modelPose?: {
        bones: Record<string, [number, number, number]>;
        morphTargets: Record<string, number>;
      };
    }
  | {
      id: string;
      type: "light";
      enabled: boolean;
      lightType:
        | "ambient"
        | "directional"
        | "hemisphere"
        | "point"
        | "spot"
        | "rectArea";
      color: string;
      intensity: number;
      castShadow: boolean;
      groundColor?: string;
      distance?: number;
      decay?: number;
      angle?: number;
      penumbra?: number;
      width?: number;
      height?: number;
    }
  | {
      id: string;
      type: "collider";
      enabled: boolean;
      shape: "box" | "mesh";
      [key: string]: unknown;
    }
  | {
      id: string;
      type: "audio-source";
      enabled: boolean;
      audioAssetId?: string;
      volume: number;
      loop: boolean;
      autoplay: boolean;
      spatial: boolean;
      refDistance: number;
      rolloffFactor: number;
      maxDistance: number;
    }
  | {
      id: string;
      type: "particle-emitter";
      enabled: boolean;
      particleAssetId: string;
    }
  | {
      id: string;
      type: "spawn-point";
      enabled: boolean;
      target: "player" | "item-preview";
    }
  | {
      id: string;
      type: "xrift-component";
      enabled: boolean;
      schemaId: string;
      schemaVersion: string;
      properties: Record<string, unknown>;
      assetReferences: string[];
      entityReferences: string[];
    };

export type XriftRuntimeEntity = {
  id: string;
  name: string;
  parentId: string | null;
  children: string[];
  enabled: boolean;
  transform: XriftRuntimeTransform;
  components: XriftRuntimeComponent[];
};

export type XriftRuntimeScene = {
  id: string;
  name: string;
  rootEntityIds: string[];
  entities: Record<string, XriftRuntimeEntity>;
  settings?: Record<string, unknown>;
};

export type XriftRuntimeAsset =
  | {
      id: string;
      kind: "model";
      name: string;
      url: string;
      sourceFormat?: "glb" | "gltf" | "obj" | "vrm";
      scale: number;
      openBrush?: {
        renderer: "three-icosa";
        rendererVersion: string;
        extensionNames: string[];
        brushBaseUrl: string;
      };
      materialSlots: Array<{
        slot: string;
        name: string;
        sourceMaterialIndex?: number;
      }>;
    }
  | {
      id: string;
      kind: "texture";
      name: string;
      url: string;
      colorSpace: "auto" | "srgb" | "linear";
      flipY: boolean;
    }
  | {
      id: string;
      kind: "audio";
      name: string;
      url: string;
    }
  | {
      id: string;
      kind: "material";
      name: string;
      properties: Record<string, unknown>;
    }
  | {
      id: string;
      kind: "particle";
      name: string;
      properties: Record<string, unknown>;
    };

export type XriftRuntimeManifest = {
  format: typeof XRIFT_STUDIO_RUNTIME_FORMAT;
  schemaVersion: typeof XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION;
  generator: "xrift-studio";
  compilerVersion: string;
  projectId: string;
  projectKind: "world" | "item";
  entryScene: string;
  scenes: Record<string, XriftRuntimeScene>;
  assets: Record<string, XriftRuntimeAsset>;
};

export function isXriftRuntimeManifest(value: unknown): value is XriftRuntimeManifest {
  if (!isRecord(value)) return false;
  return (
    value.format === XRIFT_STUDIO_RUNTIME_FORMAT &&
    value.schemaVersion === XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION &&
    value.generator === "xrift-studio" &&
    (value.projectKind === "world" || value.projectKind === "item") &&
    typeof value.entryScene === "string" &&
    isRecord(value.scenes) &&
    isRecord(value.assets) &&
    isRecord(value.scenes[value.entryScene])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
