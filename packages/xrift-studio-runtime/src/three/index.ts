import {
  AmbientLight,
  AnimationClip,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Light,
  LoadingManager,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  RectAreaLight,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

import {
  isXriftRuntimeManifest,
  type XriftRuntimeAsset,
  type XriftRuntimeComponent,
  type XriftRuntimeDiagnostic,
  type XriftRuntimeEntity,
  type XriftRuntimeManifest,
} from "../schema.js";

export type XriftLoadResult = {
  root: Group;
  animations: AnimationClip[];
  entities: Map<string, Object3D>;
  diagnostics: XriftRuntimeDiagnostic[];
  manifest: XriftRuntimeManifest;
};

export type XriftThreeLoaderOptions = {
  assetBaseUrl?: string;
  manager?: LoadingManager;
};

type LoadedModel = { root: Object3D; animations: AnimationClip[] };

export class XriftThreeLoader {
  readonly assetBaseUrl?: string;
  readonly manager: LoadingManager;

  constructor(options: XriftThreeLoaderOptions = {}) {
    this.assetBaseUrl = options.assetBaseUrl;
    this.manager = options.manager ?? new LoadingManager();
  }

  async load(input: string | URL | XriftRuntimeManifest): Promise<XriftLoadResult> {
    if (typeof input !== "string" && !(input instanceof URL)) {
      return this.parse(input);
    }
    const manifestUrl = resolveUrl(String(input));
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      throw new Error(
        `xrift-studio runtime manifest could not be loaded (${response.status})`,
      );
    }
    const manifest: unknown = await response.json();
    return this.parse(manifest, manifestUrl);
  }

  async parse(
    input: unknown,
    manifestUrl?: string | URL,
  ): Promise<XriftLoadResult> {
    if (!isXriftRuntimeManifest(input)) {
      throw new Error("Unsupported xrift-studio runtime manifest");
    }
    const manifest = input;
    const entryScene = manifest.scenes[manifest.entryScene];
    if (!entryScene) throw new Error("Runtime entry scene is missing");
    const diagnostics: XriftRuntimeDiagnostic[] = [];
    const assetBase = this.resolveAssetBase(manifestUrl);
    const assets = Object.values(manifest.assets);
    const modelAssets = assets.filter(
      (asset): asset is Extract<XriftRuntimeAsset, { kind: "model" }> =>
        asset.kind === "model",
    );
    const textureAssets = assets.filter(
      (asset): asset is Extract<XriftRuntimeAsset, { kind: "texture" }> =>
        asset.kind === "texture",
    );
    const [modelEntries, textureEntries] = await Promise.all([
      Promise.all(
        modelAssets.map(async (asset) => [
          asset.id,
          await this.loadModel(asset, assetBase),
        ] as const),
      ),
      Promise.all(
        textureAssets.map(async (asset) => [
          asset.id,
          await this.loadTexture(asset, assetBase),
        ] as const),
      ),
    ]);
    const models = new Map(modelEntries);
    const textures = new Map(textureEntries);
    const materials = this.createMaterials(manifest, textures, diagnostics);
    const entities = new Map<string, Object3D>();
    const animations: AnimationClip[] = [];

    for (const entity of Object.values(entryScene.entities)) {
      const group = new Group();
      group.name = entity.name;
      group.visible = entity.enabled;
      group.userData.xriftStudioEntityId = entity.id;
      group.position.fromArray(entity.transform.position);
      group.rotation.fromArray([...entity.transform.rotation, "XYZ"]);
      group.scale.fromArray(entity.transform.scale);
      entities.set(entity.id, group);
    }
    for (const entity of Object.values(entryScene.entities)) {
      const group = entities.get(entity.id);
      if (!group) continue;
      const parent = entity.parentId ? entities.get(entity.parentId) : undefined;
      (parent ?? null)?.add(group);
    }

    const root = new Group();
    root.name = entryScene.name;
    root.userData.xriftStudioSceneId = entryScene.id;
    for (const rootId of entryScene.rootEntityIds) {
      const entity = entities.get(rootId);
      if (entity) root.add(entity);
    }
    for (const entity of Object.values(entryScene.entities)) {
      const group = entities.get(entity.id);
      if (!group) continue;
      for (const component of entity.components) {
        if (!component.enabled) continue;
        const object = this.createComponentObject({
          component,
          entity,
          manifest,
          models,
          materials,
          animations,
          diagnostics,
        });
        if (object) group.add(object);
      }
    }
    return { root, animations, entities, diagnostics, manifest };
  }

  private resolveAssetBase(manifestUrl?: string | URL): URL {
    if (this.assetBaseUrl) return new URL(this.assetBaseUrl, browserBaseUrl());
    if (manifestUrl) return new URL(".", resolveUrl(String(manifestUrl)));
    return browserBaseUrl();
  }

  private async loadModel(
    asset: Extract<XriftRuntimeAsset, { kind: "model" }>,
    assetBase: URL,
  ): Promise<LoadedModel> {
    const url = new URL(asset.url, assetBase).toString();
    if (asset.sourceFormat === "obj") {
      const root = await new OBJLoader(this.manager).loadAsync(url);
      root.scale.multiplyScalar(asset.scale);
      return { root, animations: [] };
    }
    const loader = new GLTFLoader(this.manager);
    if (asset.openBrush?.renderer === "three-icosa") {
      const { GLTFGoogleTiltBrushMaterialExtension } = await import(
        "three-icosa/dist/three-icosa.module.js"
      );
      loader.register(
        (parser) =>
          new GLTFGoogleTiltBrushMaterialExtension(
            parser,
            asset.openBrush!.brushBaseUrl,
          ),
      );
    }
    const gltf = await loader.loadAsync(url);
    tagSourceMaterialIndices(gltf);
    gltf.scene.scale.multiplyScalar(asset.scale);
    return { root: gltf.scene, animations: gltf.animations };
  }

  private async loadTexture(
    asset: Extract<XriftRuntimeAsset, { kind: "texture" }>,
    assetBase: URL,
  ): Promise<Texture> {
    const texture = await new TextureLoader(this.manager).loadAsync(
      new URL(asset.url, assetBase).toString(),
    );
    texture.flipY = asset.flipY;
    if (asset.colorSpace === "srgb") texture.colorSpace = SRGBColorSpace;
    return texture;
  }

  private createMaterials(
    manifest: XriftRuntimeManifest,
    textures: ReadonlyMap<string, Texture>,
    diagnostics: XriftRuntimeDiagnostic[],
  ): Map<string, Material> {
    const materials = new Map<string, Material>();
    for (const asset of Object.values(manifest.assets)) {
      if (asset.kind !== "material") continue;
      const properties = asset.properties;
      const pbr = asRecord(properties.pbrMetallicRoughness);
      const baseColor = asNumberArray(pbr?.baseColorFactor, 4) ?? [1, 1, 1, 1];
      const [red = 1, green = 1, blue = 1, alpha = 1] = baseColor;
      const material = new MeshStandardMaterial({
        color: new Color(red, green, blue),
        opacity: alpha,
        transparent: properties.alphaMode === "BLEND" || alpha < 1,
        alphaTest:
          properties.alphaMode === "MASK" && typeof properties.alphaCutoff === "number"
            ? properties.alphaCutoff
            : 0,
        metalness: typeof pbr?.metallicFactor === "number" ? pbr.metallicFactor : 0,
        roughness: typeof pbr?.roughnessFactor === "number" ? pbr.roughnessFactor : 1,
        ...(properties.doubleSided === true ? { side: DoubleSide } : {}),
      });
      const baseColorTexture = asRecord(pbr?.baseColorTexture);
      const textureId = baseColorTexture?.textureAssetId;
      if (typeof textureId === "string") {
        material.map = textures.get(textureId) ?? null;
        if (!material.map) {
          diagnostics.push({
            severity: "warning",
            code: "texture-not-loaded",
            message: `Material texture could not be loaded: ${textureId}`,
            assetId: asset.id,
          });
        }
      }
      const emissive = asNumberArray(properties.emissiveFactor, 3);
      if (emissive) {
        const [red = 0, green = 0, blue = 0] = emissive;
        material.emissive = new Color(red, green, blue);
      }
      material.name = asset.name;
      materials.set(asset.id, material);
    }
    return materials;
  }

  private createComponentObject(input: {
    component: XriftRuntimeComponent;
    entity: XriftRuntimeEntity;
    manifest: XriftRuntimeManifest;
    models: ReadonlyMap<string, LoadedModel>;
    materials: ReadonlyMap<string, Material>;
    animations: AnimationClip[];
    diagnostics: XriftRuntimeDiagnostic[];
  }): Object3D | null {
    const { component } = input;
    if (component.type === "mesh") {
      if (component.geometry.kind === "primitive") {
        const material = materialForBinding(component, input.materials);
        const mesh = new Mesh(
          createPrimitiveGeometry(component.geometry.primitive),
          material ?? new MeshStandardMaterial({ color: 0xbfc7d5 }),
        );
        mesh.castShadow = component.castShadow;
        mesh.receiveShadow = component.receiveShadow;
        mesh.userData.xriftStudioComponentId = component.id;
        return mesh;
      }
      const loaded = input.models.get(component.geometry.assetId);
      if (!loaded) {
        input.diagnostics.push({
          severity: "error",
          code: "model-not-loaded",
          message: `Model could not be loaded: ${component.geometry.assetId}`,
          entityId: input.entity.id,
          componentId: component.id,
          assetId: component.geometry.assetId,
        });
        return null;
      }
      const instance = cloneSkeleton(loaded.root);
      applyModelMaterials(instance, component, input.manifest, input.materials);
      applyModelPose(instance, component);
      instance.traverse((object) => {
        if (object instanceof Mesh) {
          object.castShadow = component.castShadow;
          object.receiveShadow = component.receiveShadow;
        }
      });
      input.animations.push(...loaded.animations);
      instance.userData.xriftStudioComponentId = component.id;
      return instance;
    }
    if (component.type === "light") return createLight(component);
    if (component.type === "spawn-point" || component.type === "collider") {
      const marker = new Group();
      marker.userData.xriftStudioComponent = component;
      return marker;
    }
    input.diagnostics.push({
      severity: "warning",
      code: "component-three-adapter-missing",
      message: `Three.js adapter is not implemented for ${component.type}`,
      entityId: input.entity.id,
      componentId: component.id,
    });
    return null;
  }
}

