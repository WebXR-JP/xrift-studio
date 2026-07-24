import {
  AmbientLight,
  AnimationClip,
  BoxGeometry,
  BufferGeometry,
  ClampToEdgeWrapping,
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
  MirroredRepeatWrapping,
  Object3D,
  PlaneGeometry,
  PointLight,
  RectAreaLight,
  RepeatWrapping,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  WebGLRenderer,
} from "three";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Text } from "troika-three-text";

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
  animationClipsByEntity: Map<string, AnimationClip[]>;
  interactionAnimationIndicesByEntity: Map<string, number[]>;
  entities: Map<string, Object3D>;
  diagnostics: XriftRuntimeDiagnostic[];
  manifest: XriftRuntimeManifest;
};

export type XriftThreeLoaderOptions = {
  assetBaseUrl?: string;
  manager?: LoadingManager;
  renderer?: WebGLRenderer;
  ktx2TranscoderPath?: string;
  dracoDecoderPath?: string;
};

const DEFAULT_KTX2_TRANSCODER_PATH =
  "https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master/basis/";
const DEFAULT_DRACO_DECODER_PATH =
  "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";

type LoadedModel = {
  root: Object3D;
  animations: AnimationClip[];
  interactionAnimationIndices: number[];
  sourceMaterials: ReadonlyMap<number, Material>;
};

export class XriftThreeLoader {
  readonly assetBaseUrl?: string;
  readonly manager: LoadingManager;
  readonly renderer?: WebGLRenderer;
  readonly ktx2TranscoderPath: string;
  readonly dracoDecoderPath: string;

