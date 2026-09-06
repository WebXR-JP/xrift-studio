import { InstancedMesh, Material, Matrix4, Mesh, type Object3D } from "three";

/** Shared by Play and both publication formats. Authoring meshes stay attached. */
export function createModelInstancing(root: Object3D, entityIds: readonly string[], entityKey: string) {
  const eligible = new Set(entityIds);
  let signature = "";
  let originals: Mesh[] = [];
  let batches: InstancedMesh[] = [];
  const restore = () => {
    for (const mesh of originals) mesh.visible = true;
    for (const batch of batches) { batch.removeFromParent(); batch.dispose(); }
    originals = []; batches = [];
  };
  return {
    update() {
      root.updateMatrixWorld(true);
      const inverse = new Matrix4().copy(root.matrixWorld).invert();
      const hidden = new Set(originals);
      const candidates: Array<{ mesh: Mesh; matrix: Matrix4; key: string }> = [];
      const materialKeys = new Map<Material, string>();
      const materialKey = (material: Material) => {
        let key = materialKeys.get(material);
        if (key !== undefined) return key;
        // Material.toJSON also serializes texture pixels. Compare render state
        // and shared texture identity without touching image data or the GPU.
        key = JSON.stringify({ ...material, uuid: undefined }, (_key, value) =>
          value?.isTexture ? { texture: value.uuid } : value);
        materialKeys.set(material, key);
        return key;
      };
      root.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh || (mesh as InstancedMesh).isInstancedMesh ||
          (mesh as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh ||
          mesh.morphTargetInfluences || mesh.children.length ||
          mesh.customDepthMaterial || mesh.customDistanceMaterial ||
          (!mesh.visible && !hidden.has(mesh))) return;
        let owner: string | undefined;
        for (let parent: Object3D | null = mesh; parent && parent !== root; parent = parent.parent) {
          if (parent !== mesh && !parent.visible) return;
          owner ??= parent.userData[entityKey];
        }
        if (!owner || !eligible.has(owner)) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (materials.some((m) => m.transparent || (m as Material & { isShaderMaterial?: boolean }).isShaderMaterial ||
          m.onBeforeCompile !== Material.prototype.onBeforeCompile)) return;
        const matrix = new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
        // InstancedMesh cannot render mirrored transforms correctly.
        if (matrix.determinant() <= 0) return;
        // Nearby instances share a culling bound; distant neighborhoods remain separate.
        const cell = [12, 13, 14].map((i) => Math.floor(matrix.elements[i]! / 64)).join(",");
        const key = [mesh.geometry.uuid, materials.map(materialKey).join("|"), mesh.castShadow,
          mesh.receiveShadow, mesh.renderOrder, mesh.layers.mask, mesh.frustumCulled, cell].join(";");
        candidates.push({ mesh, matrix, key });
      });
      const nextSignature = candidates.map(({ mesh, matrix, key }) => `${mesh.uuid}:${key}:${matrix.elements.join(",")}`).join("\n");
      if (signature === nextSignature) return;
      signature = nextSignature;
      restore();
      const groups = new Map<string, typeof candidates>();
      for (const candidate of candidates) {
        const group = groups.get(candidate.key) ?? [];
        group.push(candidate); groups.set(candidate.key, group);
      }
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const sample = group[0]!.mesh;
        const batch = new InstancedMesh(sample.geometry, sample.material, group.length);
        batch.name = "xrift-model-instances";
        batch.castShadow = sample.castShadow; batch.receiveShadow = sample.receiveShadow;
        batch.renderOrder = sample.renderOrder; batch.layers.mask = sample.layers.mask;
        batch.frustumCulled = sample.frustumCulled;
        group.forEach(({ mesh, matrix }, index) => {
          batch.setMatrixAt(index, matrix); mesh.visible = false; originals.push(mesh);
        });
        batch.instanceMatrix.needsUpdate = true;
        batch.computeBoundingBox(); batch.computeBoundingSphere();
        // Keep entity identity for world raycasts and collision inspection.
        const raycast = batch.raycast.bind(batch);
        batch.raycast = (raycaster, intersections) => {
          const hits: Parameters<typeof raycast>[1] = [];
          raycast(raycaster, hits);
          for (const hit of hits) {
            if (hit.instanceId !== undefined && group[hit.instanceId]) hit.object = group[hit.instanceId]!.mesh;
            intersections.push(hit);
          }
        };
        root.add(batch); batches.push(batch);
      }
    },
    dispose: restore,
    get batchCount() { return batches.length; },
    get instanceCount() { return originals.length; },
  };
}