export async function loadXriftRuntime(
  manifest: string | URL | XriftRuntimeManifest,
  options?: XriftThreeLoaderOptions,
): Promise<XriftLoadResult> {
  return new XriftThreeLoader(options).load(manifest);
}

export function disposeXriftLoadResult(result: XriftLoadResult): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  result.root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of entries) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value);
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

function createPrimitiveGeometry(
  primitive: Extract<XriftRuntimeComponent, { type: "mesh" }>["geometry"] extends infer Geometry
    ? Geometry extends { kind: "primitive"; primitive: infer Primitive }
      ? Primitive
      : never
    : never,
): BufferGeometry {
  if (primitive === "box") return new BoxGeometry();
  if (primitive === "sphere") return new SphereGeometry(0.5, 32, 20);
  if (primitive === "cylinder") return new CylinderGeometry(0.5, 0.5, 1, 32);
  if (primitive === "cone") return new ConeGeometry(0.5, 1, 32);
  return new PlaneGeometry(1, 1);
}

function materialForBinding(
  component: Extract<XriftRuntimeComponent, { type: "mesh" }>,
  materials: ReadonlyMap<string, Material>,
): Material | undefined {
  const first = component.materialBindings[0];
  return first ? materials.get(first.materialAssetId) : undefined;
}