  constructor(options: XriftThreeLoaderOptions = {}) {
    this.assetBaseUrl = options.assetBaseUrl;
    this.manager = options.manager ?? new LoadingManager();
    this.renderer = options.renderer;
    this.ktx2TranscoderPath =
      options.ktx2TranscoderPath ?? DEFAULT_KTX2_TRANSCODER_PATH;
    this.dracoDecoderPath =
      options.dracoDecoderPath ?? DEFAULT_DRACO_DECODER_PATH;
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
    const animationClipsByEntity = new Map<string, AnimationClip[]>();
    const interactionAnimationIndicesByEntity = new Map<string, number[]>();

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
          animationClipsByEntity,
          interactionAnimationIndicesByEntity,
          diagnostics,
        });
        if (object) group.add(object);
      }
    }
    return {
      root,
      animations,
      animationClipsByEntity,
      interactionAnimationIndicesByEntity,
      entities,
      diagnostics,
      manifest,
    };
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
      return {
        root,
        animations: [],
        interactionAnimationIndices: [],
        sourceMaterials: new Map(),
      };
    }
    const loader = new GLTFLoader(this.manager);
    const dracoLoader = new DRACOLoader(this.manager).setDecoderPath(
      this.dracoDecoderPath,
    );
    loader.setDRACOLoader(dracoLoader);
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
    let gltf: GLTF;
    try {
      gltf = await loader.loadAsync(url);
    } finally {
      dracoLoader.dispose();
    }
    tagSourceMaterialIndices(gltf);
    gltf.scene.scale.multiplyScalar(asset.scale);
    return {
      root: gltf.scene,
      animations: gltf.animations,
      interactionAnimationIndices:
        getKhrInteractivityOnStartAnimationIndices(
          (
            gltf.parser as unknown as {
              json?: RuntimeGltfDocument;
            }
          ).json?.extensions?.KHR_interactivity,
        ),
      sourceMaterials: collectSourceMaterials(gltf.scene),
    };
  }

  private async loadTexture(
    asset: Extract<XriftRuntimeAsset, { kind: "texture" }>,
    assetBase: URL,
  ): Promise<Texture> {
    const url = new URL(asset.url, assetBase).toString();
    const texture =
      asset.sourceFormat === "ktx2"
        ? await this.loadKtx2Texture(url)
        : await new TextureLoader(this.manager).loadAsync(url);
    texture.flipY = asset.flipY;
    if (asset.colorSpace === "srgb") texture.colorSpace = SRGBColorSpace;
    texture.wrapS = runtimeTextureWrapping(asset.sampler.wrapS);
    texture.wrapT = runtimeTextureWrapping(asset.sampler.wrapT);
    return texture;
  }

  private async loadKtx2Texture(url: string): Promise<Texture> {
    if (!this.renderer) {
      throw new Error(
        "KTX2 texture loading requires XriftThreeLoaderOptions.renderer",
      );
    }
    return new KTX2Loader(this.manager)
      .setTranscoderPath(this.ktx2TranscoderPath)
      .detectSupport(this.renderer)
      .loadAsync(url);
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
      const resolveTexture = (
        textureInfo: Record<string, unknown> | undefined,
      ): Texture | null => {
        const textureId = textureInfo?.textureAssetId;
        if (typeof textureId !== "string" || !textureInfo) return null;
        const sourceTexture = textures.get(textureId);
        const resolved = sourceTexture
          ? configureMaterialTexture(sourceTexture, textureInfo)
          : null;
        if (!resolved) {
          diagnostics.push({
            severity: "warning",
            code: "texture-not-loaded",
            message: `Material texture could not be loaded: ${textureId}`,
            assetId: asset.id,
          });
        }
        return resolved;
      };
      material.map = resolveTexture(baseColorTexture);
      const metallicRoughnessTexture = asRecord(pbr?.metallicRoughnessTexture);
      const resolvedMetallicRoughness = resolveTexture(metallicRoughnessTexture);
      material.metalnessMap = resolvedMetallicRoughness;
      material.roughnessMap = resolvedMetallicRoughness;
      const normalTexture = asRecord(properties.normalTexture);
      material.normalMap = resolveTexture(normalTexture);
      if (typeof normalTexture?.scale === "number") {
        material.normalScale.set(normalTexture.scale, normalTexture.scale);
      }
      const occlusionTexture = asRecord(properties.occlusionTexture);
      material.aoMap = resolveTexture(occlusionTexture);
      if (typeof occlusionTexture?.strength === "number") {
        material.aoMapIntensity = occlusionTexture.strength;
      }
      material.emissiveMap = resolveTexture(asRecord(properties.emissiveTexture));
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
    animationClipsByEntity: Map<string, AnimationClip[]>;
    interactionAnimationIndicesByEntity: Map<string, number[]>;
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
      const instance = selectRuntimeSourceNode(
        cloneSkeleton(loaded.root),
        component.geometry.sourceNodeIndex,
      );
      applyModelMaterials(
        instance,
        loaded,
        component,
        input.manifest,
        input.materials,
      );
      applyModelPose(instance, component);
      instance.traverse((object) => {
        if (object instanceof Mesh) {
          object.castShadow = component.castShadow;
          object.receiveShadow = component.receiveShadow;
        }
      });
      input.animations.push(...loaded.animations);
      if (loaded.animations.length > 0) {
        input.animationClipsByEntity.set(input.entity.id, [
          ...(input.animationClipsByEntity.get(input.entity.id) ?? []),
          ...loaded.animations,
        ]);
      }
      if (loaded.interactionAnimationIndices.length > 0) {
        input.interactionAnimationIndicesByEntity.set(
          input.entity.id,
          loaded.interactionAnimationIndices,
        );
      }
      instance.userData.xriftStudioComponentId = component.id;
      return instance;
    }
    if (component.type === "animation") return null;
    if (component.type === "light") return createLight(component);
    if (component.type === "text") {
      const text = new Text();
      text.text = component.text;
      text.color = component.color;
      text.fontSize = component.fontSize;
      text.maxWidth = component.maxWidth ?? Infinity;
      text.anchorX = component.anchorX;
      text.anchorY = component.anchorY;
      text.outlineWidth = component.outlineWidth;
      text.outlineColor = component.outlineColor;
      text.sync();
      text.userData.xriftStudioComponentId = component.id;
      return text;
    }
    if (
      component.type === "spawn-point" ||
      component.type === "collider" ||
      component.type === "rigid-body"
    ) {
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

function runtimeTextureWrapping(
  value: "repeat" | "clamp-to-edge" | "mirrored-repeat",
) {
  if (value === "repeat") return RepeatWrapping;
  if (value === "mirrored-repeat") return MirroredRepeatWrapping;
  return ClampToEdgeWrapping;
}

function configureMaterialTexture(
  source: Texture,
  textureInfo: Record<string, unknown>,
): Texture {
  const texture = source.clone();
  const texCoord = textureInfo.texCoord;
  if (typeof texCoord === "number" && Number.isInteger(texCoord) && texCoord >= 0) {
    texture.channel = texCoord;
  }
  const transform = asRecord(textureInfo.transform);
  const offset = asNumberArray(transform?.offset, 2);
  const scale = asNumberArray(transform?.scale, 2);
  if (offset) texture.offset.set(offset[0] ?? 0, offset[1] ?? 0);
  if (scale) texture.repeat.set(scale[0] ?? 1, scale[1] ?? 1);
  if (typeof transform?.rotation === "number") {
    texture.rotation = transform.rotation;
  }
  texture.needsUpdate = true;
  return texture;
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
  loaded: LoadedModel,
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
    component.materialBindings.map((binding) => [
      `${binding.sourceNodeIndex ?? "global"}:${binding.slot}`,
      binding.materialAssetId,
    ]),
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
      const sourceNodeIndex = nearestSourceNodeIndex(object);
      const materialId = slot
        ? (sourceNodeIndex === undefined
            ? undefined
            : bindingBySlot.get(`${sourceNodeIndex}:${slot.slot}`)) ??
          bindingBySlot.get(`global:${slot.slot}`)
        : undefined;
      const materialAsset = materialId ? manifest.assets[materialId] : undefined;
      if (
        materialAsset?.kind === "material" &&
        materialAsset.shader?.kind === "openbrush"
      ) {
        return (
          loaded.sourceMaterials
            .get(materialAsset.shader.sourceMaterialIndex)
            ?.clone() ?? material
        );
      }
      return (materialId ? materials.get(materialId) : undefined) ?? material;
    });
    object.material = Array.isArray(object.material) ? next : next[0] ?? object.material;
  });
}