function applyModelMaterials(
  root: Object3D,
  component: Extract<XriftRuntimeComponent, { type: "mesh" }>,
  manifest: XriftRuntimeManifest,
  materials: ReadonlyMap<string, Material>,
): void {
  const asset =
    component.geometry.kind === "model"
      ? manifest.assets[component.geometry.assetId]
      : undefined;
  if (!asset || asset.kind !== "model") return;
  const bindingBySlot = new Map(
    component.materialBindings.map((binding) => [binding.slot, binding.materialAssetId]),
  );
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const original = Array.isArray(object.material) ? object.material : [object.material];
    const next = original.map((material, index) => {
      const taggedIndex = material.userData.xriftSourceMaterialIndex;
      const slot = asset.materialSlots.find(
        (candidate) =>
          candidate.sourceMaterialIndex === taggedIndex ||
          candidate.sourceMaterialIndex === index ||
          candidate.name === material.name,
      );
      const materialId = slot ? bindingBySlot.get(slot.slot) : undefined;
      return (materialId ? materials.get(materialId) : undefined) ?? material;
    });
    object.material = Array.isArray(object.material) ? next : next[0] ?? object.material;
  });
}

type RuntimeGltfDocument = {
  meshes?: Array<{ primitives?: Array<{ material?: unknown }> }>;
};