function collectSourceMaterials(root: Object3D): Map<number, Material> {
  const materials = new Map<number, Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const entries = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of entries) {
      const sourceIndex = material.userData.xriftSourceMaterialIndex;
      if (
        typeof sourceIndex === "number" &&
        Number.isInteger(sourceIndex) &&
        sourceIndex >= 0 &&
        !materials.has(sourceIndex)
      ) {
        materials.set(sourceIndex, material);
      }
    }
  });
  return materials;
}

type RuntimeGltfDocument = {
  meshes?: Array<{ primitives?: Array<{ material?: unknown }> }>;
  extensions?: Record<string, unknown>;
};

function getKhrInteractivityOnStartAnimationIndices(
  value: unknown,
): number[] {
  const extension = asRecord(value);
  const graphs = Array.isArray(extension?.graphs) ? extension.graphs : [];
  const graphIndex =
    typeof extension?.graph === "number" &&
    Number.isInteger(extension.graph) &&
    extension.graph >= 0
      ? extension.graph
      : 0;
  const graph = asRecord(graphs[graphIndex]);
  const declarations = Array.isArray(graph?.declarations)
    ? graph.declarations
    : [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const operationFor = (node: Record<string, unknown> | undefined) => {
    const declarationIndex = node?.declaration;
    if (
      typeof declarationIndex !== "number" ||
      !Number.isInteger(declarationIndex) ||
      declarationIndex < 0
    ) {
      return undefined;
    }
    return asRecord(declarations[declarationIndex])?.op;
  };
  const pending = nodes.flatMap((candidate, nodeIndex) =>
    operationFor(asRecord(candidate)) === "event/onStart" ? [nodeIndex] : [],
  );
  const visited = new Set<number>();
  const animationIndices = new Set<number>();
  while (pending.length > 0) {
    const nodeIndex = pending.shift();
    if (nodeIndex === undefined || visited.has(nodeIndex)) continue;
    visited.add(nodeIndex);
    const node = asRecord(nodes[nodeIndex]);
    if (!node) continue;
    if (operationFor(node) === "animation/start") {
      const animationValue = asRecord(asRecord(node.values)?.animation)?.value;
      const animationIndex =
        Array.isArray(animationValue) ? animationValue[0] : undefined;
      if (
        typeof animationIndex === "number" &&
        Number.isInteger(animationIndex) &&
        animationIndex >= 0
      ) {
        animationIndices.add(animationIndex);
      }
    }
    const flows = asRecord(node.flows);
    for (const candidate of Object.values(flows ?? {})) {
      const targetIndex = asRecord(candidate)?.node;
      if (
        typeof targetIndex === "number" &&
        Number.isInteger(targetIndex) &&
        targetIndex >= 0 &&
        !visited.has(targetIndex)
      ) {
        pending.push(targetIndex);
      }
    }
  }
  return [...animationIndices].sort((left, right) => left - right);
}

function tagSourceMaterialIndices(gltf: GLTF): void {
  const parser = gltf.parser as unknown as {
    associations: Map<unknown, { materials?: number; meshes?: number; nodes?: number }>;
    json?: RuntimeGltfDocument;
  };
  gltf.scene.traverse((object) => {
    const sourceNodeIndex = parser.associations.get(object)?.nodes;
    if (typeof sourceNodeIndex === "number" && Number.isInteger(sourceNodeIndex)) {
      object.userData.xriftSourceNodeIndex = sourceNodeIndex;
    }
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

function selectRuntimeSourceNode(
  root: Object3D,
  sourceNodeIndex: number | undefined,
): Object3D {
  if (sourceNodeIndex === undefined) return root;
  let selected: Object3D | undefined;
  root.traverse((candidate) => {
    if (
      selected === undefined &&
      candidate.userData.xriftSourceNodeIndex === sourceNodeIndex
    ) {
      selected = candidate;
    }
  });
  if (!selected) {
    const missing = new Group();
    missing.userData.xriftMissingSourceNodeIndex = sourceNodeIndex;
    return missing;
  }
  for (const child of [...selected.children]) {
    if (typeof child.userData.xriftSourceNodeIndex === "number") {
      selected.remove(child);
    }
  }
  selected.removeFromParent();
  selected.position.set(0, 0, 0);
  selected.quaternion.identity();
  selected.scale.set(1, 1, 1);
  selected.updateMatrix();
  selected.updateMatrixWorld(true);
  return selected;
}

function applyModelPose(
  root: Object3D,
  component: Extract<XriftRuntimeComponent, { type: "mesh" }>,
): void {
  if (!component.modelPose) return;
  root.traverse((object) => {
    const sourceNodeIndex = object.userData.xriftSourceNodeIndex;
    const nodeTransform = typeof sourceNodeIndex === "number"
      ? component.modelPose?.nodes?.[String(sourceNodeIndex)]
      : undefined;
    if (nodeTransform) {
      object.position.x += nodeTransform.position[0];
      object.position.y += nodeTransform.position[1];
      object.position.z += nodeTransform.position[2];
      object.rotation.x += nodeTransform.rotation[0];
      object.rotation.y += nodeTransform.rotation[1];
      object.rotation.z += nodeTransform.rotation[2];
      object.scale.x *= nodeTransform.scale[0];
      object.scale.y *= nodeTransform.scale[1];
      object.scale.z *= nodeTransform.scale[2];
    }
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
  root.updateMatrixWorld(true);
}

function nearestSourceNodeIndex(object: Object3D): number | undefined {
  let current: Object3D | null = object;
  while (current) {
    const value = current.userData.xriftSourceNodeIndex;
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      return value;
    }
    current = current.parent;
  }
  return undefined;
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