function tagSourceMaterialIndices(gltf: GLTF): void {
  const parser = gltf.parser as unknown as {
    associations: Map<unknown, { materials?: number; meshes?: number }>;
    json?: RuntimeGltfDocument;
  };
  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const meshIndex = parser.associations.get(object)?.meshes;
    const primitiveMaterialIndices =
      typeof meshIndex === "number" && Number.isInteger(meshIndex)
        ? parser.json?.meshes?.[meshIndex]?.primitives
            ?.map((primitive) => primitive.material)
            .filter(
              (index): index is number =>
                typeof index === "number" && Number.isInteger(index) && index >= 0,
            ) ?? []
        : [];
    materials.forEach((material, materialOrder) => {
      const sourceIndex =
        parser.associations.get(material)?.materials ??
        primitiveMaterialIndices[materialOrder] ??
        (materials.length === 1 ? primitiveMaterialIndices[0] : undefined);
      if (typeof sourceIndex === "number") {
        material.userData.xriftSourceMaterialIndex = sourceIndex;
      }
    });
  });
}

function applyModelPose(
  root: Object3D,
  component: Extract<XriftRuntimeComponent, { type: "mesh" }>,
): void {
  if (!component.modelPose) return;
  root.traverse((object) => {
    const rotation = component.modelPose?.bones[object.name];
    if (rotation) {
      object.rotation.x += rotation[0];
      object.rotation.y += rotation[1];
      object.rotation.z += rotation[2];
    }
    if (!(object instanceof Mesh) || !object.morphTargetDictionary || !object.morphTargetInfluences) {
      return;
    }
    for (const [name, weight] of Object.entries(component.modelPose?.morphTargets ?? {})) {
      const index = object.morphTargetDictionary[name];
      if (index !== undefined) object.morphTargetInfluences[index] = weight;
    }
  });
}

function createLight(
  component: Extract<XriftRuntimeComponent, { type: "light" }>,
): Light {
  let light: Light;
  if (component.lightType === "ambient") {
    light = new AmbientLight(component.color, component.intensity);
  } else if (component.lightType === "hemisphere") {
    light = new HemisphereLight(
      component.color,
      component.groundColor ?? "#20242d",
      component.intensity,
    );
  } else if (component.lightType === "point") {
    light = new PointLight(
      component.color,
      component.intensity,
      component.distance ?? 0,
      component.decay ?? 2,
    );
  } else if (component.lightType === "spot") {
    const spot = new SpotLight(
      component.color,
      component.intensity,
      component.distance ?? 0,
      component.angle ?? Math.PI / 3,
      component.penumbra ?? 0,
      component.decay ?? 2,
    );
    spot.castShadow = component.castShadow;
    light = spot;
  } else if (component.lightType === "rectArea") {
    light = new RectAreaLight(
      component.color,
      component.intensity,
      component.width ?? 1,
      component.height ?? 1,
    );
  } else {
    const directional = new DirectionalLight(component.color, component.intensity);
    directional.castShadow = component.castShadow;
    light = directional;
  }
  light.userData.xriftStudioComponentId = component.id;
  return light;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asNumberArray(value: unknown, length: number): number[] | undefined {
  return Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    ? value
    : undefined;
}

function browserBaseUrl(): URL {
  if (typeof document !== "undefined") return new URL(document.baseURI);
  return new URL("http://localhost/");
}

function resolveUrl(value: string): URL {
  return new URL(value, browserBaseUrl());
}
