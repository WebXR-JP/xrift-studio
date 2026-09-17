const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["three-icosa.module-o7xN4AQ5.js","__federation_fn_import-D4Dambwr.js"])))=>i.map(i=>d[i]);
import { importShared } from './__federation_fn_import-D4Dambwr.js';
import { _ as __vitePreload } from './preload-helper-CWZBUsdZ.js';
import { G as GLTFLoader, c as clone } from './GLTFLoader-Bssp3JJ-.js';
import { DRACOLoader } from './__federation_shared_three/addons/loaders/DRACOLoader.js-Da8K1dUd.js';
import { KTX2Loader } from './__federation_shared_three/addons/loaders/KTX2Loader.js-XrELkfeR.js';
import { R as Reflector } from './Reflector-B9aJXpF_.js';
import { T as Text, p as preloadFont } from './troika-three-text.esm-ChjHFqZ4.js';

/** Read accessors, not .array: imported glTF can have interleaved attributes. */
function bakeXriftColliderGeometry(position, index, matrix, flipWinding = false) {
    if (position.count < 3)
        return null;
    if (matrix.length !== 16 || !matrix.every(Number.isFinite))
        throw new Error("衝突判定のTransformが不正です");
    const vertices = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        const offset = i * 3;
        vertices[offset] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        vertices[offset + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        vertices[offset + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
        if (!Number.isFinite(vertices[offset]) || !Number.isFinite(vertices[offset + 1]) || !Number.isFinite(vertices[offset + 2])) {
            throw new Error("衝突判定のメッシュに不正な頂点があります");
        }
    }
    const count = index?.count ?? position.count;
    if (count % 3 !== 0)
        throw new Error("衝突判定のメッシュが三角形になっていません");
    const triangles = [];
    for (let i = 0; i < count; i += 3) {
        const a = index ? index.getX(i) : i;
        const b = index ? index.getX(i + 1) : i + 1;
        const c = index ? index.getX(i + 2) : i + 2;
        if (![a, b, c].every((value) => Number.isInteger(value) && value >= 0 && value < position.count)) {
            throw new Error("衝突判定のメッシュに範囲外の頂点番号があります");
        }
        const abx = vertices[b * 3] - vertices[a * 3];
        const aby = vertices[b * 3 + 1] - vertices[a * 3 + 1];
        const abz = vertices[b * 3 + 2] - vertices[a * 3 + 2];
        const acx = vertices[c * 3] - vertices[a * 3];
        const acy = vertices[c * 3 + 1] - vertices[a * 3 + 1];
        const acz = vertices[c * 3 + 2] - vertices[a * 3 + 2];
        if (aby * acz - abz * acy === 0 && abz * acx - abx * acz === 0 && abx * acy - aby * acx === 0)
            continue;
        triangles.push(a, flipWinding ? c : b, flipWinding ? b : c);
    }
    return triangles.length ? { vertices, indices: new Uint32Array(triangles) } : null;
}
/** Rendering visibility/distance/materials must not switch physical floors off. */
function skipsXriftColliderObject(object, root) {
    return object.userData.xriftColliderExclude === true ||
        object.userData.xriftCollisionDisabled === true ||
        (object !== root && (object.userData.xriftRigidBodyBoundary === true ||
            object.userData.r3RapierType === "MeshCollider"));
}
/** Colliders use the owning body's coordinate space, not nested scaled groups. */
function findXriftColliderBody(root) {
    let parent = root.parent;
    while (parent) {
        if (parent.userData.xriftRigidBodyBoundary === true)
            return parent;
        parent = parent.parent;
    }
    return null;
}
function collectXriftMeshColliderShapes(root, collisionSpace = root) {
    root.updateWorldMatrix(true, true);
    if (root.matrixWorld.determinant() === 0)
        throw new Error("衝突判定のScaleに0が含まれています");
    collisionSpace.updateWorldMatrix(true, false);
    const inverse = collisionSpace.matrixWorld.clone().invert();
    const result = [];
    let candidateCount = 0;
    const append = (mesh, geometry, matrix, key, worldDeterminant) => {
        candidateCount += 1;
        const position = geometry.getAttribute("position");
        if (!position)
            return;
        const baked = bakeXriftColliderGeometry(position, geometry.getIndex(), matrix.elements, worldDeterminant < 0);
        if (!baked)
            return;
        // Bounding primitives retain the mesh's own orientation, unlike an AABB of
        // the entire Entity. Mesh colliders bake child transforms only once.
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const center = mesh.position.clone();
        const scale = mesh.scale.clone();
        const rotation = mesh.quaternion.clone();
        matrix.decompose(center, rotation, scale);
        const box = geometry.boundingBox;
        const half = box ? box.getSize(mesh.position.clone()).multiplyScalar(0.5) : mesh.position.clone().set(0, 0, 0);
        if (box)
            box.getCenter(center).applyMatrix4(matrix);
        const ballCenter = geometry.boundingSphere?.center.clone().applyMatrix4(matrix) ?? center;
        result.push({
            key, geometry: baked,
            position: [center.x, center.y, center.z],
            ballPosition: [ballCenter.x, ballCenter.y, ballCenter.z],
            quaternion: [rotation.x, rotation.y, rotation.z, rotation.w],
            halfExtents: [half.x * Math.abs(scale.x), half.y * Math.abs(scale.y), half.z * Math.abs(scale.z)],
            radius: (geometry.boundingSphere?.radius ?? 0) * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)),
        });
    };
    const visit = (object) => {
        if (skipsXriftColliderObject(object, root))
            return;
        const mesh = object;
        if (mesh.isMesh && mesh.geometry) {
            const local = inverse.clone().multiply(mesh.matrixWorld);
            const instanced = mesh;
            if (instanced.isInstancedMesh) {
                const instanceMatrix = local.clone();
                for (let i = 0; i < instanced.count; i += 1) {
                    instanced.getMatrixAt(i, instanceMatrix);
                    append(mesh, mesh.geometry, local.clone().multiply(instanceMatrix), `${mesh.uuid}:${i}`, mesh.matrixWorld.determinant() * instanceMatrix.determinant());
                }
            }
            else
                append(mesh, mesh.geometry, local, mesh.uuid, mesh.matrixWorld.determinant());
        }
        for (const child of object.children)
            visit(child);
    };
    visit(root);
    if (candidateCount > 0 && result.length === 0)
        throw new Error("Mesh Colliderに有効な三角形がありません");
    return result;
}
/** Watch actual Three children, including asynchronous <primitive> replacement. */
function observeXriftColliderChildren(root, changed) {
    const observed = new Set();
    const onAdded = (event) => { attach(event.child); changed(); };
    const onRemoved = (event) => { detach(event.child); changed(); };
    const attach = (object) => {
        if (observed.has(object) || skipsXriftColliderObject(object, root))
            return;
        observed.add(object);
        object.addEventListener("childadded", onAdded);
        object.addEventListener("childremoved", onRemoved);
        for (const child of object.children)
            attach(child);
    };
    const detach = (object) => {
        observed.delete(object);
        object.removeEventListener("childadded", onAdded);
        object.removeEventListener("childremoved", onRemoved);
        for (const child of object.children)
            detach(child);
    };
    attach(root);
    return () => {
        for (const object of observed) {
            object.removeEventListener("childadded", onAdded);
            object.removeEventListener("childremoved", onRemoved);
        }
        observed.clear();
    };
}

const {Fragment:_Fragment$2,jsx:_jsx$7,jsxs:_jsxs$3} = await importShared('react/jsx-runtime');

const {createPortal: createPortal$1} = await importShared('@react-three/fiber');

const {createContext,useCallback,useContext,useEffect: useEffect$9,useLayoutEffect: useLayoutEffect$2,useRef: useRef$9,useState: useState$1} = await importShared('react');

const {BallCollider,ConvexHullCollider,CuboidCollider: CuboidCollider$1,TrimeshCollider,useRapier} = await importShared('@react-three/rapier');
const XriftColliderLoadContext = createContext(null);
/** Child effects have created the actual Rapier shapes before this reports ready. */
function XriftCommittedMeshColliders({ projection, type, surface, report }) {
    const { world } = useRapier();
    const handles = useRef$9(new Map());
    // The verifier is keyed by generation; old handles cannot satisfy a new load.
    useEffect$9(() => {
        const valid = projection.shapes.every((shape) => {
            const collider = handles.current.get(shape.key);
            return collider !== undefined && world.getCollider(collider.handle) != null;
        });
        report(projection.revision, valid
            ? { status: "ready" }
            : { status: "error", message: "Mesh Colliderを物理空間に登録できませんでした" });
    }, [projection, report, world]);
    return _jsx$7(_Fragment$2, { children: projection.shapes.map((shape) => {
            const key = `${projection.revision}:${type}:${shape.key}`;
            const ref = (collider) => {
                if (collider)
                    handles.current.set(shape.key, collider);
                else
                    handles.current.delete(shape.key);
            };
            if (type === "cuboid")
                return _jsx$7(CuboidCollider$1, { ref: ref, args: shape.halfExtents, position: shape.position, quaternion: shape.quaternion, ...surface }, key);
            if (type === "ball")
                return _jsx$7(BallCollider, { ref: ref, args: [shape.radius], position: shape.ballPosition, ...surface }, key);
            if (type === "hull")
                return _jsx$7(ConvexHullCollider, { ref: ref, args: [shape.geometry.vertices], ...surface }, key);
            return _jsx$7(TrimeshCollider, { ref: ref, args: [shape.geometry.vertices, shape.geometry.indices], ...surface }, key);
        }) });
}
/** Follow late model loads without remounting their scripts or rigid bodies. */
function XRiftStudioMeshColliders({ type, children, ...surface }) {
    const source = useRef$9(null);
    const tracker = useContext(XriftColliderLoadContext);
    const registration = useRef$9(null);
    const revision = useRef$9(0);
    const [projection, setProjection] = useState$1({ shapes: [], body: null, revision: 0 });
    useLayoutEffect$2(() => {
        const resource = tracker?.register() ?? null;
        registration.current = resource;
        return () => { resource?.dispose(); registration.current = null; };
    }, [tracker]);
    const report = useCallback((forRevision, state) => {
        if (forRevision === revision.current)
            registration.current?.update(state);
    }, []);
    useLayoutEffect$2(() => {
        const root = source.current;
        if (!root)
            return;
        let active = true;
        let queued = false;
        const refresh = () => {
            if (!active)
                return;
            const nextRevision = ++revision.current;
            registration.current?.update({ status: "loading" });
            try {
                const body = findXriftColliderBody(root);
                setProjection({ body, shapes: collectXriftMeshColliderShapes(root, body ?? root), revision: nextRevision });
            }
            catch (error) {
                // Never mark this failed generation ready through an empty projection.
                const message = error instanceof Error ? error.message : String(error);
                setProjection({ shapes: [], body: null, revision: -nextRevision });
                registration.current?.update({ status: "error", message });
                console.error("Mesh Colliderを生成できませんでした:", error);
            }
        };
        const schedule = () => {
            if (queued)
                return;
            queued = true;
            // Block startup immediately, not only after the queued React update.
            registration.current?.update({ status: "loading" });
            queueMicrotask(() => { queued = false; refresh(); });
        };
        const stop = observeXriftColliderChildren(root, schedule);
        refresh();
        return () => { active = false; revision.current += 1; stop(); };
    }, [children, type, tracker]);
    const colliders = projection.revision > 0
        ? _jsx$7(XriftCommittedMeshColliders, { projection: projection, type: type, surface: surface, report: report }, projection.revision)
        : null;
    return (_jsxs$3("group", { userData: { r3RapierType: "MeshCollider" }, children: [_jsx$7("group", { ref: source, children: children }), projection.body ? createPortal$1(colliders, projection.body) : colliders] }));
}

const {InstancedMesh,Material: Material$1,Matrix4: Matrix4$2} = await importShared('three');

/** Shared by Play and both publication formats. Authoring meshes stay attached. */
function createModelInstancing(root, entityIds, entityKey) {
    const eligible = new Set(entityIds);
    let signature = "";
    let originals = [];
    let batches = [];
    const restore = () => {
        for (const mesh of originals)
            mesh.visible = true;
        for (const batch of batches) {
            batch.removeFromParent();
            batch.dispose();
        }
        originals = [];
        batches = [];
    };
    return {
        update() {
            root.updateMatrixWorld(true);
            const inverse = new Matrix4$2().copy(root.matrixWorld).invert();
            const hidden = new Set(originals);
            const candidates = [];
            const materialKeys = new Map();
            const materialKey = (material) => {
                let key = materialKeys.get(material);
                if (key !== undefined)
                    return key;
                // Material.toJSON also serializes texture pixels. Compare render state
                // and shared texture identity without touching image data or the GPU.
                key = JSON.stringify({ ...material, uuid: undefined }, (_key, value) => value?.isTexture ? { texture: value.uuid } : value);
                materialKeys.set(material, key);
                return key;
            };
            root.traverse((object) => {
                const mesh = object;
                if (!mesh.isMesh || mesh.isInstancedMesh ||
                    mesh.isSkinnedMesh ||
                    mesh.morphTargetInfluences || mesh.children.length ||
                    mesh.customDepthMaterial || mesh.customDistanceMaterial ||
                    (!mesh.visible && !hidden.has(mesh)))
                    return;
                let owner;
                for (let parent = mesh; parent && parent !== root; parent = parent.parent) {
                    if (parent !== mesh && !parent.visible)
                        return;
                    owner ?? (owner = parent.userData[entityKey]);
                }
                if (!owner || !eligible.has(owner))
                    return;
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                if (materials.some((m) => m.transparent || m.isShaderMaterial ||
                    m.onBeforeCompile !== Material$1.prototype.onBeforeCompile))
                    return;
                const matrix = new Matrix4$2().multiplyMatrices(inverse, mesh.matrixWorld);
                // InstancedMesh cannot render mirrored transforms correctly.
                if (matrix.determinant() <= 0)
                    return;
                // Nearby instances share a culling bound; distant neighborhoods remain separate.
                const cell = [12, 13, 14].map((i) => Math.floor(matrix.elements[i] / 64)).join(",");
                const key = [mesh.geometry.uuid, materials.map(materialKey).join("|"), mesh.castShadow,
                    mesh.receiveShadow, mesh.renderOrder, mesh.layers.mask, mesh.frustumCulled, cell].join(";");
                candidates.push({ mesh, matrix, key });
            });
            const nextSignature = candidates.map(({ mesh, matrix, key }) => `${mesh.uuid}:${key}:${matrix.elements.join(",")}`).join("\n");
            if (signature === nextSignature)
                return;
            signature = nextSignature;
            restore();
            const groups = new Map();
            for (const candidate of candidates) {
                const group = groups.get(candidate.key) ?? [];
                group.push(candidate);
                groups.set(candidate.key, group);
            }
            for (const group of groups.values()) {
                if (group.length < 2)
                    continue;
                const sample = group[0].mesh;
                const batch = new InstancedMesh(sample.geometry, sample.material, group.length);
                batch.userData.xriftColliderExclude = true; // Render-only copies; original meshes own collision.
                batch.name = "xrift-model-instances";
                batch.castShadow = sample.castShadow;
                batch.receiveShadow = sample.receiveShadow;
                batch.renderOrder = sample.renderOrder;
                batch.layers.mask = sample.layers.mask;
                batch.frustumCulled = sample.frustumCulled;
                group.forEach(({ mesh, matrix }, index) => {
                    batch.setMatrixAt(index, matrix);
                    mesh.visible = false;
                    originals.push(mesh);
                });
                batch.instanceMatrix.needsUpdate = true;
                batch.computeBoundingBox();
                batch.computeBoundingSphere();
                // Keep entity identity for world raycasts and collision inspection.
                const raycast = batch.raycast.bind(batch);
                batch.raycast = (raycaster, intersections) => {
                    const hits = [];
                    raycast(raycaster, hits);
                    for (const hit of hits) {
                        if (hit.instanceId !== undefined && group[hit.instanceId])
                            hit.object = group[hit.instanceId].mesh;
                        intersections.push(hit);
                    }
                };
                root.add(batch);
                batches.push(batch);
            }
        },
        dispose: restore,
        get batchCount() { return batches.length; },
        get instanceCount() { return originals.length; },
    };
}

const {jsx:_jsx$6} = await importShared('react/jsx-runtime');

const {useEffect: useEffect$8,useRef: useRef$8} = await importShared('react');

const {useFrame: useFrame$6} = await importShared('@react-three/fiber');
function XriftModelInstancing({ entityIds, entityKey = "xriftEntityId", root }) {
    const anchor = useRef$8(null);
    const manager = useRef$8(null);
    const elapsed = useRef$8(0);
    useEffect$8(() => {
        const target = root ?? anchor.current?.parent;
        if (!target || entityIds.length === 0)
            return;
        const current = createModelInstancing(target, entityIds, entityKey);
        manager.current = current;
        // Models/materials can finish loading after the parent Suspense boundary.
        current.update();
        return () => { manager.current = null; current.dispose(); };
    }, [root, entityIds, entityKey]);
    useFrame$6((_, delta) => {
        elapsed.current += delta;
        if (elapsed.current < 0.5)
            return;
        elapsed.current = 0;
        manager.current?.update();
    });
    return _jsx$6("group", { ref: anchor });
}

/** Keep late-loaded/replaced children in the official raycaster's layer.
 * Object3D child events avoid traversing every model on every frame. */
function trackInteractionLayer(root, layer) {
    const previous = new Map();
    const added = (event) => attach(event.child);
    const removed = (event) => detach(event.child);
    function attach(object) {
        if (previous.has(object))
            return;
        previous.set(object, object.layers.isEnabled(layer));
        object.layers.enable(layer);
        object.addEventListener("childadded", added);
        object.addEventListener("childremoved", removed);
        object.children.forEach(attach);
    }
    function detach(object) {
        if (!previous.has(object))
            return;
        object.removeEventListener("childadded", added);
        object.removeEventListener("childremoved", removed);
        object.children.forEach(detach);
        if (!previous.get(object))
            object.layers.disable(layer);
        previous.delete(object);
    }
    attach(root);
    return () => detach(root);
}

const {jsx:_jsx$5} = await importShared('react/jsx-runtime');

const {useEffect: useEffect$7,useRef: useRef$7} = await importShared('react');

const {Interactable,LAYERS} = await importShared('@xrift/world-components');
/** Preserve official registration, metadata and callbacks, including enabled. */
function XriftInteractable({ children, ...props }) {
    const content = useRef$7(null);
    useEffect$7(() => {
        if (content.current)
            return trackInteractionLayer(content.current, LAYERS.INTERACTABLE);
    }, []);
    return _jsx$5(Interactable, { ...props, children: _jsx$5("group", { ref: content, children: children }) });
}

/**
 * @module CopyShader
 * @three_import import { CopyShader } from 'three/addons/shaders/CopyShader.js';
 */

/**
 * Full-screen copy shader pass.
 *
 * @constant
 * @type {ShaderMaterial~Shader}
 */
const CopyShader = {

	name: 'CopyShader',

	uniforms: {

		'tDiffuse': { value: null },
		'opacity': { value: 1.0 }

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

	fragmentShader: /* glsl */`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`

};

const {BufferGeometry: BufferGeometry$3,Float32BufferAttribute: Float32BufferAttribute$2,OrthographicCamera,Mesh: Mesh$5} = await importShared('three');


/**
 * Abstract base class for all post processing passes.
 *
 * This module is only relevant for post processing with {@link WebGLRenderer}.
 *
 * @abstract
 * @three_import import { Pass } from 'three/addons/postprocessing/Pass.js';
 */
class Pass {

	/**
	 * Constructs a new pass.
	 */
	constructor() {

		/**
		 * This flag can be used for type testing.
		 *
		 * @type {boolean}
		 * @readonly
		 * @default true
		 */
		this.isPass = true;

		/**
		 * If set to `true`, the pass is processed by the composer.
		 *
		 * @type {boolean}
		 * @default true
		 */
		this.enabled = true;

		/**
		 * If set to `true`, the pass indicates to swap read and write buffer after rendering.
		 *
		 * @type {boolean}
		 * @default true
		 */
		this.needsSwap = true;

		/**
		 * If set to `true`, the pass clears its buffer before rendering
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.clear = false;

		/**
		 * If set to `true`, the result of the pass is rendered to screen. The last pass in the composers
		 * pass chain gets automatically rendered to screen, no matter how this property is configured.
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.renderToScreen = false;

	}

	/**
	 * Sets the size of the pass.
	 *
	 * @abstract
	 * @param {number} width - The width to set.
	 * @param {number} height - The height to set.
	 */
	setSize( /* width, height */ ) {}

	/**
	 * This method holds the render logic of a pass. It must be implemented in all derived classes.
	 *
	 * @abstract
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {WebGLRenderTarget} writeBuffer - The write buffer. This buffer is intended as the rendering
	 * destination for the pass.
	 * @param {WebGLRenderTarget} readBuffer - The read buffer. The pass can access the result from the
	 * previous pass from this buffer.
	 * @param {number} deltaTime - The delta time in seconds.
	 * @param {boolean} maskActive - Whether masking is active or not.
	 */
	render( /* renderer, writeBuffer, readBuffer, deltaTime, maskActive */ ) {

		console.error( 'THREE.Pass: .render() must be implemented in derived pass.' );

	}

	/**
	 * Frees the GPU-related resources allocated by this instance. Call this
	 * method whenever the pass is no longer used in your app.
	 *
	 * @abstract
	 */
	dispose() {}

}

// Helper for passes that need to fill the viewport with a single quad.

const _camera = new OrthographicCamera( -1, 1, 1, -1, 0, 1 );

// https://github.com/mrdoob/three.js/pull/21358

class FullscreenTriangleGeometry extends BufferGeometry$3 {

	constructor() {

		super();

		this.setAttribute( 'position', new Float32BufferAttribute$2( [ -1, 3, 0, -1, -1, 0, 3, -1, 0 ], 3 ) );
		this.setAttribute( 'uv', new Float32BufferAttribute$2( [ 0, 2, 0, 0, 2, 0 ], 2 ) );

	}

}

const _geometry = new FullscreenTriangleGeometry();


/**
 * This module is a helper for passes which need to render a full
 * screen effect which is quite common in context of post processing.
 *
 * The intended usage is to reuse a single full screen quad for rendering
 * subsequent passes by just reassigning the `material` reference.
 *
 * This module can only be used with {@link WebGLRenderer}.
 *
 * @augments Mesh
 * @three_import import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
 */
class FullScreenQuad {

	/**
	 * Constructs a new full screen quad.
	 *
	 * @param {?Material} material - The material to render te full screen quad with.
	 */
	constructor( material ) {

		this._mesh = new Mesh$5( _geometry, material );

	}

	/**
	 * Frees the GPU-related resources allocated by this instance. Call this
	 * method whenever the instance is no longer used in your app.
	 */
	dispose() {

		this._mesh.geometry.dispose();

	}

	/**
	 * Renders the full screen quad.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 */
	render( renderer ) {

		renderer.render( this._mesh, _camera );

	}

	/**
	 * The quad's material.
	 *
	 * @type {?Material}
	 */
	get material() {

		return this._mesh.material;

	}

	set material( value ) {

		this._mesh.material = value;

	}

}

const {ShaderMaterial: ShaderMaterial$4,UniformsUtils: UniformsUtils$2} = await importShared('three');

/**
 * This pass can be used to create a post processing effect
 * with a raw GLSL shader object. Useful for implementing custom
 * effects.
 *
 * ```js
 * const fxaaPass = new ShaderPass( FXAAShader );
 * composer.addPass( fxaaPass );
 * ```
 *
 * @augments Pass
 * @three_import import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
 */
class ShaderPass extends Pass {

	/**
	 * Constructs a new shader pass.
	 *
	 * @param {Object|ShaderMaterial} [shader] - A shader object holding vertex and fragment shader as well as
	 * defines and uniforms. It's also valid to pass a custom shader material.
	 * @param {string} [textureID='tDiffuse'] - The name of the texture uniform that should sample
	 * the read buffer.
	 */
	constructor( shader, textureID = 'tDiffuse' ) {

		super();

		/**
		 * The name of the texture uniform that should sample the read buffer.
		 *
		 * @type {string}
		 * @default 'tDiffuse'
		 */
		this.textureID = textureID;

		/**
		 * The pass uniforms.
		 *
		 * @type {?Object}
		 */
		this.uniforms = null;

		/**
		 * The pass material.
		 *
		 * @type {?ShaderMaterial}
		 */
		this.material = null;

		if ( shader instanceof ShaderMaterial$4 ) {

			this.uniforms = shader.uniforms;

			this.material = shader;

		} else if ( shader ) {

			this.uniforms = UniformsUtils$2.clone( shader.uniforms );

			this.material = new ShaderMaterial$4( {

				name: ( shader.name !== undefined ) ? shader.name : 'unspecified',
				defines: Object.assign( {}, shader.defines ),
				uniforms: this.uniforms,
				vertexShader: shader.vertexShader,
				fragmentShader: shader.fragmentShader

			} );

		}

		// internals

		this._fsQuad = new FullScreenQuad( this.material );

	}

	/**
	 * Performs the shader pass.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {WebGLRenderTarget} writeBuffer - The write buffer. This buffer is intended as the rendering
	 * destination for the pass.
	 * @param {WebGLRenderTarget} readBuffer - The read buffer. The pass can access the result from the
	 * previous pass from this buffer.
	 * @param {number} deltaTime - The delta time in seconds.
	 * @param {boolean} maskActive - Whether masking is active or not.
	 */
	render( renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */ ) {

		if ( this.uniforms[ this.textureID ] ) {

			this.uniforms[ this.textureID ].value = readBuffer.texture;

		}

		this._fsQuad.material = this.material;

		if ( this.renderToScreen ) {

			renderer.setRenderTarget( null );
			this._fsQuad.render( renderer );

		} else {

			renderer.setRenderTarget( writeBuffer );
			// TODO: Avoid using autoClear properties, see https://github.com/mrdoob/three.js/pull/15571#issuecomment-465669600
			if ( this.clear ) renderer.clear( renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil );
			this._fsQuad.render( renderer );

		}

	}

	/**
	 * Frees the GPU-related resources allocated by this instance. Call this
	 * method whenever the pass is no longer used in your app.
	 */
	dispose() {

		this.material.dispose();

		this._fsQuad.dispose();

	}

}

/**
 * This pass can be used to define a mask during post processing.
 * Meaning only areas of subsequent post processing are affected
 * which lie in the masking area of this pass. Internally, the masking
 * is implemented with the stencil buffer.
 *
 * ```js
 * const maskPass = new MaskPass( scene, camera );
 * composer.addPass( maskPass );
 * ```
 *
 * @augments Pass
 * @three_import import { MaskPass } from 'three/addons/postprocessing/MaskPass.js';
 */
class MaskPass extends Pass {

	/**
	 * Constructs a new mask pass.
	 *
	 * @param {Scene} scene - The 3D objects in this scene will define the mask.
	 * @param {Camera} camera - The camera.
	 */
	constructor( scene, camera ) {

		super();

		/**
		 * The scene that defines the mask.
		 *
		 * @type {Scene}
		 */
		this.scene = scene;

		/**
		 * The camera.
		 *
		 * @type {Camera}
		 */
		this.camera = camera;

		/**
		 * Overwritten to perform a clear operation by default.
		 *
		 * @type {boolean}
		 * @default true
		 */
		this.clear = true;

		/**
		 * Overwritten to disable the swap.
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.needsSwap = false;

		/**
		 * Whether to inverse the mask or not.
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.inverse = false;

	}

	/**
	 * Performs a mask pass with the configured scene and camera.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {WebGLRenderTarget} writeBuffer - The write buffer. This buffer is intended as the rendering
	 * destination for the pass.
	 * @param {WebGLRenderTarget} readBuffer - The read buffer. The pass can access the result from the
	 * previous pass from this buffer.
	 * @param {number} deltaTime - The delta time in seconds.
	 * @param {boolean} maskActive - Whether masking is active or not.
	 */
	render( renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */ ) {

		const context = renderer.getContext();
		const state = renderer.state;

		// don't update color or depth

		state.buffers.color.setMask( false );
		state.buffers.depth.setMask( false );

		// lock buffers

		state.buffers.color.setLocked( true );
		state.buffers.depth.setLocked( true );

		// set up stencil

		let writeValue, clearValue;

		if ( this.inverse ) {

			writeValue = 0;
			clearValue = 1;

		} else {

			writeValue = 1;
			clearValue = 0;

		}

		state.buffers.stencil.setTest( true );
		state.buffers.stencil.setOp( context.REPLACE, context.REPLACE, context.REPLACE );
		state.buffers.stencil.setFunc( context.ALWAYS, writeValue, 0xffffffff );
		state.buffers.stencil.setClear( clearValue );
		state.buffers.stencil.setLocked( true );

		// draw into the stencil buffer

		renderer.setRenderTarget( readBuffer );
		if ( this.clear ) renderer.clear();
		renderer.render( this.scene, this.camera );

		renderer.setRenderTarget( writeBuffer );
		if ( this.clear ) renderer.clear();
		renderer.render( this.scene, this.camera );

		// unlock color and depth buffer and make them writable for subsequent rendering/clearing

		state.buffers.color.setLocked( false );
		state.buffers.depth.setLocked( false );

		state.buffers.color.setMask( true );
		state.buffers.depth.setMask( true );

		// only render where stencil is set to 1

		state.buffers.stencil.setLocked( false );
		state.buffers.stencil.setFunc( context.EQUAL, 1, 0xffffffff ); // draw if == 1
		state.buffers.stencil.setOp( context.KEEP, context.KEEP, context.KEEP );
		state.buffers.stencil.setLocked( true );

	}

}

/**
 * This pass can be used to clear a mask previously defined with {@link MaskPass}.
 *
 * ```js
 * const clearPass = new ClearMaskPass();
 * composer.addPass( clearPass );
 * ```
 *
 * @augments Pass
 */
class ClearMaskPass extends Pass {

	/**
	 * Constructs a new clear mask pass.
	 */
	constructor() {

		super();

		/**
		 * Overwritten to disable the swap.
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.needsSwap = false;

	}

	/**
	 * Performs the clear of the currently defined mask.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {WebGLRenderTarget} writeBuffer - The write buffer. This buffer is intended as the rendering
	 * destination for the pass.
	 * @param {WebGLRenderTarget} readBuffer - The read buffer. The pass can access the result from the
	 * previous pass from this buffer.
	 * @param {number} deltaTime - The delta time in seconds.
	 * @param {boolean} maskActive - Whether masking is active or not.
	 */
	render( renderer /*, writeBuffer, readBuffer, deltaTime, maskActive */ ) {

		renderer.state.buffers.stencil.setLocked( false );
		renderer.state.buffers.stencil.setTest( false );

	}

}

const {HalfFloatType: HalfFloatType$5,NoBlending: NoBlending$1,Timer,Vector2: Vector2$4,WebGLRenderTarget: WebGLRenderTarget$3} = await importShared('three');

/**
 * Used to implement post-processing effects in three.js.
 * The class manages a chain of post-processing passes to produce the final visual result.
 * Post-processing passes are executed in order of their addition/insertion.
 * The last pass is automatically rendered to screen.
 *
 * This module can only be used with {@link WebGLRenderer}.
 *
 * ```js
 * const composer = new EffectComposer( renderer );
 *
 * // adding some passes
 * const renderPass = new RenderPass( scene, camera );
 * composer.addPass( renderPass );
 *
 * const glitchPass = new GlitchPass();
 * composer.addPass( glitchPass );
 *
 * const outputPass = new OutputPass()
 * composer.addPass( outputPass );
 *
 * function animate() {
 *
 * 	composer.render(); // instead of renderer.render()
 *
 * }
 * ```
 *
 * @three_import import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
 */
class EffectComposer {

	/**
	 * Constructs a new effect composer.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {WebGLRenderTarget} [renderTarget] - This render target and a clone will
	 * be used as the internal read and write buffers. If not given, the composer creates
	 * the buffers automatically.
	 */
	constructor( renderer, renderTarget ) {

		/**
		 * The renderer.
		 *
		 * @type {WebGLRenderer}
		 */
		this.renderer = renderer;

		this._pixelRatio = renderer.getPixelRatio();

		if ( renderTarget === undefined ) {

			const size = renderer.getSize( new Vector2$4() );
			this._width = size.width;
			this._height = size.height;

			renderTarget = new WebGLRenderTarget$3( this._width * this._pixelRatio, this._height * this._pixelRatio, { type: HalfFloatType$5 } );
			renderTarget.texture.name = 'EffectComposer.rt1';

		} else {

			this._width = renderTarget.width;
			this._height = renderTarget.height;

		}

		this.renderTarget1 = renderTarget;
		this.renderTarget2 = renderTarget.clone();
		this.renderTarget2.texture.name = 'EffectComposer.rt2';

		/**
		 * A reference to the internal write buffer. Passes usually write
		 * their result into this buffer.
		 *
		 * @type {WebGLRenderTarget}
		 */
		this.writeBuffer = this.renderTarget1;

		/**
		 * A reference to the internal read buffer. Passes usually read
		 * the previous render result from this buffer.
		 *
		 * @type {WebGLRenderTarget}
		 */
		this.readBuffer = this.renderTarget2;

		/**
		 * Whether the final pass is rendered to the screen (default framebuffer) or not.
		 *
		 * @type {boolean}
		 * @default true
		 */
		this.renderToScreen = true;

		/**
		 * An array representing the (ordered) chain of post-processing passes.
		 *
		 * @type {Array<Pass>}
		 */
		this.passes = [];

		/**
		 * A copy pass used for internal swap operations.
		 *
		 * @private
		 * @type {ShaderPass}
		 */
		this.copyPass = new ShaderPass( CopyShader );
		this.copyPass.material.blending = NoBlending$1;

		/**
		 * The internal timer for managing time data.
		 *
		 * @private
		 * @type {Timer}
		 */
		this.timer = new Timer();

	}

	/**
	 * Swaps the internal read/write buffers.
	 */
	swapBuffers() {

		const tmp = this.readBuffer;
		this.readBuffer = this.writeBuffer;
		this.writeBuffer = tmp;

	}

	/**
	 * Adds the given pass to the pass chain.
	 *
	 * @param {Pass} pass - The pass to add.
	 */
	addPass( pass ) {

		this.passes.push( pass );
		pass.setSize( this._width * this._pixelRatio, this._height * this._pixelRatio );

	}

	/**
	 * Inserts the given pass at a given index.
	 *
	 * @param {Pass} pass - The pass to insert.
	 * @param {number} index - The index into the pass chain.
	 */
	insertPass( pass, index ) {

		this.passes.splice( index, 0, pass );
		pass.setSize( this._width * this._pixelRatio, this._height * this._pixelRatio );

	}

	/**
	 * Removes the given pass from the pass chain.
	 *
	 * @param {Pass} pass - The pass to remove.
	 */
	removePass( pass ) {

		const index = this.passes.indexOf( pass );

		if ( index !== -1 ) {

			this.passes.splice( index, 1 );

		}

	}

	/**
	 * Returns `true` if the pass for the given index is the last enabled pass in the pass chain.
	 *
	 * @param {number} passIndex - The pass index.
	 * @return {boolean} Whether the pass for the given index is the last pass in the pass chain.
	 */
	isLastEnabledPass( passIndex ) {

		for ( let i = passIndex + 1; i < this.passes.length; i ++ ) {

			if ( this.passes[ i ].enabled ) {

				return false;

			}

		}

		return true;

	}

	/**
	 * Executes all enabled post-processing passes in order to produce the final frame.
	 *
	 * @param {number} deltaTime - The delta time in seconds. If not given, the composer computes
	 * its own time delta value.
	 */
	render( deltaTime ) {

		// deltaTime value is in seconds

		this.timer.update();

		if ( deltaTime === undefined ) {

			deltaTime = this.timer.getDelta();

		}

		const currentRenderTarget = this.renderer.getRenderTarget();

		let maskActive = false;

		for ( let i = 0, il = this.passes.length; i < il; i ++ ) {

			const pass = this.passes[ i ];

			if ( pass.enabled === false ) continue;

			pass.renderToScreen = ( this.renderToScreen && this.isLastEnabledPass( i ) );
			pass.render( this.renderer, this.writeBuffer, this.readBuffer, deltaTime, maskActive );

			if ( pass.needsSwap ) {

				if ( maskActive ) {

					const context = this.renderer.getContext();
					const stencil = this.renderer.state.buffers.stencil;

					//context.stencilFunc( context.NOTEQUAL, 1, 0xffffffff );
					stencil.setFunc( context.NOTEQUAL, 1, 0xffffffff );

					this.copyPass.render( this.renderer, this.writeBuffer, this.readBuffer, deltaTime );

					//context.stencilFunc( context.EQUAL, 1, 0xffffffff );
					stencil.setFunc( context.EQUAL, 1, 0xffffffff );

				}

				this.swapBuffers();

			}

			if ( MaskPass !== undefined ) {

				if ( pass instanceof MaskPass ) {

					maskActive = true;

				} else if ( pass instanceof ClearMaskPass ) {

					maskActive = false;

				}

			}

		}

		this.renderer.setRenderTarget( currentRenderTarget );

	}

	/**
	 * Resets the internal state of the EffectComposer.
	 *
	 * @param {WebGLRenderTarget} [renderTarget] - This render target has the same purpose like
	 * the one from the constructor. If set, it is used to setup the read and write buffers.
	 */
	reset( renderTarget ) {

		if ( renderTarget === undefined ) {

			const size = this.renderer.getSize( new Vector2$4() );
			this._pixelRatio = this.renderer.getPixelRatio();
			this._width = size.width;
			this._height = size.height;

			renderTarget = this.renderTarget1.clone();
			renderTarget.setSize( this._width * this._pixelRatio, this._height * this._pixelRatio );

		}

		this.renderTarget1.dispose();
		this.renderTarget2.dispose();
		this.renderTarget1 = renderTarget;
		this.renderTarget2 = renderTarget.clone();

		this.writeBuffer = this.renderTarget1;
		this.readBuffer = this.renderTarget2;

	}

	/**
	 * Resizes the internal read and write buffers as well as all passes. Similar to {@link WebGLRenderer#setSize},
	 * this method honors the current pixel ration.
	 *
	 * @param {number} width - The width in logical pixels.
	 * @param {number} height - The height in logical pixels.
	 */
	setSize( width, height ) {

		this._width = width;
		this._height = height;

		const effectiveWidth = this._width * this._pixelRatio;
		const effectiveHeight = this._height * this._pixelRatio;

		this.renderTarget1.setSize( effectiveWidth, effectiveHeight );
		this.renderTarget2.setSize( effectiveWidth, effectiveHeight );

		for ( let i = 0; i < this.passes.length; i ++ ) {

			this.passes[ i ].setSize( effectiveWidth, effectiveHeight );

		}

	}

	/**
	 * Sets device pixel ratio. This is usually used for HiDPI device to prevent blurring output.
	 * Setting the pixel ratio will automatically resize the composer.
	 *
	 * @param {number} pixelRatio - The pixel ratio to set.
	 */
	setPixelRatio( pixelRatio ) {

		this._pixelRatio = pixelRatio;

		this.setSize( this._width, this._height );

	}

	/**
	 * Frees the GPU-related resources allocated by this instance. Call this
	 * method whenever the composer is no longer used in your app.
	 */
	dispose() {

		this.renderTarget1.dispose();
		this.renderTarget2.dispose();

		this.copyPass.dispose();

	}

}

const {Color: Color$9} = await importShared('three');

/**
 * This class represents a render pass. It takes a camera and a scene and produces
 * a beauty pass for subsequent post processing effects.
 *
 * ```js
 * const renderPass = new RenderPass( scene, camera );
 * composer.addPass( renderPass );
 * ```
 *
 * @augments Pass
 * @three_import import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
 */
class RenderPass extends Pass {

	/**
	 * Constructs a new render pass.
	 *
	 * @param {Scene} scene - The scene to render.
	 * @param {Camera} camera - The camera.
	 * @param {?Material} [overrideMaterial=null] - The override material. If set, this material is used
	 * for all objects in the scene.
	 * @param {?(number|Color|string)} [clearColor=null] - The clear color of the render pass.
	 * @param {?number} [clearAlpha=null] - The clear alpha of the render pass.
	 */
	constructor( scene, camera, overrideMaterial = null, clearColor = null, clearAlpha = null ) {

		super();

		/**
		 * The scene to render.
		 *
		 * @type {Scene}
		 */
		this.scene = scene;

		/**
		 * The camera.
		 *
		 * @type {Camera}
		 */
		this.camera = camera;

		/**
		 * The override material. If set, this material is used
		 * for all objects in the scene.
		 *
		 * @type {?Material}
		 * @default null
		 */
		this.overrideMaterial = overrideMaterial;

		/**
		 * The clear color of the render pass.
		 *
		 * @type {?(number|Color|string)}
		 * @default null
		 */
		this.clearColor = clearColor;

		/**
		 * The clear alpha of the render pass.
		 *
		 * @type {?number}
		 * @default null
		 */
		this.clearAlpha = clearAlpha;

		/**
		 * Overwritten to perform a clear operation by default.
		 *
		 * @type {boolean}
		 * @default true
		 */
		this.clear = true;

		/**
		 * If set to `true`, only the depth can be cleared when `clear` is to `false`.
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.clearDepth = false;

		/**
		 * Overwritten to disable the swap.
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.needsSwap = false;

		/**
		 * This flag indicates that this pass renders the scene itself.
		 *
		 * @type {boolean}
		 * @readonly
		 * @default true
		 */
		this.isRenderPass = true;

		this._oldClearColor = new Color$9();

	}

	/**
	 * Performs a beauty pass with the configured scene and camera.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {WebGLRenderTarget} writeBuffer - The write buffer. This buffer is intended as the rendering
	 * destination for the pass.
	 * @param {WebGLRenderTarget} readBuffer - The read buffer. The pass can access the result from the
	 * previous pass from this buffer.
	 * @param {number} deltaTime - The delta time in seconds.
	 * @param {boolean} maskActive - Whether masking is active or not.
	 */
	render( renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */ ) {

		const oldAutoClear = renderer.autoClear;
		renderer.autoClear = false;

		let oldClearAlpha, oldOverrideMaterial;

		if ( this.overrideMaterial !== null ) {

			oldOverrideMaterial = this.scene.overrideMaterial;

			this.scene.overrideMaterial = this.overrideMaterial;

		}

		if ( this.clearColor !== null ) {

			renderer.getClearColor( this._oldClearColor );
			renderer.setClearColor( this.clearColor, renderer.getClearAlpha() );

		}

		if ( this.clearAlpha !== null ) {

			oldClearAlpha = renderer.getClearAlpha();
			renderer.setClearAlpha( this.clearAlpha );

		}

		if ( this.clearDepth == true ) {

			renderer.clearDepth();

		}

		renderer.setRenderTarget( this.renderToScreen ? null : readBuffer );

		if ( this.clear === true ) {

			// TODO: Avoid using autoClear properties, see https://github.com/mrdoob/three.js/pull/15571#issuecomment-465669600
			renderer.clear( renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil );

		}

		renderer.render( this.scene, this.camera );

		// restore

		if ( this.clearColor !== null ) {

			renderer.setClearColor( this._oldClearColor );

		}

		if ( this.clearAlpha !== null ) {

			renderer.setClearAlpha( oldClearAlpha );

		}

		if ( this.overrideMaterial !== null ) {

			this.scene.overrideMaterial = oldOverrideMaterial;

		}

		renderer.autoClear = oldAutoClear;

	}

}

/**
 * A utility class providing noise functions.
 *
 * The code is based on [Simplex noise demystified](https://web.archive.org/web/20210210162332/http://staffwww.itn.liu.se/~stegu/simplexnoise/simplexnoise.pdf)
 * by Stefan Gustavson, 2005.
 *
 * @three_import import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
 */
class SimplexNoise {

	/**
	 * Constructs a new simplex noise object.
	 *
	 * @param {Object} [r=Math] - A math utility class that holds a `random()` method. This makes it
	 * possible to pass in custom random number generator.
	 */
	constructor( r = Math ) {

		this.grad3 = [[ 1, 1, 0 ], [ -1, 1, 0 ], [ 1, -1, 0 ], [ -1, -1, 0 ],
			[ 1, 0, 1 ], [ -1, 0, 1 ], [ 1, 0, -1 ], [ -1, 0, -1 ],
			[ 0, 1, 1 ], [ 0, -1, 1 ], [ 0, 1, -1 ], [ 0, -1, -1 ]];

		this.grad4 = [[ 0, 1, 1, 1 ], [ 0, 1, 1, -1 ], [ 0, 1, -1, 1 ], [ 0, 1, -1, -1 ],
			[ 0, -1, 1, 1 ], [ 0, -1, 1, -1 ], [ 0, -1, -1, 1 ], [ 0, -1, -1, -1 ],
			[ 1, 0, 1, 1 ], [ 1, 0, 1, -1 ], [ 1, 0, -1, 1 ], [ 1, 0, -1, -1 ],
			[ -1, 0, 1, 1 ], [ -1, 0, 1, -1 ], [ -1, 0, -1, 1 ], [ -1, 0, -1, -1 ],
			[ 1, 1, 0, 1 ], [ 1, 1, 0, -1 ], [ 1, -1, 0, 1 ], [ 1, -1, 0, -1 ],
			[ -1, 1, 0, 1 ], [ -1, 1, 0, -1 ], [ -1, -1, 0, 1 ], [ -1, -1, 0, -1 ],
			[ 1, 1, 1, 0 ], [ 1, 1, -1, 0 ], [ 1, -1, 1, 0 ], [ 1, -1, -1, 0 ],
			[ -1, 1, 1, 0 ], [ -1, 1, -1, 0 ], [ -1, -1, 1, 0 ], [ -1, -1, -1, 0 ]];

		this.p = [];

		for ( let i = 0; i < 256; i ++ ) {

			this.p[ i ] = Math.floor( r.random() * 256 );

		}

		// To remove the need for index wrapping, double the permutation table length
		this.perm = [];

		for ( let i = 0; i < 512; i ++ ) {

			this.perm[ i ] = this.p[ i & 255 ];

		}

		// A lookup table to traverse the simplex around a given point in 4D.
		// Details can be found where this table is used, in the 4D noise method.
		this.simplex = [
			[ 0, 1, 2, 3 ], [ 0, 1, 3, 2 ], [ 0, 0, 0, 0 ], [ 0, 2, 3, 1 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 1, 2, 3, 0 ],
			[ 0, 2, 1, 3 ], [ 0, 0, 0, 0 ], [ 0, 3, 1, 2 ], [ 0, 3, 2, 1 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 1, 3, 2, 0 ],
			[ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ],
			[ 1, 2, 0, 3 ], [ 0, 0, 0, 0 ], [ 1, 3, 0, 2 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 2, 3, 0, 1 ], [ 2, 3, 1, 0 ],
			[ 1, 0, 2, 3 ], [ 1, 0, 3, 2 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 2, 0, 3, 1 ], [ 0, 0, 0, 0 ], [ 2, 1, 3, 0 ],
			[ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ],
			[ 2, 0, 1, 3 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 3, 0, 1, 2 ], [ 3, 0, 2, 1 ], [ 0, 0, 0, 0 ], [ 3, 1, 2, 0 ],
			[ 2, 1, 0, 3 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 3, 1, 0, 2 ], [ 0, 0, 0, 0 ], [ 3, 2, 0, 1 ], [ 3, 2, 1, 0 ]];

	}

	/**
	 * A 2D simplex noise method.
	 *
	 * @param {number} xin - The x coordinate.
	 * @param {number} yin - The y coordinate.
	 * @return {number} The noise value.
	 */
	noise( xin, yin ) {

		let n0; // Noise contributions from the three corners
		let n1;
		let n2;
		// Skew the input space to determine which simplex cell we're in
		const F2 = 0.5 * ( Math.sqrt( 3.0 ) - 1.0 );
		const s = ( xin + yin ) * F2; // Hairy factor for 2D
		const i = Math.floor( xin + s );
		const j = Math.floor( yin + s );
		const G2 = ( 3.0 - Math.sqrt( 3.0 ) ) / 6.0;
		const t = ( i + j ) * G2;
		const X0 = i - t; // Unskew the cell origin back to (x,y) space
		const Y0 = j - t;
		const x0 = xin - X0; // The x,y distances from the cell origin
		const y0 = yin - Y0;

		// For the 2D case, the simplex shape is an equilateral triangle.
		// Determine which simplex we are in.
		let i1; // Offsets for second (middle) corner of simplex in (i,j) coords

		let j1;
		if ( x0 > y0 ) {

			i1 = 1; j1 = 0;

			// lower triangle, XY order: (0,0)->(1,0)->(1,1)

		}	else {

			i1 = 0; j1 = 1;

		} // upper triangle, YX order: (0,0)->(0,1)->(1,1)

		// A step of (1,0) in (i,j) means a step of (1-c,-c) in (x,y), and
		// a step of (0,1) in (i,j) means a step of (-c,1-c) in (x,y), where
		// c = (3-sqrt(3))/6
		const x1 = x0 - i1 + G2; // Offsets for middle corner in (x,y) unskewed coords
		const y1 = y0 - j1 + G2;
		const x2 = x0 - 1.0 + 2.0 * G2; // Offsets for last corner in (x,y) unskewed coords
		const y2 = y0 - 1.0 + 2.0 * G2;
		// Work out the hashed gradient indices of the three simplex corners
		const ii = i & 255;
		const jj = j & 255;
		const gi0 = this.perm[ ii + this.perm[ jj ] ] % 12;
		const gi1 = this.perm[ ii + i1 + this.perm[ jj + j1 ] ] % 12;
		const gi2 = this.perm[ ii + 1 + this.perm[ jj + 1 ] ] % 12;
		// Calculate the contribution from the three corners
		let t0 = 0.5 - x0 * x0 - y0 * y0;
		if ( t0 < 0 ) n0 = 0.0;
		else {

			t0 *= t0;
			n0 = t0 * t0 * this._dot( this.grad3[ gi0 ], x0, y0 ); // (x,y) of grad3 used for 2D gradient

		}

		let t1 = 0.5 - x1 * x1 - y1 * y1;
		if ( t1 < 0 ) n1 = 0.0;
		else {

			t1 *= t1;
			n1 = t1 * t1 * this._dot( this.grad3[ gi1 ], x1, y1 );

		}

		let t2 = 0.5 - x2 * x2 - y2 * y2;
		if ( t2 < 0 ) n2 = 0.0;
		else {

			t2 *= t2;
			n2 = t2 * t2 * this._dot( this.grad3[ gi2 ], x2, y2 );

		}

		// Add contributions from each corner to get the final noise value.
		// The result is scaled to return values in the interval [-1,1].
		return 70.0 * ( n0 + n1 + n2 );

	}

	/**
	 * A 3D simplex noise method.
	 *
	 * @param {number} xin - The x coordinate.
	 * @param {number} yin - The y coordinate.
	 * @param {number} zin - The z coordinate.
	 * @return {number} The noise value.
	 */
	noise3d( xin, yin, zin ) {

		let n0; // Noise contributions from the four corners
		let n1;
		let n2;
		let n3;
		// Skew the input space to determine which simplex cell we're in
		const F3 = 1.0 / 3.0;
		const s = ( xin + yin + zin ) * F3; // Very nice and simple skew factor for 3D
		const i = Math.floor( xin + s );
		const j = Math.floor( yin + s );
		const k = Math.floor( zin + s );
		const G3 = 1.0 / 6.0; // Very nice and simple unskew factor, too
		const t = ( i + j + k ) * G3;
		const X0 = i - t; // Unskew the cell origin back to (x,y,z) space
		const Y0 = j - t;
		const Z0 = k - t;
		const x0 = xin - X0; // The x,y,z distances from the cell origin
		const y0 = yin - Y0;
		const z0 = zin - Z0;

		// For the 3D case, the simplex shape is a slightly irregular tetrahedron.
		// Determine which simplex we are in.
		let i1; // Offsets for second corner of simplex in (i,j,k) coords

		let j1;
		let k1;
		let i2; // Offsets for third corner of simplex in (i,j,k) coords
		let j2;
		let k2;
		if ( x0 >= y0 ) {

			if ( y0 >= z0 ) {

				i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;

				// X Y Z order

			} else if ( x0 >= z0 ) {

				i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;

				// X Z Y order

			} else {

				i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;

			} // Z X Y order

		} else { // x0<y0

			if ( y0 < z0 ) {

				i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;

				// Z Y X order

			} else if ( x0 < z0 ) {

				i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;

				// Y Z X order

			} else {

				i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;

			} // Y X Z order

		}

		// A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z),
		// a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
		// a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where
		// c = 1/6.
		const x1 = x0 - i1 + G3; // Offsets for second corner in (x,y,z) coords
		const y1 = y0 - j1 + G3;
		const z1 = z0 - k1 + G3;
		const x2 = x0 - i2 + 2.0 * G3; // Offsets for third corner in (x,y,z) coords
		const y2 = y0 - j2 + 2.0 * G3;
		const z2 = z0 - k2 + 2.0 * G3;
		const x3 = x0 - 1.0 + 3.0 * G3; // Offsets for last corner in (x,y,z) coords
		const y3 = y0 - 1.0 + 3.0 * G3;
		const z3 = z0 - 1.0 + 3.0 * G3;
		// Work out the hashed gradient indices of the four simplex corners
		const ii = i & 255;
		const jj = j & 255;
		const kk = k & 255;
		const gi0 = this.perm[ ii + this.perm[ jj + this.perm[ kk ] ] ] % 12;
		const gi1 = this.perm[ ii + i1 + this.perm[ jj + j1 + this.perm[ kk + k1 ] ] ] % 12;
		const gi2 = this.perm[ ii + i2 + this.perm[ jj + j2 + this.perm[ kk + k2 ] ] ] % 12;
		const gi3 = this.perm[ ii + 1 + this.perm[ jj + 1 + this.perm[ kk + 1 ] ] ] % 12;
		// Calculate the contribution from the four corners
		let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
		if ( t0 < 0 ) n0 = 0.0;
		else {

			t0 *= t0;
			n0 = t0 * t0 * this._dot3( this.grad3[ gi0 ], x0, y0, z0 );

		}

		let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
		if ( t1 < 0 ) n1 = 0.0;
		else {

			t1 *= t1;
			n1 = t1 * t1 * this._dot3( this.grad3[ gi1 ], x1, y1, z1 );

		}

		let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
		if ( t2 < 0 ) n2 = 0.0;
		else {

			t2 *= t2;
			n2 = t2 * t2 * this._dot3( this.grad3[ gi2 ], x2, y2, z2 );

		}

		let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
		if ( t3 < 0 ) n3 = 0.0;
		else {

			t3 *= t3;
			n3 = t3 * t3 * this._dot3( this.grad3[ gi3 ], x3, y3, z3 );

		}

		// Add contributions from each corner to get the final noise value.
		// The result is scaled to stay just inside [-1,1]
		return 32.0 * ( n0 + n1 + n2 + n3 );

	}

	/**
	 * A 4D simplex noise method.
	 *
	 * @param {number} x - The x coordinate.
	 * @param {number} y - The y coordinate.
	 * @param {number} z - The z coordinate.
	 * @param {number} w - The w coordinate.
	 * @return {number} The noise value.
	 */
	noise4d( x, y, z, w ) {

		// For faster and easier lookups
		const grad4 = this.grad4;
		const simplex = this.simplex;
		const perm = this.perm;

		// The skewing and unskewing factors are hairy again for the 4D case
		const F4 = ( Math.sqrt( 5.0 ) - 1.0 ) / 4.0;
		const G4 = ( 5.0 - Math.sqrt( 5.0 ) ) / 20.0;
		let n0; // Noise contributions from the five corners
		let n1;
		let n2;
		let n3;
		let n4;
		// Skew the (x,y,z,w) space to determine which cell of 24 simplices we're in
		const s = ( x + y + z + w ) * F4; // Factor for 4D skewing
		const i = Math.floor( x + s );
		const j = Math.floor( y + s );
		const k = Math.floor( z + s );
		const l = Math.floor( w + s );
		const t = ( i + j + k + l ) * G4; // Factor for 4D unskewing
		const X0 = i - t; // Unskew the cell origin back to (x,y,z,w) space
		const Y0 = j - t;
		const Z0 = k - t;
		const W0 = l - t;
		const x0 = x - X0; // The x,y,z,w distances from the cell origin
		const y0 = y - Y0;
		const z0 = z - Z0;
		const w0 = w - W0;

		// For the 4D case, the simplex is a 4D shape I won't even try to describe.
		// To find out which of the 24 possible simplices we're in, we need to
		// determine the magnitude ordering of x0, y0, z0 and w0.
		// The method below is a good way of finding the ordering of x,y,z,w and
		// then find the correct traversal order for the simplex we’re in.
		// First, six pair-wise comparisons are performed between each possible pair
		// of the four coordinates, and the results are used to add up binary bits
		// for an integer index.
		const c1 = ( x0 > y0 ) ? 32 : 0;
		const c2 = ( x0 > z0 ) ? 16 : 0;
		const c3 = ( y0 > z0 ) ? 8 : 0;
		const c4 = ( x0 > w0 ) ? 4 : 0;
		const c5 = ( y0 > w0 ) ? 2 : 0;
		const c6 = ( z0 > w0 ) ? 1 : 0;
		const c = c1 + c2 + c3 + c4 + c5 + c6;

		// simplex[c] is a 4-vector with the numbers 0, 1, 2 and 3 in some order.
		// Many values of c will never occur, since e.g. x>y>z>w makes x<z, y<w and x<w
		// impossible. Only the 24 indices which have non-zero entries make any sense.
		// We use a thresholding to set the coordinates in turn from the largest magnitude.
		// The number 3 in the "simplex" array is at the position of the largest coordinate.
		const i1 = simplex[ c ][ 0 ] >= 3 ? 1 : 0;
		const j1 = simplex[ c ][ 1 ] >= 3 ? 1 : 0;
		const k1 = simplex[ c ][ 2 ] >= 3 ? 1 : 0;
		const l1 = simplex[ c ][ 3 ] >= 3 ? 1 : 0;
		// The number 2 in the "simplex" array is at the second largest coordinate.
		const i2 = simplex[ c ][ 0 ] >= 2 ? 1 : 0;
		const j2 = simplex[ c ][ 1 ] >= 2 ? 1 : 0;
		const k2 = simplex[ c ][ 2 ] >= 2 ? 1 : 0;
		const l2 = simplex[ c ][ 3 ] >= 2 ? 1 : 0;
		// The number 1 in the "simplex" array is at the second smallest coordinate.
		const i3 = simplex[ c ][ 0 ] >= 1 ? 1 : 0;
		const j3 = simplex[ c ][ 1 ] >= 1 ? 1 : 0;
		const k3 = simplex[ c ][ 2 ] >= 1 ? 1 : 0;
		const l3 = simplex[ c ][ 3 ] >= 1 ? 1 : 0;
		// The fifth corner has all coordinate offsets = 1, so no need to look that up.
		const x1 = x0 - i1 + G4; // Offsets for second corner in (x,y,z,w) coords
		const y1 = y0 - j1 + G4;
		const z1 = z0 - k1 + G4;
		const w1 = w0 - l1 + G4;
		const x2 = x0 - i2 + 2.0 * G4; // Offsets for third corner in (x,y,z,w) coords
		const y2 = y0 - j2 + 2.0 * G4;
		const z2 = z0 - k2 + 2.0 * G4;
		const w2 = w0 - l2 + 2.0 * G4;
		const x3 = x0 - i3 + 3.0 * G4; // Offsets for fourth corner in (x,y,z,w) coords
		const y3 = y0 - j3 + 3.0 * G4;
		const z3 = z0 - k3 + 3.0 * G4;
		const w3 = w0 - l3 + 3.0 * G4;
		const x4 = x0 - 1.0 + 4.0 * G4; // Offsets for last corner in (x,y,z,w) coords
		const y4 = y0 - 1.0 + 4.0 * G4;
		const z4 = z0 - 1.0 + 4.0 * G4;
		const w4 = w0 - 1.0 + 4.0 * G4;
		// Work out the hashed gradient indices of the five simplex corners
		const ii = i & 255;
		const jj = j & 255;
		const kk = k & 255;
		const ll = l & 255;
		const gi0 = perm[ ii + perm[ jj + perm[ kk + perm[ ll ] ] ] ] % 32;
		const gi1 = perm[ ii + i1 + perm[ jj + j1 + perm[ kk + k1 + perm[ ll + l1 ] ] ] ] % 32;
		const gi2 = perm[ ii + i2 + perm[ jj + j2 + perm[ kk + k2 + perm[ ll + l2 ] ] ] ] % 32;
		const gi3 = perm[ ii + i3 + perm[ jj + j3 + perm[ kk + k3 + perm[ ll + l3 ] ] ] ] % 32;
		const gi4 = perm[ ii + 1 + perm[ jj + 1 + perm[ kk + 1 + perm[ ll + 1 ] ] ] ] % 32;
		// Calculate the contribution from the five corners
		let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
		if ( t0 < 0 ) n0 = 0.0;
		else {

			t0 *= t0;
			n0 = t0 * t0 * this._dot4( grad4[ gi0 ], x0, y0, z0, w0 );

		}

		let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
		if ( t1 < 0 ) n1 = 0.0;
		else {

			t1 *= t1;
			n1 = t1 * t1 * this._dot4( grad4[ gi1 ], x1, y1, z1, w1 );

		}

		let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
		if ( t2 < 0 ) n2 = 0.0;
		else {

			t2 *= t2;
			n2 = t2 * t2 * this._dot4( grad4[ gi2 ], x2, y2, z2, w2 );

		}

		let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
		if ( t3 < 0 ) n3 = 0.0;
		else {

			t3 *= t3;
			n3 = t3 * t3 * this._dot4( grad4[ gi3 ], x3, y3, z3, w3 );

		}

		let t4 = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
		if ( t4 < 0 ) n4 = 0.0;
		else {

			t4 *= t4;
			n4 = t4 * t4 * this._dot4( grad4[ gi4 ], x4, y4, z4, w4 );

		}

		// Sum up and scale the result to cover the range [-1,1]
		return 27.0 * ( n0 + n1 + n2 + n3 + n4 );

	}

	// private

	_dot( g, x, y ) {

		return g[ 0 ] * x + g[ 1 ] * y;

	}

	_dot3( g, x, y, z ) {

		return g[ 0 ] * x + g[ 1 ] * y + g[ 2 ] * z;

	}

	_dot4( g, x, y, z, w ) {

		return g[ 0 ] * x + g[ 1 ] * y + g[ 2 ] * z + g[ 3 ] * w;

	}

}

const {Matrix4: Matrix4$1,Vector2: Vector2$3} = await importShared('three');


/**
 * @module SSAOShader
 * @three_import import { SSAOShader } from 'three/addons/shaders/SSAOShader.js';
 */

/**
 * SSAO shader.
 *
 * References:
 * - {@link http://john-chapman-graphics.blogspot.com/2013/01/ssao-tutorial.html}
 * - {@link https://learnopengl.com/Advanced-Lighting/SSAO}
 * - {@link https://github.com/McNopper/OpenGL/blob/master/Example28/shader/ssao.frag.glsl}
 *
 * @constant
 * @type {ShaderMaterial~Shader}
 */
const SSAOShader = {

	defines: {
		'PERSPECTIVE_CAMERA': 1,
		'KERNEL_SIZE': 32
	},

	uniforms: {

		'tNormal': { value: null },
		'tDepth': { value: null },
		'tNoise': { value: null },
		'kernel': { value: null },
		'cameraNear': { value: null },
		'cameraFar': { value: null },
		'resolution': { value: new Vector2$3() },
		'cameraProjectionMatrix': { value: new Matrix4$1() },
		'cameraInverseProjectionMatrix': { value: new Matrix4$1() },
		'kernelRadius': { value: 8 },
		'minDistance': { value: 0.005 },
		'maxDistance': { value: 0.05 },

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

	fragmentShader: /* glsl */`
		uniform highp sampler2D tNormal;
		uniform highp sampler2D tDepth;
		uniform sampler2D tNoise;

		uniform vec3 kernel[ KERNEL_SIZE ];

		uniform vec2 resolution;

		uniform float cameraNear;
		uniform float cameraFar;
		uniform mat4 cameraProjectionMatrix;
		uniform mat4 cameraInverseProjectionMatrix;

		uniform float kernelRadius;
		uniform float minDistance; // avoid artifacts caused by neighbour fragments with minimal depth difference
		uniform float maxDistance; // avoid the influence of fragments which are too far away

		varying vec2 vUv;

		#include <packing>

		#ifdef USE_REVERSED_DEPTH_BUFFER

			const float depthThreshold = 0.0;

		#else

			const float depthThreshold = 1.0;

		#endif

		float getDepth( const in vec2 screenPosition ) {

			return texture2D( tDepth, screenPosition ).x;

		}

		float getLinearDepth( const in vec2 screenPosition ) {

			#if PERSPECTIVE_CAMERA == 1

				float fragCoordZ = texture2D( tDepth, screenPosition ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );

			#else

				return texture2D( tDepth, screenPosition ).x;

			#endif

		}

		float getViewZ( const in float depth ) {

			#if PERSPECTIVE_CAMERA == 1

				return perspectiveDepthToViewZ( depth, cameraNear, cameraFar );

			#else

				return orthographicDepthToViewZ( depth, cameraNear, cameraFar );

			#endif

		}

		vec3 getViewPosition( const in vec2 screenPosition, const in float depth, const in float viewZ ) {

			float clipW = cameraProjectionMatrix[2][3] * viewZ + cameraProjectionMatrix[3][3];

			vec4 clipPosition = vec4( ( vec3( screenPosition, depth ) - 0.5 ) * 2.0, 1.0 );

			clipPosition *= clipW; // unprojection.

			return ( cameraInverseProjectionMatrix * clipPosition ).xyz;

		}

		vec3 getViewNormal( const in vec2 screenPosition ) {

			return unpackRGBToNormal( texture2D( tNormal, screenPosition ).xyz );

		}

		void main() {

			float depth = getDepth( vUv );

			if ( depth == depthThreshold ) {

				gl_FragColor = vec4( 1.0 ); // don't influence background

			} else {

				float viewZ = getViewZ( depth );

				vec3 viewPosition = getViewPosition( vUv, depth, viewZ );
				vec3 viewNormal = getViewNormal( vUv );

				vec2 noiseScale = vec2( resolution.x / 4.0, resolution.y / 4.0 );
				vec3 random = vec3( texture2D( tNoise, vUv * noiseScale ).r );

				// compute matrix used to reorient a kernel vector

				vec3 tangent = normalize( random - viewNormal * dot( random, viewNormal ) );
				vec3 bitangent = cross( viewNormal, tangent );
				mat3 kernelMatrix = mat3( tangent, bitangent, viewNormal );

				float occlusion = 0.0;

				for ( int i = 0; i < KERNEL_SIZE; i ++ ) {

					vec3 sampleVector = kernelMatrix * kernel[ i ]; // reorient sample vector in view space
					vec3 samplePoint = viewPosition + ( sampleVector * kernelRadius ); // calculate sample point

					vec4 samplePointNDC = cameraProjectionMatrix * vec4( samplePoint, 1.0 ); // project point and calculate NDC
					samplePointNDC /= samplePointNDC.w;

					vec2 samplePointUv = samplePointNDC.xy * 0.5 + 0.5; // compute uv coordinates

					float realDepth = getLinearDepth( samplePointUv ); // get linear depth from depth texture
					float sampleDepth = viewZToOrthographicDepth( samplePoint.z, cameraNear, cameraFar ); // compute linear depth of the sample view Z value
					float delta = sampleDepth - realDepth;

					if ( delta > minDistance && delta < maxDistance ) { // if fragment is before sample point, increase occlusion

						occlusion += 1.0;

					}

				}

				occlusion = clamp( occlusion / float( KERNEL_SIZE ), 0.0, 1.0 );

				gl_FragColor = vec4( vec3( 1.0 - occlusion ), 1.0 );

			}

		}`

};

/**
 * SSAO depth shader.
 *
 * @constant
 * @type {ShaderMaterial~Shader}
 */
const SSAODepthShader = {

	defines: {
		'PERSPECTIVE_CAMERA': 1
	},

	uniforms: {

		'tDepth': { value: null },
		'cameraNear': { value: null },
		'cameraFar': { value: null },

	},

	vertexShader:

		`varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

	fragmentShader:

		`uniform sampler2D tDepth;

		uniform float cameraNear;
		uniform float cameraFar;

		varying vec2 vUv;

		#include <packing>

		float getLinearDepth( const in vec2 screenPosition ) {

			#if PERSPECTIVE_CAMERA == 1

				float fragCoordZ = texture2D( tDepth, screenPosition ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );

			#else

				return texture2D( tDepth, screenPosition ).x;

			#endif

		}

		void main() {

			float depth = getLinearDepth( vUv );
			gl_FragColor = vec4( vec3( 1.0 - depth ), 1.0 );

		}`

};

/**
 * SSAO blur shader.
 *
 * @constant
 * @type {Object}
 */
const SSAOBlurShader = {

	uniforms: {

		'tDiffuse': { value: null },
		'resolution': { value: new Vector2$3() }

	},

	vertexShader:

		`varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

	fragmentShader:

		`uniform sampler2D tDiffuse;

		uniform vec2 resolution;

		varying vec2 vUv;

		void main() {

			vec2 texelSize = ( 1.0 / resolution );
			float result = 0.0;

			for ( int i = - 2; i <= 2; i ++ ) {

				for ( int j = - 2; j <= 2; j ++ ) {

					vec2 offset = ( vec2( float( i ), float( j ) ) ) * texelSize;
					result += texture2D( tDiffuse, vUv + offset ).r;

				}

			}

			gl_FragColor = vec4( vec3( result / ( 5.0 * 5.0 ) ), 1.0 );

		}`

};

const {AddEquation,Color: Color$8,CustomBlending,DataTexture,DepthTexture,DstAlphaFactor,DstColorFactor,FloatType: FloatType$2,HalfFloatType: HalfFloatType$4,MathUtils: MathUtils$1,MeshNormalMaterial,NearestFilter,NoBlending,RedFormat: RedFormat$1,DepthStencilFormat,UnsignedInt248Type,RepeatWrapping: RepeatWrapping$1,ShaderMaterial: ShaderMaterial$3,UniformsUtils: UniformsUtils$1,Vector3: Vector3$5,WebGLRenderTarget: WebGLRenderTarget$2,ZeroFactor} = await importShared('three');

/**
 * A pass for a basic SSAO effect.
 *
 * {@link SAOPass} and {@link GTAPass} produce a more advanced AO but are also
 * more expensive.
 *
 * ```js
 * const ssaoPass = new SSAOPass( scene, camera, width, height );
 * composer.addPass( ssaoPass );
 * ```
 *
 * @augments Pass
 * @three_import import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
 */
class SSAOPass extends Pass {

	/**
	 * Constructs a new SSAO pass.
	 *
	 * @param {Scene} scene - The scene to compute the AO for.
	 * @param {Camera} camera - The camera.
	 * @param {number} [width=512] - The width of the effect.
	 * @param {number} [height=512] - The height of the effect.
	 * @param {number} [kernelSize=32] - The kernel size.
	 */
	constructor( scene, camera, width = 512, height = 512, kernelSize = 32 ) {

		super();

		/**
		 * The width of the effect.
		 *
		 * @type {number}
		 * @default 512
		 */
		this.width = width;

		/**
		 * The height of the effect.
		 *
		 * @type {number}
		 * @default 512
		 */
		this.height = height;

		/**
		 * Overwritten to perform a clear operation by default.
		 *
		 * @type {boolean}
		 * @default true
		 */
		this.clear = true;

		/**
		 * Overwritten to disable the swap.
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.needsSwap = false;

		/**
		 * The camera.
		 *
		 * @type {Camera}
		 */
		this.camera = camera;

		/**
		 * The scene to render the AO for.
		 *
		 * @type {Scene}
		 */
		this.scene = scene;

		/**
		 * The kernel radius controls how wide the
		 * AO spreads.
		 *
		 * @type {number}
		 * @default 8
		 */
		this.kernelRadius = 8;
		this.kernel = [];
		this.noiseTexture = null;

		/**
		 * The output configuration.
		 *
		 * @type {number}
		 * @default 0
		 */
		this.output = 0;

		/**
		 * Defines the minimum distance that should be
		 * affected by the AO.
		 *
		 * @type {number}
		 * @default 0.005
		 */
		this.minDistance = 0.005;

		/**
		 * Defines the maximum distance that should be
		 * affected by the AO.
		 *
		 * @type {number}
		 * @default 0.1
		 */
		this.maxDistance = 0.1;

		this._visibilityCache = [];

		//

		this._generateSampleKernel( kernelSize );
		this._generateRandomKernelRotations();

		// depth texture

		const depthTexture = new DepthTexture();
		depthTexture.format = DepthStencilFormat;
		depthTexture.type = UnsignedInt248Type;

		// normal render target with depth buffer

		this.normalRenderTarget = new WebGLRenderTarget$2( this.width, this.height, {
			minFilter: NearestFilter,
			magFilter: NearestFilter,
			type: HalfFloatType$4,
			depthTexture: depthTexture
		} );

		// ssao render target

		this.ssaoRenderTarget = new WebGLRenderTarget$2( this.width, this.height, { type: HalfFloatType$4 } );

		this.blurRenderTarget = this.ssaoRenderTarget.clone();

		// ssao material

		this.ssaoMaterial = new ShaderMaterial$3( {
			defines: Object.assign( {}, SSAOShader.defines ),
			uniforms: UniformsUtils$1.clone( SSAOShader.uniforms ),
			vertexShader: SSAOShader.vertexShader,
			fragmentShader: SSAOShader.fragmentShader,
			blending: NoBlending
		} );

		this.ssaoMaterial.defines[ 'KERNEL_SIZE' ] = kernelSize;

		this.ssaoMaterial.uniforms[ 'tNormal' ].value = this.normalRenderTarget.texture;
		this.ssaoMaterial.uniforms[ 'tDepth' ].value = this.normalRenderTarget.depthTexture;
		this.ssaoMaterial.uniforms[ 'tNoise' ].value = this.noiseTexture;
		this.ssaoMaterial.uniforms[ 'kernel' ].value = this.kernel;
		this.ssaoMaterial.uniforms[ 'cameraNear' ].value = this.camera.near;
		this.ssaoMaterial.uniforms[ 'cameraFar' ].value = this.camera.far;
		this.ssaoMaterial.uniforms[ 'resolution' ].value.set( this.width, this.height );
		this.ssaoMaterial.uniforms[ 'cameraProjectionMatrix' ].value.copy( this.camera.projectionMatrix );
		this.ssaoMaterial.uniforms[ 'cameraInverseProjectionMatrix' ].value.copy( this.camera.projectionMatrixInverse );

		// normal material

		this.normalMaterial = new MeshNormalMaterial();
		this.normalMaterial.blending = NoBlending;

		// blur material

		this.blurMaterial = new ShaderMaterial$3( {
			defines: Object.assign( {}, SSAOBlurShader.defines ),
			uniforms: UniformsUtils$1.clone( SSAOBlurShader.uniforms ),
			vertexShader: SSAOBlurShader.vertexShader,
			fragmentShader: SSAOBlurShader.fragmentShader
		} );
		this.blurMaterial.uniforms[ 'tDiffuse' ].value = this.ssaoRenderTarget.texture;
		this.blurMaterial.uniforms[ 'resolution' ].value.set( this.width, this.height );

		// material for rendering the depth

		this.depthRenderMaterial = new ShaderMaterial$3( {
			defines: Object.assign( {}, SSAODepthShader.defines ),
			uniforms: UniformsUtils$1.clone( SSAODepthShader.uniforms ),
			vertexShader: SSAODepthShader.vertexShader,
			fragmentShader: SSAODepthShader.fragmentShader,
			blending: NoBlending
		} );
		this.depthRenderMaterial.uniforms[ 'tDepth' ].value = this.normalRenderTarget.depthTexture;
		this.depthRenderMaterial.uniforms[ 'cameraNear' ].value = this.camera.near;
		this.depthRenderMaterial.uniforms[ 'cameraFar' ].value = this.camera.far;

		// material for rendering the content of a render target

		this.copyMaterial = new ShaderMaterial$3( {
			uniforms: UniformsUtils$1.clone( CopyShader.uniforms ),
			vertexShader: CopyShader.vertexShader,
			fragmentShader: CopyShader.fragmentShader,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			blendSrc: DstColorFactor,
			blendDst: ZeroFactor,
			blendEquation: AddEquation,
			blendSrcAlpha: DstAlphaFactor,
			blendDstAlpha: ZeroFactor,
			blendEquationAlpha: AddEquation
		} );

		// internals

		this._fsQuad = new FullScreenQuad( null );

		this._originalClearColor = new Color$8();

	}

	/**
	 * Frees the GPU-related resources allocated by this instance. Call this
	 * method whenever the pass is no longer used in your app.
	 */
	dispose() {

		// dispose render targets

		this.normalRenderTarget.dispose();
		this.ssaoRenderTarget.dispose();
		this.blurRenderTarget.dispose();

		// dispose materials

		this.normalMaterial.dispose();
		this.blurMaterial.dispose();
		this.copyMaterial.dispose();
		this.depthRenderMaterial.dispose();

		// dispose full screen quad

		this._fsQuad.dispose();

	}

	/**
	 * Performs the SSAO pass.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {WebGLRenderTarget} writeBuffer - The write buffer. This buffer is intended as the rendering
	 * destination for the pass.
	 * @param {WebGLRenderTarget} readBuffer - The read buffer. The pass can access the result from the
	 * previous pass from this buffer.
	 * @param {number} deltaTime - The delta time in seconds.
	 * @param {boolean} maskActive - Whether masking is active or not.
	 */
	render( renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */ ) {

		// render normals and depth (honor only meshes, points and lines do not contribute to SSAO)

		this._overrideVisibility();
		this._renderOverride( renderer, this.normalMaterial, this.normalRenderTarget, 0x7777ff, 1.0 );
		this._restoreVisibility();

		// render SSAO

		this.ssaoMaterial.uniforms[ 'kernelRadius' ].value = this.kernelRadius;
		this.ssaoMaterial.uniforms[ 'minDistance' ].value = this.minDistance;
		this.ssaoMaterial.uniforms[ 'maxDistance' ].value = this.maxDistance;
		this._renderPass( renderer, this.ssaoMaterial, this.ssaoRenderTarget );

		// render blur

		this._renderPass( renderer, this.blurMaterial, this.blurRenderTarget );

		// output result to screen

		switch ( this.output ) {

			case SSAOPass.OUTPUT.SSAO:

				this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.ssaoRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this._renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : readBuffer );

				break;

			case SSAOPass.OUTPUT.Blur:

				this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.blurRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this._renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : readBuffer );

				break;

			case SSAOPass.OUTPUT.Depth:

				this._renderPass( renderer, this.depthRenderMaterial, this.renderToScreen ? null : readBuffer );

				break;

			case SSAOPass.OUTPUT.Normal:

				this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.normalRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this._renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : readBuffer );

				break;

			case SSAOPass.OUTPUT.Default:

				this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.blurRenderTarget.texture;
				this.copyMaterial.blending = CustomBlending;
				this._renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : readBuffer );

				break;

			default:
				console.warn( 'THREE.SSAOPass: Unknown output type.' );

		}

	}

	/**
	 * Sets the size of the pass.
	 *
	 * @param {number} width - The width to set.
	 * @param {number} height - The height to set.
	 */
	setSize( width, height ) {

		this.width = width;
		this.height = height;

		this.ssaoRenderTarget.setSize( width, height );
		this.normalRenderTarget.setSize( width, height );
		this.blurRenderTarget.setSize( width, height );

		this.ssaoMaterial.uniforms[ 'resolution' ].value.set( width, height );
		this.ssaoMaterial.uniforms[ 'cameraProjectionMatrix' ].value.copy( this.camera.projectionMatrix );
		this.ssaoMaterial.uniforms[ 'cameraInverseProjectionMatrix' ].value.copy( this.camera.projectionMatrixInverse );

		this.blurMaterial.uniforms[ 'resolution' ].value.set( width, height );

	}

	// internals

	_renderPass( renderer, passMaterial, renderTarget, clearColor, clearAlpha ) {

		// save original state
		renderer.getClearColor( this._originalClearColor );
		const originalClearAlpha = renderer.getClearAlpha();
		const originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget( renderTarget );

		// setup pass state
		renderer.autoClear = false;
		if ( ( clearColor !== undefined ) && ( clearColor !== null ) ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );
			renderer.clear();

		}

		this._fsQuad.material = passMaterial;
		this._fsQuad.render( renderer );

		// restore original state
		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( this._originalClearColor );
		renderer.setClearAlpha( originalClearAlpha );

	}

	_renderOverride( renderer, overrideMaterial, renderTarget, clearColor, clearAlpha ) {

		renderer.getClearColor( this._originalClearColor );
		const originalClearAlpha = renderer.getClearAlpha();
		const originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget( renderTarget );
		renderer.autoClear = false;

		clearColor = overrideMaterial.clearColor || clearColor;
		clearAlpha = overrideMaterial.clearAlpha || clearAlpha;

		if ( ( clearColor !== undefined ) && ( clearColor !== null ) ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );
			renderer.clear();

		}

		this.scene.overrideMaterial = overrideMaterial;
		renderer.render( this.scene, this.camera );
		this.scene.overrideMaterial = null;

		// restore original state

		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( this._originalClearColor );
		renderer.setClearAlpha( originalClearAlpha );

	}

	_generateSampleKernel( kernelSize ) {

		const kernel = this.kernel;

		for ( let i = 0; i < kernelSize; i ++ ) {

			const sample = new Vector3$5();
			sample.x = ( Math.random() * 2 ) - 1;
			sample.y = ( Math.random() * 2 ) - 1;
			sample.z = Math.random();

			sample.normalize();

			let scale = i / kernelSize;
			scale = MathUtils$1.lerp( 0.1, 1, scale * scale );
			sample.multiplyScalar( scale );

			kernel.push( sample );

		}

	}

	_generateRandomKernelRotations() {

		const width = 4, height = 4;

		const simplex = new SimplexNoise();

		const size = width * height;
		const data = new Float32Array( size );

		for ( let i = 0; i < size; i ++ ) {

			const x = ( Math.random() * 2 ) - 1;
			const y = ( Math.random() * 2 ) - 1;
			const z = 0;

			data[ i ] = simplex.noise3d( x, y, z );

		}

		this.noiseTexture = new DataTexture( data, width, height, RedFormat$1, FloatType$2 );
		this.noiseTexture.wrapS = RepeatWrapping$1;
		this.noiseTexture.wrapT = RepeatWrapping$1;
		this.noiseTexture.needsUpdate = true;

	}

	_overrideVisibility() {

		const scene = this.scene;
		const cache = this._visibilityCache;

		scene.traverse( function ( object ) {

			if ( ( object.isPoints || object.isLine || object.isLine2 ) && object.visible ) {

				object.visible = false;
				cache.push( object );

			}

		} );

	}

	_restoreVisibility() {

		const cache = this._visibilityCache;

		for ( let i = 0; i < cache.length; i ++ ) {

			cache[ i ].visible = true;

		}

		cache.length = 0;

	}

}

SSAOPass.OUTPUT = {
	'Default': 0,
	'SSAO': 1,
	'Blur': 2,
	'Depth': 3,
	'Normal': 4
};

const {Color: Color$7} = await importShared('three');


/**
 * @module LuminosityHighPassShader
 * @three_import import { LuminosityHighPassShader } from 'three/addons/shaders/LuminosityHighPassShader.js';
 */

/**
 * Luminosity high pass shader.
 *
 * @constant
 * @type {ShaderMaterial~Shader}
 */
const LuminosityHighPassShader = {

	uniforms: {

		'tDiffuse': { value: null },
		'luminosityThreshold': { value: 1.0 },
		'smoothWidth': { value: 1.0 },
		'defaultColor': { value: new Color$7( 0x000000 ) },
		'defaultOpacity': { value: 0.0 }

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

	fragmentShader: /* glsl */`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`

};

const {AdditiveBlending: AdditiveBlending$1,Color: Color$6,HalfFloatType: HalfFloatType$3,MeshBasicMaterial: MeshBasicMaterial$2,ShaderMaterial: ShaderMaterial$2,UniformsUtils,Vector2: Vector2$2,Vector3: Vector3$4,WebGLRenderTarget: WebGLRenderTarget$1} = await importShared('three');

/**
 * This pass is inspired by the bloom pass of Unreal Engine. It creates a
 * mip map chain of bloom textures and blurs them with different radii. Because
 * of the weighted combination of mips, and because larger blurs are done on
 * higher mips, this effect provides good quality and performance.
 *
 * When using this pass, tone mapping must be enabled in the renderer settings.
 *
 * Reference:
 * - [Bloom in Unreal Engine](https://docs.unrealengine.com/latest/INT/Engine/Rendering/PostProcessEffects/Bloom/)
 *
 * ```js
 * const resolution = new THREE.Vector2( window.innerWidth, window.innerHeight );
 * const bloomPass = new UnrealBloomPass( resolution, 1.5, 0.4, 0.85 );
 * composer.addPass( bloomPass );
 * ```
 *
 * @augments Pass
 * @three_import import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
 */
class UnrealBloomPass extends Pass {

	/**
	 * Constructs a new Unreal Bloom pass.
	 *
	 * @param {Vector2} [resolution] - The effect's resolution.
	 * @param {number} [strength=1] - The Bloom strength.
	 * @param {number} radius - The Bloom radius.
	 * @param {number} threshold - The luminance threshold limits which bright areas contribute to the Bloom effect.
	 */
	constructor( resolution, strength = 1, radius, threshold ) {

		super();

		/**
		 * The Bloom strength.
		 *
		 * @type {number}
		 * @default 1
		 */
		this.strength = strength;

		/**
		 * The Bloom radius. Must be in the range `[0,1]`.
		 *
		 * @type {number}
		 */
		this.radius = radius;

		/**
		 * The luminance threshold limits which bright areas contribute to the Bloom effect.
		 *
		 * @type {number}
		 */
		this.threshold = threshold;

		/**
		 * The effect's resolution.
		 *
		 * @type {Vector2}
		 * @default (256,256)
		 */
		this.resolution = ( resolution !== undefined ) ? new Vector2$2( resolution.x, resolution.y ) : new Vector2$2( 256, 256 );

		/**
		 * The effect's clear color
		 *
		 * @type {Color}
		 * @default (0,0,0)
		 */
		this.clearColor = new Color$6( 0, 0, 0 );

		/**
		 * Overwritten to disable the swap.
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.needsSwap = false;

		// internals

		// render targets
		this.renderTargetsHorizontal = [];
		this.renderTargetsVertical = [];
		this.nMips = 5;
		let resx = Math.round( this.resolution.x / 2 );
		let resy = Math.round( this.resolution.y / 2 );

		this.renderTargetBright = new WebGLRenderTarget$1( resx, resy, { type: HalfFloatType$3 } );
		this.renderTargetBright.texture.name = 'UnrealBloomPass.bright';
		this.renderTargetBright.texture.generateMipmaps = false;

		for ( let i = 0; i < this.nMips; i ++ ) {

			const renderTargetHorizontal = new WebGLRenderTarget$1( resx, resy, { type: HalfFloatType$3 } );

			renderTargetHorizontal.texture.name = 'UnrealBloomPass.h' + i;
			renderTargetHorizontal.texture.generateMipmaps = false;

			this.renderTargetsHorizontal.push( renderTargetHorizontal );

			const renderTargetVertical = new WebGLRenderTarget$1( resx, resy, { type: HalfFloatType$3 } );

			renderTargetVertical.texture.name = 'UnrealBloomPass.v' + i;
			renderTargetVertical.texture.generateMipmaps = false;

			this.renderTargetsVertical.push( renderTargetVertical );

			resx = Math.round( resx / 2 );

			resy = Math.round( resy / 2 );

		}

		// luminosity high pass material

		const highPassShader = LuminosityHighPassShader;
		this.highPassUniforms = UniformsUtils.clone( highPassShader.uniforms );

		this.highPassUniforms[ 'luminosityThreshold' ].value = threshold;
		this.highPassUniforms[ 'smoothWidth' ].value = 0.01;

		this.materialHighPassFilter = new ShaderMaterial$2( {
			uniforms: this.highPassUniforms,
			vertexShader: highPassShader.vertexShader,
			fragmentShader: highPassShader.fragmentShader
		} );

		// gaussian blur materials

		this.separableBlurMaterials = [];
		// These sizes have been changed to account for the altered coefficients-calculation to avoid blockiness,
		// while retaining the same blur-strength. For details see https://github.com/mrdoob/three.js/pull/31528
		const kernelSizeArray = [ 6, 10, 14, 18, 22 ];
		resx = Math.round( this.resolution.x / 2 );
		resy = Math.round( this.resolution.y / 2 );

		for ( let i = 0; i < this.nMips; i ++ ) {

			this.separableBlurMaterials.push( this._getSeparableBlurMaterial( kernelSizeArray[ i ] ) );

			this.separableBlurMaterials[ i ].uniforms[ 'invSize' ].value = new Vector2$2( 1 / resx, 1 / resy );

			resx = Math.round( resx / 2 );

			resy = Math.round( resy / 2 );

		}

		// composite material

		this.compositeMaterial = this._getCompositeMaterial( this.nMips );
		this.compositeMaterial.uniforms[ 'blurTexture1' ].value = this.renderTargetsVertical[ 0 ].texture;
		this.compositeMaterial.uniforms[ 'blurTexture2' ].value = this.renderTargetsVertical[ 1 ].texture;
		this.compositeMaterial.uniforms[ 'blurTexture3' ].value = this.renderTargetsVertical[ 2 ].texture;
		this.compositeMaterial.uniforms[ 'blurTexture4' ].value = this.renderTargetsVertical[ 3 ].texture;
		this.compositeMaterial.uniforms[ 'blurTexture5' ].value = this.renderTargetsVertical[ 4 ].texture;
		this.compositeMaterial.uniforms[ 'bloomStrength' ].value = strength;
		this.compositeMaterial.uniforms[ 'bloomRadius' ].value = 0.1;

		const bloomFactors = [ 1.0, 0.8, 0.6, 0.4, 0.2 ];
		this.compositeMaterial.uniforms[ 'bloomFactors' ].value = bloomFactors;
		this.bloomTintColors = [ new Vector3$4( 1, 1, 1 ), new Vector3$4( 1, 1, 1 ), new Vector3$4( 1, 1, 1 ), new Vector3$4( 1, 1, 1 ), new Vector3$4( 1, 1, 1 ) ];
		this.compositeMaterial.uniforms[ 'bloomTintColors' ].value = this.bloomTintColors;

		// blend material

		this.copyUniforms = UniformsUtils.clone( CopyShader.uniforms );

		this.blendMaterial = new ShaderMaterial$2( {
			uniforms: this.copyUniforms,
			vertexShader: CopyShader.vertexShader,
			fragmentShader: CopyShader.fragmentShader,
			premultipliedAlpha: true,
			blending: AdditiveBlending$1,
			depthTest: false,
			depthWrite: false,
			transparent: true
		} );

		this._oldClearColor = new Color$6();
		this._oldClearAlpha = 1;

		this._basic = new MeshBasicMaterial$2();

		this._fsQuad = new FullScreenQuad( null );

	}

	/**
	 * Frees the GPU-related resources allocated by this instance. Call this
	 * method whenever the pass is no longer used in your app.
	 */
	dispose() {

		for ( let i = 0; i < this.renderTargetsHorizontal.length; i ++ ) {

			this.renderTargetsHorizontal[ i ].dispose();

		}

		for ( let i = 0; i < this.renderTargetsVertical.length; i ++ ) {

			this.renderTargetsVertical[ i ].dispose();

		}

		this.renderTargetBright.dispose();

		//

		for ( let i = 0; i < this.separableBlurMaterials.length; i ++ ) {

			this.separableBlurMaterials[ i ].dispose();

		}

		this.compositeMaterial.dispose();
		this.blendMaterial.dispose();
		this._basic.dispose();

		//

		this._fsQuad.dispose();

	}

	/**
	 * Sets the size of the pass.
	 *
	 * @param {number} width - The width to set.
	 * @param {number} height - The height to set.
	 */
	setSize( width, height ) {

		let resx = Math.round( width / 2 );
		let resy = Math.round( height / 2 );

		this.renderTargetBright.setSize( resx, resy );

		for ( let i = 0; i < this.nMips; i ++ ) {

			this.renderTargetsHorizontal[ i ].setSize( resx, resy );
			this.renderTargetsVertical[ i ].setSize( resx, resy );

			this.separableBlurMaterials[ i ].uniforms[ 'invSize' ].value = new Vector2$2( 1 / resx, 1 / resy );

			resx = Math.round( resx / 2 );
			resy = Math.round( resy / 2 );

		}

	}

	/**
	 * Performs the Bloom pass.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {WebGLRenderTarget} writeBuffer - The write buffer. This buffer is intended as the rendering
	 * destination for the pass.
	 * @param {WebGLRenderTarget} readBuffer - The read buffer. The pass can access the result from the
	 * previous pass from this buffer.
	 * @param {number} deltaTime - The delta time in seconds.
	 * @param {boolean} maskActive - Whether masking is active or not.
	 */
	render( renderer, writeBuffer, readBuffer, deltaTime, maskActive ) {

		renderer.getClearColor( this._oldClearColor );
		this._oldClearAlpha = renderer.getClearAlpha();
		const oldAutoClear = renderer.autoClear;
		renderer.autoClear = false;

		renderer.setClearColor( this.clearColor, 0 );

		if ( maskActive ) renderer.state.buffers.stencil.setTest( false );

		// Render input to screen

		if ( this.renderToScreen ) {

			this._fsQuad.material = this._basic;
			this._basic.map = readBuffer.texture;

			renderer.setRenderTarget( null );
			renderer.clear();
			this._fsQuad.render( renderer );

		}

		// 1. Extract Bright Areas

		this.highPassUniforms[ 'tDiffuse' ].value = readBuffer.texture;
		this.highPassUniforms[ 'luminosityThreshold' ].value = this.threshold;
		this._fsQuad.material = this.materialHighPassFilter;

		renderer.setRenderTarget( this.renderTargetBright );
		renderer.clear();
		this._fsQuad.render( renderer );

		// 2. Blur All the mips progressively

		let inputRenderTarget = this.renderTargetBright;

		for ( let i = 0; i < this.nMips; i ++ ) {

			this._fsQuad.material = this.separableBlurMaterials[ i ];

			this.separableBlurMaterials[ i ].uniforms[ 'colorTexture' ].value = inputRenderTarget.texture;
			this.separableBlurMaterials[ i ].uniforms[ 'direction' ].value = UnrealBloomPass.BlurDirectionX;
			renderer.setRenderTarget( this.renderTargetsHorizontal[ i ] );
			renderer.clear();
			this._fsQuad.render( renderer );

			this.separableBlurMaterials[ i ].uniforms[ 'colorTexture' ].value = this.renderTargetsHorizontal[ i ].texture;
			this.separableBlurMaterials[ i ].uniforms[ 'direction' ].value = UnrealBloomPass.BlurDirectionY;
			renderer.setRenderTarget( this.renderTargetsVertical[ i ] );
			renderer.clear();
			this._fsQuad.render( renderer );

			inputRenderTarget = this.renderTargetsVertical[ i ];

		}

		// Composite All the mips

		this._fsQuad.material = this.compositeMaterial;
		this.compositeMaterial.uniforms[ 'bloomStrength' ].value = this.strength;
		this.compositeMaterial.uniforms[ 'bloomRadius' ].value = this.radius;
		this.compositeMaterial.uniforms[ 'bloomTintColors' ].value = this.bloomTintColors;

		renderer.setRenderTarget( this.renderTargetsHorizontal[ 0 ] );
		renderer.clear();
		this._fsQuad.render( renderer );

		// Blend it additively over the input texture

		this._fsQuad.material = this.blendMaterial;
		this.copyUniforms[ 'tDiffuse' ].value = this.renderTargetsHorizontal[ 0 ].texture;

		if ( maskActive ) renderer.state.buffers.stencil.setTest( true );

		if ( this.renderToScreen ) {

			renderer.setRenderTarget( null );
			this._fsQuad.render( renderer );

		} else {

			renderer.setRenderTarget( readBuffer );
			this._fsQuad.render( renderer );

		}

		// Restore renderer settings

		renderer.setClearColor( this._oldClearColor, this._oldClearAlpha );
		renderer.autoClear = oldAutoClear;

	}

	// internals

	_getSeparableBlurMaterial( kernelRadius ) {

		const coefficients = [];
		const sigma = kernelRadius / 3;

		for ( let i = 0; i < kernelRadius; i ++ ) {

			coefficients.push( 0.39894 * Math.exp( -0.5 * i * i / ( sigma * sigma ) ) / sigma );

		}

		return new ShaderMaterial$2( {

			defines: {
				'KERNEL_RADIUS': kernelRadius
			},

			uniforms: {
				'colorTexture': { value: null },
				'invSize': { value: new Vector2$2( 0.5, 0.5 ) }, // inverse texture size
				'direction': { value: new Vector2$2( 0.5, 0.5 ) },
				'gaussianCoefficients': { value: coefficients } // precomputed Gaussian coefficients
			},

			vertexShader: /* glsl */`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,

			fragmentShader: /* glsl */`

				#include <common>

				varying vec2 vUv;

				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float gaussianCoefficients[KERNEL_RADIUS];

				void main() {

					float weightSum = gaussianCoefficients[0];
					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;

					for ( int i = 1; i < KERNEL_RADIUS; i ++ ) {

						float x = float( i );
						float w = gaussianCoefficients[i];
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += ( sample1 + sample2 ) * w;

					}

					gl_FragColor = vec4( diffuseSum, 1.0 );

				}`
		} );

	}

	_getCompositeMaterial( nMips ) {

		return new ShaderMaterial$2( {

			defines: {
				'NUM_MIPS': nMips
			},

			uniforms: {
				'blurTexture1': { value: null },
				'blurTexture2': { value: null },
				'blurTexture3': { value: null },
				'blurTexture4': { value: null },
				'blurTexture5': { value: null },
				'bloomStrength': { value: 1.0 },
				'bloomFactors': { value: null },
				'bloomTintColors': { value: null },
				'bloomRadius': { value: 0.0 }
			},

			vertexShader: /* glsl */`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,

			fragmentShader: /* glsl */`

				varying vec2 vUv;

				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor( const in float factor ) {

					float mirrorFactor = 1.2 - factor;
					return mix( factor, mirrorFactor, bloomRadius );

				}

				void main() {

					// 3.0 for backwards compatibility with previous alpha-based intensity
					vec3 bloom = 3.0 * bloomStrength * (
						lerpBloomFactor( bloomFactors[ 0 ] ) * bloomTintColors[ 0 ] * texture2D( blurTexture1, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 1 ] ) * bloomTintColors[ 1 ] * texture2D( blurTexture2, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 2 ] ) * bloomTintColors[ 2 ] * texture2D( blurTexture3, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 3 ] ) * bloomTintColors[ 3 ] * texture2D( blurTexture4, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 4 ] ) * bloomTintColors[ 4 ] * texture2D( blurTexture5, vUv ).rgb
					);

					float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );
					gl_FragColor = vec4( bloom, bloomAlpha );

				}`
		} );

	}

}

UnrealBloomPass.BlurDirectionX = new Vector2$2( 1.0, 0.0 );
UnrealBloomPass.BlurDirectionY = new Vector2$2( 0.0, 1.0 );

const {BufferGeometry: BufferGeometry$2,FileLoader,Float32BufferAttribute: Float32BufferAttribute$1,Group: Group$4,LineBasicMaterial,LineSegments,Loader,Material,Mesh: Mesh$4,MeshPhongMaterial,Points,PointsMaterial: PointsMaterial$1,Vector3: Vector3$3,Color: Color$5,SRGBColorSpace: SRGBColorSpace$5} = await importShared('three');


// o object_name | g group_name
const _object_pattern = /^[og]\s*(.+)?/;
// mtllib file_reference
const _material_library_pattern = /^mtllib /;
// usemtl material_name
const _material_use_pattern = /^usemtl /;
// usemap map_name
const _map_use_pattern = /^usemap /;
const _face_vertex_data_separator_pattern = /\s+/;

const _vA = new Vector3$3();
const _vB = new Vector3$3();
const _vC = new Vector3$3();

const _ab = new Vector3$3();
const _cb = new Vector3$3();

const _color = new Color$5();

function ParserState() {

	const state = {
		objects: [],
		object: {},

		vertices: [],
		normals: [],
		colors: [],
		uvs: [],

		materials: {},
		materialLibraries: [],

		startObject: function ( name, fromDeclaration ) {

			// If the current object (initial from reset) is not from a g/o declaration in the parsed
			// file. We need to use it for the first parsed g/o to keep things in sync.
			if ( this.object && this.object.fromDeclaration === false ) {

				this.object.name = name;
				this.object.fromDeclaration = ( fromDeclaration !== false );
				return;

			}

			const previousMaterial = ( this.object && typeof this.object.currentMaterial === 'function' ? this.object.currentMaterial() : undefined );

			if ( this.object && typeof this.object._finalize === 'function' ) {

				this.object._finalize( true );

			}

			this.object = {
				name: name || '',
				fromDeclaration: ( fromDeclaration !== false ),

				geometry: {
					vertices: [],
					normals: [],
					colors: [],
					uvs: [],
					hasUVIndices: false
				},
				materials: [],
				smooth: true,

				startMaterial: function ( name, libraries ) {

					const previous = this._finalize( false );

					// New usemtl declaration overwrites an inherited material, except if faces were declared
					// after the material, then it must be preserved for proper MultiMaterial continuation.
					if ( previous && ( previous.inherited || previous.groupCount <= 0 ) ) {

						this.materials.splice( previous.index, 1 );

					}

					const material = {
						index: this.materials.length,
						name: name || '',
						mtllib: ( Array.isArray( libraries ) && libraries.length > 0 ? libraries[ libraries.length - 1 ] : '' ),
						smooth: ( previous !== undefined ? previous.smooth : this.smooth ),
						groupStart: ( previous !== undefined ? previous.groupEnd : 0 ),
						groupEnd: -1,
						groupCount: -1,
						inherited: false,

						clone: function ( index ) {

							const cloned = {
								index: ( typeof index === 'number' ? index : this.index ),
								name: this.name,
								mtllib: this.mtllib,
								smooth: this.smooth,
								groupStart: 0,
								groupEnd: -1,
								groupCount: -1,
								inherited: false
							};
							cloned.clone = this.clone.bind( cloned );
							return cloned;

						}
					};

					this.materials.push( material );

					return material;

				},

				currentMaterial: function () {

					if ( this.materials.length > 0 ) {

						return this.materials[ this.materials.length - 1 ];

					}

					return undefined;

				},

				_finalize: function ( end ) {

					const lastMultiMaterial = this.currentMaterial();
					if ( lastMultiMaterial && lastMultiMaterial.groupEnd === -1 ) {

						lastMultiMaterial.groupEnd = this.geometry.vertices.length / 3;
						lastMultiMaterial.groupCount = lastMultiMaterial.groupEnd - lastMultiMaterial.groupStart;
						lastMultiMaterial.inherited = false;

					}

					// Ignore objects tail materials if no face declarations followed them before a new o/g started.
					if ( end && this.materials.length > 1 ) {

						for ( let mi = this.materials.length - 1; mi >= 0; mi -- ) {

							if ( this.materials[ mi ].groupCount <= 0 ) {

								this.materials.splice( mi, 1 );

							}

						}

					}

					// Guarantee at least one empty material, this makes the creation later more straight forward.
					if ( end && this.materials.length === 0 ) {

						this.materials.push( {
							name: '',
							smooth: this.smooth
						} );

					}

					return lastMultiMaterial;

				}
			};

			// Inherit previous objects material.
			// Spec tells us that a declared material must be set to all objects until a new material is declared.
			// If a usemtl declaration is encountered while this new object is being parsed, it will
			// overwrite the inherited material. Exception being that there was already face declarations
			// to the inherited material, then it will be preserved for proper MultiMaterial continuation.

			if ( previousMaterial && previousMaterial.name && typeof previousMaterial.clone === 'function' ) {

				const declared = previousMaterial.clone( 0 );
				declared.inherited = true;
				this.object.materials.push( declared );

			}

			this.objects.push( this.object );

		},

		finalize: function () {

			if ( this.object && typeof this.object._finalize === 'function' ) {

				this.object._finalize( true );

			}

		},

		parseVertexIndex: function ( value, len ) {

			const index = parseInt( value, 10 );
			return ( index >= 0 ? index - 1 : index + len / 3 ) * 3;

		},

		parseNormalIndex: function ( value, len ) {

			const index = parseInt( value, 10 );
			return ( index >= 0 ? index - 1 : index + len / 3 ) * 3;

		},

		parseUVIndex: function ( value, len ) {

			const index = parseInt( value, 10 );
			return ( index >= 0 ? index - 1 : index + len / 2 ) * 2;

		},

		addVertex: function ( a, b, c ) {

			const src = this.vertices;
			const dst = this.object.geometry.vertices;

			dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );
			dst.push( src[ b + 0 ], src[ b + 1 ], src[ b + 2 ] );
			dst.push( src[ c + 0 ], src[ c + 1 ], src[ c + 2 ] );

		},

		addVertexPoint: function ( a ) {

			const src = this.vertices;
			const dst = this.object.geometry.vertices;

			dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );

		},

		addVertexLine: function ( a ) {

			const src = this.vertices;
			const dst = this.object.geometry.vertices;

			dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );

		},

		addNormal: function ( a, b, c ) {

			const src = this.normals;
			const dst = this.object.geometry.normals;

			dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );
			dst.push( src[ b + 0 ], src[ b + 1 ], src[ b + 2 ] );
			dst.push( src[ c + 0 ], src[ c + 1 ], src[ c + 2 ] );

		},

		addFaceNormal: function ( a, b, c ) {

			const src = this.vertices;
			const dst = this.object.geometry.normals;

			_vA.fromArray( src, a );
			_vB.fromArray( src, b );
			_vC.fromArray( src, c );

			_cb.subVectors( _vC, _vB );
			_ab.subVectors( _vA, _vB );
			_cb.cross( _ab );

			_cb.normalize();

			dst.push( _cb.x, _cb.y, _cb.z );
			dst.push( _cb.x, _cb.y, _cb.z );
			dst.push( _cb.x, _cb.y, _cb.z );

		},

		addColor: function ( a, b, c ) {

			const src = this.colors;
			const dst = this.object.geometry.colors;

			if ( src[ a ] !== undefined ) dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );
			if ( src[ b ] !== undefined ) dst.push( src[ b + 0 ], src[ b + 1 ], src[ b + 2 ] );
			if ( src[ c ] !== undefined ) dst.push( src[ c + 0 ], src[ c + 1 ], src[ c + 2 ] );

		},

		addUV: function ( a, b, c ) {

			const src = this.uvs;
			const dst = this.object.geometry.uvs;

			dst.push( src[ a + 0 ], src[ a + 1 ] );
			dst.push( src[ b + 0 ], src[ b + 1 ] );
			dst.push( src[ c + 0 ], src[ c + 1 ] );

		},

		addDefaultUV: function () {

			const dst = this.object.geometry.uvs;

			dst.push( 0, 0 );
			dst.push( 0, 0 );
			dst.push( 0, 0 );

		},

		addUVLine: function ( a ) {

			const src = this.uvs;
			const dst = this.object.geometry.uvs;

			dst.push( src[ a + 0 ], src[ a + 1 ] );

		},

		addFace: function ( a, b, c, ua, ub, uc, na, nb, nc ) {

			const vLen = this.vertices.length;

			let ia = this.parseVertexIndex( a, vLen );
			let ib = this.parseVertexIndex( b, vLen );
			let ic = this.parseVertexIndex( c, vLen );

			this.addVertex( ia, ib, ic );
			this.addColor( ia, ib, ic );

			// normals

			if ( na !== undefined && na !== '' ) {

				const nLen = this.normals.length;

				ia = this.parseNormalIndex( na, nLen );
				ib = this.parseNormalIndex( nb, nLen );
				ic = this.parseNormalIndex( nc, nLen );

				this.addNormal( ia, ib, ic );

			} else {

				this.addFaceNormal( ia, ib, ic );

			}

			// uvs

			if ( ua !== undefined && ua !== '' ) {

				const uvLen = this.uvs.length;

				ia = this.parseUVIndex( ua, uvLen );
				ib = this.parseUVIndex( ub, uvLen );
				ic = this.parseUVIndex( uc, uvLen );

				this.addUV( ia, ib, ic );

				this.object.geometry.hasUVIndices = true;

			} else {

				// add placeholder values (for inconsistent face definitions)

				this.addDefaultUV();

			}

		},

		addPointGeometry: function ( vertices ) {

			this.object.geometry.type = 'Points';

			const vLen = this.vertices.length;

			for ( let vi = 0, l = vertices.length; vi < l; vi ++ ) {

				const index = this.parseVertexIndex( vertices[ vi ], vLen );

				this.addVertexPoint( index );
				this.addColor( index );

			}

		},

		addLineGeometry: function ( vertices, uvs ) {

			this.object.geometry.type = 'Line';

			const vLen = this.vertices.length;
			const uvLen = this.uvs.length;

			for ( let vi = 0, l = vertices.length; vi < l; vi ++ ) {

				this.addVertexLine( this.parseVertexIndex( vertices[ vi ], vLen ) );

			}

			for ( let uvi = 0, l = uvs.length; uvi < l; uvi ++ ) {

				this.addUVLine( this.parseUVIndex( uvs[ uvi ], uvLen ) );

			}

		}

	};

	state.startObject( '', false );

	return state;

}


/**
 * A loader for the OBJ format.
 *
 * The [OBJ format](https://en.wikipedia.org/wiki/Wavefront_.obj_file) is a simple data-format that
 * represents 3D geometry in a human readable format as the position of each vertex, the UV position of
 * each texture coordinate vertex, vertex normals, and the faces that make each polygon defined as a list
 * of vertices, and texture vertices.
 *
 * ```js
 * const loader = new OBJLoader();
 * const object = await loader.loadAsync( 'models/monster.obj' );
 * scene.add( object );
 * ```
 *
 * @augments Loader
 * @three_import import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
 */
class OBJLoader extends Loader {

	/**
	 * Constructs a new OBJ loader.
	 *
	 * @param {LoadingManager} [manager] - The loading manager.
	 */
	constructor( manager ) {

		super( manager );

		/**
		 * A reference to a material creator.
		 *
		 * @type {?MaterialCreator}
		 * @default null
		 */
		this.materials = null;

	}

	/**
	 * Starts loading from the given URL and passes the loaded OBJ asset
	 * to the `onLoad()` callback.
	 *
	 * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
	 * @param {function(Group)} onLoad - Executed when the loading process has been finished.
	 * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
	 * @param {onErrorCallback} onError - Executed when errors occur.
	 */
	load( url, onLoad, onProgress, onError ) {

		const scope = this;

		const loader = new FileLoader( this.manager );
		loader.setPath( this.path );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );
		loader.load( url, function ( text ) {

			try {

				onLoad( scope.parse( text ) );

			} catch ( e ) {

				if ( onError ) {

					onError( e );

				} else {

					console.error( e );

				}

				scope.manager.itemError( url );

			}

		}, onProgress, onError );

	}

	/**
	 * Sets the material creator for this OBJ. This object is loaded via {@link MTLLoader}.
	 *
	 * @param {MaterialCreator} materials - An object that creates the materials for this OBJ.
	 * @return {OBJLoader} A reference to this loader.
	 */
	setMaterials( materials ) {

		this.materials = materials;

		return this;

	}

	/**
	 * Parses the given OBJ data and returns the resulting group.
	 *
	 * @param {string} text - The raw OBJ data as a string.
	 * @return {Group} The parsed OBJ.
	 */
	parse( text ) {

		const state = new ParserState();

		if ( text.indexOf( '\r\n' ) !== -1 ) {

			// This is faster than String.split with regex that splits on both
			text = text.replace( /\r\n/g, '\n' );

		}

		if ( text.indexOf( '\\\n' ) !== -1 ) {

			// join lines separated by a line continuation character (\)
			text = text.replace( /\\\n/g, '' );

		}

		const lines = text.split( '\n' );
		let result = [];

		for ( let i = 0, l = lines.length; i < l; i ++ ) {

			const line = lines[ i ].trimStart();

			if ( line.length === 0 ) continue;

			const lineFirstChar = line.charAt( 0 );

			// @todo invoke passed in handler if any
			if ( lineFirstChar === '#' ) continue; // skip comments

			if ( lineFirstChar === 'v' ) {

				const data = line.split( _face_vertex_data_separator_pattern );

				switch ( data[ 0 ] ) {

					case 'v':
						state.vertices.push(
							parseFloat( data[ 1 ] ),
							parseFloat( data[ 2 ] ),
							parseFloat( data[ 3 ] )
						);
						if ( data.length >= 7 ) {

							_color.setRGB(
								parseFloat( data[ 4 ] ),
								parseFloat( data[ 5 ] ),
								parseFloat( data[ 6 ] ),
								SRGBColorSpace$5
							);

							state.colors.push( _color.r, _color.g, _color.b );

						} else {

							// if no colors are defined, add placeholders so color and vertex indices match

							state.colors.push( undefined, undefined, undefined );

						}

						break;
					case 'vn':
						state.normals.push(
							parseFloat( data[ 1 ] ),
							parseFloat( data[ 2 ] ),
							parseFloat( data[ 3 ] )
						);
						break;
					case 'vt':
						state.uvs.push(
							parseFloat( data[ 1 ] ),
							parseFloat( data[ 2 ] )
						);
						break;

				}

			} else if ( lineFirstChar === 'f' ) {

				const lineData = line.slice( 1 ).trim();
				const vertexData = lineData.split( _face_vertex_data_separator_pattern );
				const faceVertices = [];

				// Parse the face vertex data into an easy to work with format

				for ( let j = 0, jl = vertexData.length; j < jl; j ++ ) {

					const vertex = vertexData[ j ];

					if ( vertex.length > 0 ) {

						const vertexParts = vertex.split( '/' );
						faceVertices.push( vertexParts );

					}

				}

				// Draw an edge between the first vertex and all subsequent vertices to form an n-gon

				const v1 = faceVertices[ 0 ];

				for ( let j = 1, jl = faceVertices.length - 1; j < jl; j ++ ) {

					const v2 = faceVertices[ j ];
					const v3 = faceVertices[ j + 1 ];

					state.addFace(
						v1[ 0 ], v2[ 0 ], v3[ 0 ],
						v1[ 1 ], v2[ 1 ], v3[ 1 ],
						v1[ 2 ], v2[ 2 ], v3[ 2 ]
					);

				}

			} else if ( lineFirstChar === 'l' ) {

				const lineParts = line.substring( 1 ).trim().split( ' ' );
				let lineVertices = [];
				const lineUVs = [];

				if ( line.indexOf( '/' ) === -1 ) {

					lineVertices = lineParts;

				} else {

					for ( let li = 0, llen = lineParts.length; li < llen; li ++ ) {

						const parts = lineParts[ li ].split( '/' );

						if ( parts[ 0 ] !== '' ) lineVertices.push( parts[ 0 ] );
						if ( parts[ 1 ] !== '' ) lineUVs.push( parts[ 1 ] );

					}

				}

				state.addLineGeometry( lineVertices, lineUVs );

			} else if ( lineFirstChar === 'p' ) {

				const lineData = line.slice( 1 ).trim();
				const pointData = lineData.split( ' ' );

				state.addPointGeometry( pointData );

			} else if ( ( result = _object_pattern.exec( line ) ) !== null ) {

				// o object_name
				// or
				// g group_name

				// WORKAROUND: https://bugs.chromium.org/p/v8/issues/detail?id=2869
				// let name = result[ 0 ].slice( 1 ).trim();
				const name = ( ' ' + result[ 0 ].slice( 1 ).trim() ).slice( 1 );

				state.startObject( name );

			} else if ( _material_use_pattern.test( line ) ) {

				// material

				state.object.startMaterial( line.substring( 7 ).trim(), state.materialLibraries );

			} else if ( _material_library_pattern.test( line ) ) {

				// mtl file

				state.materialLibraries.push( line.substring( 7 ).trim() );

			} else if ( _map_use_pattern.test( line ) ) {

				// the line is parsed but ignored since the loader assumes textures are defined MTL files
				// (according to https://www.okino.com/conv/imp_wave.htm, 'usemap' is the old-style Wavefront texture reference method)

				console.warn( 'THREE.OBJLoader: Rendering identifier "usemap" not supported. Textures must be defined in MTL files.' );

			} else if ( lineFirstChar === 's' ) {

				result = line.split( ' ' );

				// smooth shading

				// @todo Handle files that have varying smooth values for a set of faces inside one geometry,
				// but does not define a usemtl for each face set.
				// This should be detected and a dummy material created (later MultiMaterial and geometry groups).
				// This requires some care to not create extra material on each smooth value for "normal" obj files.
				// where explicit usemtl defines geometry groups.
				// Example asset: examples/models/obj/cerberus/Cerberus.obj

				/*
					 * http://paulbourke.net/dataformats/obj/
					 *
					 * From chapter "Grouping" Syntax explanation "s group_number":
					 * "group_number is the smoothing group number. To turn off smoothing groups, use a value of 0 or off.
					 * Polygonal elements use group numbers to put elements in different smoothing groups. For free-form
					 * surfaces, smoothing groups are either turned on or off; there is no difference between values greater
					 * than 0."
					 */
				if ( result.length > 1 ) {

					const value = result[ 1 ].trim().toLowerCase();
					state.object.smooth = ( value !== '0' && value !== 'off' );

				} else {

					// ZBrush can produce "s" lines #11707
					state.object.smooth = true;

				}

				const material = state.object.currentMaterial();
				if ( material ) material.smooth = state.object.smooth;

			} else {

				// Handle null terminated files without exception
				if ( line === '\0' ) continue;

				console.warn( 'THREE.OBJLoader: Unexpected line: "' + line + '"' );

			}

		}

		state.finalize();

		const container = new Group$4();
		container.materialLibraries = [].concat( state.materialLibraries );

		const hasPrimitives = ! ( state.objects.length === 1 && state.objects[ 0 ].geometry.vertices.length === 0 );

		if ( hasPrimitives === true ) {

			for ( let i = 0, l = state.objects.length; i < l; i ++ ) {

				const object = state.objects[ i ];
				const geometry = object.geometry;
				const materials = object.materials;
				const isLine = ( geometry.type === 'Line' );
				const isPoints = ( geometry.type === 'Points' );
				let hasVertexColors = false;

				// Skip o/g line declarations that did not follow with any faces
				if ( geometry.vertices.length === 0 ) continue;

				const buffergeometry = new BufferGeometry$2();

				buffergeometry.setAttribute( 'position', new Float32BufferAttribute$1( geometry.vertices, 3 ) );

				if ( geometry.normals.length > 0 ) {

					buffergeometry.setAttribute( 'normal', new Float32BufferAttribute$1( geometry.normals, 3 ) );

				}

				if ( geometry.colors.length > 0 ) {

					hasVertexColors = true;
					buffergeometry.setAttribute( 'color', new Float32BufferAttribute$1( geometry.colors, 3 ) );

				}

				if ( geometry.hasUVIndices === true ) {

					buffergeometry.setAttribute( 'uv', new Float32BufferAttribute$1( geometry.uvs, 2 ) );

				}

				// Create materials

				const createdMaterials = [];

				for ( let mi = 0, miLen = materials.length; mi < miLen; mi ++ ) {

					const sourceMaterial = materials[ mi ];
					const materialHash = sourceMaterial.name + '_' + sourceMaterial.smooth + '_' + hasVertexColors;
					let material = state.materials[ materialHash ];

					if ( this.materials !== null ) {

						material = this.materials.create( sourceMaterial.name );

						// mtl etc. loaders probably can't create line materials correctly, copy properties to a line material.
						if ( isLine && material && ! ( material instanceof LineBasicMaterial ) ) {

							const materialLine = new LineBasicMaterial();
							Material.prototype.copy.call( materialLine, material );
							materialLine.color.copy( material.color );
							material = materialLine;

						} else if ( isPoints && material && ! ( material instanceof PointsMaterial$1 ) ) {

							const materialPoints = new PointsMaterial$1( { size: 10, sizeAttenuation: false } );
							Material.prototype.copy.call( materialPoints, material );
							materialPoints.color.copy( material.color );
							materialPoints.map = material.map;
							material = materialPoints;

						}

					}

					if ( material === undefined ) {

						if ( isLine ) {

							material = new LineBasicMaterial();

						} else if ( isPoints ) {

							material = new PointsMaterial$1( { size: 1, sizeAttenuation: false } );

						} else {

							material = new MeshPhongMaterial();

						}

						material.name = sourceMaterial.name;
						material.flatShading = sourceMaterial.smooth ? false : true;
						material.vertexColors = hasVertexColors;

						state.materials[ materialHash ] = material;

					}

					createdMaterials.push( material );

				}

				// Create mesh

				let mesh;

				if ( createdMaterials.length > 1 ) {

					for ( let mi = 0, miLen = materials.length; mi < miLen; mi ++ ) {

						const sourceMaterial = materials[ mi ];
						buffergeometry.addGroup( sourceMaterial.groupStart, sourceMaterial.groupCount, mi );

					}

					if ( isLine ) {

						mesh = new LineSegments( buffergeometry, createdMaterials );

					} else if ( isPoints ) {

						mesh = new Points( buffergeometry, createdMaterials );

					} else {

						mesh = new Mesh$4( buffergeometry, createdMaterials );

					}

				} else {

					if ( isLine ) {

						mesh = new LineSegments( buffergeometry, createdMaterials[ 0 ] );

					} else if ( isPoints ) {

						mesh = new Points( buffergeometry, createdMaterials[ 0 ] );

					} else {

						mesh = new Mesh$4( buffergeometry, createdMaterials[ 0 ] );

					}

				}

				mesh.name = object.name;

				container.add( mesh );

			}

		} else {

			// if there is only the default parser state object with no geometry data, interpret data as point cloud

			if ( state.vertices.length > 0 ) {

				const material = new PointsMaterial$1( { size: 1, sizeAttenuation: false } );

				const buffergeometry = new BufferGeometry$2();

				buffergeometry.setAttribute( 'position', new Float32BufferAttribute$1( state.vertices, 3 ) );

				if ( state.colors.length > 0 && state.colors[ 0 ] !== undefined ) {

					buffergeometry.setAttribute( 'color', new Float32BufferAttribute$1( state.colors, 3 ) );
					material.vertexColors = true;

				}

				const points = new Points( buffergeometry, material );
				container.add( points );

			}

		}

		return container;

	}

}

/*!
fflate - fast JavaScript compression/decompression
<https://101arrowz.github.io/fflate>
Licensed under MIT. https://github.com/101arrowz/fflate/blob/master/LICENSE
version 0.8.2
*/
var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), fd = _b.b;
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
  var x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (var i = 0; i < 144; ++i)
  flt[i] = 8;
for (var i = 144; i < 256; ++i)
  flt[i] = 9;
for (var i = 256; i < 280; ++i)
  flt[i] = 7;
for (var i = 280; i < 288; ++i)
  flt[i] = 8;
var fdt = new u8(32);
for (var i = 0; i < 32; ++i)
  fdt[i] = 5;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m)
      m = a[i];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /* @__PURE__ */ new u8(0);
var zls = function(d, dict) {
  if ((d[0] & 15) != 8 || d[0] >> 4 > 7 || (d[0] << 8 | d[1]) % 31)
    err(6, "invalid zlib data");
  if ((d[1] >> 5 & 1) == 1)
    err(6, "invalid zlib data: " + (d[1] & 32 ? "need" : "unexpected") + " dictionary");
  return (d[1] >> 3 & 4) + 2;
};
function unzlibSync(data, opts) {
  return inflt(data.subarray(zls(data), -4), { i: 2 }, opts, opts);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}

const {DataTextureLoader: DataTextureLoader$1,DataUtils: DataUtils$1,FloatType: FloatType$1,HalfFloatType: HalfFloatType$2,LinearFilter: LinearFilter$1,LinearSRGBColorSpace: LinearSRGBColorSpace$3,RedFormat,RGFormat,RGBAFormat: RGBAFormat$1} = await importShared('three');

// Referred to the original Industrial Light & Magic OpenEXR implementation and the TinyEXR / Syoyo Fujita
// implementation, so I have preserved their copyright notices.

// /*
// Copyright (c) 2014 - 2017, Syoyo Fujita
// All rights reserved.

// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//     * Neither the name of the Syoyo Fujita nor the
//       names of its contributors may be used to endorse or promote products
//       derived from this software without specific prior written permission.

// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
// DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
// */

// // TinyEXR contains some OpenEXR code, which is licensed under ------------

// ///////////////////////////////////////////////////////////////////////////
// //
// // Copyright (c) 2002, Industrial Light & Magic, a division of Lucas
// // Digital Ltd. LLC
// //
// // All rights reserved.
// //
// // Redistribution and use in source and binary forms, with or without
// // modification, are permitted provided that the following conditions are
// // met:
// // *       Redistributions of source code must retain the above copyright
// // notice, this list of conditions and the following disclaimer.
// // *       Redistributions in binary form must reproduce the above
// // copyright notice, this list of conditions and the following disclaimer
// // in the documentation and/or other materials provided with the
// // distribution.
// // *       Neither the name of Industrial Light & Magic nor the names of
// // its contributors may be used to endorse or promote products derived
// // from this software without specific prior written permission.
// //
// // THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// // "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// // LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// // A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// // OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// // SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// // LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// // DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// // THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// // (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// // OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
// //
// ///////////////////////////////////////////////////////////////////////////

// // End of OpenEXR license -------------------------------------------------


/**
 * A loader for the OpenEXR texture format.
 *
 * `EXRLoader` currently supports uncompressed, ZIP(S), RLE, PIZ and DWA/B compression.
 * Supports reading as UnsignedByte, HalfFloat and Float type data texture.
 *
 * ```js
 * const loader = new EXRLoader();
 * const texture = await loader.loadAsync( 'textures/memorial.exr' );
 * ```
 *
 * @augments DataTextureLoader
 * @three_import import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
 */
class EXRLoader extends DataTextureLoader$1 {

	/**
	 * Constructs a new EXR loader.
	 *
	 * @param {LoadingManager} [manager] - The loading manager.
	 */
	constructor( manager ) {

		super( manager );

		/**
		 * The texture type.
		 *
		 * @type {(HalfFloatType|FloatType)}
		 * @default HalfFloatType
		 */
		this.type = HalfFloatType$2;

		/**
		 * Texture output format.
		 *
		 * @type {(RGBAFormat|RGFormat|RedFormat)}
		 * @default RGBAFormat
		 */
		this.outputFormat = RGBAFormat$1;

	}

	/**
	 * Parses the given EXR texture data.
	 *
	 * @param {ArrayBuffer} buffer - The raw texture data.
	 * @return {DataTextureLoader~TexData} An object representing the parsed texture data.
	 */
	parse( buffer ) {

		const USHORT_RANGE = ( 1 << 16 );
		const BITMAP_SIZE = ( USHORT_RANGE >> 3 );

		const HUF_ENCBITS = 16; // literal (value) bit length
		const HUF_DECBITS = 14; // decoding bit size (>= 8)

		const HUF_ENCSIZE = ( 1 << HUF_ENCBITS ) + 1; // encoding table size
		const HUF_DECSIZE = 1 << HUF_DECBITS; // decoding table size
		const HUF_DECMASK = HUF_DECSIZE - 1;

		const NBITS = 16;
		const A_OFFSET = 1 << ( NBITS - 1 );
		const MOD_MASK = ( 1 << NBITS ) - 1;

		const SHORT_ZEROCODE_RUN = 59;
		const LONG_ZEROCODE_RUN = 63;
		const SHORTEST_LONG_RUN = 2 + LONG_ZEROCODE_RUN - SHORT_ZEROCODE_RUN;

		const ULONG_SIZE = 8;
		const FLOAT32_SIZE = 4;
		const INT32_SIZE = 4;
		const INT16_SIZE = 2;
		const INT8_SIZE = 1;

		const STATIC_HUFFMAN = 0;
		const DEFLATE = 1;

		const UNKNOWN = 0;
		const LOSSY_DCT = 1;
		const RLE = 2;

		const logBase = Math.pow( 2.7182818, 2.2 );

		function reverseLutFromBitmap( bitmap, lut ) {

			let k = 0;

			for ( let i = 0; i < USHORT_RANGE; ++ i ) {

				if ( ( i == 0 ) || ( bitmap[ i >> 3 ] & ( 1 << ( i & 7 ) ) ) ) {

					lut[ k ++ ] = i;

				}

			}

			const n = k - 1;

			while ( k < USHORT_RANGE ) lut[ k ++ ] = 0;

			return n;

		}

		function hufClearDecTable( hdec ) {

			for ( let i = 0; i < HUF_DECSIZE; i ++ ) {

				hdec[ i ] = {};
				hdec[ i ].len = 0;
				hdec[ i ].lit = 0;
				hdec[ i ].p = null;

			}

		}

		const getBitsReturn = { l: 0, c: 0, lc: 0 };

		function getBits( nBits, c, lc, uInt8Array, inOffset ) {

			while ( lc < nBits ) {

				c = ( c << 8 ) | parseUint8Array( uInt8Array, inOffset );
				lc += 8;

			}

			lc -= nBits;

			getBitsReturn.l = ( c >> lc ) & ( ( 1 << nBits ) - 1 );
			getBitsReturn.c = c;
			getBitsReturn.lc = lc;

		}

		const hufTableBuffer = new Array( 59 );

		function hufCanonicalCodeTable( hcode ) {

			for ( let i = 0; i <= 58; ++ i ) hufTableBuffer[ i ] = 0;
			for ( let i = 0; i < HUF_ENCSIZE; ++ i ) hufTableBuffer[ hcode[ i ] ] += 1;

			let c = 0;

			for ( let i = 58; i > 0; -- i ) {

				const nc = ( ( c + hufTableBuffer[ i ] ) >> 1 );
				hufTableBuffer[ i ] = c;
				c = nc;

			}

			for ( let i = 0; i < HUF_ENCSIZE; ++ i ) {

				const l = hcode[ i ];
				if ( l > 0 ) hcode[ i ] = l | ( hufTableBuffer[ l ] ++ << 6 );

			}

		}

		function hufUnpackEncTable( uInt8Array, inOffset, ni, im, iM, hcode ) {

			const p = inOffset;
			let c = 0;
			let lc = 0;

			for ( ; im <= iM; im ++ ) {

				if ( p.value - inOffset.value > ni ) return false;

				getBits( 6, c, lc, uInt8Array, p );

				const l = getBitsReturn.l;
				c = getBitsReturn.c;
				lc = getBitsReturn.lc;

				hcode[ im ] = l;

				if ( l == LONG_ZEROCODE_RUN ) {

					if ( p.value - inOffset.value > ni ) {

						throw new Error( 'Something wrong with hufUnpackEncTable' );

					}

					getBits( 8, c, lc, uInt8Array, p );

					let zerun = getBitsReturn.l + SHORTEST_LONG_RUN;
					c = getBitsReturn.c;
					lc = getBitsReturn.lc;

					if ( im + zerun > iM + 1 ) {

						throw new Error( 'Something wrong with hufUnpackEncTable' );

					}

					while ( zerun -- ) hcode[ im ++ ] = 0;

					im --;

				} else if ( l >= SHORT_ZEROCODE_RUN ) {

					let zerun = l - SHORT_ZEROCODE_RUN + 2;

					if ( im + zerun > iM + 1 ) {

						throw new Error( 'Something wrong with hufUnpackEncTable' );

					}

					while ( zerun -- ) hcode[ im ++ ] = 0;

					im --;

				}

			}

			hufCanonicalCodeTable( hcode );

		}

		function hufLength( code ) {

			return code & 63;

		}

		function hufCode( code ) {

			return code >> 6;

		}

		function hufBuildDecTable( hcode, im, iM, hdecod ) {

			for ( ; im <= iM; im ++ ) {

				const c = hufCode( hcode[ im ] );
				const l = hufLength( hcode[ im ] );

				if ( c >> l ) {

					throw new Error( 'Invalid table entry' );

				}

				if ( l > HUF_DECBITS ) {

					const pl = hdecod[ ( c >> ( l - HUF_DECBITS ) ) ];

					if ( pl.len ) {

						throw new Error( 'Invalid table entry' );

					}

					pl.lit ++;

					if ( pl.p ) {

						const p = pl.p;
						pl.p = new Array( pl.lit );

						for ( let i = 0; i < pl.lit - 1; ++ i ) {

							pl.p[ i ] = p[ i ];

						}

					} else {

						pl.p = new Array( 1 );

					}

					pl.p[ pl.lit - 1 ] = im;

				} else if ( l ) {

					let plOffset = 0;

					for ( let i = 1 << ( HUF_DECBITS - l ); i > 0; i -- ) {

						const pl = hdecod[ ( c << ( HUF_DECBITS - l ) ) + plOffset ];

						if ( pl.len || pl.p ) {

							throw new Error( 'Invalid table entry' );

						}

						pl.len = l;
						pl.lit = im;

						plOffset ++;

					}

				}

			}

			return true;

		}

		const getCharReturn = { c: 0, lc: 0 };

		function getChar( c, lc, uInt8Array, inOffset ) {

			c = ( c << 8 ) | parseUint8Array( uInt8Array, inOffset );
			lc += 8;

			getCharReturn.c = c;
			getCharReturn.lc = lc;

		}

		const getCodeReturn = { c: 0, lc: 0 };

		function getCode( po, rlc, c, lc, uInt8Array, inOffset, outBuffer, outBufferOffset, outBufferEndOffset ) {

			if ( po == rlc ) {

				if ( lc < 8 ) {

					getChar( c, lc, uInt8Array, inOffset );
					c = getCharReturn.c;
					lc = getCharReturn.lc;

				}

				lc -= 8;

				let cs = ( c >> lc );
				cs = new Uint8Array( [ cs ] )[ 0 ];

				if ( outBufferOffset.value + cs > outBufferEndOffset ) {

					return false;

				}

				const s = outBuffer[ outBufferOffset.value - 1 ];

				while ( cs -- > 0 ) {

					outBuffer[ outBufferOffset.value ++ ] = s;

				}

			} else if ( outBufferOffset.value < outBufferEndOffset ) {

				outBuffer[ outBufferOffset.value ++ ] = po;

			} else {

				return false;

			}

			getCodeReturn.c = c;
			getCodeReturn.lc = lc;

		}

		function UInt16( value ) {

			return ( value & 0xFFFF );

		}

		function Int16( value ) {

			const ref = UInt16( value );
			return ( ref > 0x7FFF ) ? ref - 0x10000 : ref;

		}

		const wdec14Return = { a: 0, b: 0 };

		function wdec14( l, h ) {

			const ls = Int16( l );
			const hs = Int16( h );

			const hi = hs;
			const ai = ls + ( hi & 1 ) + ( hi >> 1 );

			const as = ai;
			const bs = ai - hi;

			wdec14Return.a = as;
			wdec14Return.b = bs;

		}

		function wdec16( l, h ) {

			const m = UInt16( l );
			const d = UInt16( h );

			const bb = ( m - ( d >> 1 ) ) & MOD_MASK;
			const aa = ( d + bb - A_OFFSET ) & MOD_MASK;

			wdec14Return.a = aa;
			wdec14Return.b = bb;

		}

		function wav2Decode( buffer, j, nx, ox, ny, oy, mx ) {

			const w14 = mx < ( 1 << 14 );
			const n = ( nx > ny ) ? ny : nx;
			let p = 1;
			let p2;
			let py;

			while ( p <= n ) p <<= 1;

			p >>= 1;
			p2 = p;
			p >>= 1;

			while ( p >= 1 ) {

				py = 0;
				const ey = py + oy * ( ny - p2 );
				const oy1 = oy * p;
				const oy2 = oy * p2;
				const ox1 = ox * p;
				const ox2 = ox * p2;
				let i00, i01, i10, i11;

				for ( ; py <= ey; py += oy2 ) {

					let px = py;
					const ex = py + ox * ( nx - p2 );

					for ( ; px <= ex; px += ox2 ) {

						const p01 = px + ox1;
						const p10 = px + oy1;
						const p11 = p10 + ox1;

						if ( w14 ) {

							wdec14( buffer[ px + j ], buffer[ p10 + j ] );

							i00 = wdec14Return.a;
							i10 = wdec14Return.b;

							wdec14( buffer[ p01 + j ], buffer[ p11 + j ] );

							i01 = wdec14Return.a;
							i11 = wdec14Return.b;

							wdec14( i00, i01 );

							buffer[ px + j ] = wdec14Return.a;
							buffer[ p01 + j ] = wdec14Return.b;

							wdec14( i10, i11 );

							buffer[ p10 + j ] = wdec14Return.a;
							buffer[ p11 + j ] = wdec14Return.b;

						} else {

							wdec16( buffer[ px + j ], buffer[ p10 + j ] );

							i00 = wdec14Return.a;
							i10 = wdec14Return.b;

							wdec16( buffer[ p01 + j ], buffer[ p11 + j ] );

							i01 = wdec14Return.a;
							i11 = wdec14Return.b;

							wdec16( i00, i01 );

							buffer[ px + j ] = wdec14Return.a;
							buffer[ p01 + j ] = wdec14Return.b;

							wdec16( i10, i11 );

							buffer[ p10 + j ] = wdec14Return.a;
							buffer[ p11 + j ] = wdec14Return.b;


						}

					}

					if ( nx & p ) {

						const p10 = px + oy1;

						if ( w14 )
							wdec14( buffer[ px + j ], buffer[ p10 + j ] );
						else
							wdec16( buffer[ px + j ], buffer[ p10 + j ] );

						i00 = wdec14Return.a;
						buffer[ p10 + j ] = wdec14Return.b;

						buffer[ px + j ] = i00;

					}

				}

				if ( ny & p ) {

					let px = py;
					const ex = py + ox * ( nx - p2 );

					for ( ; px <= ex; px += ox2 ) {

						const p01 = px + ox1;

						if ( w14 )
							wdec14( buffer[ px + j ], buffer[ p01 + j ] );
						else
							wdec16( buffer[ px + j ], buffer[ p01 + j ] );

						i00 = wdec14Return.a;
						buffer[ p01 + j ] = wdec14Return.b;

						buffer[ px + j ] = i00;

					}

				}

				p2 = p;
				p >>= 1;

			}

			return py;

		}

		function hufDecode( encodingTable, decodingTable, uInt8Array, inOffset, ni, rlc, no, outBuffer, outOffset ) {

			let c = 0;
			let lc = 0;
			const outBufferEndOffset = no;
			const inOffsetEnd = Math.trunc( inOffset.value + ( ni + 7 ) / 8 );

			while ( inOffset.value < inOffsetEnd ) {

				getChar( c, lc, uInt8Array, inOffset );

				c = getCharReturn.c;
				lc = getCharReturn.lc;

				while ( lc >= HUF_DECBITS ) {

					const index = ( c >> ( lc - HUF_DECBITS ) ) & HUF_DECMASK;
					const pl = decodingTable[ index ];

					if ( pl.len ) {

						lc -= pl.len;

						getCode( pl.lit, rlc, c, lc, uInt8Array, inOffset, outBuffer, outOffset, outBufferEndOffset );

						c = getCodeReturn.c;
						lc = getCodeReturn.lc;

					} else {

						if ( ! pl.p ) {

							throw new Error( 'hufDecode issues' );

						}

						let j;

						for ( j = 0; j < pl.lit; j ++ ) {

							const l = hufLength( encodingTable[ pl.p[ j ] ] );

							while ( lc < l && inOffset.value < inOffsetEnd ) {

								getChar( c, lc, uInt8Array, inOffset );

								c = getCharReturn.c;
								lc = getCharReturn.lc;

							}

							if ( lc >= l ) {

								if ( hufCode( encodingTable[ pl.p[ j ] ] ) == ( ( c >> ( lc - l ) ) & ( ( 1 << l ) - 1 ) ) ) {

									lc -= l;

									getCode( pl.p[ j ], rlc, c, lc, uInt8Array, inOffset, outBuffer, outOffset, outBufferEndOffset );

									c = getCodeReturn.c;
									lc = getCodeReturn.lc;

									break;

								}

							}

						}

						if ( j == pl.lit ) {

							throw new Error( 'hufDecode issues' );

						}

					}

				}

			}

			const i = ( 8 - ni ) & 7;

			c >>= i;
			lc -= i;

			while ( lc > 0 ) {

				const pl = decodingTable[ ( c << ( HUF_DECBITS - lc ) ) & HUF_DECMASK ];

				if ( pl.len ) {

					lc -= pl.len;

					getCode( pl.lit, rlc, c, lc, uInt8Array, inOffset, outBuffer, outOffset, outBufferEndOffset );

					c = getCodeReturn.c;
					lc = getCodeReturn.lc;

				} else {

					throw new Error( 'hufDecode issues' );

				}

			}

			return true;

		}

		function hufUncompress( uInt8Array, inDataView, inOffset, nCompressed, outBuffer, nRaw ) {

			const outOffset = { value: 0 };
			const initialInOffset = inOffset.value;

			const im = parseUint32( inDataView, inOffset );
			const iM = parseUint32( inDataView, inOffset );

			inOffset.value += 4;

			const nBits = parseUint32( inDataView, inOffset );

			inOffset.value += 4;

			if ( im < 0 || im >= HUF_ENCSIZE || iM < 0 || iM >= HUF_ENCSIZE ) {

				throw new Error( 'Something wrong with HUF_ENCSIZE' );

			}

			const freq = new Array( HUF_ENCSIZE );
			const hdec = new Array( HUF_DECSIZE );

			hufClearDecTable( hdec );

			const ni = nCompressed - ( inOffset.value - initialInOffset );

			hufUnpackEncTable( uInt8Array, inOffset, ni, im, iM, freq );

			if ( nBits > 8 * ( nCompressed - ( inOffset.value - initialInOffset ) ) ) {

				throw new Error( 'Something wrong with hufUncompress' );

			}

			hufBuildDecTable( freq, im, iM, hdec );

			hufDecode( freq, hdec, uInt8Array, inOffset, nBits, iM, nRaw, outBuffer, outOffset );

		}

		function applyLut( lut, data, nData ) {

			for ( let i = 0; i < nData; ++ i ) {

				data[ i ] = lut[ data[ i ] ];

			}

		}

		function predictor( source ) {

			for ( let t = 1; t < source.length; t ++ ) {

				const d = source[ t - 1 ] + source[ t ] - 128;
				source[ t ] = d;

			}

		}

		function interleaveScalar( source, out ) {

			let t1 = 0;
			let t2 = Math.floor( ( source.length + 1 ) / 2 );
			let s = 0;
			const stop = source.length - 1;

			while ( true ) {

				if ( s > stop ) break;
				out[ s ++ ] = source[ t1 ++ ];

				if ( s > stop ) break;
				out[ s ++ ] = source[ t2 ++ ];

			}

		}

		function decodeRunLength( source ) {

			let size = source.byteLength;
			const out = new Array();
			let p = 0;

			const reader = new DataView( source );

			while ( size > 0 ) {

				const l = reader.getInt8( p ++ );

				if ( l < 0 ) {

					const count = - l;
					size -= count + 1;

					for ( let i = 0; i < count; i ++ ) {

						out.push( reader.getUint8( p ++ ) );

					}


				} else {

					const count = l;
					size -= 2;

					const value = reader.getUint8( p ++ );

					for ( let i = 0; i < count + 1; i ++ ) {

						out.push( value );

					}

				}

			}

			return out;

		}

		function lossyDctDecode( cscSet, rowPtrs, channelData, acBuffer, dcBuffer, outBuffer ) {

			let dataView = new DataView( outBuffer.buffer );

			const width = channelData[ cscSet.idx[ 0 ] ].width;
			const height = channelData[ cscSet.idx[ 0 ] ].height;

			const numComp = 3;

			const numFullBlocksX = Math.floor( width / 8.0 );
			const numBlocksX = Math.ceil( width / 8.0 );
			const numBlocksY = Math.ceil( height / 8.0 );
			const leftoverX = width - ( numBlocksX - 1 ) * 8;
			const leftoverY = height - ( numBlocksY - 1 ) * 8;

			const currAcComp = { value: 0 };
			const currDcComp = new Array( numComp );
			const dctData = new Array( numComp );
			const halfZigBlock = new Array( numComp );
			const rowBlock = new Array( numComp );
			const rowOffsets = new Array( numComp );

			for ( let comp = 0; comp < numComp; ++ comp ) {

				rowOffsets[ comp ] = rowPtrs[ cscSet.idx[ comp ] ];
				currDcComp[ comp ] = ( comp < 1 ) ? 0 : currDcComp[ comp - 1 ] + numBlocksX * numBlocksY;
				dctData[ comp ] = new Float32Array( 64 );
				halfZigBlock[ comp ] = new Uint16Array( 64 );
				rowBlock[ comp ] = new Uint16Array( numBlocksX * 64 );

			}

			for ( let blocky = 0; blocky < numBlocksY; ++ blocky ) {

				let maxY = 8;

				if ( blocky == numBlocksY - 1 )
					maxY = leftoverY;

				let maxX = 8;

				for ( let blockx = 0; blockx < numBlocksX; ++ blockx ) {

					if ( blockx == numBlocksX - 1 )
						maxX = leftoverX;

					for ( let comp = 0; comp < numComp; ++ comp ) {

						halfZigBlock[ comp ].fill( 0 );

						// set block DC component
						halfZigBlock[ comp ][ 0 ] = dcBuffer[ currDcComp[ comp ] ++ ];
						// set block AC components
						unRleAC( currAcComp, acBuffer, halfZigBlock[ comp ] );

						// UnZigZag block to float
						unZigZag( halfZigBlock[ comp ], dctData[ comp ] );
						// decode float dct
						dctInverse( dctData[ comp ] );

					}

					{

						csc709Inverse( dctData );

					}

					for ( let comp = 0; comp < numComp; ++ comp ) {

						convertToHalf( dctData[ comp ], rowBlock[ comp ], blockx * 64 );

					}

				} // blockx

				let offset = 0;

				for ( let comp = 0; comp < numComp; ++ comp ) {

					const type = channelData[ cscSet.idx[ comp ] ].type;

					for ( let y = 8 * blocky; y < 8 * blocky + maxY; ++ y ) {

						offset = rowOffsets[ comp ][ y ];

						for ( let blockx = 0; blockx < numFullBlocksX; ++ blockx ) {

							const src = blockx * 64 + ( ( y & 0x7 ) * 8 );

							dataView.setUint16( offset + 0 * INT16_SIZE * type, rowBlock[ comp ][ src + 0 ], true );
							dataView.setUint16( offset + 1 * INT16_SIZE * type, rowBlock[ comp ][ src + 1 ], true );
							dataView.setUint16( offset + 2 * INT16_SIZE * type, rowBlock[ comp ][ src + 2 ], true );
							dataView.setUint16( offset + 3 * INT16_SIZE * type, rowBlock[ comp ][ src + 3 ], true );

							dataView.setUint16( offset + 4 * INT16_SIZE * type, rowBlock[ comp ][ src + 4 ], true );
							dataView.setUint16( offset + 5 * INT16_SIZE * type, rowBlock[ comp ][ src + 5 ], true );
							dataView.setUint16( offset + 6 * INT16_SIZE * type, rowBlock[ comp ][ src + 6 ], true );
							dataView.setUint16( offset + 7 * INT16_SIZE * type, rowBlock[ comp ][ src + 7 ], true );

							offset += 8 * INT16_SIZE * type;

						}

					}

					// handle partial X blocks
					if ( numFullBlocksX != numBlocksX ) {

						for ( let y = 8 * blocky; y < 8 * blocky + maxY; ++ y ) {

							const offset = rowOffsets[ comp ][ y ] + 8 * numFullBlocksX * INT16_SIZE * type;
							const src = numFullBlocksX * 64 + ( ( y & 0x7 ) * 8 );

							for ( let x = 0; x < maxX; ++ x ) {

								dataView.setUint16( offset + x * INT16_SIZE * type, rowBlock[ comp ][ src + x ], true );

							}

						}

					}

				} // comp

			} // blocky

			const halfRow = new Uint16Array( width );
			dataView = new DataView( outBuffer.buffer );

			// convert channels back to float, if needed
			for ( let comp = 0; comp < numComp; ++ comp ) {

				channelData[ cscSet.idx[ comp ] ].decoded = true;
				const type = channelData[ cscSet.idx[ comp ] ].type;

				if ( channelData[ comp ].type != 2 ) continue;

				for ( let y = 0; y < height; ++ y ) {

					const offset = rowOffsets[ comp ][ y ];

					for ( let x = 0; x < width; ++ x ) {

						halfRow[ x ] = dataView.getUint16( offset + x * INT16_SIZE * type, true );

					}

					for ( let x = 0; x < width; ++ x ) {

						dataView.setFloat32( offset + x * INT16_SIZE * type, decodeFloat16( halfRow[ x ] ), true );

					}

				}

			}

		}

		function lossyDctChannelDecode( channelIndex, rowPtrs, channelData, acBuffer, dcBuffer, outBuffer ) {

			const dataView = new DataView( outBuffer.buffer );
			const cd = channelData[ channelIndex ];
			const width = cd.width;
			const height = cd.height;

			const numBlocksX = Math.ceil( width / 8.0 );
			const numBlocksY = Math.ceil( height / 8.0 );
			const numFullBlocksX = Math.floor( width / 8.0 );
			const leftoverX = width - ( numBlocksX - 1 ) * 8;
			const leftoverY = height - ( numBlocksY - 1 ) * 8;

			const currAcComp = { value: 0 };
			let currDcComp = 0;
			const dctData = new Float32Array( 64 );
			const halfZigBlock = new Uint16Array( 64 );
			const rowBlock = new Uint16Array( numBlocksX * 64 );

			for ( let blocky = 0; blocky < numBlocksY; ++ blocky ) {

				let maxY = 8;

				if ( blocky == numBlocksY - 1 ) maxY = leftoverY;

				for ( let blockx = 0; blockx < numBlocksX; ++ blockx ) {

					halfZigBlock.fill( 0 );
					halfZigBlock[ 0 ] = dcBuffer[ currDcComp ++ ];
					unRleAC( currAcComp, acBuffer, halfZigBlock );
					unZigZag( halfZigBlock, dctData );
					dctInverse( dctData );
					convertToHalf( dctData, rowBlock, blockx * 64 );

				}

				// Write decoded data to output buffer
				for ( let y = 8 * blocky; y < 8 * blocky + maxY; ++ y ) {

					let offset = rowPtrs[ channelIndex ][ y ];

					for ( let blockx = 0; blockx < numFullBlocksX; ++ blockx ) {

						const src = blockx * 64 + ( ( y & 0x7 ) * 8 );

						for ( let x = 0; x < 8; ++ x ) {

							dataView.setUint16( offset + x * INT16_SIZE * cd.type, rowBlock[ src + x ], true );

						}

						offset += 8 * INT16_SIZE * cd.type;

					}

					if ( numBlocksX != numFullBlocksX ) {

						const src = numFullBlocksX * 64 + ( ( y & 0x7 ) * 8 );

						for ( let x = 0; x < leftoverX; ++ x ) {

							dataView.setUint16( offset + x * INT16_SIZE * cd.type, rowBlock[ src + x ], true );

						}

					}

				}

			}

			cd.decoded = true;

		}

		function unRleAC( currAcComp, acBuffer, halfZigBlock ) {

			let acValue;
			let dctComp = 1;

			while ( dctComp < 64 ) {

				acValue = acBuffer[ currAcComp.value ];

				if ( acValue == 0xff00 ) {

					dctComp = 64;

				} else if ( acValue >> 8 == 0xff ) {

					dctComp += acValue & 0xff;

				} else {

					halfZigBlock[ dctComp ] = acValue;
					dctComp ++;

				}

				currAcComp.value ++;

			}

		}

		function unZigZag( src, dst ) {

			dst[ 0 ] = decodeFloat16( src[ 0 ] );
			dst[ 1 ] = decodeFloat16( src[ 1 ] );
			dst[ 2 ] = decodeFloat16( src[ 5 ] );
			dst[ 3 ] = decodeFloat16( src[ 6 ] );
			dst[ 4 ] = decodeFloat16( src[ 14 ] );
			dst[ 5 ] = decodeFloat16( src[ 15 ] );
			dst[ 6 ] = decodeFloat16( src[ 27 ] );
			dst[ 7 ] = decodeFloat16( src[ 28 ] );
			dst[ 8 ] = decodeFloat16( src[ 2 ] );
			dst[ 9 ] = decodeFloat16( src[ 4 ] );

			dst[ 10 ] = decodeFloat16( src[ 7 ] );
			dst[ 11 ] = decodeFloat16( src[ 13 ] );
			dst[ 12 ] = decodeFloat16( src[ 16 ] );
			dst[ 13 ] = decodeFloat16( src[ 26 ] );
			dst[ 14 ] = decodeFloat16( src[ 29 ] );
			dst[ 15 ] = decodeFloat16( src[ 42 ] );
			dst[ 16 ] = decodeFloat16( src[ 3 ] );
			dst[ 17 ] = decodeFloat16( src[ 8 ] );
			dst[ 18 ] = decodeFloat16( src[ 12 ] );
			dst[ 19 ] = decodeFloat16( src[ 17 ] );

			dst[ 20 ] = decodeFloat16( src[ 25 ] );
			dst[ 21 ] = decodeFloat16( src[ 30 ] );
			dst[ 22 ] = decodeFloat16( src[ 41 ] );
			dst[ 23 ] = decodeFloat16( src[ 43 ] );
			dst[ 24 ] = decodeFloat16( src[ 9 ] );
			dst[ 25 ] = decodeFloat16( src[ 11 ] );
			dst[ 26 ] = decodeFloat16( src[ 18 ] );
			dst[ 27 ] = decodeFloat16( src[ 24 ] );
			dst[ 28 ] = decodeFloat16( src[ 31 ] );
			dst[ 29 ] = decodeFloat16( src[ 40 ] );

			dst[ 30 ] = decodeFloat16( src[ 44 ] );
			dst[ 31 ] = decodeFloat16( src[ 53 ] );
			dst[ 32 ] = decodeFloat16( src[ 10 ] );
			dst[ 33 ] = decodeFloat16( src[ 19 ] );
			dst[ 34 ] = decodeFloat16( src[ 23 ] );
			dst[ 35 ] = decodeFloat16( src[ 32 ] );
			dst[ 36 ] = decodeFloat16( src[ 39 ] );
			dst[ 37 ] = decodeFloat16( src[ 45 ] );
			dst[ 38 ] = decodeFloat16( src[ 52 ] );
			dst[ 39 ] = decodeFloat16( src[ 54 ] );

			dst[ 40 ] = decodeFloat16( src[ 20 ] );
			dst[ 41 ] = decodeFloat16( src[ 22 ] );
			dst[ 42 ] = decodeFloat16( src[ 33 ] );
			dst[ 43 ] = decodeFloat16( src[ 38 ] );
			dst[ 44 ] = decodeFloat16( src[ 46 ] );
			dst[ 45 ] = decodeFloat16( src[ 51 ] );
			dst[ 46 ] = decodeFloat16( src[ 55 ] );
			dst[ 47 ] = decodeFloat16( src[ 60 ] );
			dst[ 48 ] = decodeFloat16( src[ 21 ] );
			dst[ 49 ] = decodeFloat16( src[ 34 ] );

			dst[ 50 ] = decodeFloat16( src[ 37 ] );
			dst[ 51 ] = decodeFloat16( src[ 47 ] );
			dst[ 52 ] = decodeFloat16( src[ 50 ] );
			dst[ 53 ] = decodeFloat16( src[ 56 ] );
			dst[ 54 ] = decodeFloat16( src[ 59 ] );
			dst[ 55 ] = decodeFloat16( src[ 61 ] );
			dst[ 56 ] = decodeFloat16( src[ 35 ] );
			dst[ 57 ] = decodeFloat16( src[ 36 ] );
			dst[ 58 ] = decodeFloat16( src[ 48 ] );
			dst[ 59 ] = decodeFloat16( src[ 49 ] );

			dst[ 60 ] = decodeFloat16( src[ 57 ] );
			dst[ 61 ] = decodeFloat16( src[ 58 ] );
			dst[ 62 ] = decodeFloat16( src[ 62 ] );
			dst[ 63 ] = decodeFloat16( src[ 63 ] );

		}

		function dctInverse( data ) {

			const a = 0.5 * Math.cos( 3.14159 / 4.0 );
			const b = 0.5 * Math.cos( 3.14159 / 16.0 );
			const c = 0.5 * Math.cos( 3.14159 / 8.0 );
			const d = 0.5 * Math.cos( 3.0 * 3.14159 / 16.0 );
			const e = 0.5 * Math.cos( 5.0 * 3.14159 / 16.0 );
			const f = 0.5 * Math.cos( 3.0 * 3.14159 / 8.0 );
			const g = 0.5 * Math.cos( 7.0 * 3.14159 / 16.0 );

			const alpha = new Array( 4 );
			const beta = new Array( 4 );
			const theta = new Array( 4 );
			const gamma = new Array( 4 );

			for ( let row = 0; row < 8; ++ row ) {

				const rowPtr = row * 8;

				alpha[ 0 ] = c * data[ rowPtr + 2 ];
				alpha[ 1 ] = f * data[ rowPtr + 2 ];
				alpha[ 2 ] = c * data[ rowPtr + 6 ];
				alpha[ 3 ] = f * data[ rowPtr + 6 ];

				beta[ 0 ] = b * data[ rowPtr + 1 ] + d * data[ rowPtr + 3 ] + e * data[ rowPtr + 5 ] + g * data[ rowPtr + 7 ];
				beta[ 1 ] = d * data[ rowPtr + 1 ] - g * data[ rowPtr + 3 ] - b * data[ rowPtr + 5 ] - e * data[ rowPtr + 7 ];
				beta[ 2 ] = e * data[ rowPtr + 1 ] - b * data[ rowPtr + 3 ] + g * data[ rowPtr + 5 ] + d * data[ rowPtr + 7 ];
				beta[ 3 ] = g * data[ rowPtr + 1 ] - e * data[ rowPtr + 3 ] + d * data[ rowPtr + 5 ] - b * data[ rowPtr + 7 ];

				theta[ 0 ] = a * ( data[ rowPtr + 0 ] + data[ rowPtr + 4 ] );
				theta[ 3 ] = a * ( data[ rowPtr + 0 ] - data[ rowPtr + 4 ] );
				theta[ 1 ] = alpha[ 0 ] + alpha[ 3 ];
				theta[ 2 ] = alpha[ 1 ] - alpha[ 2 ];

				gamma[ 0 ] = theta[ 0 ] + theta[ 1 ];
				gamma[ 1 ] = theta[ 3 ] + theta[ 2 ];
				gamma[ 2 ] = theta[ 3 ] - theta[ 2 ];
				gamma[ 3 ] = theta[ 0 ] - theta[ 1 ];

				data[ rowPtr + 0 ] = gamma[ 0 ] + beta[ 0 ];
				data[ rowPtr + 1 ] = gamma[ 1 ] + beta[ 1 ];
				data[ rowPtr + 2 ] = gamma[ 2 ] + beta[ 2 ];
				data[ rowPtr + 3 ] = gamma[ 3 ] + beta[ 3 ];

				data[ rowPtr + 4 ] = gamma[ 3 ] - beta[ 3 ];
				data[ rowPtr + 5 ] = gamma[ 2 ] - beta[ 2 ];
				data[ rowPtr + 6 ] = gamma[ 1 ] - beta[ 1 ];
				data[ rowPtr + 7 ] = gamma[ 0 ] - beta[ 0 ];

			}

			for ( let column = 0; column < 8; ++ column ) {

				alpha[ 0 ] = c * data[ 16 + column ];
				alpha[ 1 ] = f * data[ 16 + column ];
				alpha[ 2 ] = c * data[ 48 + column ];
				alpha[ 3 ] = f * data[ 48 + column ];

				beta[ 0 ] = b * data[ 8 + column ] + d * data[ 24 + column ] + e * data[ 40 + column ] + g * data[ 56 + column ];
				beta[ 1 ] = d * data[ 8 + column ] - g * data[ 24 + column ] - b * data[ 40 + column ] - e * data[ 56 + column ];
				beta[ 2 ] = e * data[ 8 + column ] - b * data[ 24 + column ] + g * data[ 40 + column ] + d * data[ 56 + column ];
				beta[ 3 ] = g * data[ 8 + column ] - e * data[ 24 + column ] + d * data[ 40 + column ] - b * data[ 56 + column ];

				theta[ 0 ] = a * ( data[ column ] + data[ 32 + column ] );
				theta[ 3 ] = a * ( data[ column ] - data[ 32 + column ] );

				theta[ 1 ] = alpha[ 0 ] + alpha[ 3 ];
				theta[ 2 ] = alpha[ 1 ] - alpha[ 2 ];

				gamma[ 0 ] = theta[ 0 ] + theta[ 1 ];
				gamma[ 1 ] = theta[ 3 ] + theta[ 2 ];
				gamma[ 2 ] = theta[ 3 ] - theta[ 2 ];
				gamma[ 3 ] = theta[ 0 ] - theta[ 1 ];

				data[ 0 + column ] = gamma[ 0 ] + beta[ 0 ];
				data[ 8 + column ] = gamma[ 1 ] + beta[ 1 ];
				data[ 16 + column ] = gamma[ 2 ] + beta[ 2 ];
				data[ 24 + column ] = gamma[ 3 ] + beta[ 3 ];

				data[ 32 + column ] = gamma[ 3 ] - beta[ 3 ];
				data[ 40 + column ] = gamma[ 2 ] - beta[ 2 ];
				data[ 48 + column ] = gamma[ 1 ] - beta[ 1 ];
				data[ 56 + column ] = gamma[ 0 ] - beta[ 0 ];

			}

		}

		function csc709Inverse( data ) {

			for ( let i = 0; i < 64; ++ i ) {

				const y = data[ 0 ][ i ];
				const cb = data[ 1 ][ i ];
				const cr = data[ 2 ][ i ];

				data[ 0 ][ i ] = y + 1.5747 * cr;
				data[ 1 ][ i ] = y - 0.1873 * cb - 0.4682 * cr;
				data[ 2 ][ i ] = y + 1.8556 * cb;

			}

		}

		function convertToHalf( src, dst, idx ) {

			for ( let i = 0; i < 64; ++ i ) {

				dst[ idx + i ] = DataUtils$1.toHalfFloat( toLinear( src[ i ] ) );

			}

		}

		function toLinear( float ) {

			if ( float <= 1 ) {

				return Math.sign( float ) * Math.pow( Math.abs( float ), 2.2 );

			} else {

				return Math.sign( float ) * Math.pow( logBase, Math.abs( float ) - 1.0 );

			}

		}

		function uncompressRAW( info ) {

			return new DataView( info.array.buffer, info.offset.value, info.size );

		}

		function uncompressRLE( info ) {

			const compressed = info.viewer.buffer.slice( info.offset.value, info.offset.value + info.size );

			const rawBuffer = new Uint8Array( decodeRunLength( compressed ) );
			const tmpBuffer = new Uint8Array( rawBuffer.length );

			predictor( rawBuffer ); // revert predictor

			interleaveScalar( rawBuffer, tmpBuffer ); // interleave pixels

			return new DataView( tmpBuffer.buffer );

		}

		function uncompressZIP( info ) {

			const compressed = info.array.slice( info.offset.value, info.offset.value + info.size );

			const rawBuffer = unzlibSync( compressed );
			const tmpBuffer = new Uint8Array( rawBuffer.length );

			predictor( rawBuffer ); // revert predictor

			interleaveScalar( rawBuffer, tmpBuffer ); // interleave pixels

			return new DataView( tmpBuffer.buffer );

		}

		function uncompressPIZ( info ) {

			const inDataView = info.viewer;
			const inOffset = { value: info.offset.value };

			const outBuffer = new Uint16Array( info.columns * info.lines * ( info.inputChannels.length * info.type ) );
			const bitmap = new Uint8Array( BITMAP_SIZE );

			// Setup channel info
			let outBufferEnd = 0;
			const pizChannelData = new Array( info.inputChannels.length );
			for ( let i = 0, il = info.inputChannels.length; i < il; i ++ ) {

				pizChannelData[ i ] = {};
				pizChannelData[ i ][ 'start' ] = outBufferEnd;
				pizChannelData[ i ][ 'end' ] = pizChannelData[ i ][ 'start' ];
				pizChannelData[ i ][ 'nx' ] = info.columns;
				pizChannelData[ i ][ 'ny' ] = info.lines;
				pizChannelData[ i ][ 'size' ] = info.type;

				outBufferEnd += pizChannelData[ i ].nx * pizChannelData[ i ].ny * pizChannelData[ i ].size;

			}

			// Read range compression data

			const minNonZero = parseUint16( inDataView, inOffset );
			const maxNonZero = parseUint16( inDataView, inOffset );

			if ( maxNonZero >= BITMAP_SIZE ) {

				throw new Error( 'Something is wrong with PIZ_COMPRESSION BITMAP_SIZE' );

			}

			if ( minNonZero <= maxNonZero ) {

				for ( let i = 0; i < maxNonZero - minNonZero + 1; i ++ ) {

					bitmap[ i + minNonZero ] = parseUint8( inDataView, inOffset );

				}

			}

			// Reverse LUT
			const lut = new Uint16Array( USHORT_RANGE );
			const maxValue = reverseLutFromBitmap( bitmap, lut );

			const length = parseUint32( inDataView, inOffset );

			// Huffman decoding
			hufUncompress( info.array, inDataView, inOffset, length, outBuffer, outBufferEnd );

			// Wavelet decoding
			for ( let i = 0; i < info.inputChannels.length; ++ i ) {

				const cd = pizChannelData[ i ];

				for ( let j = 0; j < pizChannelData[ i ].size; ++ j ) {

					wav2Decode(
						outBuffer,
						cd.start + j,
						cd.nx,
						cd.size,
						cd.ny,
						cd.nx * cd.size,
						maxValue
					);

				}

			}

			// Expand the pixel data to their original range
			applyLut( lut, outBuffer, outBufferEnd );

			// Rearrange the pixel data into the format expected by the caller.
			let tmpOffset = 0;
			const tmpBuffer = new Uint8Array( outBuffer.buffer.byteLength );
			for ( let y = 0; y < info.lines; y ++ ) {

				for ( let c = 0; c < info.inputChannels.length; c ++ ) {

					const cd = pizChannelData[ c ];

					const n = cd.nx * cd.size;
					const cp = new Uint8Array( outBuffer.buffer, cd.end * INT16_SIZE, n * INT16_SIZE );

					tmpBuffer.set( cp, tmpOffset );
					tmpOffset += n * INT16_SIZE;
					cd.end += n;

				}

			}

			return new DataView( tmpBuffer.buffer );

		}

		function uncompressPXR( info ) {

			const compressed = info.array.slice( info.offset.value, info.offset.value + info.size );

			const rawBuffer = unzlibSync( compressed );

			const byteSize = info.inputChannels.length * info.lines * info.columns * info.totalBytes;
			const tmpBuffer = new ArrayBuffer( byteSize );
			const viewer = new DataView( tmpBuffer );

			let tmpBufferEnd = 0;
			let writePtr = 0;
			const ptr = new Array( 4 );

			for ( let y = 0; y < info.lines; y ++ ) {

				for ( let c = 0; c < info.inputChannels.length; c ++ ) {

					let pixel = 0;

					const type = info.inputChannels[ c ].pixelType;
					switch ( type ) {

						case 1:

							ptr[ 0 ] = tmpBufferEnd;
							ptr[ 1 ] = ptr[ 0 ] + info.columns;
							tmpBufferEnd = ptr[ 1 ] + info.columns;

							for ( let j = 0; j < info.columns; ++ j ) {

								const diff = ( rawBuffer[ ptr[ 0 ] ++ ] << 8 ) | rawBuffer[ ptr[ 1 ] ++ ];

								pixel += diff;

								viewer.setUint16( writePtr, pixel, true );
								writePtr += 2;

							}

							break;

						case 2:

							ptr[ 0 ] = tmpBufferEnd;
							ptr[ 1 ] = ptr[ 0 ] + info.columns;
							ptr[ 2 ] = ptr[ 1 ] + info.columns;
							tmpBufferEnd = ptr[ 2 ] + info.columns;

							for ( let j = 0; j < info.columns; ++ j ) {

								const diff = ( rawBuffer[ ptr[ 0 ] ++ ] << 24 ) | ( rawBuffer[ ptr[ 1 ] ++ ] << 16 ) | ( rawBuffer[ ptr[ 2 ] ++ ] << 8 );

								pixel += diff;

								viewer.setUint32( writePtr, pixel, true );
								writePtr += 4;

							}

							break;

					}

				}

			}

			return viewer;

		}

		function uncompressDWA( info ) {

			const inDataView = info.viewer;
			const inOffset = { value: info.offset.value };
			const outBuffer = new Uint8Array( info.columns * info.lines * ( info.inputChannels.length * info.type * INT16_SIZE ) );

			// Read compression header information
			const dwaHeader = {

				version: parseInt64( inDataView, inOffset ),
				unknownUncompressedSize: parseInt64( inDataView, inOffset ),
				unknownCompressedSize: parseInt64( inDataView, inOffset ),
				acCompressedSize: parseInt64( inDataView, inOffset ),
				dcCompressedSize: parseInt64( inDataView, inOffset ),
				rleCompressedSize: parseInt64( inDataView, inOffset ),
				rleUncompressedSize: parseInt64( inDataView, inOffset ),
				rleRawSize: parseInt64( inDataView, inOffset ),
				totalAcUncompressedCount: parseInt64( inDataView, inOffset ),
				totalDcUncompressedCount: parseInt64( inDataView, inOffset ),
				acCompression: parseInt64( inDataView, inOffset )

			};

			if ( dwaHeader.version < 2 )
				throw new Error( 'EXRLoader.parse: ' + EXRHeader.compression + ' version ' + dwaHeader.version + ' is unsupported' );

			// Read channel ruleset information
			const channelRules = new Array();
			let ruleSize = parseUint16( inDataView, inOffset ) - INT16_SIZE;

			while ( ruleSize > 0 ) {

				const name = parseNullTerminatedString( inDataView.buffer, inOffset );
				const value = parseUint8( inDataView, inOffset );
				const compression = ( value >> 2 ) & 3;
				const csc = ( value >> 4 ) - 1;
				const index = new Int8Array( [ csc ] )[ 0 ];
				const type = parseUint8( inDataView, inOffset );

				channelRules.push( {
					name: name,
					index: index,
					type: type,
					compression: compression,
				} );

				ruleSize -= name.length + 3;

			}

			// Classify channels
			const channels = EXRHeader.channels;
			const channelData = new Array( info.inputChannels.length );

			for ( let i = 0; i < info.inputChannels.length; ++ i ) {

				const cd = channelData[ i ] = {};
				const channel = channels[ i ];

				cd.name = channel.name;
				cd.compression = UNKNOWN;
				cd.decoded = false;
				cd.type = channel.pixelType;
				cd.pLinear = channel.pLinear;
				cd.width = info.columns;
				cd.height = info.lines;

			}

			const cscSet = {
				idx: new Array( 3 )
			};

			for ( let offset = 0; offset < info.inputChannels.length; ++ offset ) {

				const cd = channelData[ offset ];

				for ( let i = 0; i < channelRules.length; ++ i ) {

					const rule = channelRules[ i ];

					if ( cd.name == rule.name ) {

						cd.compression = rule.compression;

						if ( rule.index >= 0 ) {

							cscSet.idx[ rule.index ] = offset;

						}

						cd.offset = offset;

					}

				}

			}

			let acBuffer, dcBuffer, rleBuffer;

			// Read DCT - AC component data
			if ( dwaHeader.acCompressedSize > 0 ) {

				switch ( dwaHeader.acCompression ) {

					case STATIC_HUFFMAN:

						acBuffer = new Uint16Array( dwaHeader.totalAcUncompressedCount );
						hufUncompress( info.array, inDataView, inOffset, dwaHeader.acCompressedSize, acBuffer, dwaHeader.totalAcUncompressedCount );
						break;

					case DEFLATE:

						const compressed = info.array.slice( inOffset.value, inOffset.value + dwaHeader.totalAcUncompressedCount );
						const data = unzlibSync( compressed );
						acBuffer = new Uint16Array( data.buffer );
						inOffset.value += dwaHeader.totalAcUncompressedCount;
						break;

				}


			}

			// Read DCT - DC component data
			if ( dwaHeader.dcCompressedSize > 0 ) {

				const zlibInfo = {
					array: info.array,
					offset: inOffset,
					size: dwaHeader.dcCompressedSize
				};
				dcBuffer = new Uint16Array( uncompressZIP( zlibInfo ).buffer );
				inOffset.value += dwaHeader.dcCompressedSize;

			}

			// Read RLE compressed data
			if ( dwaHeader.rleRawSize > 0 ) {

				const compressed = info.array.slice( inOffset.value, inOffset.value + dwaHeader.rleCompressedSize );
				const data = unzlibSync( compressed );
				rleBuffer = decodeRunLength( data.buffer );

				inOffset.value += dwaHeader.rleCompressedSize;

			}

			// Prepare outbuffer data offset
			let outBufferEnd = 0;
			const rowOffsets = new Array( channelData.length );
			for ( let i = 0; i < rowOffsets.length; ++ i ) {

				rowOffsets[ i ] = new Array();

			}

			for ( let y = 0; y < info.lines; ++ y ) {

				for ( let chan = 0; chan < channelData.length; ++ chan ) {

					rowOffsets[ chan ].push( outBufferEnd );
					outBufferEnd += channelData[ chan ].width * info.type * INT16_SIZE;

				}

			}

			// Decode lossy DCT data if we have a valid color space conversion set with the first RGB channel present
			if ( cscSet.idx[ 0 ] !== undefined && channelData[ cscSet.idx[ 0 ] ] ) {

				lossyDctDecode( cscSet, rowOffsets, channelData, acBuffer, dcBuffer, outBuffer );

			}

			// Decode other channels
			for ( let i = 0; i < channelData.length; ++ i ) {

				const cd = channelData[ i ];

				if ( cd.decoded ) continue;

				switch ( cd.compression ) {

					case RLE:

						let row = 0;
						let rleOffset = 0;

						for ( let y = 0; y < info.lines; ++ y ) {

							let rowOffsetBytes = rowOffsets[ i ][ row ];

							for ( let x = 0; x < cd.width; ++ x ) {

								for ( let byte = 0; byte < INT16_SIZE * cd.type; ++ byte ) {

									outBuffer[ rowOffsetBytes ++ ] = rleBuffer[ rleOffset + byte * cd.width * cd.height ];

								}

								rleOffset ++;

							}

							row ++;

						}

						break;

					case LOSSY_DCT:

						lossyDctChannelDecode( i, rowOffsets, channelData, acBuffer, dcBuffer, outBuffer );

						break;

					default:
						throw new Error( 'EXRLoader.parse: unsupported channel compression' );

				}

			}

			return new DataView( outBuffer.buffer );

		}

		function parseNullTerminatedString( buffer, offset ) {

			const uintBuffer = new Uint8Array( buffer );
			let endOffset = 0;

			while ( uintBuffer[ offset.value + endOffset ] != 0 ) {

				endOffset += 1;

			}

			const stringValue = new TextDecoder().decode(
				uintBuffer.slice( offset.value, offset.value + endOffset )
			);

			offset.value = offset.value + endOffset + 1;

			return stringValue;

		}

		function parseFixedLengthString( buffer, offset, size ) {

			const stringValue = new TextDecoder().decode(
				new Uint8Array( buffer ).slice( offset.value, offset.value + size )
			);

			offset.value = offset.value + size;

			return stringValue;

		}

		function parseRational( dataView, offset ) {

			const x = parseInt32( dataView, offset );
			const y = parseUint32( dataView, offset );

			return [ x, y ];

		}

		function parseTimecode( dataView, offset ) {

			const x = parseUint32( dataView, offset );
			const y = parseUint32( dataView, offset );

			return [ x, y ];

		}

		function parseInt32( dataView, offset ) {

			const Int32 = dataView.getInt32( offset.value, true );

			offset.value = offset.value + INT32_SIZE;

			return Int32;

		}

		function parseUint32( dataView, offset ) {

			const Uint32 = dataView.getUint32( offset.value, true );

			offset.value = offset.value + INT32_SIZE;

			return Uint32;

		}

		function parseUint8Array( uInt8Array, offset ) {

			const Uint8 = uInt8Array[ offset.value ];

			offset.value = offset.value + INT8_SIZE;

			return Uint8;

		}

		function parseUint8( dataView, offset ) {

			const Uint8 = dataView.getUint8( offset.value );

			offset.value = offset.value + INT8_SIZE;

			return Uint8;

		}

		const parseInt64 = function ( dataView, offset ) {

			let int;

			if ( 'getBigInt64' in DataView.prototype ) {

				int = Number( dataView.getBigInt64( offset.value, true ) );

			} else {

				int = dataView.getUint32( offset.value + 4, true ) + Number( dataView.getUint32( offset.value, true ) << 32 );

			}

			offset.value += ULONG_SIZE;

			return int;

		};

		function parseFloat32( dataView, offset ) {

			const float = dataView.getFloat32( offset.value, true );

			offset.value += FLOAT32_SIZE;

			return float;

		}

		function decodeFloat32( dataView, offset ) {

			return DataUtils$1.toHalfFloat( parseFloat32( dataView, offset ) );

		}

		// https://stackoverflow.com/questions/5678432/decompressing-half-precision-floats-in-javascript
		function decodeFloat16( binary ) {

			const exponent = ( binary & 0x7C00 ) >> 10,
				fraction = binary & 0x03FF;

			return ( binary >> 15 ? -1 : 1 ) * (
				exponent ?
					(
						exponent === 0x1F ?
							fraction ? NaN : Infinity :
							Math.pow( 2, exponent - 15 ) * ( 1 + fraction / 0x400 )
					) :
					6.103515625e-5 * ( fraction / 0x400 )
			);

		}

		function parseUint16( dataView, offset ) {

			const Uint16 = dataView.getUint16( offset.value, true );

			offset.value += INT16_SIZE;

			return Uint16;

		}

		function parseFloat16( buffer, offset ) {

			return decodeFloat16( parseUint16( buffer, offset ) );

		}

		function parseChlist( dataView, buffer, offset, size ) {

			const startOffset = offset.value;
			const channels = [];

			while ( offset.value < ( startOffset + size - 1 ) ) {

				const name = parseNullTerminatedString( buffer, offset );
				const pixelType = parseInt32( dataView, offset );
				const pLinear = parseUint8( dataView, offset );
				offset.value += 3; // reserved, three chars
				const xSampling = parseInt32( dataView, offset );
				const ySampling = parseInt32( dataView, offset );

				channels.push( {
					name: name,
					pixelType: pixelType,
					pLinear: pLinear,
					xSampling: xSampling,
					ySampling: ySampling
				} );

			}

			offset.value += 1;

			return channels;

		}

		function parseChromaticities( dataView, offset ) {

			const redX = parseFloat32( dataView, offset );
			const redY = parseFloat32( dataView, offset );
			const greenX = parseFloat32( dataView, offset );
			const greenY = parseFloat32( dataView, offset );
			const blueX = parseFloat32( dataView, offset );
			const blueY = parseFloat32( dataView, offset );
			const whiteX = parseFloat32( dataView, offset );
			const whiteY = parseFloat32( dataView, offset );

			return { redX: redX, redY: redY, greenX: greenX, greenY: greenY, blueX: blueX, blueY: blueY, whiteX: whiteX, whiteY: whiteY };

		}

		function parseCompression( dataView, offset ) {

			const compressionCodes = [
				'NO_COMPRESSION',
				'RLE_COMPRESSION',
				'ZIPS_COMPRESSION',
				'ZIP_COMPRESSION',
				'PIZ_COMPRESSION',
				'PXR24_COMPRESSION',
				'B44_COMPRESSION',
				'B44A_COMPRESSION',
				'DWAA_COMPRESSION',
				'DWAB_COMPRESSION'
			];

			const compression = parseUint8( dataView, offset );

			return compressionCodes[ compression ];

		}

		function parseBox2i( dataView, offset ) {

			const xMin = parseInt32( dataView, offset );
			const yMin = parseInt32( dataView, offset );
			const xMax = parseInt32( dataView, offset );
			const yMax = parseInt32( dataView, offset );

			return { xMin: xMin, yMin: yMin, xMax: xMax, yMax: yMax };

		}

		function parseLineOrder( dataView, offset ) {

			const lineOrders = [
				'INCREASING_Y',
				'DECREASING_Y',
				'RANDOM_Y',
			];

			const lineOrder = parseUint8( dataView, offset );

			return lineOrders[ lineOrder ];

		}

		function parseEnvmap( dataView, offset ) {

			const envmaps = [
				'ENVMAP_LATLONG',
				'ENVMAP_CUBE'
			];

			const envmap = parseUint8( dataView, offset );

			return envmaps[ envmap ];

		}

		function parseTiledesc( dataView, offset ) {

			const levelModes = [
				'ONE_LEVEL',
				'MIPMAP_LEVELS',
				'RIPMAP_LEVELS',
			];

			const roundingModes = [
				'ROUND_DOWN',
				'ROUND_UP',
			];

			const xSize = parseUint32( dataView, offset );
			const ySize = parseUint32( dataView, offset );
			const modes = parseUint8( dataView, offset );

			return {
				xSize: xSize,
				ySize: ySize,
				levelMode: levelModes[ modes & 0xf ],
				roundingMode: roundingModes[ modes >> 4 ]
			};

		}

		function parseV2f( dataView, offset ) {

			const x = parseFloat32( dataView, offset );
			const y = parseFloat32( dataView, offset );

			return [ x, y ];

		}

		function parseV3f( dataView, offset ) {

			const x = parseFloat32( dataView, offset );
			const y = parseFloat32( dataView, offset );
			const z = parseFloat32( dataView, offset );

			return [ x, y, z ];

		}

		function parseValue( dataView, buffer, offset, type, size ) {

			if ( type === 'string' || type === 'stringvector' || type === 'iccProfile' ) {

				return parseFixedLengthString( buffer, offset, size );

			} else if ( type === 'chlist' ) {

				return parseChlist( dataView, buffer, offset, size );

			} else if ( type === 'chromaticities' ) {

				return parseChromaticities( dataView, offset );

			} else if ( type === 'compression' ) {

				return parseCompression( dataView, offset );

			} else if ( type === 'box2i' ) {

				return parseBox2i( dataView, offset );

			} else if ( type === 'envmap' ) {

				return parseEnvmap( dataView, offset );

			} else if ( type === 'tiledesc' ) {

				return parseTiledesc( dataView, offset );

			} else if ( type === 'lineOrder' ) {

				return parseLineOrder( dataView, offset );

			} else if ( type === 'float' ) {

				return parseFloat32( dataView, offset );

			} else if ( type === 'v2f' ) {

				return parseV2f( dataView, offset );

			} else if ( type === 'v3f' ) {

				return parseV3f( dataView, offset );

			} else if ( type === 'int' ) {

				return parseInt32( dataView, offset );

			} else if ( type === 'rational' ) {

				return parseRational( dataView, offset );

			} else if ( type === 'timecode' ) {

				return parseTimecode( dataView, offset );

			} else if ( type === 'preview' ) {

				offset.value += size;
				return 'skipped';

			} else {

				offset.value += size;
				return undefined;

			}

		}

		function roundLog2( x, mode ) {

			const log2 = Math.log2( x );
			return mode == 'ROUND_DOWN' ? Math.floor( log2 ) : Math.ceil( log2 );

		}

		function calculateTileLevels( tiledesc, w, h ) {

			let num = 0;

			switch ( tiledesc.levelMode ) {

				case 'ONE_LEVEL':
					num = 1;
					break;

				case 'MIPMAP_LEVELS':
					num = roundLog2( Math.max( w, h ), tiledesc.roundingMode ) + 1;
					break;

				case 'RIPMAP_LEVELS':
					throw new Error( 'THREE.EXRLoader: RIPMAP_LEVELS tiles currently unsupported.' );

			}

			return num;

		}

		function calculateTiles( count, dataSize, size, roundingMode ) {

			const tiles = new Array( count );

			for ( let i = 0; i < count; i ++ ) {

				const b = ( 1 << i );
				let s = ( dataSize / b ) | 0;

				if ( roundingMode == 'ROUND_UP' && s * b < dataSize ) s += 1;

				const l = Math.max( s, 1 );

				tiles[ i ] = ( ( l + size - 1 ) / size ) | 0;

			}

			return tiles;

		}

		function parseTiles() {

			const EXRDecoder = this;
			const offset = EXRDecoder.offset;
			const tmpOffset = { value: 0 };

			for ( let tile = 0; tile < EXRDecoder.tileCount; tile ++ ) {

				const tileX = parseInt32( EXRDecoder.viewer, offset );
				const tileY = parseInt32( EXRDecoder.viewer, offset );
				offset.value += 8; // skip levels - only parsing top-level
				EXRDecoder.size = parseUint32( EXRDecoder.viewer, offset );

				const startX = tileX * EXRDecoder.blockWidth;
				const startY = tileY * EXRDecoder.blockHeight;
				EXRDecoder.columns = ( startX + EXRDecoder.blockWidth > EXRDecoder.width ) ? EXRDecoder.width - startX : EXRDecoder.blockWidth;
				EXRDecoder.lines = ( startY + EXRDecoder.blockHeight > EXRDecoder.height ) ? EXRDecoder.height - startY : EXRDecoder.blockHeight;

				const bytesBlockLine = EXRDecoder.columns * EXRDecoder.totalBytes;
				const isCompressed = EXRDecoder.size < EXRDecoder.lines * bytesBlockLine;
				const viewer = isCompressed ? EXRDecoder.uncompress( EXRDecoder ) : uncompressRAW( EXRDecoder );

				offset.value += EXRDecoder.size;

				for ( let line = 0; line < EXRDecoder.lines; line ++ ) {

					const lineOffset = line * EXRDecoder.columns * EXRDecoder.totalBytes;

					for ( let channelID = 0; channelID < EXRDecoder.inputChannels.length; channelID ++ ) {

						const name = EXRHeader.channels[ channelID ].name;
						const lOff = EXRDecoder.channelByteOffsets[ name ] * EXRDecoder.columns;
						const cOff = EXRDecoder.decodeChannels[ name ];

						if ( cOff === undefined ) continue;

						tmpOffset.value = lineOffset + lOff;
						const outLineOffset = ( EXRDecoder.height - ( 1 + startY + line ) ) * EXRDecoder.outLineWidth;

						for ( let x = 0; x < EXRDecoder.columns; x ++ ) {

							const outIndex = outLineOffset + ( x + startX ) * EXRDecoder.outputChannels + cOff;
							EXRDecoder.byteArray[ outIndex ] = EXRDecoder.getter( viewer, tmpOffset );

						}

					}

				}

			}

		}

		function parseScanline() {

			const EXRDecoder = this;
			const offset = EXRDecoder.offset;
			const tmpOffset = { value: 0 };

			for ( let scanlineBlockIdx = 0; scanlineBlockIdx < EXRDecoder.height / EXRDecoder.blockHeight; scanlineBlockIdx ++ ) {

				const line = parseInt32( EXRDecoder.viewer, offset ) - EXRHeader.dataWindow.yMin; // line_no
				EXRDecoder.size = parseUint32( EXRDecoder.viewer, offset ); // data_len
				EXRDecoder.lines = ( ( line + EXRDecoder.blockHeight > EXRDecoder.height ) ? ( EXRDecoder.height - line ) : EXRDecoder.blockHeight );

				const bytesPerLine = EXRDecoder.columns * EXRDecoder.totalBytes;
				const isCompressed = EXRDecoder.size < EXRDecoder.lines * bytesPerLine;
				const viewer = isCompressed ? EXRDecoder.uncompress( EXRDecoder ) : uncompressRAW( EXRDecoder );

				offset.value += EXRDecoder.size;

				for ( let line_y = 0; line_y < EXRDecoder.blockHeight; line_y ++ ) {

					const scan_y = scanlineBlockIdx * EXRDecoder.blockHeight;
					const true_y = line_y + EXRDecoder.scanOrder( scan_y );
					if ( true_y >= EXRDecoder.height ) continue;

					const lineOffset = line_y * bytesPerLine;
					const outLineOffset = ( EXRDecoder.height - 1 - true_y ) * EXRDecoder.outLineWidth;

					for ( let channelID = 0; channelID < EXRDecoder.inputChannels.length; channelID ++ ) {

						const name = EXRHeader.channels[ channelID ].name;
						const lOff = EXRDecoder.channelByteOffsets[ name ] * EXRDecoder.columns;
						const cOff = EXRDecoder.decodeChannels[ name ];

						if ( cOff === undefined ) continue;

						tmpOffset.value = lineOffset + lOff;

						for ( let x = 0; x < EXRDecoder.columns; x ++ ) {

							const outIndex = outLineOffset + x * EXRDecoder.outputChannels + cOff;
							EXRDecoder.byteArray[ outIndex ] = EXRDecoder.getter( viewer, tmpOffset );

						}

					}

				}

			}

		}

		function parseHeader( dataView, buffer, offset ) {

			const EXRHeader = {};

			if ( dataView.getUint32( 0, true ) != 20000630 ) { // magic

				throw new Error( 'THREE.EXRLoader: Provided file doesn\'t appear to be in OpenEXR format.' );

			}

			EXRHeader.version = dataView.getUint8( 4 );

			const spec = dataView.getUint8( 5 ); // fullMask

			EXRHeader.spec = {
				singleTile: !! ( spec & 2 ),
				longName: !! ( spec & 4 ),
				deepFormat: !! ( spec & 8 ),
				multiPart: !! ( spec & 16 ),
			};

			// start of header

			offset.value = 8; // start at 8 - after pre-amble

			let keepReading = true;

			while ( keepReading ) {

				const attributeName = parseNullTerminatedString( buffer, offset );

				if ( attributeName === '' ) {

					keepReading = false;

				} else {

					const attributeType = parseNullTerminatedString( buffer, offset );
					const attributeSize = parseUint32( dataView, offset );
					const attributeValue = parseValue( dataView, buffer, offset, attributeType, attributeSize );

					if ( attributeValue === undefined ) {

						console.warn( `THREE.EXRLoader: Skipped unknown header attribute type \'${attributeType}\'.` );

					} else {

						EXRHeader[ attributeName ] = attributeValue;

					}

				}

			}

			if ( ( spec & -7 ) != 0 ) { // unsupported deep-image, multi-part

				console.error( 'THREE.EXRHeader:', EXRHeader );
				throw new Error( 'THREE.EXRLoader: Provided file is currently unsupported.' );

			}

			return EXRHeader;

		}

		function setupDecoder( EXRHeader, dataView, uInt8Array, offset, outputType, outputFormat ) {

			const EXRDecoder = {
				size: 0,
				viewer: dataView,
				array: uInt8Array,
				offset: offset,
				width: EXRHeader.dataWindow.xMax - EXRHeader.dataWindow.xMin + 1,
				height: EXRHeader.dataWindow.yMax - EXRHeader.dataWindow.yMin + 1,
				inputChannels: EXRHeader.channels,
				channelByteOffsets: {},
				shouldExpand: false,
				scanOrder: null,
				totalBytes: null,
				columns: null,
				lines: null,
				type: null,
				uncompress: null,
				getter: null,
				format: null,
				colorSpace: LinearSRGBColorSpace$3,
			};

			switch ( EXRHeader.compression ) {

				case 'NO_COMPRESSION':
					EXRDecoder.blockHeight = 1;
					EXRDecoder.uncompress = uncompressRAW;
					break;

				case 'RLE_COMPRESSION':
					EXRDecoder.blockHeight = 1;
					EXRDecoder.uncompress = uncompressRLE;
					break;

				case 'ZIPS_COMPRESSION':
					EXRDecoder.blockHeight = 1;
					EXRDecoder.uncompress = uncompressZIP;
					break;

				case 'ZIP_COMPRESSION':
					EXRDecoder.blockHeight = 16;
					EXRDecoder.uncompress = uncompressZIP;
					break;

				case 'PIZ_COMPRESSION':
					EXRDecoder.blockHeight = 32;
					EXRDecoder.uncompress = uncompressPIZ;
					break;

				case 'PXR24_COMPRESSION':
					EXRDecoder.blockHeight = 16;
					EXRDecoder.uncompress = uncompressPXR;
					break;

				case 'DWAA_COMPRESSION':
					EXRDecoder.blockHeight = 32;
					EXRDecoder.uncompress = uncompressDWA;
					break;

				case 'DWAB_COMPRESSION':
					EXRDecoder.blockHeight = 256;
					EXRDecoder.uncompress = uncompressDWA;
					break;

				default:
					throw new Error( 'EXRLoader.parse: ' + EXRHeader.compression + ' is unsupported' );

			}

			const channels = {};
			for ( const channel of EXRHeader.channels ) {

				switch ( channel.name ) {

					case 'Y':
					case 'R':
					case 'G':
					case 'B':
					case 'A':
						channels[ channel.name ] = true;
						EXRDecoder.type = channel.pixelType;

				}

			}

			// RGB images will be converted to RGBA format, preventing software emulation in select devices.
			let fillAlpha = false;
			let invalidOutput = false;

			// Validate if input texture contain supported channels
			if ( channels.R && channels.G && channels.B ) {

				EXRDecoder.outputChannels = 4;

			} else if ( channels.Y ) {

				EXRDecoder.outputChannels = 1;

			} else {

				throw new Error( 'EXRLoader.parse: file contains unsupported data channels.' );

			}

			// Setup output texture configuration
			switch ( EXRDecoder.outputChannels ) {

				case 4:

					if ( outputFormat == RGBAFormat$1 ) {

						fillAlpha = ! channels.A;
						EXRDecoder.format = RGBAFormat$1;
						EXRDecoder.colorSpace = LinearSRGBColorSpace$3;
						EXRDecoder.outputChannels = 4;
						EXRDecoder.decodeChannels = { R: 0, G: 1, B: 2, A: 3 };

					} else if ( outputFormat == RGFormat ) {

						EXRDecoder.format = RGFormat;
						EXRDecoder.colorSpace = LinearSRGBColorSpace$3;
						EXRDecoder.outputChannels = 2;
						EXRDecoder.decodeChannels = { R: 0, G: 1 };

					} else if ( outputFormat == RedFormat ) {

						EXRDecoder.format = RedFormat;
						EXRDecoder.colorSpace = LinearSRGBColorSpace$3;
						EXRDecoder.outputChannels = 1;
						EXRDecoder.decodeChannels = { R: 0 };

					} else {

						invalidOutput = true;

					}

					break;

				case 1:

					if ( outputFormat == RGBAFormat$1 ) {

						fillAlpha = true;
						EXRDecoder.format = RGBAFormat$1;
						EXRDecoder.colorSpace = LinearSRGBColorSpace$3;
						EXRDecoder.outputChannels = 4;
						EXRDecoder.shouldExpand = true;
						EXRDecoder.decodeChannels = { Y: 0 };

					} else if ( outputFormat == RGFormat ) {

						EXRDecoder.format = RGFormat;
						EXRDecoder.colorSpace = LinearSRGBColorSpace$3;
						EXRDecoder.outputChannels = 2;
						EXRDecoder.shouldExpand = true;
						EXRDecoder.decodeChannels = { Y: 0 };

					} else if ( outputFormat == RedFormat ) {

						EXRDecoder.format = RedFormat;
						EXRDecoder.colorSpace = LinearSRGBColorSpace$3;
						EXRDecoder.outputChannels = 1;
						EXRDecoder.decodeChannels = { Y: 0 };

					} else {

						invalidOutput = true;

					}

					break;

				default:

					invalidOutput = true;

			}

			if ( invalidOutput ) throw new Error( 'EXRLoader.parse: invalid output format for specified file.' );

			if ( EXRDecoder.type == 1 ) {

				// half
				switch ( outputType ) {

					case FloatType$1:
						EXRDecoder.getter = parseFloat16;
						break;

					case HalfFloatType$2:
						EXRDecoder.getter = parseUint16;
						break;

				}

			} else if ( EXRDecoder.type == 2 ) {

				// float
				switch ( outputType ) {

					case FloatType$1:
						EXRDecoder.getter = parseFloat32;
						break;

					case HalfFloatType$2:
						EXRDecoder.getter = decodeFloat32;

				}

			} else {

				throw new Error( 'EXRLoader.parse: unsupported pixelType ' + EXRDecoder.type + ' for ' + EXRHeader.compression + '.' );

			}

			EXRDecoder.columns = EXRDecoder.width;
			const size = EXRDecoder.width * EXRDecoder.height * EXRDecoder.outputChannels;

			switch ( outputType ) {

				case FloatType$1:
					EXRDecoder.byteArray = new Float32Array( size );

					// Fill initially with 1s for the alpha value if the texture is not RGBA, RGB values will be overwritten
					if ( fillAlpha )
						EXRDecoder.byteArray.fill( 1, 0, size );

					break;

				case HalfFloatType$2:
					EXRDecoder.byteArray = new Uint16Array( size );

					if ( fillAlpha )
						EXRDecoder.byteArray.fill( 0x3C00, 0, size ); // Uint16Array holds half float data, 0x3C00 is 1

					break;

				default:
					console.error( 'THREE.EXRLoader: unsupported type: ', outputType );
					break;

			}

			let byteOffset = 0;
			for ( const channel of EXRHeader.channels ) {

				if ( EXRDecoder.decodeChannels[ channel.name ] !== undefined ) {

					EXRDecoder.channelByteOffsets[ channel.name ] = byteOffset;

				}

				byteOffset += channel.pixelType * 2;

			}

			EXRDecoder.totalBytes = byteOffset;
			EXRDecoder.outLineWidth = EXRDecoder.width * EXRDecoder.outputChannels;

			if ( EXRHeader.lineOrder === 'INCREASING_Y' ) {

				EXRDecoder.scanOrder = ( y ) => y;

			} else {

				EXRDecoder.scanOrder = ( y ) => EXRDecoder.height - 1 - y;

			}

			if ( EXRHeader.spec.singleTile ) {

				EXRDecoder.blockHeight = EXRHeader.tiles.ySize;
				EXRDecoder.blockWidth = EXRHeader.tiles.xSize;

				const numXLevels = calculateTileLevels( EXRHeader.tiles, EXRDecoder.width, EXRDecoder.height );
				// const numYLevels = calculateTileLevels( EXRHeader.tiles, EXRDecoder.width, EXRDecoder.height );

				const numXTiles = calculateTiles( numXLevels, EXRDecoder.width, EXRHeader.tiles.xSize, EXRHeader.tiles.roundingMode );
				const numYTiles = calculateTiles( numXLevels, EXRDecoder.height, EXRHeader.tiles.ySize, EXRHeader.tiles.roundingMode );

				EXRDecoder.tileCount = numXTiles[ 0 ] * numYTiles[ 0 ];

				for ( let l = 0; l < numXLevels; l ++ )
					for ( let y = 0; y < numYTiles[ l ]; y ++ )
						for ( let x = 0; x < numXTiles[ l ]; x ++ )
							parseInt64( dataView, offset ); // tileOffset

				EXRDecoder.decode = parseTiles.bind( EXRDecoder );

			} else {

				EXRDecoder.blockWidth = EXRDecoder.width;
				const blockCount = Math.ceil( EXRDecoder.height / EXRDecoder.blockHeight );

				for ( let i = 0; i < blockCount; i ++ )
					parseInt64( dataView, offset ); // scanlineOffset

				EXRDecoder.decode = parseScanline.bind( EXRDecoder );

			}

			return EXRDecoder;

		}

		// start parsing file [START]
		const offset = { value: 0 };
		const bufferDataView = new DataView( buffer );
		const uInt8Array = new Uint8Array( buffer );

		// get header information and validate format.
		const EXRHeader = parseHeader( bufferDataView, buffer, offset );

		// get input compression information and prepare decoding.
		const EXRDecoder = setupDecoder( EXRHeader, bufferDataView, uInt8Array, offset, this.type, this.outputFormat );

		// parse input data
		EXRDecoder.decode();

		// output texture post-processing
		if ( EXRDecoder.shouldExpand ) {

			const byteArray = EXRDecoder.byteArray;

			if ( this.outputFormat == RGBAFormat$1 ) {

				for ( let i = 0; i < byteArray.length; i += 4 )
					byteArray[ i + 2 ] = ( byteArray[ i + 1 ] = byteArray[ i ] );

			} else if ( this.outputFormat == RGFormat ) {

				for ( let i = 0; i < byteArray.length; i += 2 )
					byteArray[ i + 1 ] = byteArray[ i ];

			}

		}

		return {
			header: EXRHeader,
			width: EXRDecoder.width,
			height: EXRDecoder.height,
			data: EXRDecoder.byteArray,
			format: EXRDecoder.format,
			colorSpace: EXRDecoder.colorSpace,
			type: this.type,
		};

	}

	/**
	 * Sets the texture type.
	 *
	 * @param {(HalfFloatType|FloatType)} value - The texture type to set.
	 * @return {EXRLoader} A reference to this loader.
	 */
	setDataType( value ) {

		this.type = value;
		return this;

	}

	/**
	 * Sets texture output format. Defaults to `RGBAFormat`.
	 *
	 * @param {(RGBAFormat|RGFormat|RedFormat)} value - Texture output format.
	 * @return {EXRLoader} A reference to this loader.
	 */
	setOutputFormat( value ) {

		this.outputFormat = value;
		return this;

	}

	load( url, onLoad, onProgress, onError ) {

		function onLoadCallback( texture, texData ) {

			texture.colorSpace = texData.colorSpace;
			texture.minFilter = LinearFilter$1;
			texture.magFilter = LinearFilter$1;
			texture.generateMipmaps = false;
			texture.flipY = false;

			if ( onLoad ) onLoad( texture, texData );

		}

		return super.load( url, onLoadCallback, onProgress, onError );

	}

}

const {DataTextureLoader,DataUtils,FloatType,HalfFloatType: HalfFloatType$1,LinearFilter,LinearSRGBColorSpace: LinearSRGBColorSpace$2} = await importShared('three');


/**
 * A loader for the RGBE HDR texture format.
 *
 * ```js
 * const loader = new HDRLoader();
 * const envMap = await loader.loadAsync( 'textures/equirectangular/blouberg_sunrise_2_1k.hdr' );
 * envMap.mapping = THREE.EquirectangularReflectionMapping;
 *
 * scene.environment = envMap;
 * ```
 *
 * @augments DataTextureLoader
 * @three_import import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
 */
class HDRLoader extends DataTextureLoader {

	/**
     * Constructs a new RGBE/HDR loader.
     *
     * @param {LoadingManager} [manager] - The loading manager.
     */
	constructor( manager ) {

		super( manager );

		/**
         * The texture type.
         *
         * @type {(HalfFloatType|FloatType)}
         * @default HalfFloatType
         */
		this.type = HalfFloatType$1;

	}

	/**
     * Parses the given RGBE texture data.
     *
     * @param {ArrayBuffer} buffer - The raw texture data.
     * @return {DataTextureLoader~TexData} An object representing the parsed texture data.
     */
	parse( buffer ) {

		// adapted from http://www.graphics.cornell.edu/~bjw/rgbe.html

		const
			/* default error routine.  change this to change error handling */
			rgbe_read_error = 1,
			rgbe_write_error = 2,
			rgbe_format_error = 3,
			rgbe_memory_error = 4,
			rgbe_error = function ( rgbe_error_code, msg ) {

				switch ( rgbe_error_code ) {

					case rgbe_read_error: throw new Error( 'THREE.HDRLoader: Read Error: ' + ( msg || '' ) );
					case rgbe_write_error: throw new Error( 'THREE.HDRLoader: Write Error: ' + ( msg || '' ) );
					case rgbe_format_error: throw new Error( 'THREE.HDRLoader: Bad File Format: ' + ( msg || '' ) );
					default:
					case rgbe_memory_error: throw new Error( 'THREE.HDRLoader: Memory Error: ' + ( msg || '' ) );

				}

			},

			/* offsets to red, green, and blue components in a data (float) pixel */
			//RGBE_DATA_RED = 0,
			//RGBE_DATA_GREEN = 1,
			//RGBE_DATA_BLUE = 2,

			/* number of floats per pixel, use 4 since stored in rgba image format */
			//RGBE_DATA_SIZE = 4,

			/* flags indicating which fields in an rgbe_header_info are valid */
			RGBE_VALID_PROGRAMTYPE = 1,
			RGBE_VALID_FORMAT = 2,
			RGBE_VALID_DIMENSIONS = 4,

			NEWLINE = '\n',

			fgets = function ( buffer, lineLimit, consume ) {

				const chunkSize = 128;

				lineLimit = ! lineLimit ? 1024 : lineLimit;
				let p = buffer.pos,
					i = -1, len = 0, s = '',
					chunk = String.fromCharCode.apply( null, new Uint16Array( buffer.subarray( p, p + chunkSize ) ) );

				while ( ( 0 > ( i = chunk.indexOf( NEWLINE ) ) ) && ( len < lineLimit ) && ( p < buffer.byteLength ) ) {

					s += chunk; len += chunk.length;
					p += chunkSize;
					chunk += String.fromCharCode.apply( null, new Uint16Array( buffer.subarray( p, p + chunkSize ) ) );

				}

				if ( -1 < i ) {

					/*for (i=l-1; i>=0; i--) {
                        byteCode = m.charCodeAt(i);
                        if (byteCode > 0x7f && byteCode <= 0x7ff) byteLen++;
                        else if (byteCode > 0x7ff && byteCode <= 0xffff) byteLen += 2;
                        if (byteCode >= 0xDC00 && byteCode <= 0xDFFF) i--; //trail surrogate
                    }*/
					buffer.pos += len + i + 1;
					return s + chunk.slice( 0, i );

				}

				return false;

			},

			/* minimal header reading.  modify if you want to parse more information */
			RGBE_ReadHeader = function ( buffer ) {


				// regexes to parse header info fields
				const magic_token_re = /^#\?(\S+)/,
					gamma_re = /^\s*GAMMA\s*=\s*(\d+(\.\d+)?)\s*$/,
					exposure_re = /^\s*EXPOSURE\s*=\s*(\d+(\.\d+)?)\s*$/,
					format_re = /^\s*FORMAT=(\S+)\s*$/,
					dimensions_re = /^\s*\-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/,

					// RGBE format header struct
					header = {

						valid: 0, /* indicate which fields are valid */

						string: '', /* the actual header string */

						comments: '', /* comments found in header */

						programtype: 'RGBE', /* listed at beginning of file to identify it after "#?". defaults to "RGBE" */

						format: '', /* RGBE format, default 32-bit_rle_rgbe */

						gamma: 1.0, /* image has already been gamma corrected with given gamma. defaults to 1.0 (no correction) */

						exposure: 1.0, /* a value of 1.0 in an image corresponds to <exposure> watts/steradian/m^2. defaults to 1.0 */

						width: 0, height: 0 /* image dimensions, width/height */

					};

				let line, match;

				if ( buffer.pos >= buffer.byteLength || ! ( line = fgets( buffer ) ) ) {

					rgbe_error( rgbe_read_error, 'no header found' );

				}

				/* if you want to require the magic token then uncomment the next line */
				if ( ! ( match = line.match( magic_token_re ) ) ) {

					rgbe_error( rgbe_format_error, 'bad initial token' );

				}

				header.valid |= RGBE_VALID_PROGRAMTYPE;
				header.programtype = match[ 1 ];
				header.string += line + '\n';

				while ( true ) {

					line = fgets( buffer );
					if ( false === line ) break;
					header.string += line + '\n';

					if ( '#' === line.charAt( 0 ) ) {

						header.comments += line + '\n';
						continue; // comment line

					}

					if ( match = line.match( gamma_re ) ) {

						header.gamma = parseFloat( match[ 1 ] );

					}

					if ( match = line.match( exposure_re ) ) {

						header.exposure = parseFloat( match[ 1 ] );

					}

					if ( match = line.match( format_re ) ) {

						header.valid |= RGBE_VALID_FORMAT;
						header.format = match[ 1 ];//'32-bit_rle_rgbe';

					}

					if ( match = line.match( dimensions_re ) ) {

						header.valid |= RGBE_VALID_DIMENSIONS;
						header.height = parseInt( match[ 1 ], 10 );
						header.width = parseInt( match[ 2 ], 10 );

					}

					if ( ( header.valid & RGBE_VALID_FORMAT ) && ( header.valid & RGBE_VALID_DIMENSIONS ) ) break;

				}

				if ( ! ( header.valid & RGBE_VALID_FORMAT ) ) {

					rgbe_error( rgbe_format_error, 'missing format specifier' );

				}

				if ( ! ( header.valid & RGBE_VALID_DIMENSIONS ) ) {

					rgbe_error( rgbe_format_error, 'missing image size specifier' );

				}

				return header;

			},

			RGBE_ReadPixels_RLE = function ( buffer, w, h ) {

				const scanline_width = w;

				if (
				// run length encoding is not allowed so read flat
					( ( scanline_width < 8 ) || ( scanline_width > 0x7fff ) ) ||
                    // this file is not run length encoded
                    ( ( 2 !== buffer[ 0 ] ) || ( 2 !== buffer[ 1 ] ) || ( buffer[ 2 ] & 0x80 ) )
				) {

					// return the flat buffer
					return new Uint8Array( buffer );

				}

				if ( scanline_width !== ( ( buffer[ 2 ] << 8 ) | buffer[ 3 ] ) ) {

					rgbe_error( rgbe_format_error, 'wrong scanline width' );

				}

				const data_rgba = new Uint8Array( 4 * w * h );

				if ( ! data_rgba.length ) {

					rgbe_error( rgbe_memory_error, 'unable to allocate buffer space' );

				}

				let offset = 0, pos = 0;

				const ptr_end = 4 * scanline_width;
				const rgbeStart = new Uint8Array( 4 );
				const scanline_buffer = new Uint8Array( ptr_end );
				let num_scanlines = h;

				// read in each successive scanline
				while ( ( num_scanlines > 0 ) && ( pos < buffer.byteLength ) ) {

					if ( pos + 4 > buffer.byteLength ) {

						rgbe_error( rgbe_read_error );

					}

					rgbeStart[ 0 ] = buffer[ pos ++ ];
					rgbeStart[ 1 ] = buffer[ pos ++ ];
					rgbeStart[ 2 ] = buffer[ pos ++ ];
					rgbeStart[ 3 ] = buffer[ pos ++ ];

					if ( ( 2 != rgbeStart[ 0 ] ) || ( 2 != rgbeStart[ 1 ] ) || ( ( ( rgbeStart[ 2 ] << 8 ) | rgbeStart[ 3 ] ) != scanline_width ) ) {

						rgbe_error( rgbe_format_error, 'bad rgbe scanline format' );

					}

					// read each of the four channels for the scanline into the buffer
					// first red, then green, then blue, then exponent
					let ptr = 0, count;

					while ( ( ptr < ptr_end ) && ( pos < buffer.byteLength ) ) {

						count = buffer[ pos ++ ];
						const isEncodedRun = count > 128;
						if ( isEncodedRun ) count -= 128;

						if ( ( 0 === count ) || ( ptr + count > ptr_end ) ) {

							rgbe_error( rgbe_format_error, 'bad scanline data' );

						}

						if ( isEncodedRun ) {

							// a (encoded) run of the same value
							const byteValue = buffer[ pos ++ ];
							for ( let i = 0; i < count; i ++ ) {

								scanline_buffer[ ptr ++ ] = byteValue;

							}
							//ptr += count;

						} else {

							// a literal-run
							scanline_buffer.set( buffer.subarray( pos, pos + count ), ptr );
							ptr += count; pos += count;

						}

					}


					// now convert data from buffer into rgba
					// first red, then green, then blue, then exponent (alpha)
					const l = scanline_width; //scanline_buffer.byteLength;
					for ( let i = 0; i < l; i ++ ) {

						let off = 0;
						data_rgba[ offset ] = scanline_buffer[ i + off ];
						off += scanline_width; //1;
						data_rgba[ offset + 1 ] = scanline_buffer[ i + off ];
						off += scanline_width; //1;
						data_rgba[ offset + 2 ] = scanline_buffer[ i + off ];
						off += scanline_width; //1;
						data_rgba[ offset + 3 ] = scanline_buffer[ i + off ];
						offset += 4;

					}

					num_scanlines --;

				}

				return data_rgba;

			};

		const RGBEByteToRGBFloat = function ( sourceArray, sourceOffset, destArray, destOffset ) {

			const e = sourceArray[ sourceOffset + 3 ];
			const scale = Math.pow( 2.0, e - 128.0 ) / 255.0;

			destArray[ destOffset + 0 ] = sourceArray[ sourceOffset + 0 ] * scale;
			destArray[ destOffset + 1 ] = sourceArray[ sourceOffset + 1 ] * scale;
			destArray[ destOffset + 2 ] = sourceArray[ sourceOffset + 2 ] * scale;
			destArray[ destOffset + 3 ] = 1;

		};

		const RGBEByteToRGBHalf = function ( sourceArray, sourceOffset, destArray, destOffset ) {

			const e = sourceArray[ sourceOffset + 3 ];
			const scale = Math.pow( 2.0, e - 128.0 ) / 255.0;

			// clamping to 65504, the maximum representable value in float16
			destArray[ destOffset + 0 ] = DataUtils.toHalfFloat( Math.min( sourceArray[ sourceOffset + 0 ] * scale, 65504 ) );
			destArray[ destOffset + 1 ] = DataUtils.toHalfFloat( Math.min( sourceArray[ sourceOffset + 1 ] * scale, 65504 ) );
			destArray[ destOffset + 2 ] = DataUtils.toHalfFloat( Math.min( sourceArray[ sourceOffset + 2 ] * scale, 65504 ) );
			destArray[ destOffset + 3 ] = DataUtils.toHalfFloat( 1 );

		};

		const byteArray = new Uint8Array( buffer );
		byteArray.pos = 0;
		const rgbe_header_info = RGBE_ReadHeader( byteArray );

		const w = rgbe_header_info.width,
			h = rgbe_header_info.height,
			image_rgba_data = RGBE_ReadPixels_RLE( byteArray.subarray( byteArray.pos ), w, h );


		let data, type;
		let numElements;

		switch ( this.type ) {

			case FloatType:

				numElements = image_rgba_data.length / 4;
				const floatArray = new Float32Array( numElements * 4 );

				for ( let j = 0; j < numElements; j ++ ) {

					RGBEByteToRGBFloat( image_rgba_data, j * 4, floatArray, j * 4 );

				}

				data = floatArray;
				type = FloatType;
				break;

			case HalfFloatType$1:

				numElements = image_rgba_data.length / 4;
				const halfArray = new Uint16Array( numElements * 4 );

				for ( let j = 0; j < numElements; j ++ ) {

					RGBEByteToRGBHalf( image_rgba_data, j * 4, halfArray, j * 4 );

				}

				data = halfArray;
				type = HalfFloatType$1;
				break;

			default:

				throw new Error( 'THREE.HDRLoader: Unsupported type: ' + this.type );

		}

		return {
			width: w, height: h,
			data: data,
			header: rgbe_header_info.string,
			gamma: rgbe_header_info.gamma,
			exposure: rgbe_header_info.exposure,
			type: type
		};

	}

	/**
     * Sets the texture type.
     *
     * @param {(HalfFloatType|FloatType)} value - The texture type to set.
     * @return {HDRLoader} A reference to this loader.
     */
	setDataType( value ) {

		this.type = value;
		return this;

	}

	load( url, onLoad, onProgress, onError ) {

		function onLoadCallback( texture, texData ) {

			switch ( texture.type ) {

				case FloatType:
				case HalfFloatType$1:

					texture.colorSpace = LinearSRGBColorSpace$2;
					texture.minFilter = LinearFilter;
					texture.magFilter = LinearFilter;
					texture.generateMipmaps = false;
					texture.flipY = true;

					break;

			}

			if ( onLoad ) onLoad( texture, texData );

		}

		return super.load( url, onLoadCallback, onProgress, onError );

	}

}

// @deprecated, r180

class RGBELoader extends HDRLoader {

	constructor( manager ) {

		console.warn( 'RGBELoader has been deprecated. Please use HDRLoader instead.' );
		super( manager );

	}

}

const __vite_import_meta_env__ = {"BASE_URL": "/"};
const TEXT_FONT_DIRECTORY = "xrift-studio/vendor/text-fonts";
function textFontFileName(font, weight) {
  return `${font.id}-${font.subset}-${weight}-normal.woff`;
}
const AUTOMATIC_TEXT_FONT_ID = "auto";
const TEXT_FONT_CATALOG = [
  japanese("noto-sans-jp", "Noto Sans JP", "標準的なゴシック体", "sans", [400, 700])
];
const CATALOG_BY_ID = new Map(TEXT_FONT_CATALOG.map((font) => [font.id, font]));
const DEFAULT_TEXT_FONT_ID = "noto-sans-jp";
function getTextFontDefinition(fontId) {
  if (!fontId || fontId === AUTOMATIC_TEXT_FONT_ID)
    return void 0;
  return CATALOG_BY_ID.get(fontId);
}
function resolveTextFontWeight(font, requested) {
  const target = Number.isFinite(requested) ? Number(requested) : 400;
  let best = font.weights[0] ?? 400;
  for (const weight of font.weights) {
    if (Math.abs(weight - target) < Math.abs(best - target))
      best = weight;
  }
  return best;
}
function resolveTextFontUrl(fontId, fontWeight, directoryUrl) {
  const font = getTextFontDefinition(fontId) ?? CATALOG_BY_ID.get(DEFAULT_TEXT_FONT_ID);
  const weight = resolveTextFontWeight(font, fontWeight);
  const directory = directoryUrl ?? resolveTextFontDirectoryUrl();
  const withTrailingSlash = directory.endsWith("/") ? directory : `${directory}/`;
  return `${withTrailingSlash}${textFontFileName(font, weight)}`;
}
function resolveTextFontDirectoryUrl(baseUrl) {
  const base = (defaultTextFontBaseUrl()).trim() || "/";
  const baseWithTrailingSlash = base.endsWith("/") ? base : `${base}/`;
  return `${baseWithTrailingSlash}${TEXT_FONT_DIRECTORY}/`;
}
function defaultTextFontBaseUrl() {
  const env = __vite_import_meta_env__;
  return env?.BASE_URL;
}
function japanese(id, label, labelJa, category, weights) {
  return { id, label, labelJa, category, subset: "japanese", weights, license: "OFL-1.1" };
}

/**
 * Text component configuration and plate geometry, with no Three.js import.
 *
 * The authoring layer (SceneDocument, Inspector, compiler) and the renderers
 * describe a Text panel with the same types, so a caption cannot be normalized
 * one way when it is edited and another way when it is drawn. Keeping this file
 * free of `three` is what lets the document layer share it.
 */
const DEFAULT_TEXT_BACKGROUND = {
    mode: "none",
    color: "#0f172a",
    opacity: 0.85,
    paddingX: 0.08,
    paddingY: 0.06,
    fit: "text",
    width: 1,
    height: 0.4,
    offset: 0.005,
    doubleSided: false,
};
/**
 * Size and centre of the background plate in the Text's local space.
 *
 * `blockBounds` is troika's measured `[minX, minY, maxX, maxY]` for the whole
 * text block, already shifted by the anchor. It is `null` before the first sync
 * completes, which is why a text-fitted plate reports no rectangle rather than
 * flashing at some guessed size.
 */
function resolveTextPanelPlate(background, blockBounds, anchorX, anchorY) {
    if (background.mode === "none")
        return null;
    if (background.fit === "fixed") {
        const width = Math.max(0.001, background.width);
        const height = Math.max(0.001, background.height);
        return {
            width,
            height,
            centerX: anchorX === "left" ? width / 2 : anchorX === "right" ? -width / 2 : 0,
            centerY: anchorY === "top" ? -height / 2 : anchorY === "bottom" ? height / 2 : 0,
        };
    }
    if (!blockBounds || blockBounds.length < 4)
        return null;
    const minX = blockBounds[0] ?? 0;
    const minY = blockBounds[1] ?? 0;
    const maxX = blockBounds[2] ?? 0;
    const maxY = blockBounds[3] ?? 0;
    if (![minX, minY, maxX, maxY].every((value) => Number.isFinite(value)))
        return null;
    const width = Math.max(0.001, maxX - minX + background.paddingX * 2);
    const height = Math.max(0.001, maxY - minY + background.paddingY * 2);
    return {
        width,
        height,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
    };
}

/**
 * Shared implementation of the Text component's rendering.
 *
 * One Three.js object graph backs every surface that draws Studio text: the
 * editor viewport, Play, the published runtime and the generated Classic
 * source. Keeping the geometry, the plate layout and the font handling here is
 * what stops a wall label from being laid out one way while editing and another
 * way once the world is uploaded.
 *
 * The object is a `Group` of two children:
 *
 *   - a troika SDF `Text`, which stays crisp at any distance, and
 *   - an optional unlit background plate sized from the text's own measured
 *     bounds, so a caption plate fits its caption without anyone typing width
 *     and height by hand.
 */
const {DoubleSide: DoubleSide$2,FrontSide: FrontSide$2,Group: Group$3,Mesh: Mesh$3,MeshBasicMaterial: MeshBasicMaterial$1,PlaneGeometry: PlaneGeometry$2} = await importShared('three');
/**
 * Han unification means an unqualified CJK run can resolve to a Chinese face,
 * which renders Japanese kanji with the wrong shapes. Studio authors Japanese
 * worlds, so the fallback resolver is told which language it is typesetting.
 */
const TEXT_PANEL_LANG = "ja";
const fontLoadStates = new Map();
const fontLoadRequests = new Map();
/**
 * How long a font read may take before the automatic face is used instead.
 *
 * troika only logs a font it could not read, so nothing else would report one.
 * In practice its loader answers either way — a missing file resolves through
 * its own fallback in about the time a present one takes (measured against a
 * 404 base) — so this is the guard for a read that never answers at all rather
 * than the normal failure path. The wait is long enough that a slow connection
 * is never mistaken for a missing file.
 */
const FONT_LOAD_TIMEOUT_MS = 10000;
/**
 * One character, so the request actually reaches the font.
 *
 * troika short-circuits an empty string before loading anything and reports
 * success, which would be indistinguishable from a font that loaded. Basic
 * Latin is present in every bundled subset, including the Japanese ones.
 */
const FONT_PROBE_CHARACTER = "A";
/**
 * Loads a catalog font through troika before handing its URL to a `Text`.
 *
 * troika logs a failed font read and then never resolves that request, so text
 * assigned an unreachable font simply never appears. The file is bundled rather
 * than downloaded, so this now guards a missing or misplaced copy rather than a
 * blocked CDN: checking first falls back to the automatic Noto face and still
 * shows the words.
 *
 * The check goes through troika's own loader rather than `fetch`. The read is
 * same-origin either way, but a published world is scanned as a bundle, and a
 * `fetch` in the world's own code is reported as `no-network-without-permission`
 * whatever it requests — which would make every world containing Text declare a
 * network permission it does not use. See THIRD_PARTY_ASSETS.md.
 */
function loadTextPanelFont(url) {
    const cached = fontLoadStates.get(url);
    if (cached)
        return Promise.resolve(cached);
    const pending = fontLoadRequests.get(url);
    if (pending)
        return pending;
    const request = new Promise((resolve) => {
        const timer = setTimeout(() => resolve("failed"), FONT_LOAD_TIMEOUT_MS);
        const settle = (state) => {
            clearTimeout(timer);
            resolve(state);
        };
        try {
            preloadFont({ font: url, characters: FONT_PROBE_CHARACTER }, () => settle("loaded"));
        }
        catch {
            settle("failed");
        }
    }).then((state) => {
        fontLoadStates.set(url, state);
        fontLoadRequests.delete(url);
        return state;
    });
    fontLoadRequests.set(url, request);
    return request;
}
/** Synchronous view of the font cache, for renderers that cannot await. */
function peekTextPanelFont(url) {
    return fontLoadStates.get(url);
}
class XriftTextPanelObject extends Group$3 {
    constructor() {
        super();
        this.config = null;
        /** Guards against a slow font resolving after a later config replaced it. */
        this.fontGeneration = 0;
        this.onLayout = null;
        this.text = new Text();
        this.plate = new Mesh$3(new PlaneGeometry$2(1, 1), new MeshBasicMaterial$1());
        this.plate.visible = false;
        // Drawn before the glyphs so a translucent plate blends against the world
        // behind it rather than over the text it is meant to sit behind.
        this.plate.renderOrder = -1;
        this.add(this.plate);
        this.add(this.text);
    }
    /** Invoked after every sync, once the plate has been resized. */
    setLayoutListener(listener) {
        this.onLayout = listener;
    }
    update(config, backgroundTexture) {
        this.config = config;
        const text = this.text;
        text.text = config.text;
        text.color = config.color;
        text.fontSize = config.fontSize;
        text.maxWidth = config.maxWidth ?? Infinity;
        text.anchorX = config.anchorX;
        text.anchorY = config.anchorY;
        text.outlineWidth = config.outlineWidth;
        text.outlineColor = config.outlineColor;
        text.textAlign = config.textAlign ?? "center";
        text.lineHeight = config.lineHeight ?? "normal";
        text.letterSpacing = config.letterSpacing ?? 0;
        text.fontWeight = config.fontWeight ?? 400;
        text.lang = TEXT_PANEL_LANG;
        const background = config.background ?? DEFAULT_TEXT_BACKGROUND;
        const hasPlate = background.mode !== "none";
        // Only nudged when a plate exists: an offset applied to free-standing text
        // would bias its depth against unrelated geometry for no reason.
        text.depthOffset = hasPlate ? -1 : 0;
        this.applyPlateMaterial(background, backgroundTexture);
        // The plate is placed from whatever bounds are already known so a fixed
        // panel appears at once and an edited caption keeps its plate instead of
        // blinking out until the new typesetting lands.
        this.layoutPlate();
        this.applyFont(config);
    }
    dispose() {
        this.text.dispose();
        this.plate.geometry.dispose();
        this.plate.material.dispose();
    }
    /**
     * Decides the font before the Text is ever rendered, then typesets once.
     *
     * troika typesets from `onBeforeRender`, so the first drawn frame starts a
     * sync with whatever font is set at that moment, and a sync that never
     * completes silently swallows every sync queued behind it. Two consequences
     * shape this:
     *
     * - Assigning a URL that turns out to be unreachable is unrecoverable, which
     *   is why the file is fetched first and a failure falls back to troika's own
     *   face instead.
     * - Letting the first frame sync on troika's face while the bundled font
     *   downloads sends every glyph to its per-script fallback CDN, and if that
     *   CDN is blocked the Text is stuck there even after its own font arrives.
     *   Hiding the Text keeps `onBeforeRender` from firing until the decision is
     *   made; the background plate is already in place, so a panel is not blank
     *   while it waits.
     */
    applyFont(config) {
        const url = config.fontUrl ??
            resolveTextFontUrl(config.fontId, config.fontWeight, config.fontDirectoryUrl);
        const generation = ++this.fontGeneration;
        const known = peekTextPanelFont(url);
        if (known) {
            this.setFont(known === "loaded" ? url : null);
            return;
        }
        this.text.visible = false;
        void loadTextPanelFont(url).then((state) => {
            if (generation !== this.fontGeneration)
                return;
            this.setFont(state === "loaded" ? url : null);
            this.onLayout?.();
        });
    }
    setFont(url) {
        this.text.font = url;
        this.text.visible = true;
        this.text.sync(() => this.layoutPlate());
    }
    applyPlateMaterial(background, backgroundTexture) {
        const material = this.plate.material;
        if (background.mode === "none") {
            this.plate.visible = false;
            material.map = null;
            return;
        }
        const opacity = clampUnit$3(background.opacity);
        material.color.set(background.color);
        material.map = background.mode === "texture" ? backgroundTexture : null;
        material.opacity = opacity;
        material.transparent = opacity < 1 || background.mode === "texture";
        // Cutout rather than sorted blending: a signage PNG keeps writing depth, so
        // it does not disappear behind or in front of nearby world geometry.
        material.alphaTest = background.mode === "texture" ? 0.01 : 0;
        material.depthWrite = true;
        material.side = background.doubleSided ? DoubleSide$2 : FrontSide$2;
        material.toneMapped = false;
        material.needsUpdate = true;
    }
    layoutPlate() {
        const config = this.config;
        if (!config)
            return;
        const background = config.background ?? DEFAULT_TEXT_BACKGROUND;
        const plate = resolveTextPanelPlate(background, this.text.textRenderInfo?.blockBounds ?? null, config.anchorX, config.anchorY);
        if (!plate) {
            this.plate.visible = false;
            this.onLayout?.();
            return;
        }
        this.plate.visible = true;
        this.plate.scale.set(plate.width, plate.height, 1);
        this.plate.position.set(plate.centerX, plate.centerY, -Math.abs(background.offset));
        this.onLayout?.();
    }
}
function clampUnit$3(value) {
    if (!Number.isFinite(value))
        return 1;
    return Math.min(1, Math.max(0, value));
}

/**
 * Image component configuration and quad geometry, with no Three.js import.
 *
 * The authoring layer (SceneDocument, Inspector, compiler) and the renderers
 * describe an Image with the same types, the way the Text panel does, so a
 * picture cannot be sized one way while it is edited and another way once the
 * world is published. Keeping this file free of `three` is what lets the
 * document layer share it.
 */
/**
 * Size and centre of the quad in the Image's local space.
 *
 * `imageAspect` is width divided by height of the decoded picture, or `null`
 * when there is no picture to measure. Without a fixed height and without a
 * picture the quad is square, which is the honest shape for「まだ画像を選んで
 * いない」rather than a guess at what will be chosen.
 */
function resolveImageQuadPlate(config, imageAspect) {
    const width = Math.max(0.001, config.width);
    const aspect = imageAspect !== null && Number.isFinite(imageAspect) && imageAspect > 0
        ? imageAspect
        : 1;
    const height = Math.max(0.001, config.height !== undefined && Number.isFinite(config.height) && config.height > 0
        ? config.height
        : width / aspect);
    return {
        width,
        height,
        centerX: config.anchorX === "left" ? width / 2 : config.anchorX === "right" ? -width / 2 : 0,
        centerY: config.anchorY === "top" ? -height / 2 : config.anchorY === "bottom" ? height / 2 : 0,
    };
}

/**
 * Shared implementation of the Image component's rendering.
 *
 * One Three.js object backs every surface that draws a Studio Image: the
 * editor viewport, Play, the published runtime and the generated Classic
 * source. Keeping the quad, its sizing and its material handling here is what
 * stops a gallery picture from being one size while editing and another once
 * the world is uploaded — the same reason the Text panel is shared.
 *
 * The object is a `Group` with one child, a plane sized from the config and
 * the decoded picture's own aspect ratio, so an author sets a width and the
 * photo keeps its proportions without anyone typing a height.
 */
const {DoubleSide: DoubleSide$1,FrontSide: FrontSide$1,Group: Group$2,Mesh: Mesh$2,MeshBasicMaterial,MeshStandardMaterial: MeshStandardMaterial$1,PlaneGeometry: PlaneGeometry$1} = await importShared('three');
/**
 * Width divided by height of a decoded Texture, or null when it is not known.
 *
 * Both an ordinary image and a KTX2 `CompressedTexture` report their size on
 * `image`, so one read serves every format the runtime loads.
 */
function imageTextureAspect(texture) {
    const image = texture?.image;
    const width = typeof image?.width === "number" ? image.width : 0;
    const height = typeof image?.height === "number" ? image.height : 0;
    return width > 0 && height > 0 ? width / height : null;
}
class XriftImageQuadObject extends Group$2 {
    constructor() {
        super();
        this.plate = new Mesh$2(new PlaneGeometry$1(1, 1), new MeshBasicMaterial());
        this.plate.visible = false;
        this.add(this.plate);
    }
    /**
     * Applies a config and the decoded picture.
     *
     * `awaitingTexture` says a picture was chosen but has not arrived yet. The
     * quad is hidden until it does rather than shown at a guessed size, the way
     * a text-fitted plate waits for its typesetting — a photo that pops in as a
     * square and then snaps to its real shape reads as a glitch.
     */
    update(config, texture, awaitingTexture = false) {
        this.applyMaterial(config, texture);
        if (awaitingTexture && !texture) {
            this.plate.visible = false;
            return;
        }
        const plate = resolveImageQuadPlate(config, imageTextureAspect(texture));
        this.plate.visible = true;
        this.plate.scale.set(plate.width, plate.height, 1);
        this.plate.position.set(plate.centerX, plate.centerY, 0);
    }
    dispose() {
        this.plate.geometry.dispose();
        this.plate.material.dispose();
    }
    applyMaterial(config, texture) {
        const wantsLit = config.lit;
        const current = this.plate.material;
        const isLit = current instanceof MeshStandardMaterial$1;
        if (wantsLit !== isLit) {
            current.dispose();
            this.plate.material = wantsLit
                ? new MeshStandardMaterial$1({ roughness: 1, metalness: 0 })
                : new MeshBasicMaterial();
        }
        const material = this.plate.material;
        const opacity = clampUnit$2(config.opacity);
        material.color.set(config.color);
        material.map = texture;
        material.opacity = opacity;
        material.transparent = true;
        if (config.alphaMode === "blend") {
            // Sorted blending: a soft edge or a translucent overlay composes over
            // whatever is behind it, at the cost of not writing depth.
            material.alphaTest = 0;
            material.depthWrite = false;
        }
        else {
            // Cutout rather than sorted blending: a photo or a signage PNG keeps
            // writing depth, so it never vanishes behind or in front of nearby
            // geometry. The same choice the Text plate makes for its image.
            material.alphaTest = 0.01;
            material.depthWrite = true;
        }
        material.side = config.doubleSided ? DoubleSide$1 : FrontSide$1;
        // An unlit picture is shown exactly as authored, so it skips tone mapping
        // the way the Text plate does; a lit one is part of the scene's light.
        material.toneMapped = wantsLit;
        material.needsUpdate = true;
    }
}
function clampUnit$2(value) {
    if (!Number.isFinite(value))
        return 1;
    return Math.min(1, Math.max(0, value));
}

/**
 * Time-uniform helpers for animated shaders.
 *
 * A time uniform is a `float` or `vec4` uniform whose name follows a
 * conventional time spelling (for example `_UTime`, `uTime`, `_Time`, `time`,
 * `fTime` or `u_time`). When a shader declares one, Studio feeds it the
 * wall-clock elapsed seconds automatically in the editor Scene View, Material
 * previews and the exported runtime — no manual wiring required. The author
 * can still pin a single name with `animatedTimeUniform`; it takes precedence.
 *
 * This covers both shapes Studio renders: Classic R3F Custom Shaders, whose
 * descriptor is known when the Material is built, and shaders that arrive
 * already compiled — Open Brush brushes come out of three-icosa's glTF
 * extension. `stampMaterialTimeUniforms` handles the second shape by reading
 * the GLSL off the live Material.
 *
 * Every render path drives the same `userData.xriftTimeUniforms` contract, so
 * stamping a Material is all it takes to make it animate everywhere.
 */
/**
 * Matches conventional time uniform names: _UTime, uTime, _Time, time, fTime,
 * and the underscore-separated `u_time` / `_u_time` spelling that Open Brush
 * brushes use. Open Brush brushes declare `uniform vec4 u_time;`, so leaving
 * the separator out of this pattern froze every animated brush.
 */
const TIME_UNIFORM_NAME = /^_?(?:[uf]_?)?time$/i;
const TIME_UNIFORM_TYPE = new Set(["float", "vec4"]);
/** Parses declared GLSL uniforms (float/vec4) from a shader source stage. */
function declaredScalarUniforms(source) {
    const result = new Map();
    if (!source)
        return result;
    const pattern = /\buniform\s+(?:lowp\s+|mediump\s+|highp\s+)?(float|vec4)\s+([A-Za-z_]\w*)\s*;/g;
    for (const match of source.matchAll(pattern)) {
        const type = match[1];
        const name = match[2];
        if (name)
            result.set(name, type);
    }
    return result;
}
/**
 * Detects time uniforms from a shader's GLSL source (vertex + fragment).
 *
 * Returns specs in declaration order, deduplicated by name. A manually
 * authored `animatedTimeUniform` is merged in (as the first entry) when it is
 * actually a declared float/vec4 uniform.
 */
function detectTimeUniforms(shader) {
    const declared = new Map();
    for (const source of [shader.vertexShader, shader.fragmentShader]) {
        for (const [name, type] of declaredScalarUniforms(source)) {
            declared.set(name, type);
        }
    }
    const specs = [];
    const seen = new Set();
    // A manually authored animatedTimeUniform overrides auto-detection and may
    // name any declared float/vec4 uniform, even a non-time-named one.
    const manual = shader.animatedTimeUniform;
    if (manual && TIME_UNIFORM_TYPE.has(declared.get(manual) ?? "")) {
        specs.push({ name: manual, glslType: declared.get(manual) });
        seen.add(manual);
    }
    for (const [name, glslType] of declared) {
        if (seen.has(name))
            continue;
        if (TIME_UNIFORM_NAME.test(name)) {
            specs.push({ name, glslType });
            seen.add(name);
        }
    }
    return specs;
}
/**
 * Applies the resolved time value onto a live uniform object, tolerating both
 * plain `number`/array uniforms and three.js vector objects (e.g. `Vector4`).
 */
function applyTimeUniformValue(uniform, spec, elapsedSeconds) {
    if (!uniform)
        return;
    if (spec.glslType === "vec4") {
        const t = elapsedSeconds;
        const x = t / 20;
        const y = t;
        const z = t * 2;
        const w = t * 3;
        const value = uniform.value;
        if (value && typeof value === "object" && "set" in value) {
            value.set(x, y, z, w);
        }
        else if (Array.isArray(value)) {
            value[0] = x;
            value[1] = y;
            value[2] = z;
            value[3] = w;
        }
        else {
            uniform.value = [x, y, z, w];
        }
        return;
    }
    uniform.value = elapsedSeconds;
}
/**
 * Records the time uniforms a live material declares onto its `userData`, so
 * every render path drives it from the one `xriftTimeUniforms` contract.
 *
 * Materials Studio builds from a Classic R3F shader are stamped at
 * construction, where the shader descriptor is still in hand. Materials that
 * arrive already built have no descriptor to read: Open Brush brushes come out
 * of three-icosa's glTF extension with their GLSL already compiled in. Those
 * are stamped from their own source instead, which is why this reads
 * `vertexShader`/`fragmentShader` off the material rather than a descriptor.
 *
 * Returns the specs that were stamped, or an empty array when the material
 * declares no time uniform.
 */
function stampMaterialTimeUniforms(material) {
    if (!material || !material.userData)
        return [];
    // A material already carrying specs keeps them: the authored
    // animatedTimeUniform is more specific than anything detected here.
    const existing = material.userData.xriftTimeUniforms;
    if (Array.isArray(existing) && existing.length > 0) {
        return existing;
    }
    const specs = detectTimeUniforms(material).filter(
    // Only keep a spec the material can actually drive. Detection reads GLSL,
    // so a uniform the material never bound would otherwise be recorded as
    // animated and read as working when it is not.
    (spec) => !material.uniforms || spec.name in material.uniforms);
    if (specs.length === 0)
        return [];
    material.userData.xriftTimeUniforms = specs;
    return specs;
}
/**
 * Stamps every material under a loaded object tree. Used right after a glTF
 * finishes loading so brushes animate no matter which render path clones or
 * reassigns the materials afterwards.
 */
function stampObjectTimeUniforms(root) {
    if (!root)
        return 0;
    let stamped = 0;
    root.traverse((object) => {
        const mesh = object;
        if (!mesh.material)
            return;
        const entries = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const entry of entries) {
            if (stampMaterialTimeUniforms(entry).length > 0) {
                stamped += 1;
            }
        }
    });
    return stamped;
}

/**
 * A structural read of an untrusted `KHR_interactivity` document.
 *
 * The engine never touches raw JSON. Everything it needs — which operation a
 * node runs, where its inputs come from, where its flows go — is resolved once
 * here, so the execution code below can be about semantics instead of about
 * defending itself from a hostile document on every access.
 *
 * Nothing is discarded silently. A node whose declaration cannot be resolved
 * keeps its place in the array with an unresolvable operation name, because the
 * canonical JSON keeps it too and the author has to be told which node it was.
 */
const TYPE_SIGNATURES = new Set([
    "bool",
    "float",
    "float2",
    "float3",
    "float4",
    "float2x2",
    "float3x3",
    "float4x4",
    "int",
    "ref",
    "custom",
]);
/** How many scalars one signature holds. `null` means the type is opaque. */
function signatureLength(signature) {
    switch (signature) {
        case "bool":
        case "float":
        case "int":
        case "ref":
            return 1;
        case "float2":
            return 2;
        case "float3":
            return 3;
        case "float4":
        case "float2x2":
            return 4;
        case "float3x3":
            return 9;
        case "float4x4":
            return 16;
        case "custom":
            return null;
    }
}
function asRecord$2(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function asArray(value) {
    return Array.isArray(value) ? value : [];
}
function asIndex(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : null;
}
function asJsonValues(value) {
    if (!Array.isArray(value))
        return null;
    const collected = [];
    for (const entry of value) {
        if (entry === null ||
            typeof entry === "string" ||
            typeof entry === "boolean" ||
            (typeof entry === "number" && Number.isFinite(entry))) {
            collected.push(entry);
            continue;
        }
        // A non-scalar inside a typed value is not representable; the whole socket
        // is treated as unset rather than half-read.
        return null;
    }
    return collected;
}
function parseConfiguration(value) {
    const parsed = new Map();
    const record = asRecord$2(value);
    if (!record)
        return parsed;
    for (const [key, entry] of Object.entries(record)) {
        const values = asJsonValues(asRecord$2(entry)?.value);
        if (values)
            parsed.set(key, values);
    }
    return parsed;
}
function parseValues(value) {
    const parsed = new Map();
    const record = asRecord$2(value);
    if (!record)
        return parsed;
    for (const [socket, entry] of Object.entries(record)) {
        const source = asRecord$2(entry);
        if (!source)
            continue;
        const linked = asIndex(source.node);
        if (linked !== null) {
            const named = source.socket;
            parsed.set(socket, {
                kind: "link",
                node: linked,
                socket: typeof named === "string" && named ? named : "value",
            });
            continue;
        }
        parsed.set(socket, {
            kind: "inline",
            typeIndex: asIndex(source.type),
            value: asJsonValues(source.value),
        });
    }
    return parsed;
}
function parseFlows(value) {
    const parsed = new Map();
    const record = asRecord$2(value);
    if (!record)
        return parsed;
    for (const [socket, entry] of Object.entries(record)) {
        const target = asRecord$2(entry);
        const node = asIndex(target?.node);
        if (node === null)
            continue;
        const named = target?.socket;
        parsed.set(socket, {
            node,
            socket: typeof named === "string" && named ? named : "in",
        });
    }
    return parsed;
}
function parseGraph(value, index) {
    const record = asRecord$2(value);
    const declarations = asArray(record?.declarations);
    const types = [];
    for (const entry of asArray(record?.types)) {
        const signature = asRecord$2(entry)?.signature;
        types.push(typeof signature === "string" && TYPE_SIGNATURES.has(signature)
            ? signature
            : "custom");
    }
    const variables = [];
    for (const entry of asArray(record?.variables)) {
        const variable = asRecord$2(entry);
        variables.push({
            typeIndex: asIndex(variable?.type),
            value: asJsonValues(variable?.value),
        });
    }
    const events = [];
    for (const entry of asArray(record?.events)) {
        const id = asRecord$2(entry)?.id;
        events.push(typeof id === "string" && id ? id : null);
    }
    const nodes = [];
    for (const [nodeIndex, entry] of asArray(record?.nodes).entries()) {
        const node = asRecord$2(entry);
        const declarationIndex = asIndex(node?.declaration);
        const declaration = declarationIndex === null
            ? undefined
            : asRecord$2(declarations[declarationIndex]);
        const op = declaration?.op;
        const extension = declaration?.extension;
        nodes.push({
            index: nodeIndex,
            op: typeof op === "string" && op ? op : null,
            extension: typeof extension === "string" && extension ? extension : null,
            configuration: parseConfiguration(node?.configuration),
            values: parseValues(node?.values),
            flows: parseFlows(node?.flows),
        });
    }
    const name = asRecord$2(record)?.name;
    return {
        index,
        name: typeof name === "string" && name ? name : null,
        types,
        variables,
        events,
        nodes,
    };
}
/** Reads a whole `KHR_interactivity` extension object. */
function parseInteractivityExtension(value) {
    const record = asRecord$2(value);
    const graphs = asArray(record?.graphs).map((entry, index) => parseGraph(entry, index));
    const requested = asIndex(record?.graph) ?? 0;
    return {
        graphs,
        defaultGraphIndex: requested < graphs.length ? requested : 0,
    };
}

function precedes(left, right) {
    return left.dueAt < right.dueAt || (left.dueAt === right.dueAt && left.id < right.id);
}
/**
 * Earliest deadline first, with creation order breaking ties. Indexed removal
 * releases cancelled timers immediately: they must not occupy the engine's
 * pending-work budget or accumulate behind a far-future deadline.
 */
class TimerQueue {
    constructor() {
        this.heap = [];
        this.positions = new Map();
        this.idsByNode = new Map();
    }
    get size() { return this.heap.length; }
    peek() { return this.heap[0]; }
    push(timer) {
        const index = this.heap.length;
        this.heap.push(timer);
        this.positions.set(timer.id, index);
        let ids = this.idsByNode.get(timer.node);
        if (!ids) {
            ids = new Set();
            this.idsByNode.set(timer.node, ids);
        }
        ids.add(timer.id);
        this.siftUp(index);
    }
    pop() {
        const timer = this.peek();
        if (timer)
            this.remove(timer.id);
        return timer;
    }
    remove(id) {
        const index = this.positions.get(id);
        if (index === undefined)
            return;
        const timer = this.heap[index];
        const last = this.heap.pop();
        this.positions.delete(id);
        const ids = this.idsByNode.get(timer.node);
        ids.delete(id);
        if (ids.size === 0)
            this.idsByNode.delete(timer.node);
        if (index === this.heap.length)
            return;
        this.heap[index] = last;
        this.positions.set(last.id, index);
        const parent = (index - 1) >> 1;
        if (index > 0 && precedes(last, this.heap[parent]))
            this.siftUp(index);
        else
            this.siftDown(index);
    }
    removeNode(node) {
        const ids = this.idsByNode.get(node);
        if (!ids)
            return;
        // Set iteration permits removing the current item.
        for (const id of ids)
            this.remove(id);
    }
    clear() {
        this.heap.length = 0;
        this.positions.clear();
        this.idsByNode.clear();
    }
    swap(left, right) {
        const a = this.heap[left];
        const b = this.heap[right];
        this.heap[left] = b;
        this.heap[right] = a;
        this.positions.set(a.id, right);
        this.positions.set(b.id, left);
    }
    siftUp(start) {
        let index = start;
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (!precedes(this.heap[index], this.heap[parent]))
                break;
            this.swap(index, parent);
            index = parent;
        }
    }
    siftDown(start) {
        let index = start;
        while (index * 2 + 1 < this.heap.length) {
            const left = index * 2 + 1;
            const right = left + 1;
            const child = right < this.heap.length && precedes(this.heap[right], this.heap[left]) ? right : left;
            if (!precedes(this.heap[child], this.heap[index]))
                break;
            this.swap(index, child);
            index = child;
        }
    }
}

/**
 * The one value representation the engine passes between nodes.
 *
 * KHR types are all fixed-length arrays of scalars, so a signature and a data
 * array is enough. Keeping a single shape here is what lets a math operation
 * accept a float and a float3 without every operation re-deriving what it was
 * handed.
 */
const TRUE = { signature: "bool", data: [true] };
const FALSE = { signature: "bool", data: [false] };
function boolValue(value) {
    return value ? TRUE : FALSE;
}
/**
 * A computed float, non-finite included.
 *
 * `math/Inf` and `math/NaN` are constants the specification defines, so the
 * sanitising belongs at the JSON boundary ({@link fromJsonValue}) rather than
 * here — coercing a computed infinity to zero made `math/isInf` answer false
 * about the value produced one node earlier.
 */
function floatValue(value) {
    return { signature: "float", data: [value] };
}
function intValue(value) {
    return {
        signature: "int",
        data: [Number.isFinite(value) ? Math.trunc(value) : 0],
    };
}
function vectorValue(components) {
    const signature = components.length === 2
        ? "float2"
        : components.length === 3
            ? "float3"
            : components.length === 4
                ? "float4"
                : "float";
    return {
        signature,
        data: components.map((entry) => (Number.isFinite(entry) ? entry : 0)),
    };
}
/** The all-zero value of a signature, which the RC uses when nothing is set. */
function defaultValue(signature) {
    if (signature === "bool")
        return FALSE;
    const length = signatureLength(signature);
    if (length === null)
        return { signature, data: [] };
    return { signature, data: new Array(length).fill(0) };
}
/** Reads a JSON typed value into the engine's representation. */
function fromJsonValue(signature, value) {
    if (!value || value.length === 0)
        return defaultValue(signature);
    if (signature === "bool") {
        return boolValue(value[0] === true);
    }
    const length = signatureLength(signature);
    const size = length ?? value.length;
    const data = [];
    for (let index = 0; index < size; index += 1) {
        const entry = value[index];
        data.push(typeof entry === "number" && Number.isFinite(entry) ? entry : 0);
    }
    return { signature, data };
}
function asBoolean(value) {
    if (!value)
        return false;
    const first = value.data[0];
    if (typeof first === "boolean")
        return first;
    return typeof first === "number" && first !== 0;
}
function asNumber(value) {
    if (!value)
        return 0;
    const first = value.data[0];
    if (typeof first === "boolean")
        return first ? 1 : 0;
    // Non-finite numbers pass through. JSON cannot express one, so an infinity
    // here was computed — `math/Inf` is a constant the specification defines, and
    // coercing it to 0 made `math/isInf` answer false about its own value.
    return typeof first === "number" ? first : 0;
}
function asInteger(value) {
    return Math.trunc(asNumber(value));
}
/** Numeric components, padded with zeroes so callers can index safely. */
function asNumbers(value, length) {
    const components = [];
    for (let index = 0; index < length; index += 1) {
        const entry = value?.data[index];
        if (typeof entry === "number") {
            components.push(entry);
        }
        else if (typeof entry === "boolean") {
            components.push(entry ? 1 : 0);
        }
        else {
            components.push(0);
        }
    }
    return components;
}
/** How many scalars a value actually carries. */
function valueLength(value) {
    if (!value)
        return 0;
    return signatureLength(value.signature) ?? value.data.length;
}
/**
 * Linear blend between two values of the same shape.
 *
 * Interpolation is the whole point of a timed property write, so it lives
 * beside the value model rather than inside one operation: `variable/interpolate`,
 * `pointer/interpolate` and a timed Entity property write all use this.
 */
function mixValues(from, to, ratio) {
    // Not clamped to 0..1. An easing that overshoots hands a ratio above 1 on
    // purpose, and `math/mix` is defined as a plain blend, so pinning the ratio
    // here would quietly turn「少し行き過ぎて戻る」into a slow ease-out. Values
    // that must stay inside a range are clamped where they are written.
    const mix = Number.isFinite(ratio) ? ratio : 0;
    if (to.signature === "bool") {
        // A boolean has no midpoint; it flips once the blend reaches the end, so a
        // timed write of a switch still lands on a legal value.
        return mix < 1 ? from : to;
    }
    const length = Math.max(valueLength(from), valueLength(to));
    const start = asNumbers(from, length);
    const end = asNumbers(to, length);
    const blended = end.map((entry, index) => {
        const base = start[index] ?? 0;
        return base + (entry - base) * mix;
    });
    if (to.signature === "int") {
        return { signature: "int", data: blended.map((entry) => Math.round(entry)) };
    }
    return { signature: to.signature, data: blended };
}
const INTERACTIVITY_EASINGS = [
    "linear",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "ease-in-strong",
    "ease-out-strong",
    "ease-out-back",
];
const EASINGS = new Set(INTERACTIVITY_EASINGS);
function parseEasing(value) {
    return typeof value === "string" && EASINGS.has(value)
        ? value
        : "linear";
}
/** Shapes a 0..1 progress ratio. Kept here so Play and publish ease alike. */
function applyEasing(ratio, easing) {
    const clamped = ratio <= 0 ? 0 : ratio >= 1 ? 1 : ratio;
    const back = 1 - clamped;
    switch (easing) {
        case "ease-in":
            return clamped * clamped;
        case "ease-out":
            return 1 - back * back;
        case "ease-in-out":
            return clamped < 0.5 ? 2 * clamped * clamped : 1 - 2 * back * back;
        case "ease-in-strong":
            return clamped * clamped * clamped;
        case "ease-out-strong":
            return 1 - back * back * back;
        case "ease-out-back": {
            // Overshoots by about ten percent and settles, which is what a lid or a
            // sign wants when it stops. The constants are the usual "back" pair, and
            // the returned ratio deliberately passes 1 before coming back — the
            // caller must not clamp it, or the curve is just a slow ease-out.
            const overshoot = 1.70158;
            return 1 - (overshoot + 1) * back * back * back + overshoot * back * back;
        }
        case "linear":
            return clamped;
    }
}

/**
 * The single interpreter for `KHR_interactivity` behavior graphs.
 *
 * Studio's Play preview and a published world both run this module, so a graph
 * cannot behave one way while authoring and another way after publishing. It
 * replaces two earlier static walks that only ever answered one question each
 * ("which clips start, and when" and "which properties an interaction writes"),
 * and could therefore not express waiting, repeating, branching on a computed
 * value, or anything continuous.
 *
 * Two evaluation directions live here and are deliberately kept apart:
 *
 * - values are pulled on demand, so a socket is only computed when a running
 *   node asks for it, and a cycle among values is a reported error;
 * - flows are pushed from an entry point, and a cycle among flows is a loop,
 *   which is legal and bounded by an activation budget rather than forbidden.
 *
 * Input is untrusted published JSON. Every read is structural (see `graph.ts`)
 * and every world write goes through {@link InteractivityHost}.
 */
const DEFAULT_ACTIVATION_BUDGET = 20000;
const DEFAULT_TRACE_LIMIT = 500;
const MAX_PENDING_TIMERS = 4096;
/**
 * How many distinct moments one frame may resolve.
 *
 * A frame is not one instant: a long one contains every wait that came due
 * inside it, in order. The cap is what keeps a graph that schedules zero-second
 * work from stepping forever without advancing the clock.
 */
const MAX_FRAME_STEPS = 4096;
/** Operations this engine executes. Anything else is reported, never guessed. */
const INTERACTIVITY_EXECUTED_OPERATIONS = new Set([
    "event/onStart",
    "event/onTick",
    "event/receive",
    "event/send",
    "flow/branch",
    "flow/switch",
    "flow/sequence",
    "flow/setDelay",
    "flow/cancelDelay",
    "flow/doN",
    "flow/multiGate",
    "flow/waitAll",
    "flow/throttle",
    "flow/for",
    "flow/while",
    "variable/get",
    "variable/set",
    "variable/interpolate",
    "pointer/get",
    "pointer/set",
    "pointer/interpolate",
    "animation/start",
    "animation/stop",
    "animation/stopAt",
    "debug/log",
    "xrift/onInteract",
    "xrift/setProperty",
    "xrift/toggleProperty",
]);
/**
 * Value operations the evaluator computes.
 *
 * Kept as data rather than derived from the switch below so the authoring side
 * can ask "will Play evaluate this" without importing the interpreter, and so a
 * fixture can prove the two agree.
 */
const INTERACTIVITY_VALUE_OPERATIONS = new Set([
    "math/E",
    "math/Pi",
    "math/Tau",
    "math/Inf",
    "math/NaN",
    "math/add",
    "math/sub",
    "math/mul",
    "math/div",
    "math/rem",
    "math/min",
    "math/max",
    "math/pow",
    "math/atan2",
    "math/neg",
    "math/abs",
    "math/sign",
    "math/floor",
    "math/ceil",
    "math/round",
    "math/trunc",
    "math/fract",
    "math/sqrt",
    "math/cbrt",
    "math/exp",
    "math/log",
    "math/log2",
    "math/log10",
    "math/sin",
    "math/cos",
    "math/tan",
    "math/asin",
    "math/acos",
    "math/atan",
    "math/rad",
    "math/deg",
    "math/saturate",
    "math/isInf",
    "math/isNaN",
    "math/clamp",
    "math/mix",
    "math/smoothStep",
    "math/random",
    "math/eq",
    "math/lt",
    "math/le",
    "math/gt",
    "math/ge",
    "math/and",
    "math/or",
    "math/xor",
    "math/not",
    "math/select",
    "math/length",
    "math/normalize",
    "math/dot",
    "math/cross",
    "math/combine2",
    "math/combine3",
    "math/combine4",
    "math/extract2",
    "math/extract3",
    "math/extract4",
    "ref/eq",
    "type/boolToFloat",
    "type/boolToInt",
    "type/floatToBool",
    "type/floatToInt",
    "type/intToBool",
    "type/intToFloat",
    "variable/get",
    "pointer/get",
]);
const A_INPUT = ["a", "0"];
const B_INPUT = ["b", "1"];
const C_INPUT = ["c", "2"];
function isPureOperation(op) {
    if (!op)
        return false;
    return (op.startsWith("math/") ||
        op.startsWith("type/") ||
        op === "variable/get" ||
        op === "pointer/get" ||
        op === "ref/eq");
}
/** Signature guessed from an inline value that carries no type index. */
function inferSignature(value) {
    if (!value || value.length === 0)
        return "float";
    if (typeof value[0] === "boolean")
        return "bool";
    switch (value.length) {
        case 2:
            return "float2";
        case 3:
            return "float3";
        case 4:
            return "float4";
        default:
            return "float";
    }
}
function componentWise(left, right, combine) {
    const leftLength = Math.max(1, valueLength(left));
    const rightLength = Math.max(1, valueLength(right));
    const length = Math.max(leftLength, rightLength);
    const a = asNumbers(left, leftLength);
    const b = asNumbers(right, rightLength);
    const data = [];
    for (let index = 0; index < length; index += 1) {
        // A scalar broadcasts over a vector, which is how "multiply this colour by
        // 0.5" is written without a combine node in front of it.
        const leftEntry = leftLength === 1 ? (a[0] ?? 0) : (a[index] ?? 0);
        const rightEntry = rightLength === 1 ? (b[0] ?? 0) : (b[index] ?? 0);
        const result = combine(leftEntry, rightEntry);
        data.push(Number.isFinite(result) ? result : 0);
    }
    const signature = (length === leftLength ? left?.signature : right?.signature) ??
        (length === 1 ? "float" : length === 2 ? "float2" : length === 3 ? "float3" : "float4");
    return { signature: signature === "bool" ? "float" : signature, data };
}
function mapComponents(value, transform) {
    const length = Math.max(1, valueLength(value));
    const components = asNumbers(value, length).map((entry) => {
        const result = transform(entry);
        return Number.isFinite(result) ? result : 0;
    });
    const signature = value?.signature ?? "float";
    return { signature: signature === "bool" ? "float" : signature, data: components };
}
/** Runs one behavior graph against one host. */
class InteractivityEngine {
    constructor(extension, host = {}, options = {}) {
        this.variables = [];
        this.outputs = new Map();
        this.loops = new Map();
        this.gateCursor = new Map();
        this.waitAllSeen = new Map();
        this.throttleUntil = new Map();
        this.timers = new TimerQueue();
        this.interpolations = [];
        this.issues = [];
        this.trace = [];
        /** First time each node ran. Uncapped, unlike the trace, so it is complete. */
        this.visited = new Map();
        this.timeSeconds = 0;
        this.lastTickSeconds = 0;
        this.activeNode = -1;
        this.nextTimerId = 1;
        this.budget = 0;
        this.started = false;
        const parsed = parseInteractivityExtension(extension);
        const index = options.graphIndex ?? parsed.defaultGraphIndex;
        this.graph = parsed.graphs[index] ?? null;
        this.graphIndex = this.graph?.index ?? index;
        this.host = host;
        this.activationBudget = options.activationBudget ?? DEFAULT_ACTIVATION_BUDGET;
        this.traceLimit = options.traceLimit ?? DEFAULT_TRACE_LIMIT;
        this.localEventDelivery = options.localEventDelivery ?? true;
        for (const variable of this.graph?.variables ?? []) {
            const signature = variable.typeIndex === null
                ? inferSignature(variable.value)
                : (this.graph?.types[variable.typeIndex] ?? "float");
            this.variables.push(fromJsonValue(signature, variable.value));
        }
    }
    /** Seconds since {@link start}, advanced by {@link update}. */
    get currentTime() {
        return this.timeSeconds;
    }
    /**
     * The node currently running, or -1 between activations.
     *
     * A host is called from inside one node's execution and otherwise has no way
     * to say which node asked for a write. The timeline needs that to send an
     * author from "at 35 s the light changes" back to the node that changed it.
     */
    get activeNodeIndex() {
        return this.activeNode;
    }
    getIssues() {
        return this.issues;
    }
    getTrace() {
        return this.trace;
    }
    /**
     * Every node that ran, and when it first did.
     *
     * The trace is bounded so a long run cannot grow without limit; this is not,
     * because "which nodes never ran" is the question an author asks about a
     * graph that does nothing, and a truncated answer would be wrong.
     */
    getVisitedNodes() {
        return this.visited;
    }
    /** True while a timer or an interpolation is still pending. */
    get hasPendingWork() {
        return (this.timers.size > 0 ||
            this.interpolations.some((entry) => !entry.cancelled));
    }
    /** Whether this graph reacts to every frame, which a dry run has to honour. */
    get usesTick() {
        return (this.graph?.nodes ?? []).some((node) => node.op === "event/onTick");
    }
    /** The next moment something is scheduled to happen, or `null`. */
    nextScheduledTime() {
        let next = this.timers.peek()?.dueAt ?? null;
        for (const entry of this.interpolations) {
            if (entry.cancelled)
                continue;
            const due = this.timeSeconds + Math.max(0, entry.duration - entry.elapsed);
            if (next === null || due < next)
                next = due;
        }
        return next;
    }
    /** Fires every `event/onStart`. Safe to call once. */
    start() {
        if (this.started || !this.graph)
            return;
        this.started = true;
        this.budget = this.activationBudget;
        for (const node of this.graph.nodes) {
            if (node.op !== "event/onStart")
                continue;
            this.runFrom(node.index, "out");
        }
    }
    /**
     * Advances the clock.
     *
     * Timers are processed at the time they were due rather than at the end of
     * the frame, so a chain of one-second waits lands on whole seconds instead of
     * drifting by a frame on every hop.
     */
    update(deltaSeconds) {
        if (!this.graph || !this.started)
            return;
        const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
        const frameEnd = this.timeSeconds + delta;
        this.budget = this.activationBudget;
        // Walk the frame moment by moment rather than timer by timer. An
        // interpolation that finishes mid-frame continues into new waits, and one
        // of those can be due before a timer that was already pending. Jumping
        // straight to the earliest pending timer ran the later event first and then
        // set the clock back to run the earlier one — invisible at 60fps, plain in
        // any long frame: a tab returning from the background, a stall, or a dry
        // run stepping in whole seconds.
        for (let step = 0; step < MAX_FRAME_STEPS; step += 1) {
            const next = this.nextEventTime(frameEnd);
            if (next === null)
                break;
            this.advanceInterpolations(next);
            this.timeSeconds = next;
            // Interpolation continuations may have inserted or cancelled timers.
            // Read the queue after advancing them, preserving same-moment ordering.
            const due = this.timers.peek();
            if (!due || due.dueAt > next)
                continue;
            this.timers.pop();
            this.runOutput(due.node, due.socket);
        }
        this.advanceInterpolations(frameEnd);
        this.timeSeconds = frameEnd;
        for (const node of this.graph.nodes) {
            if (node.op !== "event/onTick")
                continue;
            this.runFrom(node.index, "out");
        }
        this.lastTickSeconds = this.timeSeconds;
    }
    /** Delivers a custom event to every matching `event/receive`. */
    receiveEvent(eventId) {
        if (!this.graph)
            return;
        this.budget = this.activationBudget;
        for (const node of this.graph.nodes) {
            if (node.op !== "event/receive")
                continue;
            if (this.configurationEventId(node) !== eventId)
                continue;
            this.runFrom(node.index, "out");
        }
    }
    /** Runs every interaction entry point, used by the Interaction Trigger. */
    interact() {
        if (!this.graph)
            return;
        this.budget = this.activationBudget;
        for (const node of this.graph.nodes) {
            if (node.op !== "xrift/onInteract")
                continue;
            this.runFrom(node.index, "out");
        }
    }
    /** Drops pending work so a stopped Play session leaves nothing running. */
    dispose() {
        this.timers.clear();
        this.interpolations = [];
        this.loops.clear();
    }
    // ---------------------------------------------------------------- flow
    /**
     * Continues from one of a node's flow outputs.
     *
     * A scheduled continuation names the socket that becomes ready, not a node to
     * re-enter: waking `flow/setDelay` at its own `done` socket would run the wait
     * a second time instead of continuing past it.
     */
    /**
     * Continues from one node's flow output, without re-entering the node.
     *
     * Used by everything that resumes later: a delay's `done`, and a local event
     * delivered to `event/receive`. The node is recorded even though it is not
     * stepped again, because it did run — without this the timeline reports a
     * receiver whose whole chain fired as 未到達.
     */
    runOutput(nodeIndex, socket) {
        const node = this.graph?.nodes[nodeIndex];
        if (!node)
            return;
        this.record(nodeIndex, node.op, socket);
        const target = node.flows.get(socket);
        if (!target)
            return;
        this.runFrom(target.node, target.socket);
    }
    runFrom(nodeIndex, socket) {
        const stack = [{ kind: "node", node: nodeIndex, socket }];
        while (stack.length > 0) {
            const frame = stack.pop();
            if (!frame)
                break;
            if (this.budget <= 0) {
                this.report(nodeIndex, null, "budget-exceeded");
                return;
            }
            this.budget -= 1;
            const next = frame.kind === "loop"
                ? this.stepLoop(frame.node)
                : this.stepNode(frame.node, frame.socket);
            // Pushed in reverse so the first target the operation named runs first.
            for (let index = next.length - 1; index >= 0; index -= 1) {
                const entry = next[index];
                if (entry)
                    stack.push(entry);
            }
        }
    }
    follow(node, socket) {
        const target = node.flows.get(socket);
        if (!target)
            return [];
        return [{ kind: "node", node: target.node, socket: target.socket }];
    }
    stepNode(nodeIndex, socket) {
        const node = this.graph?.nodes[nodeIndex];
        if (!node)
            return [];
        if (!node.op) {
            this.report(nodeIndex, null, "missing-declaration");
            return [];
        }
        this.record(nodeIndex, node.op, socket);
        this.activeNode = nodeIndex;
        const seen = new Set();
        switch (node.op) {
            case "event/onStart":
            case "event/onTick":
            case "event/receive":
            case "xrift/onInteract":
                return this.follow(node, "out");
            case "event/send": {
                const name = this.configurationEventId(node);
                if (name && this.host.emitEvent) {
                    const payload = new Map();
                    for (const [key, source] of node.values) {
                        const value = this.readSocket(node, key, seen);
                        if (value)
                            payload.set(key, value);
                    }
                    this.host.emitEvent(name, payload);
                }
                // A graph can also address its own receivers, which is how two graphs
                // in one Asset are composed without a shared variable.
                const targets = this.follow(node, "out");
                if (name)
                    this.queueLocalEvent(name, targets);
                return targets;
            }
            case "flow/branch": {
                const condition = this.readSocket(node, "condition", seen);
                return this.follow(node, asBoolean(condition) ? "true" : "false");
            }
            case "flow/switch": {
                // A missing selection is not case 0. `asInteger(null)` is 0, so an
                // unwired node silently took the first case instead of the fallback the
                // author wired for exactly this.
                const selected = this.readSocket(node, "selection", seen);
                const named = selected !== null && node.flows.has(String(asInteger(selected)))
                    ? String(asInteger(selected))
                    : "default";
                return this.follow(node, named);
            }
            case "flow/sequence": {
                const sockets = [...node.flows.keys()].sort(compareFlowSocketNames);
                return sockets.flatMap((name) => this.follow(node, name));
            }
            case "flow/setDelay": {
                if (socket === "cancel") {
                    this.cancelTimersOf(nodeIndex);
                    return [];
                }
                const duration = asNumber(this.readSocket(node, "duration", seen));
                if (!Number.isFinite(duration) || duration < 0) {
                    this.report(nodeIndex, node.op, "invalid-input", "duration");
                    return this.follow(node, "err");
                }
                const timerId = this.schedule(nodeIndex, "done", duration);
                if (timerId === null) {
                    this.report(nodeIndex, node.op, "budget-exceeded", "pending delays");
                    return this.follow(node, "err");
                }
                this.setOutput(nodeIndex, "lastDelay", intValue(timerId));
                return this.follow(node, "out");
            }
            case "flow/cancelDelay": {
                const delayId = asInteger(this.readSocket(node, "delay", seen));
                this.timers.remove(delayId);
                return this.follow(node, "out");
            }
            case "flow/doN": {
                if (socket === "reset") {
                    this.setOutput(nodeIndex, "currentCount", intValue(0));
                    return [];
                }
                // `|| 1` turned an explicit 0 into 1, so「0回だけ通す」let one through.
                // Only an absent socket falls back to once.
                const declared = this.readSocket(node, "n", seen);
                const limit = declared === null ? 1 : Math.max(0, asInteger(declared));
                const current = asInteger(this.outputs.get(outputKey(nodeIndex, "currentCount")) ?? null);
                if (current >= limit)
                    return [];
                this.setOutput(nodeIndex, "currentCount", intValue(current + 1));
                return this.follow(node, "out");
            }
            case "flow/multiGate": {
                const sockets = [...node.flows.keys()]
                    .filter((name) => name !== "reset")
                    .sort(compareFlowSocketNames);
                if (socket === "reset" || sockets.length === 0) {
                    this.gateCursor.set(nodeIndex, 0);
                    return [];
                }
                const cursor = this.gateCursor.get(nodeIndex) ?? 0;
                const loop = this.configurationFlag(node, "isLoop", true);
                if (cursor >= sockets.length && !loop)
                    return [];
                const chosen = sockets[cursor % sockets.length];
                this.gateCursor.set(nodeIndex, cursor + 1);
                return chosen ? this.follow(node, chosen) : [];
            }
            case "flow/waitAll": {
                const expected = this.waitAllInputs(node);
                if (socket === "reset") {
                    this.waitAllSeen.delete(nodeIndex);
                    this.setOutput(nodeIndex, "remainingInputs", intValue(expected.length));
                    return [];
                }
                const seenInputs = this.waitAllSeen.get(nodeIndex) ?? new Set();
                seenInputs.add(socket);
                this.waitAllSeen.set(nodeIndex, seenInputs);
                const remaining = expected.filter((name) => !seenInputs.has(name)).length;
                this.setOutput(nodeIndex, "remainingInputs", intValue(remaining));
                const passthrough = this.follow(node, "out");
                if (remaining > 0)
                    return passthrough;
                this.waitAllSeen.delete(nodeIndex);
                return [...this.follow(node, "completed"), ...passthrough];
            }
            case "flow/throttle": {
                if (socket === "reset") {
                    this.throttleUntil.delete(nodeIndex);
                    return [];
                }
                const duration = asNumber(this.readSocket(node, "duration", seen));
                const openAt = this.throttleUntil.get(nodeIndex);
                if (openAt !== undefined && this.timeSeconds < openAt) {
                    this.setOutput(nodeIndex, "lastRemainingTime", floatValue(openAt - this.timeSeconds));
                    return this.follow(node, "err");
                }
                this.throttleUntil.set(nodeIndex, this.timeSeconds + Math.max(0, duration));
                this.setOutput(nodeIndex, "lastRemainingTime", floatValue(0));
                return this.follow(node, "out");
            }
            case "flow/for": {
                const start = asInteger(this.readSocket(node, "startIndex", seen));
                const end = asInteger(this.readSocket(node, "endIndex", seen));
                this.loops.set(nodeIndex, {
                    index: start,
                    end,
                    bodySocket: node.flows.has("loopBody") ? "loopBody" : "body",
                    completedSocket: "completed",
                    indexSocket: "index",
                    condition: true,
                });
                return [{ kind: "loop", node: nodeIndex }];
            }
            case "flow/while": {
                this.loops.set(nodeIndex, {
                    index: 0,
                    end: Number.POSITIVE_INFINITY,
                    bodySocket: node.flows.has("loopBody") ? "loopBody" : "body",
                    completedSocket: "completed",
                    indexSocket: null,
                    condition: false,
                });
                return [{ kind: "loop", node: nodeIndex }];
            }
            case "variable/set": {
                const index = this.configurationIndex(node, "variable");
                const value = this.readSocket(node, "value", seen) ??
                    this.readSocket(node, "0", seen) ??
                    this.readSocket(node, "a", seen);
                if (index !== null && value)
                    this.variables[index] = value;
                return this.follow(node, "out");
            }
            case "variable/interpolate": {
                const index = this.configurationIndex(node, "variable");
                const value = this.readSocket(node, "value", seen) ?? this.readSocket(node, "0", seen);
                const duration = asNumber(this.readSocket(node, "duration", seen));
                if (index === null || !value) {
                    this.report(nodeIndex, node.op, "invalid-input", "variable");
                    return this.follow(node, "err");
                }
                const from = this.variables[index] ?? defaultValue(value.signature);
                this.beginInterpolation({
                    node: nodeIndex,
                    kind: "variable",
                    variableIndex: index,
                    pointer: "",
                    target: null,
                    from,
                    to: value,
                    duration,
                    easing: this.readEasing(node, seen),
                });
                return this.follow(node, "out");
            }
            case "pointer/set": {
                const pointer = this.configurationString(node, "pointer");
                const value = this.readSocket(node, "value", seen);
                if (!pointer || !value) {
                    this.report(nodeIndex, node.op, "invalid-input", "pointer");
                    return this.follow(node, "err");
                }
                if (!this.host.writePointer) {
                    this.report(nodeIndex, node.op, "unsupported-by-host", pointer);
                    return this.follow(node, "err");
                }
                const written = this.host.writePointer(pointer, value);
                return this.follow(node, written ? "out" : "err");
            }
            case "pointer/interpolate": {
                const pointer = this.configurationString(node, "pointer");
                const value = this.readSocket(node, "value", seen);
                const duration = asNumber(this.readSocket(node, "duration", seen));
                if (!pointer || !value || !this.host.writePointer) {
                    this.report(nodeIndex, node.op, "unsupported-by-host", pointer ?? "pointer");
                    return this.follow(node, "err");
                }
                const from = this.host.readPointer?.(pointer) ?? defaultValue(value.signature);
                this.beginInterpolation({
                    node: nodeIndex,
                    kind: "pointer",
                    variableIndex: -1,
                    pointer,
                    target: null,
                    from,
                    to: value,
                    duration,
                    easing: this.readEasing(node, seen),
                });
                return this.follow(node, "out");
            }
            case "animation/start": {
                const animationIndex = asInteger(this.readSocket(node, "animation", seen));
                if (animationIndex < 0) {
                    this.report(nodeIndex, node.op, "invalid-input", "animation");
                    return this.follow(node, "err");
                }
                const startTime = asNumber(this.readSocket(node, "startTime", seen));
                const endSocket = this.readSocket(node, "endTime", seen);
                const endTime = endSocket === null ? null : asNumber(endSocket);
                const speedSocket = this.readSocket(node, "speed", seen);
                const speed = speedSocket === null ? 1 : asNumber(speedSocket) || 1;
                this.host.startAnimation?.({
                    animationIndex,
                    startTime,
                    // An unset or non-positive end plays the whole clip; the RC uses
                    // `math/Inf` for "do not stop", which arrives here as a non-finite
                    // number rather than as a separate socket shape. `asNumber` passes
                    // one through, so this is the check that decides, not a coercion.
                    endTime: endTime === null || !Number.isFinite(endTime) || endTime <= startTime
                        ? null
                        : endTime,
                    speed,
                });
                if (!this.host.startAnimation) {
                    this.report(nodeIndex, node.op, "unsupported-by-host", "startAnimation");
                }
                const finish = endTime !== null && Number.isFinite(endTime) && endTime > startTime
                    ? (endTime - startTime) / Math.abs(speed)
                    : null;
                // Restarting the same node replaces its pending completion instead of
                // stacking a second one, the same rule a timed write follows. A clip
                // retriggered every second otherwise left a queue of `done` flows that
                // all fired later, long after the play they belonged to had ended.
                this.cancelTimersOf(nodeIndex);
                if (finish !== null && node.flows.has("done")) {
                    this.schedule(nodeIndex, "done", finish);
                }
                return this.follow(node, "out");
            }
            case "animation/stop":
            case "animation/stopAt": {
                const animationIndex = asInteger(this.readSocket(node, "animation", seen));
                const stopAt = node.op === "animation/stopAt"
                    ? asNumber(this.readSocket(node, "stopTime", seen))
                    : null;
                if (!this.host.stopAnimation) {
                    this.report(nodeIndex, node.op, "unsupported-by-host", "stopAnimation");
                    return this.follow(node, "err");
                }
                this.host.stopAnimation({ animationIndex, atSeconds: stopAt });
                return this.follow(node, "out");
            }
            case "debug/log": {
                const message = this.configurationString(node, "message") ?? "";
                const value = this.readSocket(node, "value", seen);
                this.host.log?.({
                    nodeIndex,
                    timeSeconds: this.timeSeconds,
                    message: value ? `${message} ${JSON.stringify(value.data)}`.trim() : message,
                });
                return this.follow(node, "out");
            }
            case "xrift/setProperty":
            case "xrift/toggleProperty": {
                const target = this.actionTarget(node);
                if (!target) {
                    this.report(nodeIndex, node.op, "invalid-input", "target");
                    return this.follow(node, "err");
                }
                if (target.text !== undefined) {
                    // Text-valued: nothing in a socket, and no midpoint to ramp through.
                    if (!this.host.writeString) {
                        this.report(nodeIndex, node.op, "unsupported-by-host", "writeString");
                        return this.follow(node, "err");
                    }
                    if (!this.host.writeString(target, target.text)) {
                        return this.follow(node, "err");
                    }
                    return [...this.follow(node, "out"), ...this.follow(node, "done")];
                }
                if (target.assetId !== undefined) {
                    // An Asset-valued property: no socket to read, and no midpoint to
                    // interpolate through, so a duration on it is simply not honoured.
                    if (!this.host.writeAsset) {
                        this.report(nodeIndex, node.op, "unsupported-by-host", "writeAsset");
                        return this.follow(node, "err");
                    }
                    if (!this.host.writeAsset(target, target.assetId)) {
                        return this.follow(node, "err");
                    }
                    return [...this.follow(node, "out"), ...this.follow(node, "done")];
                }
                if (!this.host.writeProperty) {
                    this.report(nodeIndex, node.op, "unsupported-by-host", "writeProperty");
                    return this.follow(node, "err");
                }
                const current = this.host.readProperty?.(target) ?? null;
                const next = node.op === "xrift/toggleProperty"
                    ? boolValue(!asBoolean(current))
                    : this.readSocket(node, "value", seen);
                if (!next) {
                    this.report(nodeIndex, node.op, "invalid-input", "value");
                    return this.follow(node, "err");
                }
                const duration = asNumber(this.readSocket(node, "duration", seen));
                if (duration > 0) {
                    this.beginInterpolation({
                        node: nodeIndex,
                        kind: "property",
                        variableIndex: -1,
                        pointer: "",
                        target,
                        // A host that cannot report the current value still gets a ramp:
                        // starting from the signature's zero is what "fade this in" means,
                        // and it is predictable rather than silently instantaneous.
                        from: current ?? defaultValue(next.signature),
                        to: next,
                        duration,
                        easing: this.readEasing(node, seen),
                    });
                    return this.follow(node, "out");
                }
                const written = this.host.writeProperty(target, next);
                if (!written)
                    return this.follow(node, "err");
                // An immediate write completes immediately, so `done` fires now. A
                // sequence wired through `done` must not stall the day its author sets
                // the duration back to zero.
                return [...this.follow(node, "out"), ...this.follow(node, "done")];
            }
            default:
                this.report(nodeIndex, node.op, "unsupported-operation");
                return [];
        }
    }
    stepLoop(nodeIndex) {
        const node = this.graph?.nodes[nodeIndex];
        const state = this.loops.get(nodeIndex);
        if (!node || !state)
            return [];
        if (state.condition) {
            if (state.index >= state.end) {
                this.loops.delete(nodeIndex);
                return this.follow(node, state.completedSocket);
            }
            if (state.indexSocket) {
                this.setOutput(nodeIndex, state.indexSocket, intValue(state.index));
            }
            state.index += 1;
        }
        else {
            const condition = this.readSocket(node, "condition", new Set());
            if (!asBoolean(condition)) {
                this.loops.delete(nodeIndex);
                return this.follow(node, state.completedSocket);
            }
            state.index += 1;
            if (state.index > this.activationBudget) {
                this.loops.delete(nodeIndex);
                this.report(nodeIndex, node.op, "budget-exceeded", "flow/while");
                return [];
            }
        }
        // The loop frame goes back underneath the body, so the body's whole chain
        // runs before the next iteration is considered.
        return [
            ...this.follow(node, state.bodySocket),
            { kind: "loop", node: nodeIndex },
        ];
    }
    queueLocalEvent(name, exclude) {
        if (!this.localEventDelivery)
            return;
        for (const candidate of this.graph?.nodes ?? []) {
            if (candidate.op !== "event/receive")
                continue;
            if (this.configurationEventId(candidate) !== name)
                continue;
            // Scheduled at the current time rather than run inline: a receiver that
            // sends back to the sender would otherwise recurse inside one activation.
            this.schedule(candidate.index, "out", 0);
        }
    }
    // -------------------------------------------------------------- values
    readSocket(node, name, seen) {
        const socket = node.values.get(name);
        if (!socket)
            return null;
        if (socket.kind === "link") {
            return this.evaluate(socket.node, socket.socket, seen);
        }
        const signature = socket.typeIndex === null
            ? inferSignature(socket.value)
            : (this.graph?.types[socket.typeIndex] ?? inferSignature(socket.value));
        return fromJsonValue(signature, socket.value);
    }
    readAny(node, names, seen) {
        for (const name of names) {
            const value = this.readSocket(node, name, seen);
            if (value)
                return value;
        }
        return null;
    }
    readEasing(node, seen) {
        const configured = node.configuration.get("easing")?.[0];
        return parseEasing(configured);
    }
    evaluate(nodeIndex, socket, seen) {
        const node = this.graph?.nodes[nodeIndex];
        if (!node)
            return null;
        const key = outputKey(nodeIndex, socket);
        if (seen.has(key)) {
            this.report(nodeIndex, node.op, "value-cycle", socket);
            return null;
        }
        if (!isPureOperation(node.op)) {
            // A flow node's outputs are whatever its last activation produced. An
            // output that has not been produced yet is genuinely unknown, so it is
            // reported rather than substituted with a plausible zero.
            const stored = this.outputs.get(key);
            if (stored)
                return stored;
            if (node.op === "event/onTick") {
                if (socket === "timeSinceStart")
                    return floatValue(this.timeSeconds);
                if (socket === "timeSinceLastTick") {
                    return floatValue(this.timeSeconds - this.lastTickSeconds);
                }
            }
            return null;
        }
        seen.add(key);
        // A value node never enters the flow, so without this it would read as
        // never having run — which is the opposite of what an author needs to see
        // when they are looking for the node that is not being used.
        if (!this.visited.has(nodeIndex)) {
            this.visited.set(nodeIndex, this.timeSeconds);
        }
        const computed = this.evaluatePure(node, socket, seen);
        seen.delete(key);
        return computed;
    }
    evaluatePure(node, socket, seen) {
        const op = node.op ?? "";
        if (op === "variable/get") {
            const index = this.configurationIndex(node, "variable");
            if (socket === "isValid") {
                return boolValue(index !== null && this.variables[index] !== undefined);
            }
            return index === null ? null : (this.variables[index] ?? null);
        }
        if (op === "pointer/get") {
            const pointer = this.configurationString(node, "pointer");
            if (socket === "isValid")
                return boolValue(Boolean(pointer));
            if (!pointer)
                return null;
            return this.host.readPointer?.(pointer) ?? null;
        }
        if (op.startsWith("type/")) {
            const source = this.readAny(node, A_INPUT, seen);
            switch (op) {
                case "type/boolToFloat":
                    return floatValue(asBoolean(source) ? 1 : 0);
                case "type/boolToInt":
                    return intValue(asBoolean(source) ? 1 : 0);
                case "type/floatToBool":
                case "type/intToBool":
                    return boolValue(asNumber(source) !== 0);
                case "type/floatToInt":
                    return intValue(Math.trunc(asNumber(source)));
                case "type/intToFloat":
                    return floatValue(asNumber(source));
                default:
                    return null;
            }
        }
        if (op === "ref/eq") {
            const left = this.readAny(node, A_INPUT, seen);
            const right = this.readAny(node, B_INPUT, seen);
            return boolValue(asNumber(left) === asNumber(right));
        }
        return this.evaluateMath(op, node, socket, seen);
    }
    evaluateMath(op, node, socket, seen) {
        const a = () => this.readAny(node, A_INPUT, seen);
        const b = () => this.readAny(node, B_INPUT, seen);
        const c = () => this.readAny(node, C_INPUT, seen);
        switch (op) {
            case "math/E":
                return floatValue(Math.E);
            case "math/Pi":
                return floatValue(Math.PI);
            case "math/Tau":
                return floatValue(Math.PI * 2);
            case "math/Inf":
                return floatValue(Number.POSITIVE_INFINITY);
            case "math/NaN":
                return { signature: "float", data: [Number.NaN] };
            case "math/add":
                return componentWise(a(), b(), (left, right) => left + right);
            case "math/sub":
                return componentWise(a(), b(), (left, right) => left - right);
            case "math/mul":
                return componentWise(a(), b(), (left, right) => left * right);
            case "math/div":
                return componentWise(a(), b(), (left, right) => (right === 0 ? 0 : left / right));
            case "math/rem":
                return componentWise(a(), b(), (left, right) => (right === 0 ? 0 : left % right));
            case "math/min":
                return componentWise(a(), b(), Math.min);
            case "math/max":
                return componentWise(a(), b(), Math.max);
            case "math/pow":
                return componentWise(a(), b(), Math.pow);
            case "math/atan2":
                return componentWise(a(), b(), Math.atan2);
            case "math/neg":
                return mapComponents(a(), (entry) => -entry);
            case "math/abs":
                return mapComponents(a(), Math.abs);
            case "math/sign":
                return mapComponents(a(), Math.sign);
            case "math/floor":
                return mapComponents(a(), Math.floor);
            case "math/ceil":
                return mapComponents(a(), Math.ceil);
            case "math/round":
                return mapComponents(a(), Math.round);
            case "math/trunc":
                return mapComponents(a(), Math.trunc);
            case "math/fract":
                return mapComponents(a(), (entry) => entry - Math.floor(entry));
            case "math/sqrt":
                return mapComponents(a(), (entry) => (entry < 0 ? 0 : Math.sqrt(entry)));
            case "math/cbrt":
                return mapComponents(a(), Math.cbrt);
            case "math/exp":
                return mapComponents(a(), Math.exp);
            case "math/log":
                return mapComponents(a(), (entry) => (entry > 0 ? Math.log(entry) : 0));
            case "math/log2":
                return mapComponents(a(), (entry) => (entry > 0 ? Math.log2(entry) : 0));
            case "math/log10":
                return mapComponents(a(), (entry) => (entry > 0 ? Math.log10(entry) : 0));
            case "math/sin":
                return mapComponents(a(), Math.sin);
            case "math/cos":
                return mapComponents(a(), Math.cos);
            case "math/tan":
                return mapComponents(a(), Math.tan);
            case "math/asin":
                return mapComponents(a(), Math.asin);
            case "math/acos":
                return mapComponents(a(), Math.acos);
            case "math/atan":
                return mapComponents(a(), Math.atan);
            case "math/rad":
                return mapComponents(a(), (entry) => (entry * Math.PI) / 180);
            case "math/deg":
                return mapComponents(a(), (entry) => (entry * 180) / Math.PI);
            case "math/saturate":
                return mapComponents(a(), (entry) => Math.min(1, Math.max(0, entry)));
            case "math/isInf":
                return boolValue(!Number.isFinite(asNumber(a())) && !Number.isNaN(asNumber(a())));
            case "math/isNaN":
                return boolValue(Number.isNaN(asNumber(a())));
            case "math/clamp": {
                const value = a();
                const low = asNumber(b());
                const high = asNumber(c());
                return mapComponents(value, (entry) => Math.min(Math.max(entry, low), high));
            }
            case "math/mix": {
                const from = a();
                const to = b();
                return mixValues(from ?? floatValue(0), to ?? floatValue(0), asNumber(c()));
            }
            case "math/smoothStep": {
                const value = asNumber(a());
                const edge0 = asNumber(b());
                const edge1 = asNumber(c());
                const span = edge1 - edge0;
                const ratio = span === 0 ? 0 : Math.min(1, Math.max(0, (value - edge0) / span));
                return floatValue(ratio * ratio * (3 - 2 * ratio));
            }
            case "math/random":
                return floatValue((this.host.random ?? Math.random)());
            case "math/eq": {
                // Every component, not just the first: `(1,0,0)` and `(1,5,5)` are not
                // the same position. The ordering operations below stay scalar, which
                // is the only shape the specification defines them for.
                const left = a();
                const right = b();
                const length = Math.max(left ? left.data.length : 0, right ? right.data.length : 0, 1);
                const leftComponents = asNumbers(left, length);
                const rightComponents = asNumbers(right, length);
                return boolValue(leftComponents.every((entry, index) => entry === rightComponents[index]));
            }
            case "math/lt":
                return boolValue(asNumber(a()) < asNumber(b()));
            case "math/le":
                return boolValue(asNumber(a()) <= asNumber(b()));
            case "math/gt":
                return boolValue(asNumber(a()) > asNumber(b()));
            case "math/ge":
                return boolValue(asNumber(a()) >= asNumber(b()));
            case "math/and":
                return boolValue(asBoolean(a()) && asBoolean(b()));
            case "math/or":
                return boolValue(asBoolean(a()) || asBoolean(b()));
            case "math/xor":
                return boolValue(asBoolean(a()) !== asBoolean(b()));
            case "math/not":
                return boolValue(!asBoolean(a()));
            case "math/select":
                return asBoolean(c()) ? a() : b();
            case "math/length": {
                const value = a();
                const components = asNumbers(value, Math.max(1, valueLength(value)));
                return floatValue(Math.hypot(...components));
            }
            case "math/normalize": {
                const value = a();
                const length = Math.max(1, valueLength(value));
                const components = asNumbers(value, length);
                const magnitude = Math.hypot(...components);
                return magnitude === 0
                    ? vectorValue(components)
                    : vectorValue(components.map((entry) => entry / magnitude));
            }
            case "math/dot": {
                const left = asNumbers(a(), Math.max(1, valueLength(a())));
                const right = asNumbers(b(), left.length);
                return floatValue(left.reduce((total, entry, index) => total + entry * (right[index] ?? 0), 0));
            }
            case "math/cross": {
                const left = asNumbers(a(), 3);
                const right = asNumbers(b(), 3);
                return vectorValue([
                    (left[1] ?? 0) * (right[2] ?? 0) - (left[2] ?? 0) * (right[1] ?? 0),
                    (left[2] ?? 0) * (right[0] ?? 0) - (left[0] ?? 0) * (right[2] ?? 0),
                    (left[0] ?? 0) * (right[1] ?? 0) - (left[1] ?? 0) * (right[0] ?? 0),
                ]);
            }
            case "math/combine2":
                return vectorValue([asNumber(a()), asNumber(b())]);
            case "math/combine3":
                return vectorValue([asNumber(a()), asNumber(b()), asNumber(c())]);
            case "math/combine4":
                return vectorValue([
                    asNumber(a()),
                    asNumber(b()),
                    asNumber(c()),
                    asNumber(this.readAny(node, ["d", "3"], seen)),
                ]);
            case "math/extract2":
            case "math/extract3":
            case "math/extract4": {
                // Extract publishes one output per component, named by its index, so
                // the socket the caller asked for is what selects the component.
                const value = a();
                if (!value)
                    return null;
                const components = asNumbers(value, Math.max(1, valueLength(value)));
                const index = Number.isInteger(Number(socket)) ? Number(socket) : 0;
                return floatValue(components[index] ?? 0);
            }
            default:
                return null;
        }
    }
    // ------------------------------------------------------------ scheduling
    schedule(node, socket, delaySeconds) {
        if (this.timers.size >= MAX_PENDING_TIMERS)
            return null;
        const id = this.nextTimerId;
        this.nextTimerId += 1;
        this.timers.push({
            id,
            dueAt: this.timeSeconds + Math.max(0, delaySeconds),
            node,
            socket,
        });
        return id;
    }
    /**
     * The next moment inside this frame at which anything happens.
     *
     * Both kinds of pending work count: a wait that comes due, and an
     * interpolation that reaches its end and continues on `done`. Looking at only
     * one of them is what let the two run out of order.
     */
    nextEventTime(frameEnd) {
        let next = null;
        const consider = (time) => {
            const clamped = time < this.timeSeconds ? this.timeSeconds : time;
            if (clamped > frameEnd)
                return;
            if (next === null || clamped < next)
                next = clamped;
        };
        const timer = this.timers.peek();
        if (timer)
            consider(timer.dueAt);
        for (const entry of this.interpolations) {
            if (entry.cancelled)
                continue;
            consider(this.timeSeconds + Math.max(0, entry.duration - entry.elapsed));
        }
        return next;
    }
    cancelTimersOf(nodeIndex) {
        this.timers.removeNode(nodeIndex);
    }
    beginInterpolation(entry) {
        // Restarting the same node replaces its interpolation instead of stacking
        // two writers on one property.
        this.interpolations = this.interpolations.filter((candidate) => candidate.node !== entry.node);
        const duration = Number.isFinite(entry.duration) && entry.duration > 0 ? entry.duration : 0;
        const interpolation = {
            id: this.nextTimerId,
            node: entry.node,
            kind: entry.kind,
            variableIndex: entry.variableIndex,
            pointer: entry.pointer,
            target: entry.target,
            from: entry.from,
            to: entry.to,
            duration,
            easing: entry.easing,
            elapsed: 0,
            cancelled: false,
        };
        this.nextTimerId += 1;
        if (duration === 0) {
            this.applyInterpolation(interpolation, 1);
            this.schedule(entry.node, "done", 0);
            return;
        }
        if (entry.kind !== "variable") {
            this.host.beginTimedWrite?.({
                target: entry.target,
                pointer: entry.kind === "pointer" ? entry.pointer : null,
                from: entry.from,
                to: entry.to,
                durationSeconds: duration,
                easing: entry.easing,
            });
        }
        this.interpolations.push(interpolation);
    }
    /**
     * Advances every running interpolation up to `endTime`.
     *
     * A finished one continues at the instant it finished rather than at the end
     * of the frame that noticed. The difference is invisible at 60fps and is a
     * whole step in a dry run, where it would put「2秒かけて動かしてから次」on the
     * timeline at the wrong second.
     */
    advanceInterpolations(endTime) {
        const deltaSeconds = endTime - this.timeSeconds;
        if (deltaSeconds < 0 || this.interpolations.length === 0)
            return;
        const finished = [];
        for (const entry of this.interpolations) {
            if (entry.cancelled)
                continue;
            entry.elapsed += deltaSeconds;
            const ratio = entry.duration === 0 ? 1 : entry.elapsed / entry.duration;
            // A zero-length step still has to retire an entry that has nothing left
            // to run, but it must not re-write a value that has not moved.
            if (deltaSeconds > 0 || ratio >= 1)
                this.applyInterpolation(entry, ratio);
            if (ratio >= 1) {
                finished.push({ entry, at: endTime - Math.max(0, entry.elapsed - entry.duration) });
            }
        }
        if (finished.length === 0)
            return;
        const done = new Set(finished.map((candidate) => candidate.entry));
        this.interpolations = this.interpolations.filter((entry) => !done.has(entry) && !entry.cancelled);
        finished.sort((left, right) => left.at - right.at);
        const resume = this.timeSeconds;
        for (const { entry, at } of finished) {
            const node = this.graph?.nodes[entry.node];
            if (!node)
                continue;
            const target = node.flows.get("done");
            if (!target)
                continue;
            this.timeSeconds = at;
            this.runFrom(target.node, target.socket);
        }
        this.timeSeconds = resume;
    }
    applyInterpolation(entry, ratio) {
        const eased = applyEasing(ratio, entry.easing);
        const value = mixValues(entry.from, entry.to, eased);
        if (entry.kind === "variable") {
            this.variables[entry.variableIndex] = value;
            return;
        }
        if (entry.kind === "pointer") {
            this.host.writePointer?.(entry.pointer, value);
            return;
        }
        if (entry.target)
            this.host.writeProperty?.(entry.target, value);
    }
    // -------------------------------------------------------------- helpers
    setOutput(node, socket, value) {
        this.outputs.set(outputKey(node, socket), value);
    }
    configurationString(node, key) {
        const entry = node.configuration.get(key)?.[0];
        return typeof entry === "string" && entry ? entry : null;
    }
    configurationIndex(node, key) {
        const entry = node.configuration.get(key)?.[0];
        return typeof entry === "number" && Number.isInteger(entry) && entry >= 0
            ? entry
            : null;
    }
    configurationFlag(node, key, fallback) {
        const entry = node.configuration.get(key)?.[0];
        return typeof entry === "boolean" ? entry : fallback;
    }
    configurationEventId(node) {
        const named = this.configurationString(node, "event");
        if (named)
            return named;
        const index = this.configurationIndex(node, "event");
        if (index === null)
            return null;
        return this.graph?.events[index] ?? null;
    }
    waitAllInputs(node) {
        const declared = this.configurationIndex(node, "inputFlows");
        if (declared !== null && declared > 0) {
            return Array.from({ length: declared }, (_unused, index) => String(index));
        }
        // Without a declared count the node waits for every input another node
        // actually targets, which is what the editor writes when it connects one.
        const inputs = new Set();
        for (const candidate of this.graph?.nodes ?? []) {
            for (const target of candidate.flows.values()) {
                if (target.node === node.index && target.socket !== "reset") {
                    inputs.add(target.socket);
                }
            }
        }
        return [...inputs].sort(compareFlowSocketNames);
    }
    actionTarget(node) {
        const entityId = this.configurationString(node, "entity");
        const targetKind = this.configurationString(node, "targetKind");
        const property = this.configurationString(node, "property");
        if (!entityId || !targetKind || !property)
            return null;
        const componentId = this.configurationString(node, "component");
        return {
            entityId,
            componentId: targetKind === "entity" ? null : componentId,
            targetKind,
            property,
            ...(this.configurationString(node, "shared") === "true"
                ? { shared: true }
                : {}),
            // Present-but-empty is meaningful — it names no Asset on purpose — so the
            // key's presence, not its value, is what marks an Asset-valued action.
            ...(node.configuration.has("asset")
                ? { assetId: this.configurationString(node, "asset") }
                : {}),
            ...(node.configuration.has("text")
                ? { text: this.configurationString(node, "text") ?? "" }
                : {}),
        };
    }
    record(nodeIndex, op, socket) {
        if (!this.visited.has(nodeIndex)) {
            this.visited.set(nodeIndex, this.timeSeconds);
        }
        this.trace.push({ timeSeconds: this.timeSeconds, nodeIndex, op, socket });
        if (this.trace.length > this.traceLimit)
            this.trace.shift();
    }
    report(nodeIndex, op, reason, detail) {
        const duplicate = this.issues.some((issue) => issue.nodeIndex === nodeIndex &&
            issue.reason === reason &&
            issue.detail === detail);
        if (duplicate)
            return;
        this.issues.push({
            graphIndex: this.graphIndex,
            nodeIndex,
            op,
            reason,
            ...(detail === undefined ? {} : { detail }),
        });
    }
}
function outputKey(node, socket) {
    return `${node}:${socket}`;
}
/** Orders `0`, `1`, `10` numerically, and anything else alphabetically. */
function compareFlowSocketNames(left, right) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    const leftIsNumber = Number.isInteger(leftNumber);
    const rightIsNumber = Number.isInteger(rightNumber);
    if (leftIsNumber && rightIsNumber)
        return leftNumber - rightNumber;
    if (leftIsNumber)
        return -1;
    if (rightIsNumber)
        return 1;
    return left.localeCompare(right);
}

/**
 * Runs a behavior graph forward without a renderer, and reports what happens.
 *
 * A graph that unfolds over time is impossible to review by reading it: the
 * author wants to know what happens at 35 seconds, not which node is wired to
 * which. The same dry run answers three separate needs, which is why it lives
 * here instead of inside any one of them:
 *
 * - the Editor's timeline view and its "what will Play do" diagnostics;
 * - the Model visual, which needs the clips a graph starts and when;
 * - the fixtures, which assert ordering and timing without a clock.
 *
 * Randomness is seeded so two runs of the same graph produce the same report.
 */
const DEFAULT_HORIZON_SECONDS = 120;
const DEFAULT_STEP_SECONDS = 1 / 30;
const MAX_STEPS = 20000;
/** Small deterministic generator, so a dry run is reproducible. */
function seededRandom(seed) {
    let state = seed >>> 0 || 1;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}
function dryRunInteractivityGraph(extension, options = {}) {
    const horizon = Math.max(0, options.horizonSeconds ?? DEFAULT_HORIZON_SECONDS);
    const step = Math.max(1 / 240, options.stepSeconds ?? DEFAULT_STEP_SECONDS);
    const entries = [];
    /** Timed changes already recorded, so their samples are not recorded again. */
    const timed = [];
    let engine = null;
    const at = () => engine?.currentTime ?? 0;
    const from = () => engine?.activeNodeIndex ?? -1;
    const host = {
        random: seededRandom(options.seed ?? 1),
        startAnimation: (request) => entries.push({
            kind: "animation-start",
            timeSeconds: at(),
            nodeIndex: from(),
            animationIndex: request.animationIndex,
            startTime: request.startTime,
            endTime: request.endTime,
            speed: request.speed,
        }),
        stopAnimation: (request) => entries.push({
            kind: "animation-stop",
            timeSeconds: at(),
            nodeIndex: from(),
            animationIndex: request.animationIndex,
        }),
        beginTimedWrite: (write) => {
            if (!write.target)
                return;
            timed.push({
                target: write.target,
                endsAt: at() + write.durationSeconds,
            });
            entries.push({
                kind: "property",
                timeSeconds: at(),
                nodeIndex: from(),
                target: write.target,
                value: write.to,
                durationSeconds: write.durationSeconds,
            });
        },
        writeProperty: (target, value) => {
            // A timed change is already recorded as one entry spanning its duration;
            // its per-frame samples would otherwise bury the timeline in duplicates.
            const covered = timed.some((entry) => entry.endsAt >= at() - 1e-6 &&
                entry.target.entityId === target.entityId &&
                entry.target.componentId === target.componentId &&
                entry.target.property === target.property);
            if (!covered) {
                entries.push({
                    kind: "property",
                    timeSeconds: at(),
                    nodeIndex: from(),
                    target,
                    value,
                    durationSeconds: 0,
                });
            }
            return true;
        },
        // No `writePointer`: nothing in Studio resolves a glTF Object Model pointer
        // yet, and a dry run that pretended otherwise would predict a Play the
        // author is not going to get. A caller with a resolver passes one in.
        emitEvent: (name) => entries.push({ kind: "event", timeSeconds: at(), nodeIndex: from(), name }),
        log: (entry) => entries.push({
            kind: "log",
            timeSeconds: at(),
            nodeIndex: entry.nodeIndex,
            message: entry.message,
        }),
        ...(options.readProperty ? { readProperty: options.readProperty } : {}),
        ...(options.readPointer ? { readPointer: options.readPointer } : {}),
    };
    engine = new InteractivityEngine(extension, host, options);
    if (options.entry === "interact") {
        engine.start();
        engine.interact();
    }
    else {
        engine.start();
    }
    const needsFrames = engine.usesTick;
    let steps = 0;
    while (engine.currentTime < horizon && steps < MAX_STEPS) {
        steps += 1;
        if (needsFrames) {
            engine.update(Math.min(step, horizon - engine.currentTime));
            continue;
        }
        const next = engine.nextScheduledTime();
        if (next === null)
            break;
        if (next > horizon)
            break;
        // Nothing continuous is running, so the clock can jump straight to the next
        // scheduled moment instead of simulating thousands of empty frames.
        engine.update(Math.max(next - engine.currentTime, 1e-6));
    }
    const truncated = engine.hasPendingWork;
    return {
        entries: [...entries].sort((left, right) => left.timeSeconds - right.timeSeconds),
        issues: engine.getIssues(),
        visitedNodes: engine.getVisitedNodes(),
        trace: engine.getTrace(),
        simulatedSeconds: engine.currentTime,
        truncated,
    };
}

/**
 * How far this runtime implements `KHR_interactivity`, and the timed report a
 * caller can get out of a graph without running a renderer.
 *
 * The behaviour itself lives in `./interactivity/`, which Studio's Play preview
 * and a published world both execute. This module is the classification and the
 * compatibility surface on top of it: the Editor asks here whether an operation
 * will run, and the Model visual asks here which clips a graph starts and when.
 *
 * Input is untrusted published JSON. The graph is never rewritten: an operation
 * this runtime does not implement stays in the canonical JSON and does not run.
 */
/** Operations that need something from the host before they change anything. */
const HOST_DEPENDENT_OPERATIONS = new Set([
    "animation/start",
    "animation/stop",
    "animation/stopAt",
    "event/send",
    "xrift/onInteract",
    "xrift/setProperty",
    "xrift/toggleProperty",
]);
/**
 * Operations the interpreter implements that no host implements yet.
 *
 * The glTF Object Model pointer needs a resolver Studio does not have, so a
 * `pointer/*` node still does nothing. Reporting it as unsupported keeps the
 * Editor badge honest: the alternative is a node that claims to work because
 * the interpreter would run it if anything were listening.
 */
const HOST_UNIMPLEMENTED_OPERATIONS = new Set([
    "pointer/get",
    "pointer/set",
    "pointer/interpolate",
]);
function getInteractivityRuntimeSupport(op) {
    if (HOST_UNIMPLEMENTED_OPERATIONS.has(op))
        return "ignored";
    const known = INTERACTIVITY_EXECUTED_OPERATIONS.has(op) ||
        INTERACTIVITY_VALUE_OPERATIONS.has(op);
    if (!known)
        return "ignored";
    return HOST_DEPENDENT_OPERATIONS.has(op) ? "conditional" : "executed";
}
/**
 * Every operation with a fixed classification, for callers that want the table.
 *
 * Derived from the interpreter's own sets so a newly implemented operation
 * cannot be executed while still being reported as unsupported.
 */
Object.freeze(Object.fromEntries([...INTERACTIVITY_EXECUTED_OPERATIONS, ...INTERACTIVITY_VALUE_OPERATIONS].map((op) => [op, getInteractivityRuntimeSupport(op)])));
/**
 * Turns the cues a graph produced into one plan per clip.
 *
 * Three surfaces play these — Studio's Scene View, Studio's Play preview, and
 * the code the compiler writes for a published world — and the rules are the
 * part that has to agree between them. They did not: the reading of "no end
 * time" as a loop is what makes an idle, a flag or a flock behave, and a
 * surface that got it wrong played the clip once and stopped, which looks like
 * the graph being broken rather than a rule being applied differently.
 *
 * The earliest start for a clip wins. Two graphs asking for the same clip is
 * one clip playing, from the first moment either of them asked — a mixer has
 * one action per clip, so there is no second playback to give the later cue.
 */
function planInteractivityAnimationCues(cues) {
    const byIndex = new Map();
    for (const cue of cues) {
        const known = byIndex.get(cue.animationIndex);
        if (known && known.delaySeconds <= cue.delaySeconds)
            continue;
        byIndex.set(cue.animationIndex, {
            index: cue.animationIndex,
            delaySeconds: cue.delaySeconds,
            // A start with no end time runs until something stops it, which on a
            // mixer means looping. A graph that named an end time wants one pass, and
            // so does one the same graph stops later.
            loop: (cue.endTime ?? null) === null && cue.stopSeconds === undefined,
            speed: typeof cue.speed === "number" &&
                Number.isFinite(cue.speed) &&
                cue.speed !== 0
                ? cue.speed
                : 1,
            startTime: typeof cue.startTime === "number" && Number.isFinite(cue.startTime)
                ? Math.max(0, cue.startTime)
                : 0,
        });
    }
    return [...byIndex.values()].sort((left, right) => left.index - right.index);
}
/**
 * Runs the selected graph forward from `event/onStart` and reports the clips.
 *
 * The name is kept from the static walk this replaced, because the Model visual
 * and the Editor both call it. What changed is that the answer now comes from
 * actually running the graph, so a clip started after a wait, inside a loop, or
 * behind a computed condition is reported like any other.
 */
function walkOnStart(value, options = {}) {
    const run = dryRunInteractivityGraph(value, {
        ...(options.horizonSeconds === undefined
            ? {}
            : { horizonSeconds: options.horizonSeconds }),
    });
    const cues = [];
    for (const entry of run.entries) {
        if (entry.kind === "animation-start") {
            cues.push({
                animationIndex: entry.animationIndex,
                delaySeconds: entry.timeSeconds,
                startTime: entry.startTime,
                endTime: entry.endTime,
                speed: entry.speed,
            });
            continue;
        }
        if (entry.kind !== "animation-stop")
            continue;
        // A stop applies to the most recent start of the same clip. Stopping at the
        // moment it starts means the clip never plays, which is how a graph cancels
        // a start it just made rather than leaving a zero-length playback behind.
        for (let index = cues.length - 1; index >= 0; index -= 1) {
            const cue = cues[index];
            if (!cue || cue.animationIndex !== entry.animationIndex)
                continue;
            if (cue.stopSeconds !== undefined)
                continue;
            if (entry.timeSeconds <= cue.delaySeconds) {
                cues.splice(index, 1);
            }
            else {
                cue.stopSeconds = entry.timeSeconds;
            }
            break;
        }
    }
    return {
        cues: cues.sort((left, right) => left.delaySeconds - right.delaySeconds ||
            left.animationIndex - right.animationIndex),
        issues: [...run.issues],
    };
}
/** Animations the graph starts on `event/onStart`, with their delays. */
function getKhrInteractivityOnStartAnimationCues(value) {
    return walkOnStart(value).cues;
}

const XRIFT_STUDIO_RUNTIME_FORMAT = "xrift-studio.runtime";
const XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION = "1.0.0";
const RUNTIME_TERRAIN_SIZE_MIN = 0.5;
const RUNTIME_TERRAIN_SIZE_MAX = 512;
const RUNTIME_TERRAIN_RESOLUTION_MIN = 9;
const RUNTIME_TERRAIN_RESOLUTION_MAX = 257;
const RUNTIME_TERRAIN_HEIGHT_ABSOLUTE_MAX = 256;
/**
 * Validates the runtime boundary before Three.js allocates geometry or reads
 * component fields. In particular, Terrain sample arrays are untrusted when a
 * manifest is loaded from a URL and must not be allowed to request arbitrary
 * buffer sizes.
 */
function isXriftRuntimeManifest(value) {
    if (!isRecord$1(value))
        return false;
    const scenes = value.scenes;
    const assets = value.assets;
    const entryScene = value.entryScene;
    return (value.format === XRIFT_STUDIO_RUNTIME_FORMAT &&
        value.schemaVersion === XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION &&
        value.generator === "xrift-studio" &&
        typeof value.compilerVersion === "string" &&
        typeof value.projectId === "string" &&
        (value.projectKind === "world" || value.projectKind === "item") &&
        typeof entryScene === "string" &&
        isRecord$1(scenes) &&
        isRecord$1(assets) &&
        Object.values(scenes).every(isRuntimeScene) &&
        Object.values(assets).every(isRuntimeAsset) &&
        isRuntimeDecoderPaths(value.decoders) &&
        (value.textFontDirectoryUrl === undefined ||
            typeof value.textFontDirectoryUrl === "string") &&
        isRuntimeScene(scenes[entryScene]));
}
function isRuntimeDecoderPaths(value) {
    if (value === undefined)
        return true;
    if (!isRecord$1(value))
        return false;
    return ((value.ktx2TranscoderPath === undefined ||
        typeof value.ktx2TranscoderPath === "string") &&
        (value.dracoDecoderPath === undefined ||
            typeof value.dracoDecoderPath === "string"));
}
function isRuntimeScene(value) {
    return (isRecord$1(value) &&
        typeof value.id === "string" &&
        typeof value.name === "string" &&
        isStringArray(value.rootEntityIds) &&
        isRecord$1(value.entities) &&
        Object.values(value.entities).every(isRuntimeEntity) &&
        (value.settings === undefined || isRecord$1(value.settings)));
}
function isRuntimeEntity(value) {
    return (isRecord$1(value) &&
        typeof value.id === "string" &&
        typeof value.name === "string" &&
        (value.parentId === null || typeof value.parentId === "string") &&
        isStringArray(value.children) &&
        typeof value.enabled === "boolean" &&
        isRuntimeTransform(value.transform) &&
        Array.isArray(value.components) &&
        value.components.every(isRuntimeComponent));
}
function isRuntimeTransform(value) {
    return (isRecord$1(value) &&
        isFiniteTuple(value.position, 3) &&
        isFiniteTuple(value.rotation, 3) &&
        isFiniteTuple(value.scale, 3));
}
function isRuntimeComponent(value) {
    if (!isRecord$1(value) ||
        typeof value.id !== "string" ||
        typeof value.type !== "string" ||
        typeof value.enabled !== "boolean") {
        return false;
    }
    if (value.type !== "mesh")
        return true;
    return (isRuntimeGeometry(value.geometry) &&
        Array.isArray(value.materialBindings) &&
        value.materialBindings.every(isRuntimeMaterialBinding) &&
        typeof value.castShadow === "boolean" &&
        typeof value.receiveShadow === "boolean");
}
function isRuntimeGeometry(value) {
    if (!isRecord$1(value) || typeof value.kind !== "string")
        return false;
    if (value.kind === "primitive") {
        return ["box", "sphere", "cylinder", "cone", "plane"].includes(value.primitive);
    }
    if (value.kind === "model")
        return typeof value.assetId === "string";
    if (value.kind !== "terrain")
        return false;
    return (isRuntimeTerrainSize(value.width) &&
        isRuntimeTerrainSize(value.depth) &&
        isRuntimeTerrainResolution(value.resolution) &&
        Array.isArray(value.heights) &&
        value.heights.length === value.resolution * value.resolution &&
        value.heights.every(isRuntimeTerrainHeight) &&
        (value.holes === undefined ||
            (Array.isArray(value.holes) &&
                value.holes.length === (value.resolution - 1) * (value.resolution - 1) &&
                value.holes.every((hole) => typeof hole === "boolean"))));
}
function isRuntimeMaterialBinding(value) {
    return (isRecord$1(value) &&
        typeof value.slot === "string" &&
        typeof value.materialAssetId === "string" &&
        (value.sourceNodeIndex === undefined || Number.isInteger(value.sourceNodeIndex)));
}
function isRuntimeAsset(value) {
    if (!isRecord$1(value) ||
        typeof value.id !== "string" ||
        typeof value.name !== "string" ||
        typeof value.kind !== "string") {
        return false;
    }
    switch (value.kind) {
        case "model":
            return typeof value.url === "string" && Number.isFinite(value.scale);
        case "texture":
        case "skybox":
        case "audio":
        case "font":
            return typeof value.url === "string";
        case "material":
        case "particle":
            return isRecord$1(value.properties);
        case "interactivity":
            return isRecord$1(value.extension);
        default:
            return false;
    }
}
function isRuntimeTerrainSize(value) {
    return (typeof value === "number" &&
        Number.isFinite(value) &&
        value >= RUNTIME_TERRAIN_SIZE_MIN &&
        value <= RUNTIME_TERRAIN_SIZE_MAX);
}
function isRuntimeTerrainResolution(value) {
    return (typeof value === "number" &&
        Number.isInteger(value) &&
        value >= RUNTIME_TERRAIN_RESOLUTION_MIN &&
        value <= RUNTIME_TERRAIN_RESOLUTION_MAX);
}
function isRuntimeTerrainHeight(value) {
    return (typeof value === "number" &&
        Number.isFinite(value) &&
        Math.abs(value) <= RUNTIME_TERRAIN_HEIGHT_ABSOLUTE_MAX);
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function isFiniteTuple(value, length) {
    return (Array.isArray(value) &&
        value.length === length &&
        value.every((entry) => typeof entry === "number" && Number.isFinite(entry)));
}
function isRecord$1(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

const {AmbientLight: AmbientLight$3,BackSide: BackSide$1,BoxGeometry: BoxGeometry$1,BufferGeometry: BufferGeometry$1,ClampToEdgeWrapping,Color: Color$4,ConeGeometry,CylinderGeometry,DirectionalLight: DirectionalLight$1,DoubleSide,EquirectangularReflectionMapping: EquirectangularReflectionMapping$2,FrontSide,Float32BufferAttribute,Group: Group$1,HemisphereLight: HemisphereLight$1,LoadingManager,Mesh: Mesh$1,MeshStandardMaterial,MirroredRepeatWrapping,PlaneGeometry,PointLight: PointLight$1,RectAreaLight: RectAreaLight$1,RepeatWrapping,SphereGeometry: SphereGeometry$1,SpotLight: SpotLight$1,ShaderMaterial: ShaderMaterial$1,SRGBColorSpace: SRGBColorSpace$4,Vector2: Vector2$1,Vector3: Vector3$2,Vector4,Texture,TextureLoader: TextureLoader$1} = await importShared('three');
const DEFAULT_KTX2_TRANSCODER_PATH = "https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master/basis/";
const DEFAULT_DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
class XriftThreeLoader {
  constructor(options = {}) {
    this.options = options;
    this.assetBaseUrl = options.assetBaseUrl;
    this.manager = options.manager ?? new LoadingManager();
    this.renderer = options.renderer;
  }
  async load(input) {
    if (typeof input !== "string" && !(input instanceof URL)) {
      return this.parse(input);
    }
    const manifestUrl = resolveUrl(String(input));
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      throw new Error(`xrift-studio runtime manifest could not be loaded (${response.status})`);
    }
    const manifest = await response.json();
    return this.parse(manifest, manifestUrl);
  }
  async parse(input, manifestUrl) {
    if (!isXriftRuntimeManifest(input)) {
      throw new Error("Unsupported xrift-studio runtime manifest");
    }
    const manifest = input;
    const entryScene = manifest.scenes[manifest.entryScene];
    if (!entryScene)
      throw new Error("Runtime entry scene is missing");
    const diagnostics = [];
    const assetBase = this.resolveAssetBase(manifestUrl);
    const ktx2TranscoderPath = this.resolveDecoderPath("ktx2", manifest, assetBase);
    const dracoDecoderPath = this.resolveDecoderPath("draco", manifest, assetBase);
    const textFontDirectoryUrl = manifest.textFontDirectoryUrl ? new URL(manifest.textFontDirectoryUrl, assetBase).toString() : void 0;
    const fontUrlsByAssetId = new Map(Object.values(manifest.assets).flatMap((asset) => asset.kind === "font" ? [[asset.id, new URL(asset.url, assetBase).toString()]] : []));
    const assets = Object.values(manifest.assets);
    const modelAssets = assets.filter((asset) => asset.kind === "model");
    const textureAssets = assets.filter((asset) => asset.kind === "texture" || asset.kind === "skybox");
    const [modelEntries, textureEntries] = await Promise.all([
      Promise.all(modelAssets.map(async (asset) => [
        asset.id,
        await this.loadModel(asset, assetBase, dracoDecoderPath)
      ])),
      Promise.all(textureAssets.map(async (asset) => [
        asset.id,
        await this.loadTexture(asset, assetBase, ktx2TranscoderPath)
      ]))
    ]);
    const models = new Map(modelEntries);
    const textures = new Map(textureEntries);
    const materials = this.createMaterials(manifest, textures, diagnostics);
    const entities = /* @__PURE__ */ new Map();
    const animations = [];
    const animationClipsByEntity = /* @__PURE__ */ new Map();
    const interactionAnimationCuesByEntity = /* @__PURE__ */ new Map();
    const spawnPoints = /* @__PURE__ */ new Map();
    for (const entity of Object.values(entryScene.entities)) {
      const group = new Group$1();
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
      if (!group)
        continue;
      const parent = entity.parentId ? entities.get(entity.parentId) : void 0;
      (parent ?? null)?.add(group);
    }
    const root = new Group$1();
    root.name = entryScene.name;
    root.userData.xriftStudioSceneId = entryScene.id;
    for (const rootId of entryScene.rootEntityIds) {
      const entity = entities.get(rootId);
      if (entity)
        root.add(entity);
    }
    for (const entity of Object.values(entryScene.entities)) {
      const group = entities.get(entity.id);
      if (!group)
        continue;
      for (const component of entity.components) {
        if (!component.enabled)
          continue;
        const object = this.createComponentObject({
          component,
          entity,
          manifest,
          textFontDirectoryUrl,
          fontUrlsByAssetId,
          models,
          materials,
          textures,
          animations,
          animationClipsByEntity,
          interactionAnimationCuesByEntity,
          diagnostics
        });
        if (object) {
          group.add(object);
          if (component.type === "spawn-point" || isRuntimeSpawnPointComponent(component)) {
            spawnPoints.set(component.id, object);
          }
        }
      }
      const billboardWrapper = group.children.find((child) => child.userData.xriftRuntimeBillboardY === true);
      if (billboardWrapper) {
        for (const child of [...group.children]) {
          if (child === billboardWrapper)
            continue;
          billboardWrapper.add(child);
        }
      }
    }
    return {
      root,
      assetBaseUrl: assetBase,
      animations,
      animationClipsByEntity,
      interactionAnimationCuesByEntity,
      entities,
      spawnPoints,
      textures,
      diagnostics,
      manifest
    };
  }
  resolveAssetBase(manifestUrl) {
    if (this.assetBaseUrl)
      return new URL(this.assetBaseUrl, browserBaseUrl());
    if (manifestUrl)
      return new URL(".", resolveUrl(String(manifestUrl)));
    return browserBaseUrl();
  }
  /**
   * Decoder directory for one compressed format.
   *
   * Caller options win, then the directory the manifest says the world ships
   * itself, and only then the public default. A published world cannot reach a
   * CDN, so a manifest that names its own files must never be overridden by
   * the default.
   */
  resolveDecoderPath(kind, manifest, assetBase) {
    const option = kind === "ktx2" ? this.options.ktx2TranscoderPath : this.options.dracoDecoderPath;
    if (option)
      return option;
    const declared = kind === "ktx2" ? manifest.decoders?.ktx2TranscoderPath : manifest.decoders?.dracoDecoderPath;
    if (declared)
      return new URL(declared, assetBase).toString();
    return kind === "ktx2" ? DEFAULT_KTX2_TRANSCODER_PATH : DEFAULT_DRACO_DECODER_PATH;
  }
  async loadModel(asset, assetBase, dracoDecoderPath) {
    const url = new URL(asset.url, assetBase).toString();
    if (asset.sourceFormat === "obj") {
      const root = await new OBJLoader(this.manager).loadAsync(url);
      root.scale.multiplyScalar(asset.scale);
      return {
        root,
        animations: [],
        interactionAnimationCues: [],
        sourceMaterials: /* @__PURE__ */ new Map()
      };
    }
    const loader = new GLTFLoader(this.manager);
    const dracoLoader = new DRACOLoader(this.manager).setDecoderPath(dracoDecoderPath);
    loader.setDRACOLoader(dracoLoader);
    if (asset.openBrush?.renderer === "three-icosa") {
      const { GLTFGoogleTiltBrushMaterialExtension } = await __vitePreload(async () => { const { GLTFGoogleTiltBrushMaterialExtension } = await import('./three-icosa.module-o7xN4AQ5.js');return { GLTFGoogleTiltBrushMaterialExtension }},true              ?__vite__mapDeps([0,1]):void 0);
      loader.register((parser) => new GLTFGoogleTiltBrushMaterialExtension(parser, asset.openBrush.brushBaseUrl));
    }
    let gltf;
    try {
      gltf = await loader.loadAsync(url);
    } finally {
      dracoLoader.dispose();
    }
    tagSourceMaterialIndices(gltf);
    stampObjectTimeUniforms(gltf.scene);
    gltf.scene.scale.multiplyScalar(asset.scale);
    return {
      root: gltf.scene,
      animations: gltf.animations,
      interactionAnimationCues: getKhrInteractivityOnStartAnimationCues(gltf.parser.json?.extensions?.KHR_interactivity),
      sourceMaterials: collectSourceMaterials(gltf.scene)
    };
  }
  async loadTexture(asset, assetBase, ktx2TranscoderPath) {
    const url = new URL(asset.url, assetBase).toString();
    const texture = asset.kind === "texture" && asset.sourceFormat === "ktx2" ? await this.loadKtx2Texture(url, ktx2TranscoderPath) : asset.kind === "skybox" && asset.sourceFormat === "hdr" ? await new RGBELoader(this.manager).loadAsync(url) : asset.kind === "skybox" && asset.sourceFormat === "exr" ? await new EXRLoader(this.manager).loadAsync(url) : await new TextureLoader$1(this.manager).loadAsync(url);
    texture.flipY = asset.flipY;
    if (asset.kind === "texture") {
      if (asset.colorSpace === "srgb")
        texture.colorSpace = SRGBColorSpace$4;
      texture.wrapS = runtimeTextureWrapping(asset.sampler.wrapS);
      texture.wrapT = runtimeTextureWrapping(asset.sampler.wrapT);
    } else {
      texture.mapping = EquirectangularReflectionMapping$2;
    }
    return texture;
  }
  async loadKtx2Texture(url, ktx2TranscoderPath) {
    if (!this.renderer) {
      throw new Error("KTX2 texture loading requires XriftThreeLoaderOptions.renderer");
    }
    const loader = new KTX2Loader(this.manager).setTranscoderPath(ktx2TranscoderPath).detectSupport(this.renderer);
    try {
      return await loader.loadAsync(url);
    } finally {
      loader.dispose();
    }
  }
  createMaterials(manifest, textures, diagnostics) {
    const materials = /* @__PURE__ */ new Map();
    for (const asset of Object.values(manifest.assets)) {
      if (asset.kind !== "material")
        continue;
      if (asset.shader?.kind === "classic-r3f") {
        const material2 = createRuntimeClassicShaderMaterial(asset.shader, textures, diagnostics, asset.id);
        material2.name = asset.name;
        materials.set(asset.id, material2);
        continue;
      }
      const properties = asset.properties;
      const pbr = asRecord$1(properties.pbrMetallicRoughness);
      const baseColor = asNumberArray(pbr?.baseColorFactor, 4) ?? [1, 1, 1, 1];
      const [red = 1, green = 1, blue = 1, alpha = 1] = baseColor;
      const material = new MeshStandardMaterial({
        color: new Color$4(red, green, blue),
        opacity: alpha,
        transparent: properties.alphaMode === "BLEND" || alpha < 1,
        alphaTest: properties.alphaMode === "MASK" && typeof properties.alphaCutoff === "number" ? properties.alphaCutoff : 0,
        metalness: typeof pbr?.metallicFactor === "number" ? pbr.metallicFactor : 0,
        roughness: typeof pbr?.roughnessFactor === "number" ? pbr.roughnessFactor : 1,
        ...properties.doubleSided === true ? { side: DoubleSide } : {}
      });
      const baseColorTexture = asRecord$1(pbr?.baseColorTexture);
      const resolveTexture = (textureInfo) => {
        const textureId = textureInfo?.textureAssetId;
        if (typeof textureId !== "string" || !textureInfo)
          return null;
        const sourceTexture = textures.get(textureId);
        const resolved = sourceTexture ? configureMaterialTexture(sourceTexture, textureInfo) : null;
        if (!resolved) {
          diagnostics.push({
            severity: "warning",
            code: "texture-not-loaded",
            message: `Material texture could not be loaded: ${textureId}`,
            assetId: asset.id
          });
        }
        return resolved;
      };
      material.map = resolveTexture(baseColorTexture);
      const metallicRoughnessTexture = asRecord$1(pbr?.metallicRoughnessTexture);
      const resolvedMetallicRoughness = resolveTexture(metallicRoughnessTexture);
      material.metalnessMap = resolvedMetallicRoughness;
      material.roughnessMap = resolvedMetallicRoughness;
      const normalTexture = asRecord$1(properties.normalTexture);
      material.normalMap = resolveTexture(normalTexture);
      if (typeof normalTexture?.scale === "number") {
        material.normalScale.set(normalTexture.scale, normalTexture.scale);
      }
      const occlusionTexture = asRecord$1(properties.occlusionTexture);
      material.aoMap = resolveTexture(occlusionTexture);
      if (typeof occlusionTexture?.strength === "number") {
        material.aoMapIntensity = occlusionTexture.strength;
      }
      material.emissiveMap = resolveTexture(asRecord$1(properties.emissiveTexture));
      const emissive = asNumberArray(properties.emissiveFactor, 3);
      if (emissive) {
        const [red2 = 0, green2 = 0, blue2 = 0] = emissive;
        material.emissive = new Color$4(red2, green2, blue2);
      }
      material.name = asset.name;
      materials.set(asset.id, material);
    }
    return materials;
  }
  createComponentObject(input) {
    const { component } = input;
    if (component.type === "mesh") {
      if (component.geometry.kind === "primitive") {
        const material = materialForBinding(component, input.materials);
        const mesh = new Mesh$1(createPrimitiveGeometry(component.geometry.primitive), material ?? new MeshStandardMaterial({ color: 12568533 }));
        mesh.castShadow = component.castShadow;
        mesh.receiveShadow = component.receiveShadow;
        mesh.userData.xriftStudioComponentId = component.id;
        if (component.maxDistance !== void 0) {
          mesh.userData.xriftRuntimeMaxDistance = component.maxDistance;
        }
        return mesh;
      }
      if (component.geometry.kind === "terrain") {
        const material = materialForBinding(component, input.materials);
        const mesh = new Mesh$1(createTerrainGeometry(component.geometry), material ?? new MeshStandardMaterial({ color: 7048782 }));
        mesh.castShadow = component.castShadow;
        mesh.receiveShadow = component.receiveShadow;
        mesh.userData.xriftStudioComponentId = component.id;
        if (component.maxDistance !== void 0) {
          mesh.userData.xriftRuntimeMaxDistance = component.maxDistance;
        }
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
          assetId: component.geometry.assetId
        });
        return null;
      }
      const instance = selectRuntimeSourceNode(clone(loaded.root), component.geometry.sourceNodeIndex);
      applyModelMaterials(instance, loaded, component, input.manifest, input.materials);
      applyModelPose(instance, component);
      instance.traverse((object) => {
        if (object instanceof Mesh$1) {
          object.castShadow = component.castShadow;
          object.receiveShadow = component.receiveShadow;
        }
      });
      input.animations.push(...loaded.animations);
      if (loaded.animations.length > 0) {
        input.animationClipsByEntity.set(input.entity.id, [
          ...input.animationClipsByEntity.get(input.entity.id) ?? [],
          ...loaded.animations
        ]);
      }
      if (loaded.interactionAnimationCues.length > 0) {
        input.interactionAnimationCuesByEntity.set(input.entity.id, loaded.interactionAnimationCues);
      }
      instance.userData.xriftStudioComponentId = component.id;
      if (component.maxDistance !== void 0) {
        instance.userData.xriftRuntimeMaxDistance = component.maxDistance;
      }
      return instance;
    }
    if (component.type === "vegetation-wind")
      return null;
    if (component.type === "light")
      return createLight(component);
    if (component.type === "text") {
      const background = component.background ?? DEFAULT_TEXT_BACKGROUND;
      const backgroundTexture = background.mode === "texture" && background.textureAssetId ? input.textures.get(background.textureAssetId) ?? null : null;
      if (background.mode === "texture" && !backgroundTexture) {
        input.diagnostics.push({
          severity: "warning",
          code: "text-background-texture-missing",
          message: `Text background texture could not be loaded: ${background.textureAssetId ?? "(unset)"}`,
          entityId: input.entity.id,
          componentId: component.id,
          ...background.textureAssetId ? { assetId: background.textureAssetId } : {}
        });
      }
      const panel = new XriftTextPanelObject();
      const fontAssetId = component.fontAssetId;
      const fontUrl = fontAssetId ? input.fontUrlsByAssetId.get(fontAssetId) : void 0;
      if (fontAssetId && !fontUrl) {
        input.diagnostics.push({
          severity: "warning",
          code: "text-font-asset-missing",
          message: `Text font asset could not be resolved: ${fontAssetId}`,
          entityId: input.entity.id,
          componentId: component.id,
          assetId: fontAssetId
        });
      }
      panel.update(runtimeTextPanelConfig(component, input.textFontDirectoryUrl, fontUrl), backgroundTexture);
      panel.userData.xriftStudioComponentId = component.id;
      return panel;
    }
    if (component.type === "image") {
      const textureAssetId = component.textureAssetId;
      const texture = textureAssetId ? input.textures.get(textureAssetId) ?? null : null;
      if (textureAssetId && !texture) {
        input.diagnostics.push({
          severity: "warning",
          code: "image-texture-missing",
          message: `Image texture could not be loaded: ${textureAssetId}`,
          entityId: input.entity.id,
          componentId: component.id,
          assetId: textureAssetId
        });
      }
      const quad = new XriftImageQuadObject();
      quad.update(runtimeImageQuadConfig(component), texture, false);
      quad.userData.xriftStudioComponentId = component.id;
      return quad;
    }
    if (component.type === "xrift-component" && component.schemaId !== "xrift.spawn-point") {
      if (isRuntimeOfficialWrapperComponent(component.schemaId) || isRuntimeOfficialLeafComponent(component.schemaId)) {
        return null;
      }
      if (component.schemaId === "xrift.skybox") {
        return createRuntimeSkyboxComponent(component);
      }
      if (component.schemaId === "xrift.mirror") {
        return createRuntimeMirrorComponent(component);
      }
      if (component.schemaId === "xrift.billboard-y") {
        return createRuntimeBillboardComponent(component);
      }
    }
    if (isRuntimeSpawnPointComponent(component)) {
      const marker = new Group$1();
      const properties = component.properties;
      const position = asNumberArray(properties.position, 3) ?? [0, 0, 0];
      const yaw = typeof properties.yaw === "number" && Number.isFinite(properties.yaw) ? properties.yaw : 0;
      marker.name = `spawn-point:${component.id}`;
      marker.position.fromArray(position);
      marker.rotation.y = yaw * Math.PI / 180;
      marker.userData.xriftStudioComponentId = component.id;
      marker.userData.xriftStudioComponent = component;
      marker.userData.xriftRuntimeSpawnPoint = true;
      return marker;
    }
    if (component.type === "spawn-point" || component.type === "collider" || component.type === "rigid-body") {
      const marker = new Group$1();
      marker.name = `${component.type}:${component.id}`;
      marker.userData.xriftStudioComponentId = component.id;
      marker.userData.xriftStudioComponent = component;
      return marker;
    }
    input.diagnostics.push({
      severity: "warning",
      code: "component-three-adapter-missing",
      message: `Three.js adapter is not implemented for ${component.type}`,
      entityId: input.entity.id,
      componentId: component.id
    });
    return null;
  }
}
const RUNTIME_OFFICIAL_SKYBOX_VERTEX_SHADER = `
varying vec3 vWorldPosition;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const RUNTIME_OFFICIAL_SKYBOX_FRAGMENT_SHADER = `
uniform vec3 topColor;
uniform vec3 bottomColor;
uniform float offset;
uniform float exponent;
varying vec3 vWorldPosition;
void main() {
  float h = normalize(vWorldPosition + offset).y;
  float t = max(pow(max(h, 0.0), max(exponent, 0.01)), 0.0);
  gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
}
`;
const RUNTIME_OFFICIAL_MIRROR_VERTEX_SHADER = `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const RUNTIME_OFFICIAL_MIRROR_FRAGMENT_SHADER = `
uniform vec3 baseColor;
uniform vec3 edgeColor;
uniform float fresnelPower;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - max(dot(viewDir, vWorldNormal), 0.0), fresnelPower);
  vec3 color = mix(baseColor, edgeColor, fresnel);
  gl_FragColor = vec4(color, 1.0);
}
`;
function createRuntimeSkyboxComponent(component) {
  const properties = component.properties;
  const topColor = colorNumberOr(properties.topColor, 8900331);
  const bottomColor = colorNumberOr(properties.bottomColor, 16777215);
  const offset = runtimeNumberOr(properties.offset, 0, -1e3);
  const exponent = runtimeNumberOr(properties.exponent, 1, 0.01);
  const material = new ShaderMaterial$1({
    vertexShader: RUNTIME_OFFICIAL_SKYBOX_VERTEX_SHADER,
    fragmentShader: RUNTIME_OFFICIAL_SKYBOX_FRAGMENT_SHADER,
    uniforms: {
      topColor: { value: new Color$4(topColor) },
      bottomColor: { value: new Color$4(bottomColor) },
      offset: { value: offset },
      exponent: { value: exponent }
    },
    side: BackSide$1,
    depthWrite: false
  });
  const mesh = new Mesh$1(new SphereGeometry$1(500, 32, 15), material);
  mesh.name = `skybox:${component.id}`;
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.userData.xriftStudioComponentId = component.id;
  mesh.userData.xriftRuntimeSkybox = true;
  return mesh;
}
function createRuntimeMirrorComponent(component) {
  const properties = component.properties;
  const size = asNumberArray(properties.size, 2) ?? [8, 5];
  const color = colorNumberOr(properties.color, 13421772);
  const textureResolution = Math.max(64, Math.min(2048, Math.round(runtimeNumberOr(properties.textureResolution, 512, 1))));
  const maxSize = Math.max(size[0] ?? 1, size[1] ?? 1, 1e-3);
  const textureWidth = Math.max(1, Math.round((size[0] ?? 1) / maxSize * textureResolution));
  const textureHeight = Math.max(1, Math.round((size[1] ?? 1) / maxSize * textureResolution));
  const reflector = new Reflector(new PlaneGeometry(size[0], size[1]), {
    clipBias: 3e-3,
    textureWidth,
    textureHeight,
    color,
    multisample: 0
  });
  reflector.name = `mirror-reflector:${component.id}`;
  reflector.userData.xriftStudioComponentId = component.id;
  reflector.userData.xriftRuntimeMirror = reflector;
  const fallback = new Mesh$1(new PlaneGeometry(size[0], size[1]), new ShaderMaterial$1({
    vertexShader: RUNTIME_OFFICIAL_MIRROR_VERTEX_SHADER,
    fragmentShader: RUNTIME_OFFICIAL_MIRROR_FRAGMENT_SHADER,
    uniforms: {
      baseColor: { value: new Color$4(color) },
      edgeColor: { value: new Color$4(16777215) },
      fresnelPower: { value: 3 }
    }
  }));
  fallback.name = `mirror-fallback:${component.id}`;
  fallback.visible = false;
  fallback.userData.xriftRuntimeMirrorFallback = true;
  const group = new Group$1();
  group.name = `mirror:${component.id}`;
  group.add(reflector, fallback);
  group.userData.xriftStudioComponentId = component.id;
  group.userData.xriftRuntimeMirror = reflector;
  group.userData.xriftRuntimeMirrorFallback = fallback;
  group.userData.xriftRuntimeMirrorLodDistance = runtimeNumberOr(properties.lodDistance, 10, 0);
  applyRuntimeComponentTransform(group, properties);
  return group;
}
function createRuntimeBillboardComponent(component) {
  const group = new Group$1();
  group.name = `billboard-y:${component.id}`;
  group.userData.xriftStudioComponentId = component.id;
  group.userData.xriftRuntimeBillboardY = true;
  applyRuntimeComponentTransform(group, component.properties);
  return group;
}
function applyRuntimeComponentTransform(object, properties) {
  const position = asNumberArray(properties.position, 3);
  const rotation = asNumberArray(properties.rotation, 3);
  if (position)
    object.position.fromArray(position);
  if (rotation)
    object.rotation.fromArray(rotation);
  if (typeof properties.scale === "number" && Number.isFinite(properties.scale)) {
    object.scale.setScalar(properties.scale);
  } else {
    const scale = asNumberArray(properties.scale, 3);
    if (scale)
      object.scale.fromArray(scale);
  }
}
function colorNumberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function runtimeNumberOr(value, fallback, minimum) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum ? value : fallback;
}
function isRuntimeSpawnPointComponent(component) {
  return component.type === "xrift-component" && component.schemaId === "xrift.spawn-point";
}
function isRuntimeOfficialWrapperComponent(schemaId) {
  return schemaId === "xrift.interactable" || schemaId === "xrift.grabbable" || schemaId === "xrift.text-input";
}
function isRuntimeOfficialLeafComponent(schemaId) {
  return schemaId === "xrift.video-screen" || schemaId === "xrift.video-player" || schemaId === "xrift.live-video-player" || schemaId === "xrift.video-180-sphere" || schemaId === "xrift.screen-share-display" || schemaId === "xrift.tag-board" || schemaId === "xrift.entry-log-board" || schemaId === "xrift.portal";
}
function createRuntimeClassicShaderMaterial(shader, textures, diagnostics, assetId) {
  const variant = shader.variants.find((candidate) => !candidate.meshNameIncludes) ?? shader.variants[0];
  const uniforms = Object.fromEntries(Object.entries(shader.uniforms).map(([name, uniform]) => {
    if (uniform.kind === "texture") {
      const texture = textures.get(uniform.textureAssetId)?.clone() ?? null;
      if (!texture && uniform.textureAssetId) {
        diagnostics.push({
          severity: "warning",
          code: "custom-shader-texture-not-loaded",
          message: `Custom Shader texture could not be loaded: ${uniform.textureAssetId}`,
          assetId
        });
      }
      return [name, { value: texture }];
    }
    if (uniform.kind === "color") {
      return [name, { value: new Color$4(uniform.value) }];
    }
    if (uniform.kind === "vector") {
      const value = uniform.value;
      const vector = value.length === 2 ? new Vector2$1(value[0] ?? 0, value[1] ?? 0) : value.length === 3 ? new Vector3$2(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0) : new Vector4(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 0);
      return [name, { value: vector }];
    }
    return [name, { value: uniform.value }];
  }));
  const material = new ShaderMaterial$1({
    name: shader.sourceModulePath,
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    uniforms,
    defines: variant?.defines ?? {},
    side: variant?.side === "back" ? BackSide$1 : variant?.side === "double" ? DoubleSide : FrontSide,
    transparent: variant?.transparent ?? false,
    depthWrite: variant?.depthWrite ?? true
  });
  const timeUniforms = detectTimeUniforms(shader);
  if (timeUniforms.length > 0) {
    material.userData.xriftTimeUniforms = timeUniforms;
  }
  return material;
}
function runtimeTextureWrapping(value) {
  if (value === "repeat")
    return RepeatWrapping;
  if (value === "mirrored-repeat")
    return MirroredRepeatWrapping;
  return ClampToEdgeWrapping;
}
function configureMaterialTexture(source, textureInfo) {
  const texture = source.clone();
  const texCoord = textureInfo.texCoord;
  if (typeof texCoord === "number" && Number.isInteger(texCoord) && texCoord >= 0) {
    texture.channel = texCoord;
  }
  const transform = asRecord$1(textureInfo.transform);
  const offset = asNumberArray(transform?.offset, 2);
  const scale = asNumberArray(transform?.scale, 2);
  if (offset)
    texture.offset.set(offset[0] ?? 0, offset[1] ?? 0);
  if (scale)
    texture.repeat.set(scale[0] ?? 1, scale[1] ?? 1);
  if (typeof transform?.rotation === "number") {
    texture.rotation = transform.rotation;
  }
  texture.needsUpdate = true;
  return texture;
}
function disposeXriftLoadResult(result) {
  const geometries = /* @__PURE__ */ new Set();
  const materials = /* @__PURE__ */ new Set();
  const textures = /* @__PURE__ */ new Set();
  const reflectors = /* @__PURE__ */ new Set();
  const textPanels = /* @__PURE__ */ new Set();
  result.root.traverse((object) => {
    if (object instanceof Reflector)
      reflectors.add(object);
    if (object instanceof XriftTextPanelObject)
      textPanels.add(object);
    if (!(object instanceof Mesh$1))
      return;
    geometries.add(object.geometry);
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of entries) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof Texture)
          textures.add(value);
      }
    }
  });
  for (const texture of result.textures.values())
    textures.add(texture);
  for (const geometry of geometries)
    geometry.dispose();
  for (const material of materials)
    material.dispose();
  for (const texture of textures)
    texture.dispose();
  for (const reflector of reflectors)
    reflector.dispose();
  for (const panel of textPanels)
    panel.dispose();
}
function createPrimitiveGeometry(primitive) {
  if (primitive === "box")
    return new BoxGeometry$1();
  if (primitive === "sphere")
    return new SphereGeometry$1(0.5, 32, 20);
  if (primitive === "cylinder")
    return new CylinderGeometry(0.5, 0.5, 1, 32);
  if (primitive === "cone")
    return new ConeGeometry(0.5, 1, 32);
  return new PlaneGeometry(1, 1);
}
function createTerrainGeometry(terrain) {
  const resolution = Math.max(2, Math.floor(terrain.resolution));
  const positions = new Float32Array(resolution * resolution * 3);
  const indices = [];
  const xStep = terrain.width / (resolution - 1);
  const zStep = terrain.depth / (resolution - 1);
  for (let z = 0; z < resolution; z += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const vertex = z * resolution + x;
      const offset = vertex * 3;
      positions[offset] = x * xStep - terrain.width / 2;
      positions[offset + 1] = terrain.heights[vertex] ?? 0;
      positions[offset + 2] = z * zStep - terrain.depth / 2;
    }
  }
  for (let z = 0; z < resolution - 1; z += 1) {
    for (let x = 0; x < resolution - 1; x += 1) {
      const cell = z * (resolution - 1) + x;
      if (terrain.holes?.[cell])
        continue;
      const topLeft = z * resolution + x;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + resolution;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }
  const geometry = new BufferGeometry$1();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function materialForBinding(component, materials) {
  const first = component.materialBindings[0];
  return first ? materials.get(first.materialAssetId) : void 0;
}
function applyModelMaterials(root, loaded, component, manifest, materials) {
  const asset = component.geometry.kind === "model" ? manifest.assets[component.geometry.assetId] : void 0;
  if (!asset || asset.kind !== "model")
    return;
  const bindingBySlot = new Map(component.materialBindings.map((binding) => [
    `${binding.sourceNodeIndex ?? "global"}:${binding.slot}`,
    binding.materialAssetId
  ]));
  root.traverse((object) => {
    if (!(object instanceof Mesh$1))
      return;
    const original = Array.isArray(object.material) ? object.material : [object.material];
    const next = original.map((material, index) => {
      const taggedIndex = material.userData.xriftSourceMaterialIndex;
      const slot = (typeof taggedIndex === "number" ? asset.materialSlots.find((candidate) => candidate.sourceMaterialIndex === taggedIndex) : void 0) ?? asset.materialSlots.find((candidate) => candidate.name === material.name) ?? asset.materialSlots.find((candidate) => candidate.sourceMaterialIndex === index);
      const sourceNodeIndex = nearestSourceNodeIndex(object);
      const materialId = slot ? (sourceNodeIndex === void 0 ? void 0 : bindingBySlot.get(`${sourceNodeIndex}:${slot.slot}`)) ?? bindingBySlot.get(`global:${slot.slot}`) : void 0;
      const materialAsset = materialId ? manifest.assets[materialId] : void 0;
      if (materialAsset?.kind === "material" && materialAsset.shader?.kind === "openbrush") {
        return loaded.sourceMaterials.get(materialAsset.shader.sourceMaterialIndex)?.clone() ?? material;
      }
      return (materialId ? materials.get(materialId) : void 0) ?? material;
    });
    object.material = Array.isArray(object.material) ? next : next[0] ?? object.material;
  });
}
function collectSourceMaterials(root) {
  const materials = /* @__PURE__ */ new Map();
  root.traverse((object) => {
    if (!(object instanceof Mesh$1))
      return;
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of entries) {
      const sourceIndex = material.userData.xriftSourceMaterialIndex;
      if (typeof sourceIndex === "number" && Number.isInteger(sourceIndex) && sourceIndex >= 0 && !materials.has(sourceIndex)) {
        materials.set(sourceIndex, material);
      }
    }
  });
  return materials;
}
function tagSourceMaterialIndices(gltf) {
  const parser = gltf.parser;
  gltf.scene.traverse((object) => {
    const sourceNodeIndex = parser.associations.get(object)?.nodes;
    if (typeof sourceNodeIndex === "number" && Number.isInteger(sourceNodeIndex)) {
      object.userData.xriftSourceNodeIndex = sourceNodeIndex;
    }
    if (!(object instanceof Mesh$1))
      return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const meshIndex = parser.associations.get(object)?.meshes;
    const primitiveMaterialIndices = typeof meshIndex === "number" && Number.isInteger(meshIndex) ? parser.json?.meshes?.[meshIndex]?.primitives?.map((primitive) => primitive.material).filter((index) => typeof index === "number" && Number.isInteger(index) && index >= 0) ?? [] : [];
    materials.forEach((material, materialOrder) => {
      const sourceIndex = parser.associations.get(material)?.materials ?? primitiveMaterialIndices[materialOrder] ?? (materials.length === 1 ? primitiveMaterialIndices[0] : void 0);
      if (typeof sourceIndex === "number") {
        material.userData.xriftSourceMaterialIndex = sourceIndex;
      }
    });
  });
}
function selectRuntimeSourceNode(root, sourceNodeIndex) {
  if (sourceNodeIndex === void 0)
    return root;
  let selected;
  root.traverse((candidate) => {
    if (selected === void 0 && candidate.userData.xriftSourceNodeIndex === sourceNodeIndex) {
      selected = candidate;
    }
  });
  if (!selected) {
    const missing = new Group$1();
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
function applyModelPose(root, component) {
  if (!component.modelPose)
    return;
  root.traverse((object) => {
    const sourceNodeIndex = object.userData.xriftSourceNodeIndex;
    const nodeTransform = typeof sourceNodeIndex === "number" ? component.modelPose?.nodes?.[String(sourceNodeIndex)] : void 0;
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
      if (nodeTransform.visible === false)
        object.visible = false;
    }
    const rotation = component.modelPose?.bones[object.name];
    if (rotation) {
      object.rotation.x += rotation[0];
      object.rotation.y += rotation[1];
      object.rotation.z += rotation[2];
    }
    if (!(object instanceof Mesh$1) || !object.morphTargetDictionary || !object.morphTargetInfluences) {
      return;
    }
    for (const [name, weight] of Object.entries(component.modelPose?.morphTargets ?? {})) {
      const index = object.morphTargetDictionary[name];
      if (index !== void 0)
        object.morphTargetInfluences[index] = weight;
    }
  });
  root.updateMatrixWorld(true);
}
function nearestSourceNodeIndex(object) {
  let current = object;
  while (current) {
    const value = current.userData.xriftSourceNodeIndex;
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      return value;
    }
    current = current.parent;
  }
  return void 0;
}
function runtimeTextPanelConfig(component, fontDirectoryUrl, fontUrl) {
  return {
    ...fontDirectoryUrl === void 0 ? {} : { fontDirectoryUrl },
    ...fontUrl === void 0 ? {} : { fontUrl },
    text: component.text,
    color: component.color,
    fontSize: component.fontSize,
    ...component.maxWidth === void 0 ? {} : { maxWidth: component.maxWidth },
    anchorX: component.anchorX,
    anchorY: component.anchorY,
    outlineWidth: component.outlineWidth,
    outlineColor: component.outlineColor,
    ...component.fontId === void 0 ? {} : { fontId: component.fontId },
    ...component.fontWeight === void 0 ? {} : { fontWeight: component.fontWeight },
    ...component.textAlign === void 0 ? {} : { textAlign: component.textAlign },
    ...component.lineHeight === void 0 ? {} : { lineHeight: component.lineHeight },
    ...component.letterSpacing === void 0 ? {} : { letterSpacing: component.letterSpacing },
    ...component.background === void 0 ? {} : { background: component.background }
  };
}
function runtimeImageQuadConfig(component) {
  return {
    width: component.width,
    ...component.height === void 0 ? {} : { height: component.height },
    anchorX: component.anchorX,
    anchorY: component.anchorY,
    color: component.color,
    opacity: component.opacity,
    alphaMode: component.alphaMode,
    doubleSided: component.doubleSided,
    lit: component.lit
  };
}
function createLight(component) {
  let light;
  if (component.lightType === "ambient") {
    light = new AmbientLight$3(component.color, component.intensity);
  } else if (component.lightType === "hemisphere") {
    light = new HemisphereLight$1(component.color, component.groundColor ?? "#20242d", component.intensity);
  } else if (component.lightType === "point") {
    light = new PointLight$1(component.color, component.intensity, component.distance ?? 0, component.decay ?? 2);
  } else if (component.lightType === "spot") {
    const spot = new SpotLight$1(component.color, component.intensity, component.distance ?? 0, component.angle ?? Math.PI / 3, component.penumbra ?? 0, component.decay ?? 2);
    spot.castShadow = component.castShadow;
    light = spot;
  } else if (component.lightType === "rectArea") {
    light = new RectAreaLight$1(component.color, component.intensity, component.width ?? 1, component.height ?? 1);
  } else {
    const directional = new DirectionalLight$1(component.color, component.intensity);
    directional.castShadow = component.castShadow;
    light = directional;
  }
  light.userData.xriftStudioComponentId = component.id;
  return light;
}
function asRecord$1(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function asNumberArray(value, length) {
  return Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === "number" && Number.isFinite(entry)) ? value : void 0;
}
function browserBaseUrl() {
  if (typeof document !== "undefined")
    return new URL(document.baseURI);
  return new URL("http://localhost/");
}
function resolveUrl(value) {
  return new URL(value, browserBaseUrl());
}

const {jsx:_jsx$4} = await importShared('react/jsx-runtime');

const {useEffect: useEffect$6,useMemo: useMemo$7,useRef: useRef$6} = await importShared('react');

const {useFrame: useFrame$5} = await importShared('@react-three/fiber');

const {AdditiveBlending,BufferAttribute,BufferGeometry,Color: Color$3,DynamicDrawUsage,Euler: Euler$1,NormalBlending,PointsMaterial,SRGBColorSpace: SRGBColorSpace$3,Vector3: Vector3$1} = await importShared('three');

const XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY = "xriftParticleRuntime";
function createXriftParticleRuntimeBridge(options = {}) {
  const owners = /* @__PURE__ */ new Map();
  const componentId = options.componentId ?? "";
  let state = { revision: 0, componentId };
  let restartRevision = 0;
  const recompute = () => {
    const next = {
      revision: state.revision + 1,
      componentId,
      ...restartRevision > 0 ? { restartRevision } : {}
    };
    const ordered = [...owners.values()].sort((left, right) => left.order - right.order || left.key.localeCompare(right.key));
    for (const owner of ordered) {
      const { restartRevision: _ownerCommand, ...overrides } = owner.overrides;
      Object.assign(next, overrides);
    }
    state = next;
  };
  return {
    setOwner(owner, order, key, overrides) {
      const previous = owners.get(owner);
      if (overrides.restartRevision !== void 0 && overrides.restartRevision !== previous?.overrides.restartRevision) {
        restartRevision += 1;
      }
      owners.set(owner, { order, key, overrides: { ...overrides } });
      recompute();
    },
    removeOwner(owner) {
      if (!owners.delete(owner))
        return;
      recompute();
    },
    read: () => state
  };
}
function createXriftParticleEmissionPlan(config, emissionRateOverride) {
  const capacity = Math.max(1, Math.min(1e4, config.maxParticles));
  const rate = Math.max(0, emissionRateOverride ?? config.emission.rateOverTime);
  const maximumLifetime = Math.max(0.01, config.startLifetime.min, config.startLifetime.max);
  const continuousSlotCount = rate <= 0 ? 0 : Math.min(capacity, Math.max(1, Math.ceil(rate * maximumLifetime)));
  const burstBirthTimes = emissionRateOverride === void 0 ? createBurstBirthTimes(config.emission.bursts, Math.max(0.01, config.duration), capacity - continuousSlotCount) : [];
  return {
    rate,
    continuousSlotCount,
    burstBirthTimes,
    activeCount: continuousSlotCount + burstBirthTimes.length,
    duration: Math.max(0.01, config.duration),
    looping: config.looping,
    prewarm: config.prewarm
  };
}
function resolveXriftParticleBirthTime(plan, index, elapsed, startDelay) {
  if (index < plan.continuousSlotCount) {
    const firstBirth2 = index / Math.max(plan.rate, 1e-4) + startDelay;
    const period = plan.continuousSlotCount / Math.max(plan.rate, 1e-4);
    const elapsedCycles2 = Math.floor((elapsed - firstBirth2) / period);
    if (elapsedCycles2 < 0 && !(plan.looping && plan.prewarm))
      return null;
    if (plan.looping) {
      return firstBirth2 + elapsedCycles2 * period;
    }
    const emissionEnd = startDelay + plan.duration;
    const finalCycle = Math.floor((emissionEnd - 1e-9 - firstBirth2) / period);
    if (finalCycle < 0)
      return null;
    return firstBirth2 + Math.min(elapsedCycles2, finalCycle) * period;
  }
  const burstIndex = index - plan.continuousSlotCount;
  const authoredBirth = plan.burstBirthTimes[burstIndex];
  if (authoredBirth === void 0)
    return null;
  const firstBirth = authoredBirth + startDelay;
  if (!plan.looping)
    return firstBirth;
  const elapsedCycles = Math.floor((elapsed - firstBirth) / plan.duration);
  if (elapsedCycles < 0 && !plan.prewarm)
    return null;
  return firstBirth + elapsedCycles * plan.duration;
}
const XriftScriptParticleEmitter = ({ componentId, config, color, opacity, map, displayOpacityScale = 1 }) => {
  const count = Math.max(1, Math.min(1e4, config.maxParticles));
  const authoredEmissionPlan = useMemo$7(() => createXriftParticleEmissionPlan(config), [config]);
  const pointsRef = useRef$6(null);
  const elapsedRef = useRef$6(0);
  const restartRevisionRef = useRef$6(0);
  const runtimeBridge = useMemo$7(() => createXriftParticleRuntimeBridge({ componentId: componentId ?? "" }), [componentId]);
  const runtimeUserData = useMemo$7(() => ({ [XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY]: runtimeBridge }), [runtimeBridge]);
  const geometry = useMemo$7(() => createGeometry(count), [count]);
  const material = useMemo$7(() => new PointsMaterial({
    color,
    map: map ?? null,
    size: baseParticleSize(config),
    sizeAttenuation: true,
    transparent: true,
    opacity: clampUnit$1(opacity) * clampUnit$1(displayOpacityScale),
    vertexColors: true,
    alphaTest: map ? 0.01 : 0,
    depthWrite: config.renderer.blending !== "additive",
    blending: config.renderer.blending === "additive" ? AdditiveBlending : NormalBlending
  }), [color, config, displayOpacityScale, map, opacity]);
  const seeds = useMemo$7(() => Array.from({ length: count }, (_, index) => particleSeed(index)), [count]);
  const velocity = useMemo$7(() => new Vector3$1(), []);
  const start = useMemo$7(() => new Vector3$1(), []);
  const positionValue = useMemo$7(() => new Vector3$1(), []);
  const orbitalRotation = useMemo$7(() => new Euler$1(), []);
  const currentColor = useMemo$7(() => new Color$3(), []);
  useEffect$6(() => {
    elapsedRef.current = 0;
    restartRevisionRef.current = 0;
  }, [config]);
  useEffect$6(() => () => geometry.dispose(), [geometry]);
  useEffect$6(() => () => material.dispose(), [material]);
  useFrame$5((_state, delta) => {
    const runtime = runtimeBridge.read();
    const restartRevision = runtime.restartRevision ?? 0;
    if (restartRevisionRef.current !== restartRevision) {
      restartRevisionRef.current = restartRevision;
      elapsedRef.current = 0;
    }
    material.size = baseParticleSize(config) * Math.max(0, runtime.sizeMultiplier ?? 1);
    material.color.set(runtime.color ?? color);
    material.opacity = clampUnit$1(opacity) * clampUnit$1(displayOpacityScale) * clampUnit$1(runtime.opacity ?? 1);
    if (runtime.stopped) {
      elapsedRef.current = 0;
      if (pointsRef.current)
        pointsRef.current.visible = false;
      clearGeometry(geometry, count);
      return;
    }
    if (runtime.playing === false)
      return;
    elapsedRef.current += Math.min(delta, 0.1);
    const elapsed = elapsedRef.current;
    const position = geometry.getAttribute("position");
    const colors = geometry.getAttribute("color");
    const emissionPlan = runtime.emissionRate === void 0 ? authoredEmissionPlan : createXriftParticleEmissionPlan(config, runtime.emissionRate);
    const speedMultiplier = Math.max(0, runtime.speedMultiplier ?? 1);
    let visibleParticleCount = 0;
    for (let index = 0; index < count; index += 1) {
      if (index >= emissionPlan.activeCount) {
        hideParticle(position, colors, index);
        continue;
      }
      const seed = seeds[index];
      const startDelay = mix(config.startDelay.min, config.startDelay.max, seed.c);
      const bornAt = resolveXriftParticleBirthTime(emissionPlan, index, elapsed, startDelay);
      if (bornAt === null) {
        hideParticle(position, colors, index);
        continue;
      }
      const rawAge = elapsed - bornAt;
      const lifetime = Math.max(0.01, mix(config.startLifetime.min, config.startLifetime.max, seed.b));
      if (rawAge < 0 || rawAge > lifetime) {
        hideParticle(position, colors, index);
        continue;
      }
      const age = rawAge;
      visibleParticleCount += 1;
      const normalizedAge = Math.max(0, Math.min(1, age / lifetime));
      const speed = mix(config.startSpeed.min, config.startSpeed.max, seed.speed) * speedMultiplier;
      initialParticle(config.shape, seed, start, velocity);
      velocity.multiplyScalar(speed);
      positionValue.set(start.x + (velocity.x + config.velocityOverLifetime.linear[0]) * age + config.gravity[0] * age * age * 0.5, start.y + (velocity.y + config.velocityOverLifetime.linear[1]) * age + config.gravity[1] * age * age * 0.5, start.z + (velocity.z + config.velocityOverLifetime.linear[2]) * age + config.gravity[2] * age * age * 0.5);
      orbitalRotation.set(config.velocityOverLifetime.orbital[0] * age, config.velocityOverLifetime.orbital[1] * age, config.velocityOverLifetime.orbital[2] * age);
      positionValue.applyEuler(orbitalRotation);
      position.setXYZ(index, positionValue.x, positionValue.y, positionValue.z);
      const startColor = config.colorOverLifetime.start;
      const endColor = config.colorOverLifetime.end;
      currentColor.setRGB(mix(startColor[0], endColor[0], normalizedAge), mix(startColor[1], endColor[1], normalizedAge), mix(startColor[2], endColor[2], normalizedAge), SRGBColorSpace$3);
      colors.setXYZW(index, currentColor.r, currentColor.g, currentColor.b, mix(startColor[3], endColor[3], normalizedAge));
    }
    position.needsUpdate = true;
    colors.needsUpdate = true;
    if (pointsRef.current) {
      pointsRef.current.visible = visibleParticleCount > 0;
    }
  });
  return _jsx$4("points", { ref: pointsRef, geometry, material, userData: runtimeUserData, castShadow: config.renderer.castShadow, receiveShadow: config.renderer.receiveShadow });
};
function createBurstBirthTimes(bursts, duration, capacity) {
  if (capacity <= 0)
    return [];
  const scheduled = [];
  for (const burst of bursts) {
    const cycles = Math.max(1, Math.floor(burst.cycles));
    const count = Math.max(0, Math.floor(burst.count));
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      const time = Math.max(0, burst.time) + cycle * Math.max(0, burst.interval);
      if (time > duration)
        continue;
      scheduled.push({ time, count });
    }
  }
  scheduled.sort((left, right) => left.time - right.time);
  const birthTimes = [];
  for (const burst of scheduled) {
    for (let particle = 0; particle < burst.count && birthTimes.length < capacity; particle += 1) {
      birthTimes.push(burst.time);
    }
    if (birthTimes.length >= capacity)
      break;
  }
  return birthTimes;
}
function baseParticleSize(config) {
  return Math.max(1e-3, (config.startSize.min + config.startSize.max) / 2 * ((config.sizeOverLifetime.min + config.sizeOverLifetime.max) / 2));
}
function createGeometry(count) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3 + 1] = -1e4;
  }
  const position = new BufferAttribute(positions, 3);
  const color = new BufferAttribute(colors, 4);
  position.setUsage(DynamicDrawUsage);
  color.setUsage(DynamicDrawUsage);
  geometry.setAttribute("position", position);
  geometry.setAttribute("color", color);
  return geometry;
}
function clearGeometry(geometry, count) {
  const position = geometry.getAttribute("position");
  const colors = geometry.getAttribute("color");
  for (let index = 0; index < count; index += 1) {
    hideParticle(position, colors, index);
  }
  position.needsUpdate = true;
  colors.needsUpdate = true;
}
function hideParticle(position, colors, index) {
  position.setXYZ(index, 0, -1e4, 0);
  colors.setXYZW(index, 0, 0, 0, 0);
}
function particleSeed(index) {
  return {
    a: hash(index * 4 + 1),
    b: hash(index * 4 + 2),
    c: hash(index * 4 + 3),
    speed: hash(index * 4 + 4)
  };
}
function hash(value) {
  const result = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return result - Math.floor(result);
}
function mix(start, end, amount) {
  return start + (end - start) * amount;
}
function initialParticle(shape, seed, start, direction) {
  start.set(0, 0, 0);
  if (shape.type === "sphere") {
    const theta = seed.a * Math.PI * 2;
    const phi = Math.acos(seed.b * 2 - 1);
    const radius = shape.radius * Math.cbrt(seed.c);
    direction.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    start.copy(direction).multiplyScalar(radius);
    return;
  }
  if (shape.type === "box") {
    start.set((seed.a - 0.5) * shape.size[0], (seed.b - 0.5) * shape.size[1], (seed.c - 0.5) * shape.size[2]);
    direction.set(0, 1, 0);
    return;
  }
  if (shape.type === "cone") {
    const theta = seed.a * Math.PI * 2;
    const radial = Math.sqrt(seed.b) * shape.radius;
    start.set(Math.cos(theta) * radial, 0, Math.sin(theta) * radial);
    const slope = Math.tan(shape.angle * Math.PI / 180);
    direction.set(Math.cos(theta) * slope, 1, Math.sin(theta) * slope).normalize();
    return;
  }
  direction.set(0, 1, 0);
}
function clampUnit$1(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

const {jsx:_jsx$3} = await importShared('react/jsx-runtime');

const {useEffect: useEffect$5,useLayoutEffect: useLayoutEffect$1,useMemo: useMemo$6,useRef: useRef$5} = await importShared('react');

const {useFrame: useFrame$4,useThree: useThree$5} = await importShared('@react-three/fiber');

const {Audio:ThreeAudio,AudioListener,AudioLoader,PositionalAudio} = await importShared('three');

const XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY = "xriftAudioSourceRuntime";
/**
 * DOM-free owner composition used by both Studio Play and generated output.
 * The React component merely connects a Three.js player to this state machine.
 */
function createXriftAudioSourceRuntimeBridge(options) {
    const owners = new Map();
    let authored = {
        enabled: options.enabled,
        sourceStatus: options.sourceStatus,
        volume: clampUnit(options.volume),
        loop: options.loop,
        autoplay: options.autoplay,
    };
    let controller = null;
    let playbackRevision = 0;
    let seekRevision = 0;
    let state = {
        revision: 0,
        componentId: options.componentId,
        audioAssetId: options.audioAssetId?.trim() ?? "",
        spatial: options.spatial,
        enabled: authored.enabled,
        status: initialStatus(authored),
        playing: false,
        currentTime: 0,
        duration: 0,
        volume: authored.volume,
        loop: authored.loop,
        playback: authored.autoplay ? "play" : "pause",
        playbackRevision,
        seekTime: 0,
        seekRevision,
    };
    let appliedPlaybackRevision = -1;
    let appliedSeekRevision = -1;
    const orderedOwners = () => [...owners.values()].sort((left, right) => left.order - right.order || left.key.localeCompare(right.key));
    const recompute = (commandChanged = false, seekChanged = false) => {
        let volume = authored.volume;
        let loop = authored.loop;
        let playback = authored.autoplay ? "play" : "pause";
        let seekTime = 0;
        for (const owner of orderedOwners()) {
            if (owner.overrides.volume !== undefined) {
                volume = clampUnit(owner.overrides.volume);
            }
            if (owner.overrides.loop !== undefined)
                loop = owner.overrides.loop;
            if (owner.playback !== undefined)
                playback = owner.playback;
            if (owner.seekTime !== undefined)
                seekTime = owner.seekTime;
        }
        if (commandChanged)
            playbackRevision += 1;
        if (seekChanged)
            seekRevision += 1;
        state = {
            ...state,
            revision: state.revision + 1,
            enabled: authored.enabled,
            volume,
            loop,
            playback,
            playbackRevision,
            seekTime,
            seekRevision,
            ...forcedAvailabilityState(authored),
        };
        return state;
    };
    const apply = async (force = false) => {
        const target = controller;
        const unavailable = forcedAvailabilityState(authored);
        if (unavailable.status) {
            if (target)
                target.stop();
            state = { ...state, ...unavailable };
            return false;
        }
        if (!target) {
            state = {
                ...state,
                status: "unavailable",
                playing: false,
            };
            return false;
        }
        target.setVolume(state.volume);
        target.setLoop(state.loop);
        if (state.seekTime !== undefined &&
            (force || appliedSeekRevision !== state.seekRevision)) {
            target.seek(state.seekTime);
            appliedSeekRevision = state.seekRevision;
        }
        if (!force && appliedPlaybackRevision === state.playbackRevision) {
            return state.playing;
        }
        appliedPlaybackRevision = state.playbackRevision;
        if (state.playback === "pause") {
            const paused = target.pause();
            state = {
                ...state,
                status: paused ? "paused" : "unavailable",
                playing: false,
            };
            return paused;
        }
        if (state.playback === "stop") {
            const stopped = target.stop();
            state = {
                ...state,
                status: stopped ? "stopped" : "unavailable",
                playing: false,
                currentTime: 0,
            };
            return stopped;
        }
        const requestedController = target;
        const requestedRevision = state.playbackRevision;
        try {
            const result = await target.play();
            if (controller !== requestedController ||
                state.playbackRevision !== requestedRevision ||
                state.playback !== "play" ||
                forcedAvailabilityState(authored).status) {
                // Loading and AudioContext.resume are asynchronous. A newer Stop,
                // Pause, reset, or unmount always wins over this stale completion.
                await apply(true);
                return false;
            }
            state = {
                ...state,
                status: result,
                playing: result === "playing",
            };
            return result === "playing";
        }
        catch {
            if (controller !== requestedController ||
                state.playbackRevision !== requestedRevision ||
                state.playback !== "play" ||
                forcedAvailabilityState(authored).status) {
                await apply(true);
                return false;
            }
            state = {
                ...state,
                status: "unavailable",
                playing: false,
            };
            return false;
        }
    };
    return {
        setOwner(owner, order, key, overrides) {
            owners.set(owner, {
                ...(owners.get(owner) ?? { order, key }),
                order,
                key,
                overrides: normalizeOverrides(overrides),
            });
            recompute();
            void apply();
        },
        removeOwner(owner) {
            const previous = owners.get(owner);
            if (!previous || !owners.delete(owner))
                return;
            recompute(previous.playback !== undefined, previous.seekTime !== undefined);
            void apply();
        },
        async command(owner, order, key, command) {
            const previous = owners.get(owner);
            const next = {
                order,
                key,
                overrides: previous?.overrides ?? {},
                ...(previous?.playback !== undefined
                    ? { playback: previous.playback }
                    : {}),
                ...(previous?.seekTime !== undefined
                    ? { seekTime: previous.seekTime }
                    : {}),
            };
            if (command.type === "seek") {
                next.seekTime = clampTime(command.time);
                owners.set(owner, next);
                recompute(false, true);
            }
            else {
                next.playback = command.type;
                owners.set(owner, next);
                recompute(true, false);
            }
            const applied = await apply();
            return command.type === "play" && state.playback !== "play"
                ? false
                : applied;
        },
        read: () => state,
        configure(next) {
            const normalized = {
                enabled: next.enabled,
                sourceStatus: next.sourceStatus,
                volume: clampUnit(next.volume),
                loop: next.loop,
                autoplay: next.autoplay,
            };
            const playbackChanged = authored.autoplay !== normalized.autoplay ||
                authored.enabled !== normalized.enabled ||
                authored.sourceStatus !== normalized.sourceStatus;
            authored = normalized;
            recompute(playbackChanged);
            void apply();
        },
        connect(nextController) {
            controller = nextController;
            appliedPlaybackRevision = -1;
            appliedSeekRevision = -1;
            nextController.setVolume(state.volume);
            nextController.setLoop(state.loop);
            return () => {
                if (controller !== nextController)
                    return;
                nextController.stop();
                controller = null;
                appliedPlaybackRevision = -1;
                appliedSeekRevision = -1;
            };
        },
        refresh: () => apply(true),
        observe(observation) {
            const forced = forcedAvailabilityState(authored);
            state = {
                ...state,
                ...observation,
                ...(forced.status ? forced : {}),
            };
        },
    };
}
/**
 * Shared Audio Source renderer. Edit mode decides whether to mount it; when
 * mounted it behaves identically in Studio Play and generated classic JSX.
 */
function XriftAudioSource({ componentId, audioAssetId, assetUrl, sourceStatus = assetUrl ? "available" : "missing", enabled, volume, loop, autoplay, spatial, refDistance, rolloffFactor, maxDistance, }) {
    const camera = useThree$5((fiberState) => fiberState.camera);
    const listener = useMemo$6(() => listenerForCamera(camera), [camera]);
    const sound = useMemo$6(() => spatial
        ? new PositionalAudio(listener)
        : new ThreeAudio(listener), [assetUrl, audioAssetId, listener, spatial]);
    const bridge = useMemo$6(() => createXriftAudioSourceRuntimeBridge({
        componentId,
        audioAssetId,
        spatial,
        enabled,
        sourceStatus,
        volume,
        loop,
        autoplay,
    }), [audioAssetId, componentId, spatial]);
    const loadingRef = useRef$5(Promise.resolve(false));
    useLayoutEffect$1(() => retainListener(camera, listener), [camera, listener]);
    useEffect$5(() => {
        bridge.configure({
            enabled,
            sourceStatus,
            volume,
            loop,
            autoplay,
        });
    }, [autoplay, bridge, enabled, loop, sourceStatus, volume]);
    useLayoutEffect$1(() => {
        const previous = sound.userData[XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY];
        sound.userData[XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY] = bridge;
        return () => {
            if (sound.userData[XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY] === bridge) {
                if (previous === undefined) {
                    delete sound.userData[XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY];
                }
                else {
                    sound.userData[XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY] = previous;
                }
            }
        };
    }, [bridge, sound]);
    useLayoutEffect$1(() => {
        let active = true;
        if (!enabled ||
            sourceStatus !== "available" ||
            !assetUrl?.trim()) {
            loadingRef.current = Promise.resolve(false);
            return () => {
                active = false;
            };
        }
        bridge.observe({
            status: "loading",
            playing: false,
            currentTime: 0,
            duration: 0,
        });
        const loading = new AudioLoader()
            .loadAsync(assetUrl)
            .then((buffer) => {
            if (!active)
                return false;
            sound.setBuffer(buffer);
            bridge.observe({
                status: "ready",
                playing: false,
                currentTime: 0,
                duration: buffer.duration,
            });
            return true;
        })
            .catch(() => {
            if (active) {
                bridge.observe({
                    status: "unavailable",
                    playing: false,
                    currentTime: 0,
                    duration: 0,
                });
            }
            return false;
        });
        loadingRef.current = loading;
        void loading.then((loaded) => {
            if (active && loaded)
                void bridge.refresh();
        });
        return () => {
            active = false;
        };
    }, [assetUrl, bridge, enabled, sound, sourceStatus]);
    useLayoutEffect$1(() => {
        const controller = createThreeAudioController(sound, listener, () => loadingRef.current);
        const disconnect = bridge.connect(controller);
        void bridge.refresh();
        return () => {
            disconnect();
            try {
                sound.disconnect();
            }
            catch {
                // A source that never started was never connected.
            }
            try {
                sound.gain.disconnect();
            }
            catch {
                // Web Audio nodes may already be disconnected during renderer teardown.
            }
        };
    }, [bridge, listener, sound]);
    useEffect$5(() => {
        if (!(sound instanceof PositionalAudio))
            return;
        sound.setRefDistance(clampNonNegative(refDistance));
        sound.setRolloffFactor(clampNonNegative(rolloffFactor));
        sound.setMaxDistance(clampNonNegative(maxDistance));
    }, [maxDistance, refDistance, rolloffFactor, sound]);
    useFrame$4(() => {
        bridge.observe(readThreeAudioObservation(sound, bridge.read().status));
    });
    return _jsx$3("primitive", { object: sound });
}
const listenersByCamera = new WeakMap();
function listenerForCamera(camera) {
    const existing = listenersByCamera.get(camera);
    if (existing)
        return existing.listener;
    const listener = new AudioListener();
    listenersByCamera.set(camera, { listener, users: 0 });
    return listener;
}
function retainListener(camera, listener) {
    const entry = listenersByCamera.get(camera);
    if (!entry || entry.listener !== listener)
        return () => { };
    entry.users += 1;
    if (listener.parent !== camera)
        camera.add(listener);
    return () => {
        entry.users = Math.max(0, entry.users - 1);
        if (entry.users > 0)
            return;
        if (listener.parent === camera)
            camera.remove(listener);
        listenersByCamera.delete(camera);
    };
}
function createThreeAudioController(sound, listener, loading) {
    return {
        setVolume(value) {
            sound.setVolume(clampUnit(value));
        },
        setLoop(value) {
            sound.setLoop(value);
        },
        async play() {
            if (!(await loading()) || !sound.buffer)
                return "unavailable";
            try {
                if (listener.context.state === "suspended") {
                    await listener.context.resume();
                }
                if (listener.context.state !== "running") {
                    return "autoplay-blocked";
                }
                if (!sound.isPlaying)
                    sound.play();
                return sound.isPlaying ? "playing" : "autoplay-blocked";
            }
            catch {
                return "autoplay-blocked";
            }
        },
        pause() {
            if (!sound.buffer)
                return false;
            try {
                sound.pause();
                return true;
            }
            catch {
                return false;
            }
        },
        stop() {
            try {
                sound.stop();
                sound.offset = 0;
                return true;
            }
            catch {
                return false;
            }
        },
        seek(time) {
            if (!sound.buffer)
                return false;
            const wasPlaying = sound.isPlaying;
            try {
                sound.stop();
                sound.offset = clampToDuration(time, sound.buffer.duration);
                if (wasPlaying)
                    sound.play();
                return true;
            }
            catch {
                return false;
            }
        },
    };
}
function readThreeAudioObservation(sound, previousStatus) {
    const duration = sound.buffer?.duration ?? 0;
    if (!sound.buffer) {
        return { playing: false, currentTime: 0, duration };
    }
    const internal = sound;
    const elapsed = sound.isPlaying
        ? Math.max(sound.context.currentTime - (internal._startedAt ?? 0), 0) *
            sound.playbackRate
        : 0;
    let currentTime = (internal._progress ?? 0) + sound.offset + elapsed;
    if (sound.loop && duration > 0)
        currentTime %= duration;
    else
        currentTime = clampToDuration(currentTime, duration);
    const status = sound.isPlaying
        ? "playing"
        : previousStatus === "playing"
            ? "stopped"
            : previousStatus;
    return {
        status,
        playing: sound.isPlaying,
        currentTime,
        duration,
    };
}
function normalizeOverrides(overrides) {
    return {
        ...(overrides.volume !== undefined
            ? { volume: clampUnit(overrides.volume) }
            : {}),
        ...(overrides.loop !== undefined ? { loop: overrides.loop } : {}),
    };
}
function initialStatus(authored) {
    if (!authored.enabled)
        return "disabled";
    if (authored.sourceStatus === "missing")
        return "missing";
    if (authored.sourceStatus === "unavailable")
        return "unavailable";
    return authored.sourceStatus === "loading" ? "loading" : "ready";
}
function forcedAvailabilityState(authored) {
    if (!authored.enabled) {
        return { status: "disabled", playing: false, currentTime: 0 };
    }
    if (authored.sourceStatus === "missing") {
        return { status: "missing", playing: false, currentTime: 0 };
    }
    if (authored.sourceStatus === "loading") {
        return { status: "loading", playing: false };
    }
    if (authored.sourceStatus === "unavailable") {
        return { status: "unavailable", playing: false, currentTime: 0 };
    }
    return {};
}
function clampUnit(value) {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
function clampNonNegative(value) {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}
function clampTime(value) {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}
function clampToDuration(value, duration) {
    return Math.min(clampTime(value), Math.max(0, duration));
}

/**
 * Live control over one Entity's Animation playback.
 *
 * Studio's Play preview and a published world each own an `AnimationMixer`, and
 * until now each built a fixed list of actions once and never touched it again:
 * a clip could be started, but nothing could pause it, seek it, switch it, or
 * change its speed while the world was running. A behavior graph that says
 * "play for three seconds, then stop" needs exactly that.
 *
 * The bridge is the seam. It holds the resolved intent — which clip, playing or
 * not, how fast — and a controller supplied by whichever surface owns the mixer
 * applies it. Being DOM-free and renderer-free is what lets composition and
 * cleanup be fixture-tested without a canvas.
 */
const XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY = "xriftAnimationRuntime";
function clampSpeed(value) {
    if (!Number.isFinite(value))
        return 1;
    return Math.min(10, Math.max(0.01, value));
}
function clampIndex(value, length) {
    if (!Number.isInteger(value) || value < 0)
        return 0;
    return length === 0 ? 0 : Math.min(value, length - 1);
}
function createXriftAnimationRuntimeBridge(options) {
    const owners = new Map();
    let authored = {
        clipNames: [...options.clipNames],
        clipIndex: clampIndex(options.clipIndex, options.clipNames.length),
        autoplay: options.autoplay,
        speed: clampSpeed(options.speed),
        loop: options.loop,
    };
    let controller = null;
    // Commanded intent, separate from the authored one so removing a trigger's
    // overrides does not also undo a play it performed.
    let commandedClip = null;
    let commandedPlaying = null;
    let state = {
        revision: 0,
        componentId: options.componentId,
        clipNames: authored.clipNames,
        clipIndex: authored.clipIndex,
        playing: authored.autoplay,
        speed: authored.speed,
        loop: authored.loop,
        time: 0,
        duration: 0,
    };
    const orderedOwners = () => [...owners.values()].sort((left, right) => left.order - right.order || left.key.localeCompare(right.key));
    const resolve = () => {
        let speed = authored.speed;
        let loop = authored.loop;
        for (const owner of orderedOwners()) {
            if (owner.overrides.speed !== undefined) {
                speed = clampSpeed(owner.overrides.speed);
            }
            if (owner.overrides.loop !== undefined)
                loop = owner.overrides.loop;
        }
        state = {
            ...state,
            revision: state.revision + 1,
            clipNames: authored.clipNames,
            clipIndex: clampIndex(commandedClip ?? authored.clipIndex, authored.clipNames.length),
            playing: commandedPlaying ?? authored.autoplay,
            speed,
            loop,
        };
        return state;
    };
    const push = (seekTo, restart) => {
        const next = resolve();
        if (!controller)
            return;
        controller.select(next.clipIndex, next.loop);
        controller.setSpeed(next.speed);
        if (!next.playing) {
            if (seekTo !== null)
                controller.seek(seekTo);
            return;
        }
        if (restart || seekTo !== null)
            controller.play(seekTo);
    };
    return {
        setOwner(owner, order, key, overrides) {
            owners.set(owner, { order, key, overrides });
            push(null, false);
        },
        removeOwner(owner) {
            if (!owners.delete(owner))
                return;
            push(null, false);
        },
        command(owner, order, key, command) {
            owners.set(owner, {
                order,
                key,
                overrides: owners.get(owner)?.overrides ?? {},
            });
            switch (command.type) {
                case "play":
                    if (command.clipIndex !== undefined)
                        commandedClip = command.clipIndex;
                    commandedPlaying = true;
                    push(command.time ?? null, true);
                    return;
                case "pause":
                    commandedPlaying = false;
                    push(null, false);
                    controller?.pause();
                    return;
                case "stop":
                    commandedPlaying = false;
                    push(null, false);
                    controller?.stop();
                    return;
                case "seek":
                    push(command.time, false);
                    controller?.seek(command.time);
                    return;
                case "select":
                    commandedClip = command.clipIndex;
                    push(null, state.playing);
                    return;
                case "play-clip":
                    controller?.playClip?.(command.clipIndex, {
                        loop: command.loop,
                        speed: command.speed,
                        fromSeconds: command.time,
                    });
                    return;
                case "stop-clip":
                    controller?.stopClip?.(command.clipIndex);
                    return;
                case "stop-started-clips":
                    controller?.stopStartedClips?.();
                    return;
            }
        },
        read() {
            return state;
        },
        configure(next) {
            authored = {
                clipNames: [...next.clipNames],
                clipIndex: clampIndex(next.clipIndex, next.clipNames.length),
                autoplay: next.autoplay,
                speed: clampSpeed(next.speed),
                loop: next.loop,
            };
            push(null, false);
        },
        connect(next) {
            controller = next;
            push(null, state.playing);
            return () => {
                if (controller === next)
                    controller = null;
            };
        },
        sample() {
            if (!controller)
                return;
            const live = controller.sample();
            state = {
                ...state,
                playing: live.playing,
                time: live.time,
                duration: live.duration,
            };
        },
    };
}
function isXriftAnimationRuntimeBridge(value) {
    const candidate = value;
    return (typeof candidate === "object" &&
        candidate !== null &&
        typeof candidate.setOwner === "function" &&
        typeof candidate.command === "function" &&
        typeof candidate.read === "function" &&
        typeof candidate.connect === "function");
}

const {Fragment:_Fragment$1,jsx:_jsx$2,jsxs:_jsxs$2} = await importShared('react/jsx-runtime');

const {useLayoutEffect,useMemo: useMemo$5,useRef: useRef$4} = await importShared('react');

const {useFrame: useFrame$3} = await importShared('@react-three/fiber');

const {AmbientLight: AmbientLight$2,DirectionalLight,HemisphereLight,Object3D: Object3D$1,PointLight,RectAreaLight,SpotLight} = await importShared('three');

const XRIFT_LIGHT_RUNTIME_USER_DATA_KEY = "xriftLightRuntime";

/**
 * Runtime overrides for a Text panel.
 *
 * A Text Component is typeset from one config object, so「押したら文字が変わる」
 * has nowhere to land unless something can change that object without editing
 * the Scene. This is that something: the same owner-ordered bridge Light,
 * Particle and Audio Source already use, parked on the panel object so a
 * behavior graph or a Script can find it through the Entity it belongs to.
 *
 * Overrides are runtime-only. Stop, a restart or a failure removes the owner
 * and the panel goes back to the authored text, exactly like every other
 * bridge — nothing here is ever written to the document.
 */
const XRIFT_TEXT_RUNTIME_USER_DATA_KEY = "xriftTextRuntime";
function isXriftTextRuntimeBridge(value) {
    const candidate = value;
    return (typeof candidate === "object" &&
        candidate !== null &&
        typeof candidate.setOwner === "function" &&
        typeof candidate.removeOwner === "function" &&
        typeof candidate.read === "function");
}

/**
 * Runtime overrides for an Image quad.
 *
 * An Image Component is drawn from one config object, so「押したら写真が
 * 消える」or a fade has nowhere to land unless something can change that
 * object without editing the Scene. This is that something: the same
 * owner-ordered bridge Text, Light, Particle and Audio Source use, parked on
 * the quad object so a behavior graph can find it through the Entity it
 * belongs to.
 *
 * Overrides are runtime-only. Stop, a restart or a failure removes the owner
 * and the picture goes back to the authored look, exactly like every other
 * bridge — nothing here is ever written to the document.
 */
const XRIFT_IMAGE_RUNTIME_USER_DATA_KEY = "xriftImageRuntime";
function isXriftImageRuntimeBridge(value) {
    const candidate = value;
    return (typeof candidate === "object" &&
        candidate !== null &&
        typeof candidate.setOwner === "function" &&
        typeof candidate.removeOwner === "function" &&
        typeof candidate.read === "function");
}

/** Shared with the compiler, which also runs without a DOM in a Worker. */
const XRIFT_SCENE_SKYBOX_USER_DATA_KEY = "xriftSceneSkybox";

const {jsx:_jsx$1,jsxs:_jsxs$1} = await importShared('react/jsx-runtime');

/**
 * Scene-wide state a behavior graph can change, and the named events it sends.
 *
 * The screen fade, the compositor, fog, ambient light, the sky and the camera
 * belong to no Entity, so they cannot go through the per-Entity bridges the
 * other targets use. They are held here, on one bridge attached to the Scene
 * root, and applied by a component both Studio Play and a published world
 * mount.
 *
 * They are owner-ordered overrides rather than commands on purpose: a fade is a
 * state, so releasing the trigger that set it puts the authored look back —
 * which is what Play Stop has to do.
 *
 * Everything here is client-local. A graph runs inside each viewer's own
 * runtime, so a「画質を上げる」button changes the picture for whoever pressed it
 * and leaves every other viewer alone. Nothing is synchronised and nothing is
 * saved: the authored Scene settings are what a fresh viewer sees.
 */
const {useEffect: useEffect$4,useMemo: useMemo$4,useRef: useRef$3} = await importShared('react');

const {useFrame: useFrame$2,useThree: useThree$4} = await importShared('@react-three/fiber');

const {AmbientLight: AmbientLight$1,Color: Color$2,EquirectangularReflectionMapping: EquirectangularReflectionMapping$1,Fog: Fog$2,LinearSRGBColorSpace: LinearSRGBColorSpace$1,SRGBColorSpace: SRGBColorSpace$2,TextureLoader} = await importShared('three');
const XRIFT_SCENE_RUNTIME_USER_DATA_KEY = "xriftSceneRuntime";
/**
 * The authored compositor values, published for whoever needs to read them.
 *
 * `xrift/toggleProperty` has to know what「今ON/OFFどちらか」is before it can
 * flip it, and for bloom or AO the answer lives in the Scene settings the
 * compositor was handed — not in the scene graph, where fog and the sky can be
 * read straight off the objects. Publishing it beside the bridge is what lets
 * a toggle work on the first press instead of guessing the world was already
 * bright.
 */
const XRIFT_SCENE_POSTPROCESSING_BASELINE_USER_DATA_KEY = "xriftScenePostprocessingBaseline";
function readXriftScenePostprocessingBaseline(root) {
    const candidate = root.userData[XRIFT_SCENE_POSTPROCESSING_BASELINE_USER_DATA_KEY];
    return typeof candidate === "object" && candidate !== null
        ? candidate
        : null;
}
const IDLE_STATE = {
    revision: 0,
    exposure: null,
    fade: 0,
    fadeColor: [1, 1, 1],
    postprocessing: null,
    bloom: null,
    bloomStrength: null,
    bloomRadius: null,
    bloomThreshold: null,
    ao: null,
    grading: null,
    fog: null,
    fogColor: null,
    fogNear: null,
    fogFar: null,
    ambient: null,
    ambientColor: null,
    ambientIntensity: null,
    skybox: null,
    skyboxIbl: null,
    skyboxExposure: null,
    skyboxRotation: null,
    skyboxImage: null,
    cameraFov: null,
};
const clamp = (value, lower, upper) => Math.min(upper, Math.max(lower, value));
function createXriftSceneRuntimeBridge() {
    const owners = new Map();
    let state = IDLE_STATE;
    const resolve = () => {
        const next = { ...IDLE_STATE, revision: state.revision + 1 };
        const ordered = [...owners.values()].sort((left, right) => left.order - right.order || left.key.localeCompare(right.key));
        for (const owner of ordered) {
            const overrides = owner.overrides;
            if (overrides.exposure !== undefined) {
                next.exposure = clamp(overrides.exposure, 0, 16);
            }
            if (overrides.fade !== undefined)
                next.fade = clamp(overrides.fade, 0, 1);
            if (overrides.fadeColor !== undefined)
                next.fadeColor = overrides.fadeColor;
            if (overrides.postprocessing !== undefined) {
                next.postprocessing = overrides.postprocessing;
            }
            if (overrides.bloom !== undefined)
                next.bloom = overrides.bloom;
            if (overrides.bloomStrength !== undefined) {
                next.bloomStrength = clamp(overrides.bloomStrength, 0, 5);
            }
            if (overrides.bloomRadius !== undefined) {
                next.bloomRadius = clamp(overrides.bloomRadius, 0, 1);
            }
            if (overrides.bloomThreshold !== undefined) {
                next.bloomThreshold = clamp(overrides.bloomThreshold, 0, 1);
            }
            if (overrides.ao !== undefined)
                next.ao = overrides.ao;
            if (overrides.grading !== undefined)
                next.grading = overrides.grading;
            if (overrides.fog !== undefined)
                next.fog = overrides.fog;
            if (overrides.fogColor !== undefined)
                next.fogColor = overrides.fogColor;
            if (overrides.fogNear !== undefined) {
                next.fogNear = Math.max(0, overrides.fogNear);
            }
            if (overrides.fogFar !== undefined) {
                next.fogFar = Math.max(0, overrides.fogFar);
            }
            if (overrides.ambient !== undefined)
                next.ambient = overrides.ambient;
            if (overrides.ambientColor !== undefined) {
                next.ambientColor = overrides.ambientColor;
            }
            if (overrides.ambientIntensity !== undefined) {
                next.ambientIntensity = clamp(overrides.ambientIntensity, 0, 10);
            }
            if (overrides.skybox !== undefined)
                next.skybox = overrides.skybox;
            if (overrides.skyboxIbl !== undefined)
                next.skyboxIbl = overrides.skyboxIbl;
            if (overrides.skyboxExposure !== undefined) {
                next.skyboxExposure = clamp(overrides.skyboxExposure, 0, 8);
            }
            if (overrides.skyboxRotation !== undefined) {
                next.skyboxRotation = overrides.skyboxRotation;
            }
            if (overrides.skyboxImage !== undefined) {
                next.skyboxImage = overrides.skyboxImage;
            }
            if (overrides.cameraFov !== undefined) {
                next.cameraFov = clamp(overrides.cameraFov, 1, 179);
            }
        }
        state = next;
    };
    return {
        setOwner(owner, order, key, overrides) {
            owners.set(owner, {
                order,
                key,
                overrides: { ...owners.get(owner)?.overrides, ...overrides },
            });
            resolve();
        },
        removeOwner(owner) {
            if (!owners.delete(owner))
                return;
            resolve();
        },
        read() {
            return state;
        },
    };
}
function isXriftSceneRuntimeBridge(value) {
    const candidate = value;
    return (typeof candidate === "object" &&
        candidate !== null &&
        typeof candidate.setOwner === "function" &&
        typeof candidate.removeOwner === "function" &&
        typeof candidate.read === "function");
}
function findXriftSceneRuntimeBridge(root) {
    const candidate = root.userData[XRIFT_SCENE_RUNTIME_USER_DATA_KEY];
    return isXriftSceneRuntimeBridge(candidate) ? candidate : null;
}
const defaultEventScope = {};
const sceneEventScopes = new WeakMap();
function eventHandlers(scope) {
    let handlers = sceneEventScopes.get(scope);
    if (!handlers) {
        handlers = new Map();
        sceneEventScopes.set(scope, handlers);
    }
    return handlers;
}
function subscribeXriftSceneEvent(name, handler, scope = defaultEventScope) {
    const sceneEventHandlers = eventHandlers(scope);
    const existing = sceneEventHandlers.get(name) ?? new Set();
    existing.add(handler);
    sceneEventHandlers.set(name, existing);
    return () => {
        const current = sceneEventHandlers.get(name);
        if (!current)
            return;
        current.delete(handler);
        if (current.size === 0)
            sceneEventHandlers.delete(name);
    };
}
function emitXriftSceneEvent(name, payload, scope = defaultEventScope) {
    const sceneEventHandlers = eventHandlers(scope);
    const handlers = sceneEventHandlers.get(name);
    if (!handlers)
        return;
    for (const handler of [...handlers])
        handler(payload);
}
/** Snapshot delivery prevents a receiving Graph from recursively running itself. */
function createXriftGraphEventQueue(scope, names, receive) {
    let pending = [];
    let disposed = false;
    const subscriptions = [...new Set(names)].map((name) => subscribeXriftSceneEvent(name, () => {
        if (disposed)
            return;
        if (pending.length >= 1024)
            throw new Error("Graph event queue limit exceeded");
        pending.push(name);
    }, scope));
    return {
        flush() {
            const batch = pending;
            pending = [];
            for (const name of batch) {
                if (!disposed)
                    receive(name);
            }
        },
        dispose() { disposed = true; pending = []; subscriptions.forEach((off) => off()); },
    };
}
const isAmbientLight = (object) => object.isAmbientLight === true;
const isAuthoredSky = (object) => object.userData[XRIFT_SCENE_SKYBOX_USER_DATA_KEY] === true;
const linearColor$1 = (rgb) => new Color$2().setRGB(rgb[0], rgb[1], rgb[2], LinearSRGBColorSpace$1);
async function loadEquirectangularTexture(asset) {
    const format = asset.sourceFormat;
    let texture;
    if (format === "hdr" || format === "exr") {
        const Loader = format === "hdr" ? HDRLoader : EXRLoader;
        texture = await new Loader().loadAsync(asset.url);
    }
    else {
        texture = await new TextureLoader().loadAsync(asset.url);
        texture.colorSpace = SRGBColorSpace$2;
    }
    texture.name = asset.name ? `${asset.name} (skybox)` : "xrift-scene-skybox";
    texture.flipY = asset.flipY ?? false;
    texture.mapping = EquirectangularReflectionMapping$1;
    texture.needsUpdate = true;
    return texture;
}
/**
 * Starts or drops the sky image a graph asked for.
 *
 * An Asset the surface did not hand over is left alone rather than replaced
 * with a stand-in sky: an image nobody published cannot be drawn, and drawing
 * something else in its place would hide that from the author.
 */
function syncSkyboxImage(state, assets, current, onLoaded) {
    const wanted = state.skyboxImage;
    if ((current.current?.assetId ?? null) === wanted)
        return;
    current.current?.texture?.dispose();
    if (!wanted) {
        current.current = null;
        return;
    }
    const entry = { assetId: wanted, texture: null };
    current.current = entry;
    const asset = assets?.[wanted];
    if (!asset)
        return;
    void loadEquirectangularTexture(asset)
        .then((texture) => {
        if (current.current !== entry) {
            texture.dispose();
            return;
        }
        entry.texture = texture;
        onLoaded();
    })
        .catch(() => {
        // A failed decode leaves the authored sky in place, which is the same
        // thing the Scene shows when the Asset is missing.
    });
}
function applyFog(scene, state, authored) {
    const touched = state.fog !== null ||
        state.fogColor !== null ||
        state.fogNear !== null ||
        state.fogFar !== null;
    if (!touched) {
        if ("fog" in authored) {
            scene.fog = authored.fog ?? null;
            delete authored.fog;
        }
        return;
    }
    if (!("fog" in authored))
        authored.fog = scene.fog;
    const base = authored.fog;
    const baseFog = base instanceof Fog$2 ? base : null;
    if (state.fog === false || (state.fog === null && !base)) {
        scene.fog = null;
        return;
    }
    const near = state.fogNear ?? baseFog?.near ?? 10;
    const far = Math.max(state.fogFar ?? baseFog?.far ?? 100, near + 0.001);
    const color = state.fogColor
        ? linearColor$1(state.fogColor)
        : (baseFog?.color.clone() ?? new Color$2(0xffffff));
    const live = scene.fog;
    if (live instanceof Fog$2 && live !== base) {
        live.color.copy(color);
        live.near = near;
        live.far = far;
        return;
    }
    scene.fog = new Fog$2(color, near, far);
}
function applyAmbient(scene, state, authored) {
    const touched = state.ambient !== null ||
        state.ambientColor !== null ||
        state.ambientIntensity !== null;
    if (!touched) {
        if (authored.ambient) {
            for (const [light, original] of authored.ambient) {
                light.visible = original.visible;
                light.intensity = original.intensity;
                light.color.copy(original.color);
            }
            delete authored.ambient;
        }
        if (authored.ownedAmbient) {
            authored.ownedAmbient.removeFromParent();
            authored.ownedAmbient.dispose();
            delete authored.ownedAmbient;
        }
        return;
    }
    const captured = authored.ambient ?? new Map();
    authored.ambient = captured;
    let found = false;
    scene.traverse((object) => {
        if (!isAmbientLight(object) || object === authored.ownedAmbient)
            return;
        found = true;
        if (!captured.has(object)) {
            captured.set(object, {
                visible: object.visible,
                intensity: object.intensity,
                color: object.color.clone(),
            });
        }
        const original = captured.get(object);
        object.visible = state.ambient ?? original.visible;
        object.intensity = state.ambientIntensity ?? original.intensity;
        object.color.copy(state.ambientColor ? linearColor$1(state.ambientColor) : original.color);
    });
    if (found) {
        if (authored.ownedAmbient) {
            authored.ownedAmbient.removeFromParent();
            authored.ownedAmbient.dispose();
            delete authored.ownedAmbient;
        }
        return;
    }
    // Nothing to turn on: the Scene has 環境光 off, which is exactly when a
    // 「明るくする」button is worth having.
    if (state.ambient === false) {
        if (authored.ownedAmbient)
            authored.ownedAmbient.visible = false;
        return;
    }
    const owned = authored.ownedAmbient ?? new AmbientLight$1(0xffffff, 1);
    if (!authored.ownedAmbient) {
        owned.name = "xrift-scene-runtime-ambient";
        scene.add(owned);
        authored.ownedAmbient = owned;
    }
    owned.visible = true;
    owned.intensity = state.ambientIntensity ?? 1;
    owned.color.copy(state.ambientColor ? linearColor$1(state.ambientColor) : new Color$2(0xffffff));
}
function applySky(scene, state, authored, override) {
    const touched = state.skybox !== null ||
        state.skyboxIbl !== null ||
        state.skyboxExposure !== null ||
        state.skyboxRotation !== null ||
        state.skyboxImage !== null;
    if (!touched) {
        if (authored.skyVisible) {
            for (const [object, visible] of authored.skyVisible) {
                object.visible = visible;
            }
            delete authored.skyVisible;
        }
        if ("background" in authored) {
            scene.background = authored.background ?? null;
            delete authored.background;
        }
        if ("environment" in authored) {
            scene.environment = authored.environment ?? null;
            delete authored.environment;
        }
        if (authored.backgroundIntensity !== undefined) {
            scene.backgroundIntensity = authored.backgroundIntensity;
            delete authored.backgroundIntensity;
        }
        if (authored.environmentIntensity !== undefined) {
            scene.environmentIntensity = authored.environmentIntensity;
            delete authored.environmentIntensity;
        }
        if (authored.backgroundRotation) {
            scene.backgroundRotation.copy(authored.backgroundRotation);
            delete authored.backgroundRotation;
        }
        if (authored.environmentRotation) {
            scene.environmentRotation.copy(authored.environmentRotation);
            delete authored.environmentRotation;
        }
        return;
    }
    if (!("background" in authored))
        authored.background = scene.background;
    if (!("environment" in authored))
        authored.environment = scene.environment;
    if (authored.backgroundIntensity === undefined) {
        authored.backgroundIntensity = scene.backgroundIntensity;
    }
    if (authored.environmentIntensity === undefined) {
        authored.environmentIntensity = scene.environmentIntensity;
    }
    if (!authored.backgroundRotation) {
        authored.backgroundRotation = scene.backgroundRotation.clone();
    }
    if (!authored.environmentRotation) {
        authored.environmentRotation = scene.environmentRotation.clone();
    }
    // A gradient, Box, Dome or Sky Shader sky is a mesh, so「背景を消す」is a
    // visibility change as well as a `scene.background` one.
    const skyVisible = authored.skyVisible ?? new Map();
    authored.skyVisible = skyVisible;
    const backgroundOn = state.skybox ?? true;
    scene.traverse((object) => {
        if (!isAuthoredSky(object))
            return;
        if (!skyVisible.has(object))
            skyVisible.set(object, object.visible);
        // A swapped image replaces a mesh sky too, so the mesh has to step aside.
        object.visible = backgroundOn && !override;
    });
    if (state.skybox === false) {
        scene.background = null;
    }
    else if (override) {
        scene.background = override;
    }
    else if (state.skybox === true) {
        scene.background = authored.background ?? null;
    }
    const iblOn = state.skyboxIbl;
    if (iblOn === false) {
        scene.environment = null;
    }
    else if (override) {
        scene.environment = override;
    }
    else if (iblOn === true) {
        scene.environment = authored.environment ?? null;
    }
    if (state.skyboxExposure !== null) {
        scene.backgroundIntensity = state.skyboxExposure;
        scene.environmentIntensity = state.skyboxExposure;
    }
    if (state.skyboxRotation !== null) {
        const radians = (state.skyboxRotation * Math.PI) / 180;
        scene.backgroundRotation.set(0, radians, 0);
        scene.environmentRotation.set(0, radians, 0);
    }
}
function applyCamera(camera, state, authored) {
    const perspective = camera;
    if (!Number.isFinite(perspective.fov))
        return;
    if (state.cameraFov === null) {
        if (authored.cameraFov !== undefined) {
            perspective.fov = authored.cameraFov;
            perspective.updateProjectionMatrix();
            delete authored.cameraFov;
        }
        return;
    }
    if (authored.cameraFov === undefined)
        authored.cameraFov = perspective.fov;
    if (perspective.fov === state.cameraFov)
        return;
    perspective.fov = state.cameraFov;
    perspective.updateProjectionMatrix();
}
function applyEnvironment(scene, camera, state, authored, override) {
    applyFog(scene, state, authored);
    applyAmbient(scene, state, authored);
    applySky(scene, state, authored, override);
    applyCamera(camera, state, authored);
}
/** Puts every field a graph changed back, for Stop and unmount. */
function restoreAuthoredScene(scene, camera, authored) {
    applyFog(scene, IDLE_STATE, authored);
    applyAmbient(scene, IDLE_STATE, authored);
    applySky(scene, IDLE_STATE, authored, null);
    // The camera can already be gone when the whole Canvas unmounts; there is
    // nothing left to restore a field of view onto in that case.
    if (camera)
        applyCamera(camera, IDLE_STATE, authored);
}
/**
 * Applies the Scene bridge.
 *
 * Exposure and the fade are written every frame because the compositor also
 * writes exposure whenever its settings change; the last writer each frame is
 * what the viewer sees, and a graph's exposure has to be that. Everything else
 * is applied only when the bridge's revision changes, so a world whose graph
 * never touches the sky does no per-frame work for it.
 *
 * Bloom, AO and grading are deliberately absent: `ScenePostprocessing` owns
 * those passes and reads the same bridge itself, rather than having them
 * written into it from two places.
 */
function XriftSceneRuntime({ enabled = true, assets, }) {
    const scene = useThree$4((state) => state.scene);
    const bridge = useMemo$4(() => createXriftSceneRuntimeBridge(), []);
    const fadeRef = useRef$3(null);
    const authoredExposure = useRef$3(null);
    const appliedRevision = useRef$3(null);
    const skyboxTexture = useRef$3(null);
    const authored = useRef$3({});
    const lastCamera = useRef$3(null);
    useEffect$4(() => {
        if (!enabled)
            return;
        const holder = scene.userData;
        holder[XRIFT_SCENE_RUNTIME_USER_DATA_KEY] = bridge;
        return () => {
            delete holder[XRIFT_SCENE_RUNTIME_USER_DATA_KEY];
        };
    }, [bridge, enabled, scene]);
    useEffect$4(() => {
        // Stop, unmount and hot reload all land here. Everything a graph changed is
        // runtime-only, so the authored Scene has to be back before the next frame
        // draws — the same contract a Script's overrides keep.
        const owned = authored;
        const texture = skyboxTexture;
        const camera = lastCamera;
        return () => {
            restoreAuthoredScene(scene, camera.current, owned.current);
            owned.current = {};
            texture.current?.texture?.dispose();
            texture.current = null;
            appliedRevision.current = null;
        };
    }, [scene]);
    useFrame$2(({ camera, gl, size }) => {
        lastCamera.current = camera;
        const state = bridge.read();
        if (state.exposure === null) {
            if (authoredExposure.current !== null) {
                gl.toneMappingExposure = authoredExposure.current;
                authoredExposure.current = null;
            }
        }
        else {
            if (authoredExposure.current === null) {
                authoredExposure.current = gl.toneMappingExposure;
            }
            gl.toneMappingExposure = state.exposure;
        }
        if (appliedRevision.current !== state.revision) {
            appliedRevision.current = state.revision;
            syncSkyboxImage(state, assets, skyboxTexture, () => {
                // An image that finishes decoding after its write has to be put up on
                // its own: the revision it belonged to is already applied, and waiting
                // for the next one would leave the old sky there indefinitely.
                applyEnvironment(scene, camera, bridge.read(), authored.current, skyboxTexture.current?.texture ?? null);
            });
            applyEnvironment(scene, camera, state, authored.current, skyboxTexture.current?.texture ?? null);
        }
        const mesh = fadeRef.current;
        if (!mesh)
            return;
        const visible = state.fade > 0.001;
        mesh.visible = visible;
        if (!visible)
            return;
        const material = mesh.material;
        material.opacity = state.fade;
        material.color.setRGB(state.fadeColor[0], state.fadeColor[1], state.fadeColor[2], LinearSRGBColorSpace$1);
        // Parked just in front of the near plane and scaled to the frustum, so the
        // cover works at any field of view without a second render pass.
        const distance = 0.12;
        mesh.position.copy(camera.position);
        mesh.quaternion.copy(camera.quaternion);
        mesh.translateZ(-distance);
        const perspective = camera;
        const height = Number.isFinite(perspective.fov)
            ? 2 * distance * Math.tan(((perspective.fov ?? 60) * Math.PI) / 360)
            : distance * 2;
        const aspect = size.height === 0 ? 1 : size.width / size.height;
        mesh.scale.set(height * aspect * 1.2, height * 1.2, 1);
    });
    if (!enabled)
        return null;
    return (_jsxs$1("mesh", { ref: fadeRef, renderOrder: 10000, frustumCulled: false, visible: false, children: [_jsx$1("planeGeometry", { args: [1, 1] }), _jsx$1("meshBasicMaterial", { transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0 })] }));
}

const XRIFT_PLAYER_RUNTIME_USER_DATA_KEY = "xriftPlayerRuntime";
function isXriftPlayerRuntimeBridge(value) {
    const candidate = value;
    return (typeof candidate === "object" &&
        candidate !== null &&
        typeof candidate.teleport === "function");
}
function findXriftPlayerRuntimeBridge(root) {
    const candidate = root.userData[XRIFT_PLAYER_RUNTIME_USER_DATA_KEY];
    return isXriftPlayerRuntimeBridge(candidate) ? candidate : null;
}

const XRIFT_INSTANCE_STATE_RUNTIME_USER_DATA_KEY = "xriftInstanceStateRuntime";
function isXriftInstanceStateRuntimeBridge(value) {
    const candidate = value;
    return (typeof candidate === "object" &&
        candidate !== null &&
        typeof candidate.send === "function" &&
        typeof candidate.entries === "function" &&
        typeof candidate.subscribe === "function");
}
function findXriftInstanceStateRuntimeBridge(root) {
    const candidate = root.userData[XRIFT_INSTANCE_STATE_RUNTIME_USER_DATA_KEY];
    return isXriftInstanceStateRuntimeBridge(candidate) ? candidate : null;
}
/**
 * The id one shared action broadcasts under.
 *
 * Every viewer runs the same graph over the same Scene, so the id has to be
 * derived from what the action is - not from anything a runtime generates. Two
 * actions writing the same property of the same Component are the same shared
 * fact and deliberately collide: the last press wins for everyone, which is the
 * only answer that leaves the room agreeing.
 *
 * The Entity must already be resolved: `__xrift_self__` names a different
 * Entity in every graph that uses it, and an unresolved sentinel would make one
 * id mean several doors.
 */
function xriftSharedActionStateId(target) {
    return [
        "xrift-action",
        target.entityId,
        target.componentId ?? "",
        target.targetKind,
        target.property,
    ].join(":");
}

/**
 * Interaction triggers: the XRift extension operations a KHR_interactivity
 * graph uses to answer "what happens when this Entity is interacted with".
 *
 * The Studio editor, the Play preview and the published world all read this
 * module, for the same reason `interactivity-adapter.ts` is shared: a trigger
 * that behaves one way while authoring and another way after publishing is
 * worse than no trigger at all. Only the classification and the parse live
 * here; presentation belongs to the Editor and application to the runtime.
 *
 * Input is untrusted published JSON, so every read is structural and the graph
 * is never rewritten. An action this module does not understand is preserved
 * in the canonical JSON and simply does not run.
 */
/** glTF extension that defines the operations below. */
const XRIFT_INTERACTION_OPERATIONS = {
    setProperty: "xrift/setProperty",
    toggleProperty: "xrift/toggleProperty",
};
/**
 * "Whatever Entity this graph is attached to."
 *
 * An action that names an Entity by id belongs to one Scene and one Entity, so
 * a graph is a one-off no matter how general its logic is. Pointing at the
 * owner instead makes the graph the reusable part: attach「押したら開く」to
 * every door and each one opens itself. An explicit id still wins, for the
 * cases where a switch over here moves a thing over there.
 */
const XRIFT_INTERACTION_SELF_ENTITY_ID = "__xrift_self__";
/** The Entity an action names, with the owner substituted for the sentinel. */
function resolveXriftInteractionEntityId(entityId, selfEntityId) {
    return entityId === XRIFT_INTERACTION_SELF_ENTITY_ID && selfEntityId
        ? selfEntityId
        : entityId;
}
/**
 * Targets that belong to one viewer by design, rather than by omission.
 *
 * The Scene target is the picture: post effects, fog, exposure, the sky, the
 * field of view, the screen fade. The player target is where this person is
 * standing. Synchronising either would decide for somebody else - the person on
 * the slowest headset, or a player who pressed nothing and is suddenly
 * somewhere new.
 *
 * Everything else is world content, and reaches one viewer only because
 * nothing synchronises it yet.
 */
const VIEWER_SCOPED_TARGETS = new Set([
    "scene",
    "player",
]);
function getXriftInteractionScope(target) {
    return VIEWER_SCOPED_TARGETS.has(target) ? "viewer" : "world";
}
/**
 * Targets that belong to the Entity rather than to one of its Components.
 *
 * A Component target needs an id so two Audio Sources on one Entity stay
 * distinguishable; an Entity-scoped one has nothing to distinguish, so
 * requiring an id there would make a complete action look unfinished.
 */
const XRIFT_INTERACTION_ENTITY_SCOPED_TARGETS = new Set([
    "entity",
    "transform",
    "material",
    "scene",
    "player",
]);
function isXriftInteractionEntityScoped(target) {
    return XRIFT_INTERACTION_ENTITY_SCOPED_TARGETS.has(target);
}
/**
 * Every property a trigger can write.
 *
 * Audio Source playback is an enum rather than a boolean because the runtime
 * bridge takes commands (`play` / `pause` / `stop`), not an enabled flag:
 * modelling it as "enabled" would promise a state the runtime cannot hold.
 */
const XRIFT_INTERACTION_PROPERTIES = [
    {
        target: "entity",
        name: "enabled",
        label: "表示",
        description: "Entityとその子の表示を切り替えます。物理コライダーは残ります。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "transform",
        name: "position",
        label: "位置",
        description: "Entityの位置を、親から見たXYZ（メートル）で設定します。動作確認を止めると元の位置に戻ります。",
        kind: "vector3",
        defaultValue: [0, 0, 0],
    },
    {
        target: "transform",
        name: "rotation",
        label: "回転",
        description: "EntityのXYZ回転を度で設定します。動作確認を止めると元の回転に戻ります。",
        kind: "vector3",
        defaultValue: [0, 0, 0],
    },
    {
        target: "transform",
        name: "scale",
        label: "大きさ",
        description: "EntityのXYZ倍率を設定します。0にすると見えなくなります。動作確認を止めると元に戻ります。",
        kind: "vector3",
        defaultValue: [1, 1, 1],
    },
    {
        target: "animation",
        name: "playing",
        label: "再生中",
        description: "モデルのアニメーションを再生・停止します。操作時だけ再生する場合は、開始時に再生するノードを外してください。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "animation",
        name: "clip",
        label: "クリップ番号",
        description: "再生するクリップを番号で選びます。0が3Dモデルの最初のクリップです。範囲外の番号は最後のクリップになります。",
        kind: "float",
        defaultValue: 0,
        min: 0,
        max: 63,
        step: 1,
    },
    {
        target: "animation",
        name: "speed",
        label: "再生速度",
        description: "1で等速、0.5で半分の速さになります。",
        kind: "float",
        defaultValue: 1,
        min: 0.01,
        max: 10,
        step: 0.05,
    },
    {
        target: "animation",
        name: "time",
        label: "再生位置",
        description: "クリップの先頭からの秒数へ移動します。再生中なら、その位置から続けます。",
        kind: "float",
        defaultValue: 0,
        min: 0,
        max: 600,
        step: 0.1,
    },
    {
        target: "material",
        name: "baseColor",
        label: "Base Color",
        description: "このEntityが描くマテリアルの色を変えます。Entity内のすべてのマテリアルが対象です。動作確認を止めると元へ戻ります。",
        kind: "color",
        defaultValue: [1, 1, 1],
    },
    {
        target: "material",
        name: "emissive",
        label: "Emissive",
        description: "自己発光の色を変えます。Bloomと合わせると光って見えます。値はリニア空間のRGBです。",
        kind: "color",
        defaultValue: [0, 0, 0],
    },
    {
        target: "material",
        name: "emissiveIntensity",
        label: "Emissive Strength",
        description: "Emissiveの強さを変えます。0で消灯します。",
        kind: "float",
        defaultValue: 1,
        min: 0,
        max: 10,
        step: 0.05,
    },
    {
        target: "material",
        name: "opacity",
        label: "Opacity",
        description: "1で不透明、0で透明になります。1未満で半透明に描きます。ガラスのTransmissionとは別です。",
        kind: "float",
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.01,
    },
    {
        target: "particle",
        name: "emitting",
        label: "放出",
        description: "ONで粒を出し、OFFで止めて消します。押したときに出すには、最初はOFFにしておきます。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "particle",
        name: "restart",
        label: "出し直す",
        description: "この値を書き込むたびに、粒を最初から出し直します。一瞬だけ吹き出す表現に使います。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "particle",
        name: "emissionRate",
        label: "放出量",
        description: "1秒あたりに出る粒の数を上書きします。",
        kind: "float",
        defaultValue: 20,
        min: 0,
        max: 1000,
        step: 1,
    },
    {
        target: "particle",
        name: "sizeMultiplier",
        label: "粒の大きさ",
        description: "1で元の大きさ、2で倍になります。",
        kind: "float",
        defaultValue: 1,
        min: 0,
        max: 10,
        step: 0.05,
    },
    {
        target: "particle",
        name: "opacity",
        label: "粒の不透明度",
        description: "0で見えなくなり、1で元の濃さになります。",
        kind: "float",
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.01,
    },
    {
        target: "particle",
        name: "color",
        label: "粒の色",
        description: "粒の色を変えます。値はリニア空間のRGBで保存されます。",
        kind: "color",
        defaultValue: [1, 1, 1],
    },
    {
        target: "scene",
        name: "exposure",
        label: "露出",
        description: "画面全体の明るさを設定します。1が既定です。動作確認を止めるとシーンの設定へ戻ります。",
        kind: "float",
        defaultValue: 1,
        min: 0,
        max: 8,
        step: 0.05,
    },
    {
        target: "scene",
        name: "fade",
        label: "画面のフェード",
        description: "0で世界が見え、1で画面全体を覆います。時間をかけて変えるとホワイトアウトや暗転になります。",
        kind: "float",
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.01,
    },
    {
        target: "scene",
        name: "fadeColor",
        label: "フェードの色",
        description: "画面を覆う色です。値はリニア空間のRGBで保存されます。",
        kind: "color",
        defaultValue: [1, 1, 1],
    },
    {
        target: "scene",
        name: "postprocessing",
        label: "Post Processing",
        description: "画面全体の効果を切り替えます。操作した人の画面だけに反映され、各効果の設定は残ります。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "scene",
        name: "bloom",
        label: "Bloom",
        description: "明るい部分の光のにじみを切り替えます。Post Processingも有効にしてください。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "scene",
        name: "bloomStrength",
        label: "Bloom Strength",
        description: "光のにじみの強さです。0で効果なし、大きくすると強くなります。",
        kind: "float",
        defaultValue: 1,
        min: 0,
        max: 5,
        step: 0.05,
    },
    {
        target: "scene",
        name: "bloomRadius",
        label: "Bloom Radius",
        description: "光のにじみの広がりです。大きくすると、広く柔らかく見えます。",
        kind: "float",
        defaultValue: 0.4,
        min: 0,
        max: 1,
        step: 0.01,
    },
    {
        target: "scene",
        name: "bloomThreshold",
        label: "Bloom Threshold",
        description: "この明るさを超えた部分にBloomをかけます。下げると、より暗い部分も対象になります。",
        kind: "float",
        defaultValue: 0.8,
        min: 0,
        max: 1,
        step: 0.01,
    },
    {
        target: "scene",
        name: "ao",
        label: "SSAO",
        description: "接地部分や隙間の陰影を切り替えます。Post Processingも有効にしてください。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "scene",
        name: "grading",
        label: "Color Grading",
        description: "画面全体の明暗差や色味の調整を切り替えます。Post Processingも有効にしてください。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "scene",
        name: "fog",
        label: "Fog",
        description: "遠くを霧でかすませる効果を切り替えます。オフにしても遠景の描画は省略されません。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "scene",
        name: "fogColor",
        label: "Fog Color",
        description: "霧の色を変えます。RGBはLinearの値です。",
        kind: "color",
        defaultValue: [1, 1, 1],
    },
    {
        target: "scene",
        name: "fogNear",
        label: "Fog Near",
        description: "カメラから、この距離を超えると霧がかかり始めます。",
        kind: "float",
        defaultValue: 10,
        min: 0,
        max: 10000,
        step: 0.5,
    },
    {
        target: "scene",
        name: "fogFar",
        label: "Fog Far",
        description: "霧が最も濃くなる距離です。Fog Nearより手前にはできません。",
        kind: "float",
        defaultValue: 100,
        min: 0,
        max: 10000,
        step: 0.5,
    },
    {
        target: "scene",
        name: "ambient",
        label: "Ambient Light",
        description: "全体を均一に照らすライトを切り替えます。IBLや他のライトは変わりません。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "scene",
        name: "ambientColor",
        label: "Ambient Light Color",
        description: "全体を均一に照らすライトの色です。RGBはLinearの値です。",
        kind: "color",
        defaultValue: [1, 1, 1],
    },
    {
        target: "scene",
        name: "ambientIntensity",
        label: "Ambient Light Intensity",
        description: "全体を均一に照らすライトの強さです。0で効果なし、大きくすると明るくなります。",
        kind: "float",
        defaultValue: 1,
        min: 0,
        max: 10,
        step: 0.05,
    },
    {
        target: "scene",
        name: "skybox",
        label: "Skybox",
        description: "Skyboxの表示を切り替えます。オフにするとシーンの背景色に戻ります。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "scene",
        name: "skyboxIbl",
        label: "IBL",
        description: "Skybox Textureを照明と反射に使うか切り替えます。先にシーンへ画像を設定してください。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "scene",
        name: "skyboxExposure",
        label: "Skybox Intensity",
        description: "背景とIBLの明るさです。1が標準です。Skybox Shaderは対応するものに反映されます。",
        kind: "float",
        defaultValue: 1,
        min: 0,
        max: 8,
        step: 0.05,
    },
    {
        target: "scene",
        name: "skyboxRotation",
        label: "Skybox Rotation",
        description: "背景とIBLを水平に回転します。単位は度です。Skybox Shaderは対応するものに反映されます。",
        kind: "float",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 1,
    },
    {
        target: "scene",
        name: "skyboxImage",
        label: "Skybox Texture",
        description: "背景とIBLに使う全天球画像を差し替えます。未選択で元の画像へ戻ります。徐々に切り替えることはできません。",
        kind: "asset",
        defaultValue: "",
        assetKinds: ["skybox", "texture"],
    },
    {
        target: "scene",
        name: "cameraFov",
        label: "視野角",
        description: "カメラの視野角を度で設定します。狭めると望遠、広げると広角になります。",
        kind: "float",
        defaultValue: 60,
        min: 1,
        max: 179,
        step: 1,
    },
    {
        target: "audio-source",
        name: "playback",
        label: "再生",
        description: "音源の再生・一時停止・停止を切り替えます。操作時だけ鳴らす場合は、音源を有効にしたまま「自動で再生する」をオフにします。",
        kind: "enum",
        defaultValue: "play",
        options: [
            { value: "play", label: "再生" },
            { value: "pause", label: "一時停止" },
            { value: "stop", label: "停止" },
        ],
    },
    {
        target: "audio-source",
        name: "volume",
        label: "音量",
        description: "0で無音、1で元の音量になります。",
        kind: "float",
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.01,
    },
    {
        target: "audio-source",
        name: "loop",
        label: "ループ",
        description: "再生し終わったあと繰り返すかどうかを変えます。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "light",
        name: "enabled",
        label: "点灯",
        description: "ライトの点灯と消灯を切り替えます。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "light",
        name: "intensity",
        label: "明るさ",
        description: "0で消灯し、値を大きくすると明るくなります。",
        kind: "float",
        defaultValue: 1,
        min: 0,
        max: 100,
        step: 0.1,
    },
    {
        target: "light",
        name: "color",
        label: "色",
        description: "ライトの色を変えます。値はリニア空間のRGBで保存されます。",
        kind: "color",
        defaultValue: [1, 1, 1],
    },
    {
        target: "text",
        name: "enabled",
        label: "表示",
        description: "このテキストだけを表示・非表示にします。Entityごと消すわけではありません。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "text",
        name: "text",
        label: "文字",
        description: "表示する文字を差し替えます。改行を含められます。時間をかけた変化はできません。",
        kind: "string",
        defaultValue: "",
    },
    {
        target: "text",
        name: "color",
        label: "文字の色",
        description: "文字の色を変えます。値はリニア空間のRGBで保存されます。",
        kind: "color",
        defaultValue: [1, 1, 1],
    },
    {
        target: "text",
        name: "fontSize",
        label: "文字の大きさ",
        description: "1文字の高さをメートルで指定します。",
        kind: "float",
        defaultValue: 0.2,
        min: 0.001,
        max: 20,
        step: 0.01,
    },
    {
        target: "text",
        name: "fontWeight",
        label: "太さ",
        description: "100から900までの字面の太さです。選んだフォントが持たない太さは、いちばん近いものになります。",
        kind: "float",
        defaultValue: 400,
        min: 100,
        max: 900,
        step: 100,
    },
    {
        target: "text",
        name: "fontId",
        label: "フォント",
        description: "カタログのフォントへ切り替えます。autoで自動選択に戻ります。プロジェクトへ取り込んだフォント素材を使っているテキストでは、切り替えたあいだその素材を使いません。",
        kind: "string",
        defaultValue: "auto",
    },
    {
        target: "text",
        name: "textAlign",
        label: "行揃え",
        description: "複数行の文字揃えを変えます。テキスト全体の位置は基準位置で決まります。",
        kind: "enum",
        defaultValue: "left",
        options: [
            { value: "left", label: "左" },
            { value: "center", label: "中央" },
            { value: "right", label: "右" },
            { value: "justify", label: "両端" },
        ],
    },
    {
        target: "text",
        name: "lineHeight",
        label: "行の高さ",
        description: "文字の大きさに対する行送りの倍率です。",
        kind: "float",
        defaultValue: 1.2,
        min: 0.1,
        max: 4,
        step: 0.05,
    },
    {
        target: "text",
        name: "letterSpacing",
        label: "字間",
        description: "文字の大きさに対する字間の増減です。",
        kind: "float",
        defaultValue: 0,
        min: -0.5,
        max: 1,
        step: 0.01,
    },
    {
        target: "text",
        name: "maxWidth",
        label: "折り返し幅",
        description: "この幅を超えると折り返します。0で折り返しません。",
        kind: "float",
        defaultValue: 0,
        min: 0,
        max: 100,
        step: 0.05,
    },
    {
        target: "text",
        name: "outlineWidth",
        label: "縁取りの太さ",
        description: "文字の大きさに対する縁取りの太さです。0で縁取りなしになります。",
        kind: "float",
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.005,
    },
    {
        target: "text",
        name: "outlineColor",
        label: "縁取りの色",
        description: "縁取りの色です。値はリニア空間のRGBで保存されます。",
        kind: "color",
        defaultValue: [0, 0, 0],
    },
    {
        target: "image",
        name: "enabled",
        label: "表示",
        description: "この画像だけを表示・非表示にします。Entityごと消すわけではありません。",
        kind: "bool",
        defaultValue: true,
    },
    {
        target: "image",
        name: "color",
        label: "色味",
        description: "画像に掛ける色を変えます。白で元の画像のままです。値はリニア空間のRGBで保存されます。",
        kind: "color",
        defaultValue: [1, 1, 1],
    },
    {
        target: "image",
        name: "opacity",
        label: "不透明度",
        description: "0で見えなくなり、1で元の濃さになります。時間をかけるとフェードになります。",
        kind: "float",
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.01,
    },
    {
        target: "player",
        name: "teleport",
        label: "テレポート",
        description: "操作した人を指定の座標へ移動させます。足が着く位置を指定してください。落下時に戻る場所は変わりません。",
        kind: "vector3",
        defaultValue: [0, 0, 0],
    },
];
function getXriftInteractionProperty(target, property) {
    return XRIFT_INTERACTION_PROPERTIES.find((descriptor) => descriptor.target === target && descriptor.name === property);
}
function asRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function configurationString(node, name) {
    const entry = asRecord(asRecord(node?.configuration)?.[name]);
    const values = entry?.value;
    const first = Array.isArray(values) ? values[0] : undefined;
    return typeof first === "string" ? first : null;
}
/** A socket fed by another node, which only the interpreter can evaluate. */
const LINKED_SOCKET = Symbol("linked-socket");
function inlineSocketValues(node, socket) {
    const entry = asRecord(asRecord(node?.values)?.[socket]);
    if (!entry)
        return null;
    // Reading the literal an author replaced with a wire would run the wrong
    // value, so it is reported as linked rather than read.
    if (entry.node !== undefined)
        return LINKED_SOCKET;
    return Array.isArray(entry.value) ? entry.value : [];
}
/**
 * Reads the value socket for one property.
 *
 * An empty inline value takes the descriptor's default, which is what the RC
 * specifies for a declared socket with no value written yet.
 */
function readActionValue(node, descriptor) {
    const values = inlineSocketValues(node, "value");
    if (values === null)
        return null;
    if (values === LINKED_SOCKET)
        return { kind: "linked" };
    const first = values[0];
    switch (descriptor.kind) {
        case "bool":
            if (first === undefined)
                return { kind: "bool", value: Boolean(descriptor.defaultValue) };
            return typeof first === "boolean" ? { kind: "bool", value: first } : null;
        case "float": {
            if (first === undefined) {
                return { kind: "float", value: Number(descriptor.defaultValue) };
            }
            if (typeof first !== "number" || !Number.isFinite(first))
                return null;
            return { kind: "float", value: clampFloat(first, descriptor) };
        }
        case "color": {
            if (first === undefined) {
                const fallback = descriptor.defaultValue;
                return { kind: "color", value: [fallback[0], fallback[1], fallback[2]] };
            }
            const channels = values.slice(0, 3);
            if (channels.length !== 3 ||
                channels.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
                return null;
            }
            const [red, green, blue] = channels;
            return { kind: "color", value: [red, green, blue] };
        }
        case "vector3": {
            if (first === undefined) {
                const fallback = descriptor.defaultValue;
                return { kind: "vector3", value: [fallback[0], fallback[1], fallback[2]] };
            }
            const components = values.slice(0, 3);
            if (components.length !== 3 ||
                components.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
                return null;
            }
            const [x, y, z] = components;
            return { kind: "vector3", value: [x, y, z] };
        }
        case "asset":
        case "string":
            // Handled before this function is reached; the socket carries nothing.
            return null;
        case "enum": {
            const options = descriptor.options ?? [];
            if (first === undefined) {
                return { kind: "enum", value: String(descriptor.defaultValue) };
            }
            // Stored as the option index because KHR_interactivity has no string type.
            if (typeof first !== "number" || !Number.isInteger(first))
                return null;
            const option = options[first];
            return option ? { kind: "enum", value: option.value } : null;
        }
    }
}
function clampFloat(value, descriptor) {
    const lower = descriptor.min ?? Number.NEGATIVE_INFINITY;
    const upper = descriptor.max ?? Number.POSITIVE_INFINITY;
    return Math.min(Math.max(value, lower), upper);
}
/**
 * Every graph in the Asset.
 *
 * The trigger runtime runs them all — an Asset holds several so they can
 * compose — so the compiler's dependency list and the Editor's diagnostics have
 * to look at all of them too. Reading only the default graph made an action in
 * the second one invisible to both.
 */
function parseAllGraphs(value) {
    const extension = asRecord(value);
    const graphs = Array.isArray(extension?.graphs) ? extension.graphs : [];
    return graphs.flatMap((_candidate, index) => {
        const parsed = parseGraphAt(value, index);
        return parsed ? [parsed] : [];
    });
}
function parseGraphAt(value, graphIndex) {
    const extension = asRecord(value);
    const graphs = Array.isArray(extension?.graphs) ? extension.graphs : [];
    const graph = asRecord(graphs[graphIndex]);
    if (!graph)
        return null;
    const declarations = Array.isArray(graph.declarations) ? graph.declarations : [];
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    return {
        graphIndex,
        nodes,
        operationFor: (node) => {
            const declarationIndex = node?.declaration;
            if (typeof declarationIndex !== "number" ||
                !Number.isInteger(declarationIndex) ||
                declarationIndex < 0) {
                return undefined;
            }
            const op = asRecord(declarations[declarationIndex])?.op;
            return typeof op === "string" ? op : undefined;
        },
    };
}
function readAction(node, nodeIndex, op) {
    const entityId = configurationString(node, "entity");
    const componentId = configurationString(node, "component");
    const target = configurationString(node, "targetKind");
    const property = configurationString(node, "property");
    if (!entityId || !target || !property)
        return null;
    const descriptor = getXriftInteractionProperty(target, property);
    if (!descriptor)
        return null;
    if (!isXriftInteractionEntityScoped(descriptor.target) && !componentId) {
        return null;
    }
    const mode = op === XRIFT_INTERACTION_OPERATIONS.toggleProperty ? "toggle" : "set";
    // Authoring intent, so it lives beside the target rather than in a socket:
    // "everyone sees this" is not a quantity and nothing interpolates it.
    const shared = configurationString(node, "shared") === "true" &&
        getXriftInteractionScope(descriptor.target) === "world";
    if (mode === "toggle") {
        if (descriptor.kind !== "bool")
            return null;
        return {
            nodeIndex,
            mode,
            entityId,
            componentId: isXriftInteractionEntityScoped(descriptor.target)
                ? null
                : componentId,
            target: descriptor.target,
            property: descriptor.name,
            value: null,
            shared,
        };
    }
    // An Asset id and a sentence are configuration, not socket values: neither is
    // a quantity, so both are read from beside the target.
    const value = descriptor.kind === "asset"
        ? {
            kind: "asset",
            value: configurationString(node, "asset") || null,
        }
        : descriptor.kind === "string"
            ? {
                kind: "string",
                value: configurationString(node, "text") ?? "",
            }
            : readActionValue(node, descriptor);
    if (!value)
        return null;
    return {
        nodeIndex,
        mode,
        entityId,
        componentId: isXriftInteractionEntityScoped(descriptor.target)
            ? null
            : componentId,
        target: descriptor.target,
        property: descriptor.name,
        value,
        shared,
    };
}
/**
 * Every action node in the Asset, whether or not a flow reaches it.
 *
 * `collectXriftInteractionPrograms` walks forward from `xrift/onInteract`,
 * which is the right question for「押したら何が起きるか」and the wrong one for
 * dependencies: a timeline that starts itself, or a chain behind
 * `event/receive`, writes to Entities and Assets the walk never visits. What
 * the world has to ship is decided by what the graph *can* write, so this
 * reads every node instead.
 */
function collectXriftInteractionActions(value) {
    return parseAllGraphs(value).flatMap((parsed) => parsed.nodes.flatMap((candidate, nodeIndex) => {
        const node = asRecord(candidate);
        const op = parsed.operationFor(node);
        if (!node ||
            (op !== XRIFT_INTERACTION_OPERATIONS.setProperty &&
                op !== XRIFT_INTERACTION_OPERATIONS.toggleProperty)) {
            return [];
        }
        const action = readAction(node, nodeIndex, op);
        return action ? [action] : [];
    }));
}

const {useEffect: useEffect$3,useMemo: useMemo$3,useRef: useRef$2} = await importShared('react');

const {useFrame: useFrame$1,useThree: useThree$3} = await importShared('@react-three/fiber');

const {Color: Color$1,Fog: Fog$1,LinearSRGBColorSpace,MathUtils,SRGBColorSpace: SRGBColorSpace$1} = await importShared('three');
const interactionHandlers = new Map();
function subscribeXriftInteraction(entityId, handler) {
    const existing = interactionHandlers.get(entityId) ?? new Set();
    existing.add(handler);
    interactionHandlers.set(entityId, existing);
    return () => {
        const current = interactionHandlers.get(entityId);
        if (!current)
            return;
        current.delete(handler);
        if (current.size === 0)
            interactionHandlers.delete(entityId);
    };
}
/** Called by the Entity's official Interactable when a player interacts. */
function emitXriftInteraction(entityId) {
    const handlers = interactionHandlers.get(entityId);
    if (!handlers)
        return;
    for (const handler of [...handlers])
        handler();
}
function entityMarker(object) {
    const data = object.userData;
    // Studio Play and generated output mark Entities with different keys; a
    // trigger has to resolve a target in both.
    const candidate = data.renderedEntityId ?? data.xriftEntityId ?? data.authoringEntityId;
    return typeof candidate === "string" ? candidate : undefined;
}
function findEntityObject(root, entityId) {
    let found = null;
    root.traverse((object) => {
        if (!found && entityMarker(object) === entityId)
            found = object;
    });
    return found;
}
/**
 * Visits runtime bridges belonging to one Entity.
 *
 * The traversal stops at a nested Entity so a trigger aimed at a parent never
 * silently writes to a child's Audio Source.
 */
function forEachOwnedBridge(root, entityId, userDataKey, isBridge, callback) {
    const seen = new Set();
    const visit = (object) => {
        if (object !== root) {
            const marker = entityMarker(object);
            if (marker && marker !== entityId)
                return;
        }
        const candidate = object.userData[userDataKey];
        if (isBridge(candidate) && !seen.has(candidate)) {
            seen.add(candidate);
            callback(candidate);
        }
        for (const child of object.children)
            visit(child);
    };
    visit(root);
}
/**
 * One action, as the Text bridge's override shape.
 *
 * Colours become CSS hex because that is what the panel config takes; the
 * action carries linear RGB, which is how every other colour in a graph is
 * stored, so the conversion belongs here rather than in the bridge.
 */
function textRuntimeOverrides(action) {
    const value = action.value;
    if (!value)
        return null;
    switch (action.property) {
        case "enabled":
            return value.kind === "bool" ? { enabled: value.value } : null;
        case "text":
            return value.kind === "string" ? { text: value.value } : null;
        case "fontId":
            return value.kind === "string" ? { fontId: value.value } : null;
        case "textAlign":
            return value.kind === "enum"
                ? { textAlign: value.value }
                : null;
        case "color":
            return value.kind === "color" ? { color: hexFromLinear(value.value) } : null;
        case "outlineColor":
            return value.kind === "color"
                ? { outlineColor: hexFromLinear(value.value) }
                : null;
        case "fontSize":
            return value.kind === "float" ? { fontSize: value.value } : null;
        case "fontWeight":
            return value.kind === "float" ? { fontWeight: value.value } : null;
        case "lineHeight":
            return value.kind === "float" ? { lineHeight: value.value } : null;
        case "letterSpacing":
            return value.kind === "float" ? { letterSpacing: value.value } : null;
        case "maxWidth":
            return value.kind === "float" ? { maxWidth: value.value } : null;
        case "outlineWidth":
            return value.kind === "float" ? { outlineWidth: value.value } : null;
        default:
            return null;
    }
}
/**
 * One action, as the Image bridge's override shape.
 *
 * The same colour conversion as Text: the action carries linear RGB, the quad
 * config takes CSS hex.
 */
function imageRuntimeOverrides(action) {
    const value = action.value;
    if (!value)
        return null;
    switch (action.property) {
        case "enabled":
            return value.kind === "bool" ? { enabled: value.value } : null;
        case "color":
            return value.kind === "color" ? { color: hexFromLinear(value.value) } : null;
        case "opacity":
            return value.kind === "float" ? { opacity: value.value } : null;
        default:
            return null;
    }
}
function hexFromLinear(value) {
    return `#${new Color$1()
        .setRGB(value[0], value[1], value[2], LinearSRGBColorSpace)
        .getHexString(SRGBColorSpace$1)}`;
}
function isAudioSourceBridge(value) {
    const candidate = value;
    return (typeof candidate === "object" &&
        candidate !== null &&
        typeof candidate.setOwner === "function" &&
        typeof candidate.command === "function" &&
        typeof candidate.read === "function");
}
function isParticleBridge(value) {
    const candidate = value;
    return (typeof candidate === "object" &&
        candidate !== null &&
        typeof candidate.setOwner === "function" &&
        typeof candidate.removeOwner === "function" &&
        typeof candidate.read === "function");
}
function isLightBridge(value) {
    const candidate = value;
    return (typeof candidate === "object" &&
        candidate !== null &&
        typeof candidate.setOwner === "function" &&
        typeof candidate.removeOwner === "function" &&
        typeof candidate.read === "function");
}
function linearColor(value) {
    return new Color$1().setRGB(value[0], value[1], value[2], LinearSRGBColorSpace);
}
/**
 * The write half of a trigger, without React.
 *
 * Kept separate from the component so the part that actually changes a world
 * can be exercised against a plain scene graph: an override that survives Stop,
 * or a toggle that reads the wrong current value, is not something a rendered
 * preview makes obvious.
 */
function createXriftInteractionApplier({ root, componentId, order, selfEntityId = null, }) {
    const owner = {};
    /**
     * What an Entity looked like before this trigger touched it.
     *
     * Visibility and Transform are written straight onto the object rather than
     * through a bridge, so nothing else would put them back. Capturing the first
     * value means Play Stop leaves the Scene exactly as it was authored, which is
     * the same promise the Light and Audio overrides already make.
     */
    const restorePoints = new Map();
    const ownEntityId = (id) => resolveXriftInteractionEntityId(id, selfEntityId);
    const remember = (object) => {
        if (restorePoints.has(object))
            return;
        restorePoints.set(object, {
            visible: object.visible,
            position: [object.position.x, object.position.y, object.position.z],
            rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
            scale: [object.scale.x, object.scale.y, object.scale.z],
        });
    };
    const lightOverrides = new Map();
    const audioOverrides = new Map();
    let commandRevision = 0;
    const applyEntity = (target, action) => {
        remember(target);
        // Visibility only: physics bodies stay as authored, which is the same
        // meaning `enabled` has in the Editor viewport.
        target.visible =
            action.mode === "toggle"
                ? !target.visible
                : action.value?.kind === "bool"
                    ? action.value.value
                    : target.visible;
    };
    const applyTransform = (target, action) => {
        if (action.value?.kind !== "vector3")
            return;
        remember(target);
        const [x, y, z] = action.value.value;
        if (action.property === "position") {
            target.position.set(x, y, z);
            return;
        }
        if (action.property === "rotation") {
            // Authored in degrees, because a graph is edited by hand and radians are
            // not a number an author has an opinion about.
            target.rotation.set(MathUtils.degToRad(x), MathUtils.degToRad(y), MathUtils.degToRad(z));
            return;
        }
        if (action.property === "scale")
            target.scale.set(x, y, z);
    };
    const readTransform = (object, property) => {
        if (property === "position") {
            return {
                kind: "vector3",
                value: [object.position.x, object.position.y, object.position.z],
            };
        }
        if (property === "rotation") {
            return {
                kind: "vector3",
                value: [
                    MathUtils.radToDeg(object.rotation.x),
                    MathUtils.radToDeg(object.rotation.y),
                    MathUtils.radToDeg(object.rotation.z),
                ],
            };
        }
        if (property === "scale") {
            return {
                kind: "vector3",
                value: [object.scale.x, object.scale.y, object.scale.z],
            };
        }
        return null;
    };
    const animationOwners = new Set();
    const sceneOwners = new Set();
    const textOwners = new Set();
    const imageOwners = new Set();
    /**
     * Meshes whose Material this trigger replaced with its own clone.
     *
     * A Material Asset is shared, so writing to the instance a Mesh happens to
     * hold would recolour every other Entity using it. Owning a clone first is
     * what keeps the change to this Entity, and keeping the original is what puts
     * the Scene back on Stop.
     */
    const materialRestores = new Map();
    const isMesh = (object) => object.isMesh === true;
    /** Visits this Entity's own Meshes, stopping at a nested Entity. */
    const forEachOwnedMesh = (root, entityId, callback) => {
        const visit = (object) => {
            if (object !== root) {
                const marker = entityMarker(object);
                if (marker && marker !== entityId)
                    return;
            }
            if (isMesh(object))
                callback(object);
            for (const child of object.children)
                visit(child);
        };
        visit(root);
    };
    const ownMaterials = (mesh) => {
        if (!materialRestores.has(mesh)) {
            materialRestores.set(mesh, mesh.material);
            const cloneMaterial = (source) => {
                const clone = source.clone();
                // Three's clone omits callbacks, including authored opacity channels.
                clone.onBeforeCompile = source.onBeforeCompile;
                clone.onBeforeRender = source.onBeforeRender;
                clone.customProgramCacheKey = source.customProgramCacheKey;
                return clone;
            };
            mesh.material = Array.isArray(mesh.material)
                ? mesh.material.map(cloneMaterial)
                : cloneMaterial(mesh.material);
        }
        return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    };
    const applyMaterial = (target, action) => {
        forEachOwnedMesh(target, ownEntityId(action.entityId), (mesh) => {
            for (const material of ownMaterials(mesh)) {
                if (action.property === "baseColor" && action.value?.kind === "color") {
                    material.color?.setRGB(action.value.value[0], action.value.value[1], action.value.value[2], LinearSRGBColorSpace);
                }
                else if (action.property === "emissive" &&
                    action.value?.kind === "color") {
                    material.emissive?.setRGB(action.value.value[0], action.value.value[1], action.value.value[2], LinearSRGBColorSpace);
                }
                else if (action.property === "emissiveIntensity" &&
                    action.value?.kind === "float") {
                    if (material.emissiveIntensity !== undefined) {
                        material.emissiveIntensity = action.value.value;
                    }
                }
                else if (action.property === "opacity" &&
                    action.value?.kind === "float") {
                    material.opacity = action.value.value;
                    // Below 1 the Material has to be drawn in the transparent pass, or
                    // the change simply does not show.
                    material.transparent = material.transparent || action.value.value < 1;
                }
                else {
                    continue;
                }
                material.needsUpdate = true;
            }
        });
    };
    const readMaterial = (object, target) => {
        const found = { value: null };
        forEachOwnedMesh(object, ownEntityId(target.entityId), (mesh) => {
            if (found.value)
                return;
            const materials = Array.isArray(mesh.material)
                ? mesh.material
                : [mesh.material];
            const material = materials[0];
            if (!material)
                return;
            if (target.property === "baseColor" && material.color) {
                found.value = {
                    kind: "color",
                    value: [material.color.r, material.color.g, material.color.b],
                };
            }
            else if (target.property === "emissive" && material.emissive) {
                found.value = {
                    kind: "color",
                    value: [material.emissive.r, material.emissive.g, material.emissive.b],
                };
            }
            else if (target.property === "emissiveIntensity") {
                found.value = {
                    kind: "float",
                    value: material.emissiveIntensity ?? 1,
                };
            }
            else if (target.property === "opacity") {
                found.value = { kind: "float", value: material.opacity };
            }
        });
        return found.value;
    };
    const particleOverrides = new Map();
    let particleRestarts = 0;
    const applyParticle = (target, action) => {
        forEachOwnedBridge(target, ownEntityId(action.entityId), XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY, isParticleBridge, (bridge) => {
            const state = bridge.read();
            if (action.componentId && state.componentId !== action.componentId)
                return;
            // The bridge replaces an owner's overrides wholesale, so the running
            // set is kept here: writing the rate after the switch must not undo it.
            const next = {
                ...(particleOverrides.get(bridge) ?? {}),
            };
            if (action.property === "emitting") {
                const emitting = action.mode === "toggle"
                    ? state.stopped === true || state.playing === false
                    : action.value?.kind === "bool"
                        ? action.value.value
                        : true;
                next.playing = emitting;
                next.stopped = !emitting;
            }
            else if (action.property === "restart" &&
                (action.mode === "toggle" || action.value?.kind === "bool")) {
                particleRestarts += 1;
                next.restartRevision = particleRestarts;
                next.playing = true;
                next.stopped = false;
            }
            else if (action.property === "emissionRate" &&
                action.value?.kind === "float") {
                next.emissionRate = action.value.value;
            }
            else if (action.property === "sizeMultiplier" &&
                action.value?.kind === "float") {
                next.sizeMultiplier = action.value.value;
            }
            else if (action.property === "opacity" &&
                action.value?.kind === "float") {
                next.opacity = action.value.value;
            }
            else if (action.property === "color" && action.value?.kind === "color") {
                next.color = linearColor(action.value.value).getHex(SRGBColorSpace$1);
            }
            else {
                return;
            }
            particleOverrides.set(bridge, next);
            bridge.setOwner(owner, order, componentId, next);
        });
    };
    const readParticle = (object, target) => {
        const found = { value: null };
        forEachOwnedBridge(object, ownEntityId(target.entityId), XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY, isParticleBridge, (bridge) => {
            const state = bridge.read();
            if (found.value || (target.componentId && state.componentId !== target.componentId))
                return;
            if (target.property === "emitting") {
                found.value = {
                    kind: "bool",
                    value: state.stopped !== true && state.playing !== false,
                };
            }
            else if (target.property === "emissionRate") {
                found.value = { kind: "float", value: state.emissionRate ?? 0 };
            }
            else if (target.property === "sizeMultiplier") {
                found.value = { kind: "float", value: state.sizeMultiplier ?? 1 };
            }
            else if (target.property === "opacity") {
                found.value = { kind: "float", value: state.opacity ?? 1 };
            }
            else if (target.property === "color") {
                const color = new Color$1(state.color ?? 0xffffff);
                found.value = { kind: "color", value: [color.r, color.g, color.b] };
            }
        });
        return found.value;
    };
    /**
     * Scene properties whose runtime value is simply the property's own name.
     *
     * The bridge's override keys are the property names, so a table is enough:
     * one entry per Scene setting a graph can change, and the write itself is
     * the same three lines for all of them. Only the kind has to match, which is
     * what keeps a colour from being written where a float belongs.
     */
    const SCENE_BOOL_PROPERTIES = [
        "postprocessing",
        "bloom",
        "ao",
        "grading",
        "fog",
        "ambient",
        "skybox",
        "skyboxIbl",
    ];
    const SCENE_FLOAT_PROPERTIES = [
        "exposure",
        "fade",
        "bloomStrength",
        "bloomRadius",
        "bloomThreshold",
        "fogNear",
        "fogFar",
        "ambientIntensity",
        "skyboxExposure",
        "skyboxRotation",
        "cameraFov",
    ];
    const SCENE_COLOR_PROPERTIES = [
        "fadeColor",
        "fogColor",
        "ambientColor",
    ];
    /**
     * Image is written through its own bridge for the same reason Text is: the
     * quad is drawn from one config object, so fading a picture goes through the
     * thing that owns that object rather than poking at the mesh's material.
     */
    const applyImage = (target, action) => {
        forEachOwnedBridge(target, ownEntityId(action.entityId), XRIFT_IMAGE_RUNTIME_USER_DATA_KEY, isXriftImageRuntimeBridge, (bridge) => {
            if (action.componentId && bridge.read().componentId !== action.componentId) {
                return;
            }
            const overrides = imageRuntimeOverrides(action);
            if (!overrides)
                return;
            imageOwners.add(bridge);
            bridge.setOwner(owner, order, componentId, overrides);
        });
    };
    const readImage = (target, action) => {
        const found = { value: null };
        forEachOwnedBridge(target, ownEntityId(action.entityId), XRIFT_IMAGE_RUNTIME_USER_DATA_KEY, isXriftImageRuntimeBridge, (bridge) => {
            const state = bridge.read();
            if (found.value ||
                (action.componentId && state.componentId !== action.componentId)) {
                return;
            }
            if (action.property === "enabled") {
                found.value = { kind: "bool", value: state.enabled ?? true };
                return;
            }
            if (action.property === "opacity" && state.overrides.opacity !== undefined) {
                found.value = { kind: "float", value: state.overrides.opacity };
            }
        });
        return found.value;
    };
    /**
     * Text is written through its own bridge, like Light and Particle: the panel
     * is typeset from one config object, so re-lettering a sign has to go through
     * the thing that owns that object rather than poking at the mesh.
     */
    const applyText = (target, action) => {
        forEachOwnedBridge(target, ownEntityId(action.entityId), XRIFT_TEXT_RUNTIME_USER_DATA_KEY, isXriftTextRuntimeBridge, (bridge) => {
            // An empty component id means「このEntityのText」, which is what a graph
            // attached to the Entity itself writes.
            if (action.componentId && bridge.read().componentId !== action.componentId) {
                return;
            }
            const overrides = textRuntimeOverrides(action);
            if (!overrides)
                return;
            textOwners.add(bridge);
            bridge.setOwner(owner, order, componentId, overrides);
        });
    };
    const readText = (target, action) => {
        const found = { value: null };
        forEachOwnedBridge(target, ownEntityId(action.entityId), XRIFT_TEXT_RUNTIME_USER_DATA_KEY, isXriftTextRuntimeBridge, (bridge) => {
            const state = bridge.read();
            if (found.value ||
                (action.componentId && state.componentId !== action.componentId)) {
                return;
            }
            if (action.property === "enabled") {
                found.value = { kind: "bool", value: state.enabled ?? true };
                return;
            }
            const current = state.overrides[action.property];
            if (current === undefined)
                return;
            if (typeof current === "number") {
                found.value = { kind: "float", value: current };
            }
            else if (typeof current === "string") {
                found.value =
                    action.property === "color" || action.property === "outlineColor"
                        ? null
                        : { kind: "string", value: current };
            }
        });
        return found.value;
    };
    /**
     * Moves the person playing.
     *
     * Unlike every other action there is nothing to restore on Stop: a player
     * who walked somewhere is not an override on authored data, and putting them
     * back where the graph found them would be a second teleport nobody asked
     * for. Play discards the player with the rest of the run.
     */
    const applyPlayer = (action) => {
        if (action.property !== "teleport")
            return;
        const value = action.value;
        if (value?.kind !== "vector3")
            return;
        const bridge = findXriftPlayerRuntimeBridge(root);
        // No bridge means no player to move - an Item preview, or a Scene View
        // that is not running. Silently doing nothing is right; there is nobody
        // standing anywhere to move.
        if (!bridge)
            return;
        bridge.teleport({ position: [...value.value] });
    };
    const applyScene = (action) => {
        const bridge = findXriftSceneRuntimeBridge(root);
        if (!bridge)
            return;
        sceneOwners.add(bridge);
        const property = action.property;
        const value = action.value;
        if (value?.kind === "bool" &&
            SCENE_BOOL_PROPERTIES.includes(property)) {
            bridge.setOwner(owner, order, componentId, { [property]: value.value });
            return;
        }
        if (value?.kind === "float" &&
            SCENE_FLOAT_PROPERTIES.includes(property)) {
            bridge.setOwner(owner, order, componentId, { [property]: value.value });
            return;
        }
        if (value?.kind === "color" &&
            SCENE_COLOR_PROPERTIES.includes(property)) {
            bridge.setOwner(owner, order, componentId, { [property]: value.value });
            return;
        }
        if (value?.kind === "asset" && property === "skyboxImage") {
            bridge.setOwner(owner, order, componentId, { skyboxImage: value.value });
        }
    };
    /**
     * The Scene value a toggle flips away from, or a timed change starts at.
     *
     * The override is the answer whenever there is one. When there is not, the
     * authored value has to come from somewhere real: fog, ambient light, the sky
     * and the camera are read straight off the live scene, and the compositor
     * publishes its own settings because nothing in the scene graph carries them.
     * Guessing「たぶんON」instead would make the first press of a「画質を上げる」
     * button do nothing on exactly the worlds that need it.
     */
    const readScene = (property) => {
        const bridge = findXriftSceneRuntimeBridge(root);
        if (!bridge)
            return null;
        const state = bridge.read();
        const post = readXriftScenePostprocessingBaseline(root);
        const bool = (override, authored) => override === null && authored === undefined
            ? null
            : { kind: "bool", value: override ?? authored ?? false };
        const float = (override, authored) => override === null && authored === undefined
            ? null
            : { kind: "float", value: override ?? authored ?? 0 };
        const color = (value) => ({
            kind: "color",
            value: [value[0], value[1], value[2]],
        });
        const scene = root;
        let ambientVisible;
        let ambientIntensity;
        let ambientColor;
        let skyVisible;
        if (property.startsWith("ambient") || property === "skybox") {
            root.traverse((object) => {
                const light = object;
                if (light.isAmbientLight === true && ambientVisible === undefined) {
                    ambientVisible = light.visible;
                    ambientIntensity = light.intensity;
                    ambientColor = light.color;
                }
                if (object.userData[XRIFT_SCENE_SKYBOX_USER_DATA_KEY] === true &&
                    skyVisible === undefined) {
                    skyVisible = object.visible;
                }
            });
        }
        switch (property) {
            case "exposure":
                return { kind: "float", value: state.exposure ?? 1 };
            case "fade":
                return { kind: "float", value: state.fade };
            case "fadeColor":
                return color(state.fadeColor);
            case "postprocessing":
                return bool(state.postprocessing, post?.enabled);
            case "bloom":
                return bool(state.bloom, post?.bloom);
            case "bloomStrength":
                return float(state.bloomStrength, post?.bloomStrength);
            case "bloomRadius":
                return float(state.bloomRadius, post?.bloomRadius);
            case "bloomThreshold":
                return float(state.bloomThreshold, post?.bloomThreshold);
            case "ao":
                return bool(state.ao, post?.ao);
            case "grading":
                return bool(state.grading, post?.grading);
            case "fog":
                return bool(state.fog, scene.fog != null);
            case "fogColor":
                return state.fogColor
                    ? color(state.fogColor)
                    : scene.fog instanceof Fog$1
                        ? color([scene.fog.color.r, scene.fog.color.g, scene.fog.color.b])
                        : null;
            case "fogNear":
                return float(state.fogNear, scene.fog instanceof Fog$1 ? scene.fog.near : undefined);
            case "fogFar":
                return float(state.fogFar, scene.fog instanceof Fog$1 ? scene.fog.far : undefined);
            case "ambient":
                return bool(state.ambient, ambientVisible);
            case "ambientColor":
                return state.ambientColor
                    ? color(state.ambientColor)
                    : ambientColor
                        ? color([ambientColor.r, ambientColor.g, ambientColor.b])
                        : null;
            case "ambientIntensity":
                return float(state.ambientIntensity, ambientIntensity);
            case "skybox":
                return bool(state.skybox, skyVisible ?? (scene.background != null || undefined));
            case "skyboxIbl":
                return bool(state.skyboxIbl, scene.environment != null);
            case "skyboxExposure":
                return float(state.skyboxExposure, scene.environmentIntensity);
            case "skyboxRotation":
                return float(state.skyboxRotation, (scene.environmentRotation.y * 180) / Math.PI);
            default:
                return null;
        }
    };
    const applyAnimation = (target, action) => {
        forEachOwnedBridge(target, ownEntityId(action.entityId), XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY, isXriftAnimationRuntimeBridge, (bridge) => {
            const state = bridge.read();
            // Animation is addressed per Entity, not per Component: one Model has
            // one mixer, and the Component that used to own it is gone. A graph
            // written before that still names a component id, and matching on it
            // would silently make every one of those graphs do nothing.
            animationOwners.add(bridge);
            if (action.property === "playing") {
                const playing = action.mode === "toggle"
                    ? !state.playing
                    : action.value?.kind === "bool"
                        ? action.value.value
                        : state.playing;
                bridge.command(owner, order, componentId, playing ? { type: "play" } : { type: "pause" });
                return;
            }
            if (action.property === "clip" && action.value?.kind === "float") {
                bridge.command(owner, order, componentId, {
                    type: "select",
                    clipIndex: Math.round(action.value.value),
                });
                return;
            }
            if (action.property === "time" && action.value?.kind === "float") {
                bridge.command(owner, order, componentId, {
                    type: "seek",
                    time: action.value.value,
                });
                return;
            }
            if (action.property === "speed" && action.value?.kind === "float") {
                bridge.setOwner(owner, order, componentId, {
                    speed: action.value.value,
                });
            }
        });
    };
    const readAnimation = (object, target) => {
        const found = { value: null };
        forEachOwnedBridge(object, ownEntityId(target.entityId), XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY, isXriftAnimationRuntimeBridge, (bridge) => {
            const state = bridge.read();
            if (found.value || (target.componentId && state.componentId !== target.componentId))
                return;
            if (target.property === "playing") {
                found.value = { kind: "bool", value: state.playing };
            }
            else if (target.property === "clip") {
                found.value = { kind: "float", value: state.clipIndex };
            }
            else if (target.property === "speed") {
                found.value = { kind: "float", value: state.speed };
            }
            else if (target.property === "time") {
                found.value = { kind: "float", value: state.time };
            }
        });
        return found.value;
    };
    const applyLight = (target, action) => {
        forEachOwnedBridge(target, ownEntityId(action.entityId), XRIFT_LIGHT_RUNTIME_USER_DATA_KEY, isLightBridge, (bridge) => {
            const state = bridge.read();
            if (action.componentId && state.componentId !== action.componentId)
                return;
            const next = {
                ...(lightOverrides.get(bridge) ?? {}),
            };
            if (action.property === "enabled") {
                next.enabled =
                    action.mode === "toggle"
                        ? !state.enabled
                        : action.value?.kind === "bool"
                            ? action.value.value
                            : state.enabled;
            }
            else if (action.property === "intensity" &&
                action.value?.kind === "float") {
                next.intensity = action.value.value;
            }
            else if (action.property === "color" && action.value?.kind === "color") {
                next.color = linearColor(action.value.value);
            }
            else {
                return;
            }
            lightOverrides.set(bridge, next);
            bridge.setOwner(owner, order, componentId, next);
        });
    };
    const applyAudioSource = (target, action) => {
        forEachOwnedBridge(target, ownEntityId(action.entityId), XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY, isAudioSourceBridge, (bridge) => {
            const state = bridge.read();
            if (action.componentId && state.componentId !== action.componentId)
                return;
            if (action.property === "playback") {
                if (action.value?.kind !== "enum")
                    return;
                commandRevision += 1;
                const type = action.value.value === "pause"
                    ? "pause"
                    : action.value.value === "stop"
                        ? "stop"
                        : "play";
                // The bridge resolves an autoplay refusal as false rather than
                // rejecting; a trigger has nowhere to report it, so it is dropped.
                void bridge.command(owner, order, componentId, {
                    type,
                    revision: commandRevision,
                });
                return;
            }
            const next = {
                ...(audioOverrides.get(bridge) ?? {}),
            };
            if (action.property === "volume" && action.value?.kind === "float") {
                next.volume = action.value.value;
            }
            else if (action.property === "loop") {
                next.loop =
                    action.mode === "toggle"
                        ? !state.loop
                        : action.value?.kind === "bool"
                            ? action.value.value
                            : state.loop;
            }
            else {
                return;
            }
            audioOverrides.set(bridge, next);
            bridge.setOwner(owner, order, componentId, next);
        });
    };
    const readEntity = (object, property) => property === "enabled" ? { kind: "bool", value: object.visible } : null;
    const readLight = (object, target) => {
        // A callback cannot return through `forEachOwnedBridge`, and a plain `let`
        // would be narrowed back to `null` by the time it is read.
        const found = { value: null };
        forEachOwnedBridge(object, ownEntityId(target.entityId), XRIFT_LIGHT_RUNTIME_USER_DATA_KEY, isLightBridge, (bridge) => {
            const state = bridge.read();
            if (found.value || (target.componentId && state.componentId !== target.componentId))
                return;
            if (target.property === "enabled") {
                found.value = { kind: "bool", value: state.enabled };
            }
            else if (target.property === "intensity") {
                found.value = { kind: "float", value: state.intensity };
            }
            else if (target.property === "color") {
                const color = new Color$1(state.color);
                found.value = { kind: "color", value: [color.r, color.g, color.b] };
            }
        });
        return found.value;
    };
    const readAudioSource = (object, target) => {
        const found = { value: null };
        forEachOwnedBridge(object, ownEntityId(target.entityId), XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY, isAudioSourceBridge, (bridge) => {
            const state = bridge.read();
            if (found.value || (target.componentId && state.componentId !== target.componentId))
                return;
            if (target.property === "volume") {
                found.value = { kind: "float", value: state.volume };
            }
            else if (target.property === "loop") {
                found.value = { kind: "bool", value: state.loop };
            }
            else if (target.property === "playback") {
                found.value = { kind: "enum", value: state.playback };
            }
        });
        return found.value;
    };
    const forEachAnimationBridge = (entityId, visit) => {
        const object = findEntityObject(root, ownEntityId(entityId));
        if (!object)
            return;
        forEachOwnedBridge(object, ownEntityId(entityId), XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY, isXriftAnimationRuntimeBridge, (bridge) => {
            animationOwners.add(bridge);
            visit(bridge);
        });
    };
    return {
        playClip(entityId, request) {
            forEachAnimationBridge(entityId, (bridge) => {
                bridge.command(owner, order, componentId, {
                    type: "play-clip",
                    clipIndex: request.clipIndex,
                    loop: request.loop,
                    speed: request.speed,
                    time: request.fromSeconds,
                });
            });
        },
        stopClip(entityId, clipIndex) {
            forEachAnimationBridge(entityId, (bridge) => {
                bridge.command(owner, order, componentId, {
                    type: "stop-clip",
                    clipIndex,
                });
            });
        },
        read(target) {
            if (target.targetKind === "scene")
                return readScene(target.property);
            const object = findEntityObject(root, ownEntityId(target.entityId));
            if (!object)
                return null;
            if (target.targetKind === "entity")
                return readEntity(object, target.property);
            if (target.targetKind === "transform") {
                return readTransform(object, target.property);
            }
            if (target.targetKind === "animation") {
                return readAnimation(object, target);
            }
            if (target.targetKind === "particle") {
                return readParticle(object, target);
            }
            if (target.targetKind === "material") {
                return readMaterial(object, target);
            }
            if (target.targetKind === "text")
                return readText(object, target);
            if (target.targetKind === "image")
                return readImage(object, target);
            if (target.targetKind === "light")
                return readLight(object, target);
            return readAudioSource(object, target);
        },
        apply(action) {
            // The interpreter evaluates a wired socket and hands this a concrete
            // value, so a linked action only ever arrives from the static walk -
            // where it exists to record what the action writes to, not to be run.
            if (action.value?.kind === "linked")
                return;
            if (action.target === "scene") {
                applyScene(action);
                return;
            }
            if (action.target === "player") {
                applyPlayer(action);
                return;
            }
            const target = findEntityObject(root, ownEntityId(action.entityId));
            if (!target)
                return;
            if (action.target === "entity") {
                applyEntity(target, action);
                return;
            }
            if (action.target === "transform") {
                applyTransform(target, action);
                return;
            }
            if (action.target === "animation") {
                applyAnimation(target, action);
                return;
            }
            if (action.target === "particle") {
                applyParticle(target, action);
                return;
            }
            if (action.target === "material") {
                applyMaterial(target, action);
                return;
            }
            if (action.target === "text") {
                applyText(target, action);
                return;
            }
            if (action.target === "image") {
                applyImage(target, action);
                return;
            }
            if (action.target === "light") {
                applyLight(target, action);
                return;
            }
            applyAudioSource(target, action);
        },
        share(action) {
            const bridge = findXriftInstanceStateRuntimeBridge(root);
            // No bridge means no room to tell: an Item preview, or a Scene View that
            // is not running. The local write already happened, so nothing is lost.
            if (!bridge)
                return;
            if (!action.value || action.value.kind === "linked")
                return;
            bridge.send(xriftSharedActionStateId({
                // Resolved, not the sentinel: `__xrift_self__` names a different
                // Entity in every graph that uses it, and one id must mean one thing.
                entityId: ownEntityId(action.entityId),
                componentId: action.componentId,
                targetKind: action.target,
                property: action.property,
            }), { value: action.value });
        },
        dispose() {
            // Overrides are runtime-only, exactly like a Script's: leaving them
            // applied after Stop would show values the document never had.
            for (const bridge of animationOwners)
                bridge.removeOwner(owner);
            animationOwners.clear();
            for (const bridge of sceneOwners)
                bridge.removeOwner(owner);
            sceneOwners.clear();
            for (const bridge of textOwners)
                bridge.removeOwner(owner);
            textOwners.clear();
            for (const bridge of imageOwners)
                bridge.removeOwner(owner);
            imageOwners.clear();
            for (const bridge of particleOverrides.keys())
                bridge.removeOwner(owner);
            particleOverrides.clear();
            for (const [mesh, original] of materialRestores) {
                const owned = mesh.material;
                mesh.material = original;
                for (const entry of Array.isArray(owned) ? owned : [owned]) {
                    entry.dispose();
                }
            }
            materialRestores.clear();
            for (const bridge of lightOverrides.keys())
                bridge.removeOwner(owner);
            for (const bridge of audioOverrides.keys())
                bridge.removeOwner(owner);
            lightOverrides.clear();
            audioOverrides.clear();
            for (const [object, original] of restorePoints) {
                object.visible = original.visible;
                object.position.set(...original.position);
                object.rotation.set(...original.rotation);
                object.scale.set(...original.scale);
            }
            restorePoints.clear();
        },
    };
}
/** Reads one live property value into the engine's representation. */
function toInteractivityValue(kind, value, options) {
    if (value.kind === "bool")
        return boolValue(value.value);
    if (value.kind === "float")
        return floatValue(value.value);
    if (value.kind === "color" || value.kind === "vector3") {
        return vectorValue([...value.value]);
    }
    if (value.kind === "enum") {
        const index = options.findIndex((option) => option.value === value.value);
        return intValue(index < 0 ? 0 : index);
    }
    return null;
}
/**
 * Narrows an engine value to what one property accepts.
 *
 * KHR_interactivity has no string type, so an enum arrives as the option index
 * and is resolved against the property's own option list here — the same list
 * the Editor's picker shows, so the two cannot disagree.
 */
/**
 * The engine's value in the shape the property takes, inside its legal range.
 *
 * The range matters because a write does not have to come from a slider: a
 * computed value, or an easing that deliberately passes its target and comes
 * back, can land outside what the property accepts. Clamping here keeps that
 * one node's overshoot from becoming a negative opacity or a mirrored scale.
 * Position and rotation have no declared range and are left alone.
 */
function toInteractionValue(descriptor, value) {
    const options = descriptor.options ?? [];
    const bounded = (entry, low, high) => {
        if (!Number.isFinite(entry))
            return low ?? 0;
        if (low !== undefined && entry < low)
            return low;
        if (high !== undefined && entry > high)
            return high;
        return entry;
    };
    switch (descriptor.kind) {
        case "bool":
            return { kind: "bool", value: asBoolean(value) };
        case "float":
            return {
                kind: "float",
                value: bounded(asNumber(value), descriptor.min, descriptor.max),
            };
        case "color": {
            const [red, green, blue] = asNumbers(value, 3);
            return {
                kind: "color",
                value: [
                    bounded(red ?? 0, 0, 1),
                    bounded(green ?? 0, 0, 1),
                    bounded(blue ?? 0, 0, 1),
                ],
            };
        }
        case "vector3": {
            const [x, y, z] = asNumbers(value, 3);
            return {
                kind: "vector3",
                value: [bounded(x ?? 0), bounded(y ?? 0), bounded(z ?? 0)],
            };
        }
        case "enum": {
            const index = Math.trunc(asNumber(value));
            const option = options[Math.min(Math.max(index, 0), options.length - 1)];
            return option ? { kind: "enum", value: option.value } : null;
        }
        default:
            return null;
    }
}
/**
 * The world a trigger graph can see and change.
 *
 * Every write goes through the same applier the previous static trigger used,
 * so a graph and a Script that touch one Component still compose through the
 * existing runtime bridges instead of fighting over the object.
 */
function createXriftInteractionHost(applier, eventScope) {
    const descriptorFor = (target) => getXriftInteractionProperty(target.targetKind, target.property);
    return {
        /**
         * `animation/start` plays a clip on the Entity this graph is attached to.
         *
         * The graph names a clip by index, which is what the specification's
         * operation carries, and the Entity is the owner — the same rule an action
         * with no explicit target follows. Several of these run at once, so a Model
         * whose clips are meant to play together can have all of them started.
         *
         * `endTime` decides the loop: the specification's「最後まで再生して終わる」
         * is a bounded play, and a clip with no end is one an author wants to keep
         * going. That is also what a Model full of gulls and waves wants by
         * default, and the engine still sends `done` for the bounded case.
         */
        startAnimation(request) {
            applier.playClip(XRIFT_INTERACTION_SELF_ENTITY_ID, {
                clipIndex: request.animationIndex,
                loop: request.endTime === null,
                speed: request.speed,
                fromSeconds: request.startTime,
            });
        },
        stopAnimation(request) {
            applier.stopClip(XRIFT_INTERACTION_SELF_ENTITY_ID, request.animationIndex);
        },
        readProperty(target) {
            const descriptor = descriptorFor(target);
            if (!descriptor)
                return null;
            const current = applier.read({
                entityId: target.entityId,
                componentId: target.componentId,
                targetKind: descriptor.target,
                property: target.property,
            });
            if (!current)
                return null;
            return toInteractivityValue(descriptor.kind, current, descriptor.options ?? []);
        },
        emitEvent(name, payload) {
            const values = new Map();
            for (const [key, entry] of payload)
                values.set(key, entry.data);
            emitXriftSceneEvent(name, values, eventScope);
        },
        /**
         * Points an Asset-valued property at another Asset for this viewer only.
         *
         * The applier still owns the write, so it composes with everything else a
         * graph or a Script has changed and comes off on Stop like the rest.
         */
        writeAsset(target, assetId) {
            const descriptor = descriptorFor(target);
            if (!descriptor || descriptor.kind !== "asset")
                return false;
            applier.apply({
                nodeIndex: -1,
                mode: "set",
                entityId: target.entityId,
                componentId: target.componentId,
                target: descriptor.target,
                property: target.property,
                value: { kind: "asset", value: assetId },
                shared: target.shared === true,
            });
            return true;
        },
        writeString(target, text) {
            const descriptor = descriptorFor(target);
            if (!descriptor || descriptor.kind !== "string")
                return false;
            applier.apply({
                nodeIndex: -1,
                mode: "set",
                entityId: target.entityId,
                componentId: target.componentId,
                target: descriptor.target,
                property: target.property,
                value: { kind: "string", value: text },
                shared: target.shared === true,
            });
            return true;
        },
        writeProperty(target, value) {
            const descriptor = descriptorFor(target);
            if (!descriptor)
                return false;
            const next = toInteractionValue(descriptor, value);
            if (!next)
                return false;
            const action = {
                nodeIndex: -1,
                mode: "set",
                entityId: target.entityId,
                componentId: target.componentId,
                target: descriptor.target,
                property: target.property,
                value: next,
                shared: target.shared === true,
            };
            // Applied here as well as broadcast: the person who pressed should not
            // wait for a round trip to see their own button work, and the value they
            // send is the one everyone converges on anyway.
            applier.apply(action);
            if (target.shared)
                applier.share(action);
            return true;
        },
    };
}
function XriftInteractionTriggerRuntime({ entityId, graph, componentId = "interaction-trigger", order = 0, playing = true, }) {
    const scene = useThree$3((state) => state.scene);
    const applier = useMemo$3(() => createXriftInteractionApplier({
        root: scene,
        componentId,
        order,
        selfEntityId: entityId,
    }), [componentId, entityId, order, scene]);
    const host = useMemo$3(() => createXriftInteractionHost(applier, scene), [applier, scene]);
    /**
     * One engine per graph in the Asset.
     *
     * An Asset can hold several graphs, and the point of holding several is that
     * they compose: one waits, another reacts to what it announced. Running only
     * the document's default graph would make every other graph in the file
     * inert, which is not what an author who made a second graph asked for.
     */
    const engines = useMemo$3(() => {
        if (!playing)
            return [];
        const parsed = parseInteractivityExtension(graph);
        return parsed.graphs.map((candidate) => ({
            engine: new InteractivityEngine(graph, host, { graphIndex: candidate.index, localEventDelivery: false }),
        }));
    }, [graph, host, playing]);
    const eventQueueRef = useRef$2(null);
    useEffect$3(() => () => applier.dispose(), [applier]);
    useEffect$3(() => {
        if (engines.length === 0)
            return;
        const names = parseInteractivityExtension(graph).graphs.flatMap((candidate) => candidate.nodes.flatMap((node) => {
            if (node.op !== "event/receive")
                return [];
            const event = node.configuration.get("event")?.[0];
            const name = typeof event === "string" ? event : typeof event === "number" ? candidate.events[event] : null;
            return name ? [name] : [];
        }));
        const queue = createXriftGraphEventQueue(scene, names, (name) => {
            for (const entry of engines)
                entry.engine.receiveEvent(name);
        });
        eventQueueRef.current = queue;
        // `event/onStart` is what makes a graph a timeline rather than only a
        // reaction: the same Asset can wait, repeat and finish on its own.
        for (const entry of engines)
            entry.engine.start();
        return () => {
            queue.dispose();
            eventQueueRef.current = null;
            for (const entry of engines)
                entry.engine.dispose();
            applier.dispose();
        };
    }, [applier, engines, graph, scene]);
    useFrame$1((_state, delta) => {
        const first = engines[0];
        if (!first)
            return;
        for (const entry of engines)
            entry.engine.update(delta);
        eventQueueRef.current?.flush();
    });
    useEffect$3(() => {
        if (engines.length === 0)
            return;
        return subscribeXriftInteraction(entityId, () => {
            for (const entry of engines)
                entry.engine.interact();
        });
    }, [engines, entityId]);
    /*
     * What the room already agrees on, and what it agrees on next.
     *
     * A shared action is applied here rather than by re-running the graph: the
     * flow belongs to the person who pressed, and replaying it on every viewer
     * would fire everything else that flow does - a sound, a second write, a
     * delay - once per person in the room.
     *
     * The same path serves a late joiner, which is the whole reason the value
     * travels as state rather than as an event: a door opened before someone
     * arrived is still open when they walk in.
     */
    const sharedActions = useMemo$3(() => {
        const byStateId = new Map();
        for (const action of collectXriftInteractionActions(graph)) {
            if (!action.shared)
                continue;
            byStateId.set(xriftSharedActionStateId({
                entityId: resolveXriftInteractionEntityId(action.entityId, entityId),
                componentId: action.componentId,
                targetKind: action.target,
                property: action.property,
            }), action);
        }
        return byStateId;
    }, [entityId, graph]);
    useEffect$3(() => {
        if (!playing || sharedActions.size === 0)
            return;
        const bridge = findXriftInstanceStateRuntimeBridge(scene);
        if (!bridge)
            return;
        const applyShared = (stateId, payload) => {
            const action = sharedActions.get(stateId);
            if (!action)
                return;
            const value = payload.value;
            if (!value || value.kind === "linked")
                return;
            // The arriving value, not the authored one: a toggle that flipped to
            // `true` has to land as `true` everywhere, or each viewer flips its own
            // copy and the room ends up in two states.
            applier.apply({ ...action, mode: "set", value });
        };
        for (const [stateId, payload] of bridge.entries()) {
            applyShared(stateId, payload);
        }
        return bridge.subscribe(applyShared);
    }, [applier, playing, scene, sharedActions]);
    return null;
}

/**
 * Publishes the running player so Interactivity Graphs can move it.
 *
 * `useTeleport()` is the one call in the middle, which is what keeps Play and
 * the published world on one path: a graph that teleports in the editor
 * teleports after upload, or it fails in both places for the same reason.
 *
 * Mounted for the length of a run, inside whatever provides the teleport
 * implementation. Nothing here is synchronised: a graph runs inside each
 * viewer's own runtime, so「押したら移動する」moves whoever pressed it.
 */
const {useEffect: useEffect$2,useMemo: useMemo$2} = await importShared('react');

const {useThree: useThree$2} = await importShared('@react-three/fiber');

const {useTeleportContext} = await importShared('@xrift/world-components');
function XriftPlayerRuntime({ enabled = true }) {
    const scene = useThree$2((state) => state.scene);
    const { teleport } = useTeleportContext();
    const bridge = useMemo$2(() => ({ teleport: (destination) => teleport(destination) }), [teleport]);
    useEffect$2(() => {
        if (!enabled)
            return;
        const holder = scene.userData;
        holder[XRIFT_PLAYER_RUNTIME_USER_DATA_KEY] = bridge;
        return () => {
            delete holder[XRIFT_PLAYER_RUNTIME_USER_DATA_KEY];
        };
    }, [bridge, enabled, scene]);
    return null;
}

/**
 * Publishes XRift's instance state so a graph can share what an action changed.
 *
 * `useInstanceStateContext` is the platform's own synchronisation: the values
 * travel over xrift-frontend's socket, and `states` holds what the instance
 * currently agrees on. This component does nothing but make that reachable from
 * the Three.js scene, the way the Scene and player bridges are - so Studio's
 * Play and a published world go through one path.
 *
 * In Studio there is one viewer and the package's default implementation is a
 * local Map, so a shared action behaves like a local one. That is honest rather
 * than fake: the same send and the same receive run, and the room is simply a
 * room of one.
 */
const {useEffect: useEffect$1,useMemo: useMemo$1,useRef: useRef$1} = await importShared('react');

const {useThree: useThree$1} = await importShared('@react-three/fiber');

const {useInstanceStateContext} = await importShared('@xrift/world-components');
/** Only the ids this runtime owns, so an unrelated world state is left alone. */
const SHARED_ACTION_PREFIX = "xrift-action:";
function isSharedActionPayload(value) {
    return typeof value === "object" && value !== null && "value" in value;
}
function XriftInstanceStateRuntime({ enabled = true, }) {
    const scene = useThree$1((state) => state.scene);
    const { states, sendState } = useInstanceStateContext();
    const listeners = useRef$1(new Set());
    /** What each id was last seen as, so a re-render is not replayed as a change. */
    const seen = useRef$1(new Map());
    const bridge = useMemo$1(() => ({
        send(stateId, payload) {
            sendState(stateId, payload);
        },
        entries() {
            const collected = [];
            for (const [stateId, payload] of states) {
                if (!stateId.startsWith(SHARED_ACTION_PREFIX))
                    continue;
                if (!isSharedActionPayload(payload))
                    continue;
                collected.push([stateId, payload]);
            }
            return collected;
        },
        subscribe(listener) {
            listeners.current.add(listener);
            return () => {
                listeners.current.delete(listener);
            };
        },
    }), [sendState, states]);
    useEffect$1(() => {
        if (!enabled)
            return;
        const holder = scene.userData;
        holder[XRIFT_INSTANCE_STATE_RUNTIME_USER_DATA_KEY] = bridge;
        return () => {
            delete holder[XRIFT_INSTANCE_STATE_RUNTIME_USER_DATA_KEY];
        };
    }, [bridge, enabled, scene]);
    // The platform hands the map back on every change, so what changed is found
    // by comparing rather than by being told. Serialising is what makes a value
    // that arrived unchanged - a re-render, a reconnect - stop being an event.
    useEffect$1(() => {
        if (!enabled)
            return;
        for (const [stateId, payload] of states) {
            if (!stateId.startsWith(SHARED_ACTION_PREFIX))
                continue;
            if (!isSharedActionPayload(payload))
                continue;
            const encoded = JSON.stringify(payload);
            if (seen.current.get(stateId) === encoded)
                continue;
            seen.current.set(stateId, encoded);
            for (const listener of [...listeners.current])
                listener(stateId, payload);
        }
    }, [enabled, states]);
    return null;
}

/**
 * The mixer half of live Animation control.
 *
 * Studio's Play preview and a published world each own an `AnimationMixer` and
 * would otherwise each grow their own idea of what "play from 2 seconds" means.
 * One controller, used by both, is what keeps a graph behaving the same way
 * before and after publishing.
 */
const {LoopOnce: LoopOnce$1,LoopRepeat: LoopRepeat$1} = await importShared('three');

function createXriftAnimationMixerController(options) {
    const { mixer, clips, onActiveChange } = options;
    let clipIndex = options.clipIndex;
    let loop = options.loop;
    let speed = options.speed;
    let action = null;
    let active = false;
    const setActive = (next) => {
        if (active === next)
            return;
        active = next;
        onActiveChange?.(next);
    };
    const shape = (target) => {
        target.clampWhenFinished = !loop;
        target.setLoop(loop ? LoopRepeat$1 : LoopOnce$1, loop ? Infinity : 1);
        target.timeScale = speed;
        return target;
    };
    /**
     * The action for the current clip, without changing it.
     *
     * Reading has to be side-effect free: the surface that owns the mixer may have
     * started this clip itself, and shaping it here would quietly overwrite the
     * loop and speed that start chose.
     */
    const peek = () => {
        if (action)
            return action;
        const clip = clips[clipIndex];
        return clip ? mixer.clipAction(clip) : null;
    };
    const ensure = () => {
        if (action)
            return shape(action);
        const clip = clips[clipIndex];
        if (!clip)
            return null;
        action = shape(mixer.clipAction(clip));
        return action;
    };
    /**
     * Clips a graph started, kept apart from the Component's single action.
     *
     * `mixer.clipAction` returns one action per clip, so the two paths cannot
     * share: the Component owning `action` shapes it from its own loop and speed,
     * and a graph shaping the same object would silently change the Component's
     * clip. Keeping the graph's clips in their own map is what lets both run.
     */
    const started = new Map();
    const boundedIndex = (value) => clips.length === 0
        ? -1
        : Math.min(Math.max(Math.trunc(value), 0), clips.length - 1);
    return {
        playClip(nextIndex, options) {
            const index = boundedIndex(nextIndex);
            const clip = clips[index];
            if (!clip)
                return;
            const target = started.get(index) ?? mixer.clipAction(clip);
            started.set(index, target);
            target.clampWhenFinished = !options.loop;
            target.setLoop(options.loop ? LoopRepeat$1 : LoopOnce$1, options.loop ? Infinity : 1);
            target.timeScale = options.speed;
            target.paused = false;
            const from = options.fromSeconds;
            if (from !== null || !target.isRunning()) {
                target.reset();
                target.time =
                    from !== null && Number.isFinite(from)
                        ? Math.min(Math.max(from, 0), clip.duration)
                        : 0;
            }
            target.play();
            setActive(true);
        },
        stopClip(nextIndex) {
            const index = boundedIndex(nextIndex);
            const target = started.get(index);
            if (!target)
                return;
            target.stop();
            started.delete(index);
            if (started.size === 0 && !(action && action.isRunning()))
                setActive(false);
        },
        stopStartedClips() {
            for (const target of started.values())
                target.stop();
            started.clear();
            if (!(action && action.isRunning()))
                setActive(false);
        },
        select(nextIndex, nextLoop) {
            loop = nextLoop;
            const bounded = clips.length === 0
                ? 0
                : Math.min(Math.max(Math.trunc(nextIndex), 0), clips.length - 1);
            if (bounded === clipIndex) {
                if (action)
                    shape(action);
                return;
            }
            // Switching clips keeps whatever the old one was doing: an author who
            // swaps a clip mid-playback means "play that one instead", not "stop".
            const wasPlaying = Boolean(action && action.isRunning() && !action.paused);
            action?.stop();
            action = null;
            clipIndex = bounded;
            const next = ensure();
            if (!next) {
                setActive(false);
                return;
            }
            if (wasPlaying) {
                next.reset();
                next.play();
                setActive(true);
            }
        },
        play(fromSeconds) {
            const target = ensure();
            if (!target)
                return;
            target.paused = false;
            if (fromSeconds !== null || !target.isRunning()) {
                target.reset();
                const clip = clips[clipIndex];
                const start = fromSeconds ?? 0;
                target.time =
                    clip && Number.isFinite(start)
                        ? Math.min(Math.max(start, 0), clip.duration)
                        : 0;
            }
            target.play();
            setActive(true);
        },
        pause() {
            if (action)
                action.paused = true;
            setActive(false);
        },
        stop() {
            action?.stop();
            setActive(false);
        },
        setSpeed(nextSpeed) {
            speed = nextSpeed;
            if (action)
                action.timeScale = nextSpeed;
        },
        seek(seconds) {
            const target = ensure();
            const clip = clips[clipIndex];
            if (!target || !clip)
                return;
            target.time = Math.min(Math.max(seconds, 0), clip.duration);
            // A seek on a stopped clip should show that frame, which needs one mixer
            // step; without it the pose stays wherever the clip last left it.
            if (!target.isRunning()) {
                target.play();
                target.paused = true;
            }
            mixer.update(0);
        },
        sample() {
            const clip = clips[clipIndex];
            const live = peek();
            return {
                playing: Boolean(live && live.isRunning() && !live.paused),
                time: live?.time ?? 0,
                duration: clip?.duration ?? 0,
            };
        },
        dispose() {
            for (const target of started.values())
                target.stop();
            started.clear();
            action?.stop();
            action = null;
            setActive(false);
        },
    };
}

const {Fragment:_Fragment,jsx:_jsx,jsxs:_jsxs} = await importShared('react/jsx-runtime');
const EMPTY_INSTANCING_ENTITIES = [];
const {Fragment,useEffect,useMemo,useRef,useState} = await importShared('react');

const {createPortal,useFrame,useThree} = await importShared('@react-three/fiber');

const {EntryLogBoard,Grabbable,LiveVideoPlayer,Portal,ScreenShareDisplay,TagBoard,TextInput,Video180Sphere,VideoPlayer,VideoScreen,useSpawnPointContext} = await importShared('@xrift/world-components');
const {CuboidCollider,Physics,RigidBody} = await importShared('@react-three/rapier');

const {ACESFilmicToneMapping,AmbientLight,BackSide,BoxGeometry,Color,EquirectangularReflectionMapping,AnimationMixer,Euler,Fog,Group,HalfFloatType,LoopOnce,LoopRepeat,Matrix4,Mesh,PerspectiveCamera,Object3D,Quaternion,RGBAFormat,NoToneMapping,SRGBColorSpace,ShaderMaterial,SphereGeometry,Vector2,Vector3,WebGLRenderTarget} = await importShared('three');
function XriftWorld(props) {
    return _jsx(XriftRuntimeScene, { ...props, expectedKind: "world" });
}
function XriftRuntimeScene({ manifest, assetBaseUrl, fallback = null, onLoad, onError, physics, expectedKind, }) {
    const renderer = useThree((state) => state.gl);
    const loader = useMemo(() => new XriftThreeLoader({ assetBaseUrl, renderer }), [assetBaseUrl, renderer]);
    const [result, setResult] = useState(null);
    useEffect(() => {
        let active = true;
        let loaded = null;
        void loader
            .load(manifest)
            .then((next) => {
            if (next.manifest.projectKind !== expectedKind) {
                throw new Error(`Runtime project kind is ${next.manifest.projectKind}; expected ${expectedKind}`);
            }
            if (!active) {
                disposeXriftLoadResult(next);
                return;
            }
            loaded = next;
            setResult(next);
            onLoad?.(next);
        })
            .catch((reason) => {
            if (!active)
                return;
            onError?.(reason instanceof Error ? reason : new Error(String(reason)));
        });
        return () => {
            active = false;
            if (loaded)
                disposeXriftLoadResult(loaded);
        };
    }, [expectedKind, loader, manifest, onError, onLoad]);
    const physicsEnabled = physics ?? expectedKind === "world";
    const dynamicBodies = useMemo(() => (physicsEnabled && result ? collectRuntimeDynamicBodyEntries(result) : []), [physicsEnabled, result]);
    if (!result)
        return fallback;
    const content = (_jsxs(_Fragment, { children: [_jsx("primitive", { object: result.root }), _jsx(XriftModelInstancing, { root: result.root, entityKey: "xriftStudioEntityId", entityIds: result.manifest.scenes[result.manifest.entryScene]?.modelInstancingEntityIds ?? EMPTY_INSTANCING_ENTITIES }), _jsx(XriftRuntimeSceneEnvironment, { result: result }), _jsx(XriftRuntimeOfficialComponentAdapters, { result: result }), _jsx(XriftRuntimeMeshVisibility, { result: result }), _jsx(XriftRuntimePostprocessing, { result: result }), _jsx(XriftRuntimeVegetationWind, { result: result }), _jsx(XriftRuntimeAnimations, { result: result }), _jsx(XriftRuntimeTimeUniforms, { result: result }), _jsx(XriftRuntimeSpawnPointAdapter, { result: result }), _jsx(XriftRuntimeParticleAdapters, { result: result }), _jsx(XriftRuntimeAudioAdapters, { result: result }), _jsx(XriftRuntimeInteractionTriggers, { result: result })] }));
    return physicsEnabled ? (_jsxs(Physics, { gravity: runtimeGravity(result), timeStep: "vary", children: [content, _jsx(XriftRuntimePhysicsBodies, { result: result, dynamicBodies: dynamicBodies })] })) : (content);
}
const RUNTIME_SKYBOX_VERTEX_SHADER = `
varying vec3 vDirection;
uniform vec3 uCenter;
void main() {
  vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 worldCenter = (modelMatrix * vec4(uCenter, 1.0)).xyz;
  vDirection = worldPosition - worldCenter;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const RUNTIME_SKYBOX_FRAGMENT_SHADER = `
uniform sampler2D uTexture;
uniform bool uHasTexture;
uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uOffset;
uniform float uExponent;
uniform float uExposure;
uniform float uRotation;
varying vec3 vDirection;
void main() {
  vec3 direction = normalize(vDirection);
  vec3 color;
  if (uHasTexture) {
    vec2 uv = vec2(
      atan(direction.z, direction.x) * 0.15915494309189535 + 0.5,
      asin(clamp(direction.y, -1.0, 1.0)) * 0.3183098861837907 + 0.5
    );
    uv.x = fract(uv.x + uRotation * 0.15915494309189535);
    color = texture2D(uTexture, uv).rgb;
  } else {
    float t = clamp(direction.y * 0.5 + 0.5 + uOffset, 0.0, 1.0);
    t = pow(t, max(uExponent, 0.01));
    color = mix(uBottomColor, uTopColor, t);
  }
  gl_FragColor = vec4(color * uExposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
function XriftRuntimeSceneEnvironment({ result }) {
    const { camera, scene } = useThree();
    const settings = useMemo(() => resolveRuntimeSceneEnvironmentSettings(result.manifest.scenes[result.manifest.entryScene]?.settings), [result]);
    const imageTexture = settings.skybox.imageAssetId
        ? result.textures.get(settings.skybox.imageAssetId) ?? null
        : null;
    const hasOfficialSkybox = useMemo(() => {
        let found = false;
        result.root.traverse((object) => {
            if (object.userData.xriftRuntimeSkybox === true)
                found = true;
        });
        return found;
    }, [result]);
    const ambient = useMemo(() => {
        const light = new AmbientLight(settings.ambient.color, settings.ambient.intensity);
        light.name = "xrift-scene-ambient";
        return light;
    }, [settings.ambient.color, settings.ambient.intensity]);
    const skybox = useMemo(() => {
        if (hasOfficialSkybox)
            return null;
        if (!settings.skybox.enabled && !settings.skybox.iblEnabled)
            return null;
        const geometry = createRuntimeSkyGeometry(settings.skybox.projection);
        const material = new ShaderMaterial({
            side: BackSide,
            depthTest: false,
            depthWrite: false,
            vertexShader: RUNTIME_SKYBOX_VERTEX_SHADER,
            fragmentShader: RUNTIME_SKYBOX_FRAGMENT_SHADER,
            uniforms: {
                uTexture: { value: imageTexture },
                uHasTexture: { value: Boolean(imageTexture) },
                uTopColor: { value: new Color(settings.skybox.topColor) },
                uBottomColor: { value: new Color(settings.skybox.bottomColor) },
                uOffset: { value: settings.skybox.offset },
                uExponent: { value: settings.skybox.exponent },
                uExposure: { value: settings.skybox.exposure },
                uRotation: { value: (settings.skybox.rotationDegrees * Math.PI) / 180 },
                uCenter: { value: new Vector3(...settings.skybox.center) },
            },
        });
        const mesh = new Mesh(geometry, material);
        mesh.name = "xrift-scene-skybox";
        mesh.frustumCulled = false;
        mesh.renderOrder = -1;
        if (settings.skybox.projection === "infinite") {
            mesh.scale.setScalar(100);
        }
        else {
            mesh.position.fromArray(settings.skybox.meshPosition);
            mesh.rotation.set((settings.skybox.meshRotationDegrees[0] * Math.PI) / 180, (settings.skybox.meshRotationDegrees[1] * Math.PI) / 180, (settings.skybox.meshRotationDegrees[2] * Math.PI) / 180);
            mesh.scale.fromArray(settings.skybox.meshScale);
        }
        return mesh;
    }, [
        hasOfficialSkybox,
        imageTexture,
        settings.skybox.bottomColor,
        settings.skybox.center,
        settings.skybox.enabled,
        settings.skybox.exponent,
        settings.skybox.exposure,
        settings.skybox.iblEnabled,
        settings.skybox.meshPosition,
        settings.skybox.meshRotationDegrees,
        settings.skybox.meshScale,
        settings.skybox.offset,
        settings.skybox.projection,
        settings.skybox.rotationDegrees,
        settings.skybox.topColor,
    ]);
    useEffect(() => {
        const previousFog = scene.fog;
        const previousEnvironment = scene.environment;
        const previousEnvironmentIntensity = scene.environmentIntensity;
        const previousEnvironmentRotation = scene.environmentRotation.clone();
        const typedCamera = camera;
        const previousCamera = {
            near: typedCamera.near,
            far: typedCamera.far,
            fov: typedCamera.fov,
        };
        if (settings.fog.enabled) {
            scene.fog = new Fog(settings.fog.color, settings.fog.near, settings.fog.far);
        }
        else {
            scene.fog = null;
        }
        if (camera instanceof PerspectiveCamera) {
            typedCamera.near = settings.camera.near;
            typedCamera.far = settings.camera.far;
            typedCamera.fov = settings.camera.fov;
            typedCamera.updateProjectionMatrix();
        }
        if (imageTexture && settings.skybox.iblEnabled) {
            imageTexture.mapping = EquirectangularReflectionMapping;
            scene.environment = imageTexture;
            scene.environmentIntensity = settings.skybox.exposure;
            scene.environmentRotation.set(0, (settings.skybox.rotationDegrees * Math.PI) / 180, 0);
        }
        else if (settings.skybox.iblEnabled) {
            scene.environment = null;
        }
        return () => {
            scene.fog = previousFog;
            scene.environment = previousEnvironment;
            scene.environmentIntensity = previousEnvironmentIntensity;
            scene.environmentRotation.copy(previousEnvironmentRotation);
            if (camera instanceof PerspectiveCamera) {
                typedCamera.near = previousCamera.near;
                typedCamera.far = previousCamera.far;
                typedCamera.fov = previousCamera.fov;
                typedCamera.updateProjectionMatrix();
            }
        };
    }, [camera, imageTexture, scene, settings]);
    useFrame(() => {
        if (skybox && settings.skybox.projection === "infinite") {
            skybox.position.copy(camera.position);
        }
    });
    useEffect(() => () => {
        skybox?.geometry.dispose();
        if (skybox?.material instanceof ShaderMaterial)
            skybox.material.dispose();
    }, [skybox]);
    return (_jsxs(_Fragment, { children: [_jsx("primitive", { object: ambient }), skybox ? _jsx("primitive", { object: skybox }) : null] }));
}
function resolveRuntimeSceneEnvironmentSettings(value) {
    const settings = isRecord(value) ? value : {};
    const skybox = isRecord(settings.skybox) ? settings.skybox : {};
    const fog = isRecord(settings.fog) ? settings.fog : {};
    const ambient = isRecord(settings.ambient) ? settings.ambient : {};
    const camera = isRecord(settings.camera) ? settings.camera : {};
    const imageAssetId = typeof skybox.imageAssetId === "string" && skybox.imageAssetId.trim()
        ? skybox.imageAssetId
        : undefined;
    const near = numberOr(camera.near, 0.1, 0.0001);
    const far = Math.max(numberOr(camera.far, 2000, 0.0001), near + 0.0001);
    const fogNear = numberOr(fog.near, 120, 0);
    const fogFar = Math.max(numberOr(fog.far, 600, 0), fogNear + 0.001);
    return {
        skybox: {
            enabled: skybox.enabled !== false,
            iblEnabled: skybox.iblEnabled === true,
            projection: skybox.projection === "box" || skybox.projection === "dome"
                ? skybox.projection
                : "infinite",
            ...(imageAssetId ? { imageAssetId } : {}),
            topColor: colorOr(skybox.topColor, "#87ceeb"),
            bottomColor: colorOr(skybox.bottomColor, "#ffffff"),
            offset: numberOr(skybox.offset, 0, -1),
            exponent: numberOr(skybox.exponent, 1, 0.01),
            rotationDegrees: numberOr(skybox.rotationDegrees, 0, -360),
            exposure: numberOr(skybox.exposure, 1, 0),
            meshPosition: vec3Or(skybox.meshPosition, [0, 0, 0]),
            meshRotationDegrees: vec3Or(skybox.meshRotationDegrees, [0, 0, 0]),
            meshScale: vec3Or(skybox.meshScale, [100, 100, 100], 0.001),
            center: vec3Or(skybox.center, [0, 0.01, 0]),
        },
        fog: {
            enabled: fog.enabled !== false,
            color: colorOr(fog.color, "#18181b"),
            near: Math.min(fogNear, fogFar - 0.001),
            far: fogFar,
        },
        ambient: {
            color: colorOr(ambient.color, "#ffffff"),
            intensity: numberOr(ambient.intensity, 0.55, 0),
        },
        camera: { near: Math.min(near, far - 0.0001), far, fov: numberOr(camera.fov, 46, 1) },
    };
}
function createRuntimeSkyGeometry(projection) {
    if (projection === "box") {
        const geometry = new BoxGeometry(1, 1, 1);
        geometry.translate(0, 0.5, 0);
        return geometry;
    }
    if (projection === "dome") {
        const geometry = new SphereGeometry(0.5, 50, 50);
        const position = geometry.attributes.position;
        if (!position)
            return geometry;
        const radius = 0.5;
        const bottomLimit = 0.1;
        const curvatureRadiusSquared = 0.95 * 0.95;
        for (let index = 0; index < position.count; index += 1) {
            const x = position.getX(index) / radius;
            let y = position.getY(index) / radius;
            const z = position.getZ(index) / radius;
            if (y < 0) {
                y *= 0.3;
                if (x * x + z * z < curvatureRadiusSquared)
                    y = -bottomLimit;
            }
            position.setY(index, (y + bottomLimit) * radius);
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }
    return new SphereGeometry(1, 32, 20);
}
function collectRuntimeOfficialComponentTargets(result) {
    const targets = {
        skyboxes: [],
        billboards: [],
        mirrors: [],
        wrappers: collectRuntimeOfficialWrapperTargets(result),
        leaves: collectRuntimeOfficialLeafTargets(result),
    };
    result.root.traverse((object) => {
        if (object.userData.xriftRuntimeSkybox === true)
            targets.skyboxes.push(object);
        if (object.userData.xriftRuntimeBillboardY === true)
            targets.billboards.push(object);
        if (object.userData.xriftRuntimeMirror)
            targets.mirrors.push(object);
    });
    return targets;
}
function collectRuntimeOfficialLeafTargets(result) {
    const scene = result.manifest.scenes[result.manifest.entryScene];
    if (!scene)
        return [];
    return Object.values(scene.entities).flatMap((entity) => {
        const target = result.entities.get(entity.id);
        if (!target)
            return [];
        const components = entity.components.filter((component) => component.type === "xrift-component" &&
            component.enabled &&
            isRuntimeOfficialLeafSchema(component.schemaId));
        return components.length > 0
            ? [{ key: entity.id, target, components }]
            : [];
    });
}
function collectRuntimeOfficialWrapperTargets(result) {
    const scene = result.manifest.scenes[result.manifest.entryScene];
    if (!scene)
        return [];
    return Object.values(scene.entities).flatMap((entity) => {
        const target = result.entities.get(entity.id);
        if (!target)
            return [];
        const components = entity.components.filter((component) => component.type === "xrift-component" &&
            component.enabled &&
            isRuntimeOfficialWrapperSchema(component.schemaId));
        if (components.length === 0)
            return [];
        const existing = target.userData.xriftRuntimeOfficialVisualRoot;
        const visual = existing instanceof Object3D ? existing : new Group();
        if (!(existing instanceof Object3D)) {
            visual.name = `official-wrapper-visual:${entity.id}`;
            for (const child of [...target.children])
                visual.add(child);
            target.add(visual);
            target.userData.xriftRuntimeOfficialVisualRoot = visual;
        }
        return [{ key: entity.id, target, visual, components }];
    });
}
function XriftRuntimeOfficialComponentAdapters({ result, }) {
    const { camera, gl } = useThree();
    const targets = useMemo(() => collectRuntimeOfficialComponentTargets(result), [result]);
    const cameraWorldPosition = useMemo(() => new Vector3(), []);
    const targetWorldPosition = useMemo(() => new Vector3(), []);
    const virtualCameraPosition = useMemo(() => new Vector3(), []);
    const cameraForward = useMemo(() => new Vector3(), []);
    const parentPosition = useMemo(() => new Vector3(), []);
    const parentScale = useMemo(() => new Vector3(), []);
    const parentQuaternion = useMemo(() => new Quaternion(), []);
    const parentEuler = useMemo(() => new Euler(), []);
    const mirrorWorldPosition = useMemo(() => new Vector3(), []);
    useFrame(() => {
        for (const skybox of targets.skyboxes) {
            if (!skybox.parent) {
                skybox.position.copy(camera.position);
                continue;
            }
            skybox.parent.worldToLocal(targetWorldPosition.copy(camera.position));
            skybox.position.copy(targetWorldPosition);
        }
        cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
        for (const billboard of targets.billboards) {
            billboard.getWorldPosition(targetWorldPosition);
            let referencePosition = cameraWorldPosition;
            const dx = cameraWorldPosition.x - targetWorldPosition.x;
            const dz = cameraWorldPosition.z - targetWorldPosition.z;
            if (dx * dx + dz * dz < 0.01) {
                camera.getWorldDirection(cameraForward);
                cameraForward.y = 0;
                if (cameraForward.lengthSq() < 0.01)
                    continue;
                virtualCameraPosition
                    .copy(cameraWorldPosition)
                    .addScaledVector(cameraForward.normalize(), 1);
                referencePosition = virtualCameraPosition;
            }
            const worldRotationY = Math.atan2(referencePosition.x - targetWorldPosition.x, referencePosition.z - targetWorldPosition.z);
            if (billboard.parent) {
                billboard.parent.matrixWorld.decompose(parentPosition, parentQuaternion, parentScale);
                parentEuler.setFromQuaternion(parentQuaternion, "YXZ");
                billboard.rotation.y = worldRotationY - parentEuler.y;
            }
            else {
                billboard.rotation.y = worldRotationY;
            }
        }
        for (const mirrorGroup of targets.mirrors) {
            const reflector = mirrorGroup.userData.xriftRuntimeMirror;
            const fallback = mirrorGroup.userData.xriftRuntimeMirrorFallback;
            if (!reflector || !fallback)
                continue;
            mirrorGroup.getWorldPosition(mirrorWorldPosition);
            const distance = cameraWorldPosition.distanceTo(mirrorWorldPosition);
            const lodDistance = typeof mirrorGroup.userData.xriftRuntimeMirrorLodDistance === "number"
                ? mirrorGroup.userData.xriftRuntimeMirrorLodDistance
                : 10;
            const currentlyUsingReflector = mirrorGroup.userData.xriftRuntimeMirrorActive !== false;
            const shouldUseReflector = currentlyUsingReflector
                ? distance <= lodDistance
                : distance <= lodDistance * 0.8;
            if (shouldUseReflector !== currentlyUsingReflector) {
                mirrorGroup.userData.xriftRuntimeMirrorActive = shouldUseReflector;
                reflector.visible = shouldUseReflector;
                fallback.visible = !shouldUseReflector;
            }
            if (reflector.visible) {
                reflector.getReflectionCamera?.(camera)?.layers.enableAll();
                if (gl.xr.isPresenting) {
                    for (const eyeCamera of gl.xr.getCamera().cameras) {
                        reflector.getReflectionCamera?.(eyeCamera)?.layers.enableAll();
                    }
                }
            }
        }
    });
    return (_jsxs(_Fragment, { children: [targets.wrappers.map((target) => (_jsx(Fragment, { children: createPortal(_jsx(XriftRuntimeOfficialWrappers, { entityId: target.key, components: target.components, visual: target.visual }), target.target) }, target.key))), targets.leaves.map((target) => (_jsx(Fragment, { children: createPortal(_jsx(XriftRuntimeOfficialLeaves, { components: target.components }), target.target) }, `leaf:${target.key}`)))] }));
}
function XriftRuntimeOfficialWrappers({ components, visual, entityId, }) {
    const [grabbableTransforms, setGrabbableTransforms] = useState(() => Object.fromEntries(components
        .filter((component) => component.schemaId === "xrift.grabbable")
        .map((component) => [component.id, parseRuntimeGrabbableTransform(component.properties.transform)])));
    const [textValues, setTextValues] = useState(() => Object.fromEntries(components
        .filter((component) => component.schemaId === "xrift.text-input")
        .map((component) => [component.id, stringOr(component.properties.value, "")])));
    const content = components.reduceRight((children, component) => {
        const properties = component.properties;
        if (component.schemaId === "xrift.interactable") {
            const props = {
                id: stringOr(properties.id, component.id),
                type: "button",
                interactionText: typeof properties.interactionText === "string"
                    ? properties.interactionText
                    : undefined,
                enabled: booleanOr(properties.enabled, true),
            };
            return (_jsx(XriftInteractable, { ...props, 
                // The press has to reach the Entity's own graphs. Without this the
                // published world had an Interactable that registered, highlighted
                // under the crosshair, and then did nothing - the same silence
                // Studio's Play had before it grew a host.
                onInteract: () => emitXriftInteraction(entityId), children: children }));
        }
        if (component.schemaId === "xrift.grabbable") {
            const id = stringOr(properties.id, component.id);
            const props = {
                id,
                transform: grabbableTransforms[id] ??
                    parseRuntimeGrabbableTransform(properties.transform),
                enabled: booleanOr(properties.enabled, true),
            };
            return (_jsx(Grabbable, { ...props, onMove: (next) => setGrabbableTransforms((current) => ({ ...current, [id]: next })), children: children }));
        }
        if (component.schemaId === "xrift.text-input") {
            const id = stringOr(properties.id, component.id);
            const props = {
                id,
                placeholder: typeof properties.placeholder === "string"
                    ? properties.placeholder
                    : undefined,
                maxLength: typeof properties.maxLength === "number" &&
                    Number.isFinite(properties.maxLength)
                    ? properties.maxLength
                    : undefined,
                value: textValues[id] ?? stringOr(properties.value, ""),
                interactionText: typeof properties.interactionText === "string"
                    ? properties.interactionText
                    : undefined,
                disabled: booleanOr(properties.disabled, false),
            };
            return (_jsx(TextInput, { ...props, onSubmit: (value) => setTextValues((current) => ({ ...current, [id]: value })), children: children }));
        }
        return children;
    }, _jsx("primitive", { object: visual }));
    return content;
}
function isRuntimeOfficialWrapperSchema(schemaId) {
    return (schemaId === "xrift.interactable" ||
        schemaId === "xrift.grabbable" ||
        schemaId === "xrift.text-input");
}
function isRuntimeOfficialLeafSchema(schemaId) {
    return (schemaId === "xrift.video-screen" ||
        schemaId === "xrift.video-player" ||
        schemaId === "xrift.live-video-player" ||
        schemaId === "xrift.video-180-sphere" ||
        schemaId === "xrift.screen-share-display" ||
        schemaId === "xrift.tag-board" ||
        schemaId === "xrift.entry-log-board" ||
        schemaId === "xrift.portal");
}
function XriftRuntimeOfficialLeaves({ components, }) {
    return (_jsx(_Fragment, { children: components.map((component) => {
            const properties = component.properties;
            switch (component.schemaId) {
                case "xrift.video-screen":
                    return (_jsx(VideoScreen, { ...properties }, component.id));
                case "xrift.video-player":
                    return (_jsx(VideoPlayer, { ...properties }, component.id));
                case "xrift.live-video-player":
                    return (_jsx(LiveVideoPlayer, { ...properties }, component.id));
                case "xrift.video-180-sphere":
                    return (_jsx(Video180Sphere, { ...properties }, component.id));
                case "xrift.screen-share-display":
                    return (_jsx(ScreenShareDisplay, { ...properties }, component.id));
                case "xrift.tag-board":
                    return (_jsx(TagBoard, { ...properties }, component.id));
                case "xrift.entry-log-board":
                    return (_jsx(EntryLogBoard, { ...properties }, component.id));
                case "xrift.portal": {
                    const portalProps = properties;
                    return (_jsx(Portal, { ...portalProps, instanceId: stringOr(portalProps.instanceId, "") }, component.id));
                }
                default:
                    return null;
            }
        }) }));
}
function parseRuntimeGrabbableTransform(value) {
    const transform = isRecord(value) ? value : {};
    const position = objectVec3(transform.position, { x: 0, y: 0, z: 0 });
    const rotation = objectVec3(transform.rotation, { x: 0, y: 0, z: 0 });
    const scale = typeof transform.scale === "number" && Number.isFinite(transform.scale)
        ? transform.scale
        : 1;
    return { position, rotation, scale };
}
function objectVec3(value, fallback) {
    const object = isRecord(value) ? value : {};
    return {
        x: typeof object.x === "number" && Number.isFinite(object.x) ? object.x : fallback.x,
        y: typeof object.y === "number" && Number.isFinite(object.y) ? object.y : fallback.y,
        z: typeof object.z === "number" && Number.isFinite(object.z) ? object.z : fallback.z,
    };
}
function colorOr(value, fallback) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
        ? value
        : fallback;
}
function stringOr(value, fallback) {
    return typeof value === "string" ? value : fallback;
}
function booleanOr(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
}
/**
 * Runs the Scene's Interaction Trigger graphs.
 *
 * `runtime.json` used to be data with no behaviour: the compiler refused to
 * stage a Scene with a trigger, because the manifest could carry the graph but
 * nothing on this side read it, and publishing a world whose buttons silently
 * did nothing was worse than refusing. This is the other half - the graph runs
 * here exactly as it runs in Studio's Play, through the same component.
 *
 * The Scene and player bridges are mounted alongside, once, because a graph's
 * actions reach them by looking on the Three.js scene: without them a graph
 * that fades the screen or teleports the player would find nothing there.
 */
function XriftRuntimeInteractionTriggers({ result }) {
    const scene = result.manifest.scenes[result.manifest.entryScene];
    const triggers = useMemo(() => {
        if (!scene)
            return [];
        return Object.values(scene.entities).flatMap((entity) => {
            const target = result.entities.get(entity.id);
            if (!target)
                return [];
            return entity.components.flatMap((component, order) => {
                if (component.type !== "interaction-trigger" || !component.enabled) {
                    return [];
                }
                return [
                    createPortal(_jsx(XriftInteractionTriggerRuntime, { entityId: entity.id, graph: component.graph, componentId: component.id, order: order }, `${entity.id}:${component.id}`), target),
                ];
            });
        });
    }, [result, scene]);
    if (triggers.length === 0)
        return null;
    return (_jsxs(_Fragment, { children: [_jsx(XriftSceneRuntime, {}), _jsx(XriftPlayerRuntime, {}), _jsx(XriftInstanceStateRuntime, {}), triggers] }));
}
function XriftRuntimeParticleAdapters({ result }) {
    const portals = useMemo(() => {
        const scene = result.manifest.scenes[result.manifest.entryScene];
        if (!scene)
            return [];
        return Object.values(scene.entities).flatMap((entity) => {
            const target = result.entities.get(entity.id);
            if (!target)
                return [];
            return entity.components.flatMap((component) => {
                if (component.type !== "particle-emitter" || !component.enabled) {
                    return [];
                }
                const asset = result.manifest.assets[component.particleAssetId];
                if (!asset || asset.kind !== "particle")
                    return [];
                const config = parseRuntimeParticleConfig(asset.properties);
                if (!config)
                    return [];
                return [
                    createPortal(_jsx(XriftScriptParticleEmitter, { config: config, color: "#ffffff", opacity: 1 }, `${entity.id}:${component.id}`), target),
                ];
            });
        });
    }, [result]);
    return _jsx(_Fragment, { children: portals });
}
function XriftRuntimeAudioAdapters({ result }) {
    const portals = useMemo(() => {
        const scene = result.manifest.scenes[result.manifest.entryScene];
        if (!scene)
            return [];
        return Object.values(scene.entities).flatMap((entity) => {
            const target = result.entities.get(entity.id);
            if (!target)
                return [];
            return entity.components.flatMap((component) => {
                if (component.type !== "audio-source" || !component.enabled)
                    return [];
                const asset = component.audioAssetId
                    ? result.manifest.assets[component.audioAssetId]
                    : undefined;
                if (!asset || asset.kind !== "audio")
                    return [];
                return [
                    createPortal(_jsx(XriftAudioSource, { componentId: component.id, audioAssetId: asset.id, assetUrl: new URL(asset.url, result.assetBaseUrl).toString(), sourceStatus: "available", enabled: component.enabled, volume: numberOr(component.volume, 1, 0), loop: component.loop, autoplay: component.autoplay, spatial: component.spatial, refDistance: numberOr(component.refDistance, 1, 0), rolloffFactor: numberOr(component.rolloffFactor, 1, 0), maxDistance: numberOr(component.maxDistance, 10000, 0) }, `${entity.id}:${component.id}`), target),
                ];
            });
        });
    }, [result]);
    return _jsx(_Fragment, { children: portals });
}
function parseRuntimeParticleConfig(value) {
    const range = (candidate, fallback) => {
        if (!isRecord(candidate))
            return { min: fallback[0], max: fallback[1] };
        return {
            min: numberOr(candidate.min, fallback[0], 0),
            max: numberOr(candidate.max, fallback[1], 0),
        };
    };
    const vec3 = (candidate, fallback) => vec3Or(candidate, fallback);
    const color4 = (candidate, fallback) => Array.isArray(candidate) &&
        candidate.length === 4 &&
        candidate.every((entry) => typeof entry === "number" && Number.isFinite(entry))
        ? [
            candidate[0],
            candidate[1],
            candidate[2],
            candidate[3],
        ]
        : fallback;
    const emission = isRecord(value.emission) ? value.emission : {};
    const shape = isRecord(value.shape) ? value.shape : { type: "point" };
    const renderer = isRecord(value.renderer) ? value.renderer : {};
    const shapeType = shape.type;
    const resolvedShape = shapeType === "sphere"
        ? { type: "sphere", radius: numberOr(shape.radius, 0.5, 0) }
        : shapeType === "cone"
            ? {
                type: "cone",
                radius: numberOr(shape.radius, 0.25, 0),
                angle: numberOr(shape.angle, 25, 0),
            }
            : shapeType === "box"
                ? { type: "box", size: vec3(shape.size, [1, 1, 1]) }
                : { type: "point" };
    const bursts = Array.isArray(emission.bursts)
        ? emission.bursts.flatMap((burst) => {
            if (!isRecord(burst))
                return [];
            return [
                {
                    time: numberOr(burst.time, 0, 0),
                    count: numberOr(burst.count, 0, 0),
                    cycles: numberOr(burst.cycles, 1, 0),
                    interval: numberOr(burst.interval, 0, 0),
                },
            ];
        })
        : [];
    return {
        maxParticles: Math.max(1, Math.min(10000, Math.floor(numberOr(value.maxParticles, 256, 0)))),
        duration: Math.max(0.01, numberOr(value.duration, 5, 0)),
        looping: value.looping !== false,
        prewarm: value.prewarm === true,
        simulationSpace: value.simulationSpace === "world" ? "world" : "local",
        startDelay: range(value.startDelay, [0, 0]),
        startLifetime: range(value.startLifetime, [1, 2]),
        startSpeed: range(value.startSpeed, [0.5, 1]),
        startSize: range(value.startSize, [0.08, 0.16]),
        startRotation: range(value.startRotation, [0, Math.PI * 2]),
        gravity: vec3(value.gravity, [0, -0.35, 0]),
        emission: {
            rateOverTime: Math.max(0, numberOr(emission.rateOverTime, 24, 0)),
            bursts,
        },
        shape: resolvedShape,
        colorOverLifetime: {
            start: color4(isRecord(value.colorOverLifetime)
                ? value.colorOverLifetime.start
                : undefined, [1, 0.8, 0.3, 1]),
            end: color4(isRecord(value.colorOverLifetime)
                ? value.colorOverLifetime.end
                : undefined, [1, 0.1, 0.02, 0]),
        },
        sizeOverLifetime: range(value.sizeOverLifetime, [1, 0.15]),
        velocityOverLifetime: {
            linear: vec3(isRecord(value.velocityOverLifetime)
                ? value.velocityOverLifetime.linear
                : undefined, [0, 0, 0]),
            orbital: vec3(isRecord(value.velocityOverLifetime)
                ? value.velocityOverLifetime.orbital
                : undefined, [0, 0, 0]),
        },
        renderer: {
            mode: renderer.mode === "stretched-billboard"
                ? "stretched-billboard"
                : "billboard",
            blending: renderer.blending === "normal" ? "normal" : "additive",
            sortMode: renderer.sortMode === "distance" ||
                renderer.sortMode === "youngest" ||
                renderer.sortMode === "oldest"
                ? renderer.sortMode
                : "none",
            castShadow: renderer.castShadow === true,
            receiveShadow: renderer.receiveShadow === true,
        },
    };
}
function XriftRuntimeSpawnPointAdapter({ result }) {
    const { setSpawnPoint } = useSpawnPointContext();
    const published = useRef(false);
    const spawnPoint = useMemo(() => {
        const marker = result.spawnPoints.values().next().value;
        if (!marker)
            return null;
        result.root.updateMatrixWorld(true);
        const position = new Vector3();
        const quaternion = new Quaternion();
        marker.getWorldPosition(position);
        marker.getWorldQuaternion(quaternion);
        const yaw = new Euler().setFromQuaternion(quaternion, "YXZ").y;
        return {
            position: [position.x, position.y, position.z],
            yaw: ((yaw * 180) / Math.PI + 360) % 360,
        };
    }, [result]);
    useEffect(() => {
        published.current = false;
    }, [spawnPoint]);
    useFrame(() => {
        if (!spawnPoint || published.current)
            return;
        setSpawnPoint(spawnPoint);
        published.current = true;
    });
    return null;
}
function XriftRuntimePhysicsBodies({ result, dynamicBodies, }) {
    const entries = useMemo(() => collectRuntimeColliderEntries(result), [result]);
    useEffect(() => () => {
        for (const entry of dynamicBodies) {
            entry.source.visible = true;
            entry.visual.visible = true;
            disposeRuntimePhysicsClone(entry.mesh);
            entry.visual.removeFromParent();
        }
    }, [dynamicBodies]);
    return (_jsxs(_Fragment, { children: [entries.map((entry) => (_jsxs(RigidBody, { type: "fixed", colliders: false, userData: { xriftRigidBodyBoundary: true }, position: entry.position, rotation: entry.rotation, sensor: entry.mesh ? entry.meshSensor : false, friction: entry.mesh ? entry.meshFriction : undefined, restitution: entry.mesh ? entry.meshRestitution : undefined, children: [entry.mesh ? (_jsx("group", { scale: entry.scale, children: _jsx(XRiftStudioMeshColliders, { type: entry.meshType, sensor: entry.meshSensor, friction: entry.meshFriction, restitution: entry.meshRestitution, children: _jsx("primitive", { object: entry.mesh }) }) })) : null, entry.boxes.map((box, index) => (_jsx(CuboidCollider, { args: box.halfExtents, position: box.center, rotation: box.rotation, sensor: box.sensor, friction: box.friction, restitution: box.restitution }, `${entry.id}:box:${index}`)))] }, entry.id))), dynamicBodies.map((entry) => (_jsx(XriftRuntimeDynamicBody, { entry: entry }, `dynamic:${entry.id}`)))] }));
}
function XriftRuntimeDynamicBody({ entry, }) {
    const hasExplicitCollider = entry.mesh !== null || entry.boxes.length > 0;
    const autoCollider = hasExplicitCollider || entry.autoColliders === "none"
        ? false
        : entry.autoColliders === "trimesh"
            ? "hull"
            : entry.autoColliders;
    return (_jsxs(RigidBody, { type: entry.bodyType, colliders: false, userData: { xriftRigidBodyBoundary: true }, position: entry.position, rotation: entry.rotation, sensor: entry.sensor, friction: entry.friction, restitution: entry.restitution, gravityScale: entry.gravityScale, linearDamping: entry.linearDamping, angularDamping: entry.angularDamping, canSleep: entry.canSleep, ccd: entry.ccd, lockTranslations: entry.lockTranslations, lockRotations: entry.lockRotations, children: [autoCollider ? _jsx(XRiftStudioMeshColliders, { type: autoCollider, children: _jsx("primitive", { object: entry.visual }) }) : _jsx("primitive", { object: entry.visual }), entry.mesh ? (_jsx("group", { scale: entry.scale, children: _jsx(XRiftStudioMeshColliders, { type: entry.meshType, sensor: entry.meshSensor, friction: entry.meshFriction, restitution: entry.meshRestitution, children: _jsx("primitive", { object: entry.mesh }) }) })) : null, entry.boxes.map((box, index) => (_jsx(CuboidCollider, { args: box.halfExtents, position: box.center, rotation: box.rotation, sensor: box.sensor, friction: box.friction, restitution: box.restitution }, `${entry.id}:dynamic-box:${index}`)))] }));
}
function collectRuntimeDynamicBodyEntries(result) {
    const scene = result.manifest.scenes[result.manifest.entryScene];
    if (!scene)
        return [];
    result.root.updateMatrixWorld(true);
    const entries = [];
    for (const entity of Object.values(scene.entities)) {
        if (!entity.enabled)
            continue;
        const source = result.entities.get(entity.id);
        if (!source || source.parent !== result.root)
            continue;
        if (hasDescendantRigidBody(entity.id, scene))
            continue;
        const rigidBody = entity.components.find((component) => component.type === "rigid-body" && component.enabled);
        const colliders = entity.components.filter((component) => component.type === "collider" && component.enabled);
        const legacyDynamicCollider = colliders.find((component) => component.bodyType !== undefined && component.bodyType !== "fixed");
        const bodyType = rigidBody?.bodyType ?? legacyDynamicCollider?.bodyType;
        if (bodyType !== "fixed" &&
            bodyType !== "dynamic" &&
            bodyType !== "kinematicPosition" &&
            bodyType !== "kinematicVelocity") {
            continue;
        }
        if (bodyType === "fixed" && !rigidBody)
            continue;
        source.updateWorldMatrix(true, false);
        const position = new Vector3();
        const quaternion = new Quaternion();
        const scale = new Vector3();
        source.matrixWorld.decompose(position, quaternion, scale);
        const rotation = new Euler().setFromQuaternion(quaternion, "XYZ");
        const worldScale = [
            Math.abs(scale.x),
            Math.abs(scale.y),
            Math.abs(scale.z),
        ];
        const ownedColliders = collectRuntimeOwnedColliders(entity, scene, result);
        const ownerInverse = new Matrix4().copy(source.matrixWorld).invert();
        const boxes = ownedColliders.flatMap(({ entity: colliderEntity, component: collider }) => {
            if (collider.shape !== "box")
                return [];
            const center = vec3Or(collider.center, [0, 0, 0]);
            const halfExtents = vec3Or(collider.halfExtents, [0.5, 0.5, 0.5]);
            const colliderSource = result.entities.get(colliderEntity.id) ?? source;
            colliderSource.updateWorldMatrix(true, false);
            const relative = new Matrix4().multiplyMatrices(ownerInverse, colliderSource.matrixWorld);
            const relativePosition = new Vector3();
            const relativeQuaternion = new Quaternion();
            const relativeScale = new Vector3();
            relative.decompose(relativePosition, relativeQuaternion, relativeScale);
            const localCenter = new Vector3(...center).applyMatrix4(relative);
            localCenter.multiply(new Vector3(...worldScale));
            const localRotation = new Euler().setFromQuaternion(relativeQuaternion, "XYZ");
            return [
                {
                    center: [localCenter.x, localCenter.y, localCenter.z],
                    halfExtents: [
                        halfExtents[0] * Math.abs(relativeScale.x) * worldScale[0],
                        halfExtents[1] * Math.abs(relativeScale.y) * worldScale[1],
                        halfExtents[2] * Math.abs(relativeScale.z) * worldScale[2],
                    ],
                    rotation: [localRotation.x, localRotation.y, localRotation.z],
                    sensor: collider.isTrigger === true,
                    friction: numberOr(collider.friction, 0.8, 0),
                    restitution: numberOr(collider.restitution, 0.1, 0),
                },
            ];
        });
        const meshColliders = ownedColliders.filter(({ component }) => component.shape === "mesh");
        const meshCollider = meshColliders[0]?.component;
        const meshParts = meshColliders.flatMap(({ entity: colliderEntity }) => {
            const colliderSource = result.entities.get(colliderEntity.id);
            if (!colliderSource || !containsMesh(colliderSource))
                return [];
            colliderSource.updateWorldMatrix(true, false);
            const relative = new Matrix4().multiplyMatrices(ownerInverse, colliderSource.matrixWorld);
            const clone = colliderSource.clone(true);
            const relativePosition = new Vector3();
            const relativeQuaternion = new Quaternion();
            const relativeScale = new Vector3();
            relative.decompose(relativePosition, relativeQuaternion, relativeScale);
            clone.position.copy(relativePosition);
            clone.quaternion.copy(relativeQuaternion);
            clone.scale.copy(relativeScale);
            prepareColliderClone(clone, true);
            return [clone];
        });
        const mesh = meshParts.length === 0 ? null : new Group();
        if (mesh)
            mesh.add(...meshParts);
        const visual = source.clone(true);
        visual.position.set(0, 0, 0);
        visual.quaternion.identity();
        visual.scale.copy(scale);
        source.visible = false;
        entries.push({
            id: entity.id,
            position: [position.x, position.y, position.z],
            rotation: [rotation.x, rotation.y, rotation.z],
            scale: worldScale,
            boxes,
            mesh,
            meshType: bodyType === "fixed" &&
                meshColliders.some(({ component }) => component.meshMode !== "convex")
                ? "trimesh"
                : "hull",
            meshSensor: meshCollider?.isTrigger === true,
            meshFriction: numberOr(meshCollider?.friction, 0.8, 0),
            meshRestitution: numberOr(meshCollider?.restitution, 0.1, 0),
            bodyType,
            autoColliders: rigidBody?.autoColliders ?? "none",
            sensor: rigidBody?.isTrigger ?? meshCollider?.isTrigger === true,
            friction: numberOr(rigidBody?.friction ?? meshCollider?.friction, 0.8, 0),
            restitution: numberOr(rigidBody?.restitution ?? meshCollider?.restitution, 0.1, 0),
            gravityScale: numberOr(rigidBody?.gravityScale ?? legacyDynamicCollider?.gravityScale, 1, 0),
            linearDamping: numberOr(rigidBody?.linearDamping ?? legacyDynamicCollider?.linearDamping, 0, 0),
            angularDamping: numberOr(rigidBody?.angularDamping ?? legacyDynamicCollider?.angularDamping, 0, 0),
            canSleep: booleanOr(legacyDynamicCollider?.canSleep, rigidBody?.canSleep ?? true),
            ccd: booleanOr(legacyDynamicCollider?.ccd, rigidBody?.ccd ?? false),
            lockTranslations: booleanOr(legacyDynamicCollider?.lockTranslations, rigidBody?.lockTranslations ?? false),
            lockRotations: booleanOr(legacyDynamicCollider?.lockRotations, rigidBody?.lockRotations ?? false),
            source,
            visual,
        });
    }
    return entries;
}
function collectRuntimeOwnedColliders(owner, scene, result) {
    return Object.values(scene.entities).flatMap((candidate) => {
        if (!candidate.enabled || !isDescendantEntity(candidate.id, owner.id, scene)) {
            return [];
        }
        if (candidate.id !== owner.id && hasBodyBoundaryBetween(candidate.id, owner.id, scene)) {
            return [];
        }
        const source = result.entities.get(candidate.id);
        if (!source)
            return [];
        return candidate.components.flatMap((component) => {
            if (component.type !== "collider" ||
                !component.enabled ||
                (candidate.id !== owner.id && !isFixedCollider(component))) {
                return [];
            }
            return [{ entity: candidate, component }];
        });
    });
}
function hasBodyBoundaryBetween(entityId, ownerId, scene) {
    let current = scene.entities[entityId];
    while (current && current.id !== ownerId) {
        if (current.id !== entityId && hasEnabledBody(current))
            return true;
        current = current.parentId ? scene.entities[current.parentId] : undefined;
    }
    return false;
}
function hasEnabledBody(entity) {
    return (entity.components.some((component) => component.type === "rigid-body" && component.enabled) ||
        entity.components.some((component) => component.type === "collider" &&
            component.enabled &&
            component.bodyType !== undefined &&
            component.bodyType !== "fixed"));
}
function hasDescendantRigidBody(ownerId, scene) {
    return Object.values(scene.entities).some((candidate) => candidate.id !== ownerId &&
        isDescendantEntity(candidate.id, ownerId, scene) &&
        candidate.components.some((component) => component.type === "rigid-body" && component.enabled));
}
function isDescendantEntity(entityId, ancestorId, scene) {
    let current = scene.entities[entityId];
    while (current) {
        if (current.id === ancestorId)
            return true;
        current = current.parentId ? scene.entities[current.parentId] : undefined;
    }
    return false;
}
function disposeRuntimePhysicsClone(object) {
    if (!object)
        return;
    object.traverse((child) => {
        if (!(child instanceof Mesh))
            return;
        const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];
        for (const material of materials)
            material.dispose();
    });
}
function collectRuntimeColliderEntries(result) {
    const scene = result.manifest.scenes[result.manifest.entryScene];
    if (!scene)
        return [];
    result.root.updateMatrixWorld(true);
    const entries = [];
    for (const entity of Object.values(scene.entities)) {
        if (!entity.enabled)
            continue;
        const hasRigidBody = entity.components.some((component) => component.type === "rigid-body" && component.enabled);
        if (hasRigidBody)
            continue;
        if (findAncestorRigidBody(entity.id, scene))
            continue;
        const colliders = entity.components.filter((component) => component.type === "collider" && component.enabled && isFixedCollider(component));
        if (colliders.length === 0)
            continue;
        const source = result.entities.get(entity.id);
        if (!source)
            continue;
        source.updateWorldMatrix(true, false);
        const position = new Vector3();
        const quaternion = new Quaternion();
        const scale = new Vector3();
        source.matrixWorld.decompose(position, quaternion, scale);
        const rotation = new Euler().setFromQuaternion(quaternion, "XYZ");
        const worldScale = [
            Math.abs(scale.x),
            Math.abs(scale.y),
            Math.abs(scale.z),
        ];
        const boxes = colliders.flatMap((collider) => {
            if (collider.shape !== "box")
                return [];
            const center = vec3Or(collider.center, [0, 0, 0]);
            const halfExtents = vec3Or(collider.halfExtents, [0.5, 0.5, 0.5]);
            return [
                {
                    center: [
                        center[0] * worldScale[0],
                        center[1] * worldScale[1],
                        center[2] * worldScale[2],
                    ],
                    halfExtents: [
                        halfExtents[0] * worldScale[0],
                        halfExtents[1] * worldScale[1],
                        halfExtents[2] * worldScale[2],
                    ],
                    rotation: [0, 0, 0],
                    sensor: collider.isTrigger === true,
                    friction: numberOr(collider.friction, 0.8, 0),
                    restitution: numberOr(collider.restitution, 0.1, 0),
                },
            ];
        });
        const meshCollider = colliders.find((collider) => collider.shape === "mesh");
        let meshSource = null;
        if (meshCollider) {
            if (containsMesh(source)) {
                meshSource = source.clone(true);
            }
            else if (entity.modelNode) {
                // A shared-Model node draws nothing itself; its collider geometry
                // lives under the Model root's loaded object.
                meshSource = cloneModelNodeGeometry(result, entity.modelNode);
            }
        }
        const mesh = meshSource ? prepareColliderClone(meshSource) : null;
        entries.push({
            id: entity.id,
            position: [position.x, position.y, position.z],
            rotation: [rotation.x, rotation.y, rotation.z],
            scale: worldScale,
            boxes,
            mesh,
            meshType: meshCollider?.meshMode === "convex" ? "hull" : "trimesh",
            meshSensor: meshCollider?.isTrigger === true,
            meshFriction: numberOr(meshCollider?.friction, 0.8, 0),
            meshRestitution: numberOr(meshCollider?.restitution, 0.1, 0),
        });
    }
    return entries;
}
function isFixedCollider(component) {
    return component.bodyType === undefined || component.bodyType === "fixed";
}
function findAncestorRigidBody(entityId, scene) {
    let current = scene.entities[entityId];
    while (current?.parentId) {
        current = scene.entities[current.parentId];
        if (current?.components.some((component) => component.type === "rigid-body" && component.enabled)) {
            return current;
        }
    }
    return undefined;
}
function containsMesh(object) {
    let found = false;
    object.traverse((child) => {
        if (child instanceof Mesh)
            found = true;
    });
    return found;
}
/**
 * Collider geometry for a Mesh Collider on a shared-Model node: the node's
 * subtree cloned out of the Model root's loaded object, minus descendants
 * that are glTF nodes of their own — their colliders are their own
 * Entities' business. The proxy Entity's world transform places the result,
 * so the clone's own Transform is discarded by prepareColliderClone.
 */
function cloneModelNodeGeometry(result, modelNode) {
    const modelRoot = result.entities.get(modelNode.modelEntityId);
    if (!modelRoot)
        return null;
    let node = null;
    modelRoot.traverse((candidate) => {
        if (!node &&
            candidate.userData.xriftSourceNodeIndex === modelNode.sourceNodeIndex) {
            node = candidate;
        }
    });
    if (!node)
        return null;
    const clone = node.clone(true);
    const strays = [];
    clone.traverse((child) => {
        if (child !== clone &&
            typeof child.userData.xriftSourceNodeIndex === "number") {
            strays.push(child);
        }
    });
    for (const stray of strays)
        stray.removeFromParent();
    return containsMesh(clone) ? clone : null;
}
function prepareColliderClone(object, preserveRootTransform = false) {
    if (!preserveRootTransform) {
        object.position.set(0, 0, 0);
        object.rotation.set(0, 0, 0);
        object.scale.set(1, 1, 1);
    }
    // A node the Model pose hides (visible: false) is out of the world's sight
    // and out of its physics: drop it before visibility is forced back on for
    // Rapier's sweep below.
    const hidden = [];
    object.traverse((child) => {
        if (child !== object && !child.visible)
            hidden.push(child);
    });
    for (const child of hidden)
        child.removeFromParent();
    object.traverse((child) => {
        child.visible = true;
        if (!(child instanceof Mesh))
            return;
        const materials = Array.isArray(child.material)
            ? child.material.map((material) => material.clone())
            : child.material.clone();
        if (Array.isArray(materials)) {
            for (const material of materials)
                material.visible = false;
        }
        else {
            materials.visible = false;
        }
        child.material = materials;
    });
    return object;
}
function runtimeGravity(result) {
    const settings = result.manifest.scenes[result.manifest.entryScene]?.settings;
    const physics = isRecord(settings?.physics) ? settings.physics : null;
    const gravity = numberOr(physics?.gravity, 9.81, 0);
    return [0, -gravity, 0];
}
function vec3Or(value, fallback, minimum = Number.NEGATIVE_INFINITY) {
    return Array.isArray(value) &&
        value.length === 3 &&
        value.every((entry) => typeof entry === "number" &&
            Number.isFinite(entry) &&
            entry >= minimum)
        ? [value[0], value[1], value[2]]
        : fallback;
}
function XriftRuntimePostprocessing({ result }) {
    const { camera, gl, scene, size } = useThree();
    const settings = result.manifest.scenes[result.manifest.entryScene]?.settings;
    const postprocessing = isRecord(settings?.postprocessing)
        ? settings.postprocessing
        : null;
    const bloom = isRecord(postprocessing?.bloom)
        ? postprocessing.bloom
        : null;
    const hdr = isRecord(postprocessing?.hdr) ? postprocessing.hdr : null;
    const ao = isRecord(postprocessing?.ao) ? postprocessing.ao : null;
    const enabled = postprocessing?.enabled === true;
    const bloomEnabled = bloom?.enabled === true;
    const hdrEnabled = hdr?.enabled !== false;
    const toneMapping = hdr?.toneMapping === "none" ? "none" : "aces";
    const pipeline = useMemo(() => {
        const renderTarget = hdrEnabled
            ? new WebGLRenderTarget(size.width, size.height, {
                type: HalfFloatType,
                format: RGBAFormat,
                depthBuffer: true,
                stencilBuffer: false,
            })
            : undefined;
        const composer = new EffectComposer(gl, renderTarget);
        const renderPass = new RenderPass(scene, camera);
        const aoPass = new SSAOPass(scene, camera, size.width, size.height);
        const bloomPass = new UnrealBloomPass(new Vector2(size.width, size.height), 0.12, 0.18, 8);
        composer.addPass(renderPass);
        composer.addPass(aoPass);
        composer.addPass(bloomPass);
        return { composer, aoPass, bloomPass };
    }, [camera, gl, hdrEnabled, scene]);
    useEffect(() => {
        pipeline.composer.setSize(size.width, size.height);
    }, [pipeline, size.height, size.width]);
    useEffect(() => {
        const previousToneMapping = gl.toneMapping;
        const previousExposure = gl.toneMappingExposure;
        const previousOutputColorSpace = gl.outputColorSpace;
        gl.outputColorSpace = SRGBColorSpace;
        gl.toneMapping = toneMapping === "none" ? NoToneMapping : ACESFilmicToneMapping;
        gl.toneMappingExposure = numberOr(postprocessing?.exposure, 0.85, 0);
        return () => {
            gl.toneMapping = previousToneMapping;
            gl.toneMappingExposure = previousExposure;
            gl.outputColorSpace = previousOutputColorSpace;
        };
    }, [gl, postprocessing?.exposure, toneMapping]);
    useEffect(() => {
        pipeline.bloomPass.enabled = enabled && bloomEnabled;
        pipeline.bloomPass.threshold = numberOr(bloom?.threshold, 8, 0);
        pipeline.bloomPass.strength = numberOr(bloom?.strength, 0.12, 0);
        pipeline.bloomPass.radius = numberOr(bloom?.radius, 0.18, 0);
        pipeline.aoPass.enabled = enabled && ao?.enabled === true;
        pipeline.aoPass.kernelRadius = numberOr(ao?.radius, 8, 0.1);
        pipeline.aoPass.minDistance = numberOr(ao?.minDistance, 0.005, 0);
        pipeline.aoPass.maxDistance = Math.max(numberOr(ao?.maxDistance, 0.1, 0.001), numberOr(ao?.minDistance, 0.005, 0) + 0.001);
    }, [ao, bloom, bloomEnabled, enabled, pipeline]);
    useEffect(() => () => {
        pipeline.composer.dispose();
    }, [pipeline]);
    useFrame(() => {
        if (enabled) {
            pipeline.composer.render();
        }
        else {
            // This callback owns the render priority, so explicitly fall back to
            // the normal renderer when the scene disables postprocessing.
            gl.render(scene, camera);
        }
    }, 1);
    return null;
}
function collectRuntimeMeshVisibilityTargets(result) {
    const scene = result.manifest.scenes[result.manifest.entryScene];
    if (!scene)
        return [];
    const targets = [];
    for (const entity of Object.values(scene.entities)) {
        const entityRoot = result.entities.get(entity.id);
        if (!entityRoot)
            continue;
        for (const component of entity.components) {
            if (component.type !== "mesh" ||
                !component.enabled ||
                component.maxDistance === undefined ||
                !Number.isFinite(component.maxDistance)) {
                continue;
            }
            const object = entityRoot.children.find((candidate) => candidate.userData.xriftStudioComponentId === component.id);
            if (!object)
                continue;
            targets.push({
                object,
                maxDistance: component.maxDistance,
                worldPosition: new Vector3(),
            });
        }
    }
    return targets;
}
/** Applies Mesh maxDistance every frame so Editor/Play/Classic share one cutoff. */
function XriftRuntimeMeshVisibility({ result }) {
    const targets = useMemo(() => collectRuntimeMeshVisibilityTargets(result), [result]);
    const cameraPosition = useMemo(() => new Vector3(), []);
    useFrame(({ camera }) => {
        camera.getWorldPosition(cameraPosition);
        for (const target of targets) {
            target.object.getWorldPosition(target.worldPosition);
            const visible = cameraPosition.distanceTo(target.worldPosition) <= target.maxDistance;
            if (target.object.visible !== visible)
                target.object.visible = visible;
        }
    });
    return null;
}
function collectRuntimeVegetationTargets(result) {
    const scene = result.manifest.scenes[result.manifest.entryScene];
    if (!scene)
        return [];
    const targets = [];
    const seen = new Set();
    for (const entity of Object.values(scene.entities)) {
        const root = result.entities.get(entity.id);
        if (!root)
            continue;
        const component = entity.components.find((candidate) => candidate.type === "vegetation-wind");
        if (!component || !component.enabled)
            continue;
        root.traverse((object) => {
            if (!(object instanceof Mesh) || seen.has(object))
                return;
            seen.add(object);
            const position = object.position.clone();
            const rotation = object.rotation.clone();
            let phase = 0;
            for (const character of `${entity.id}:${object.uuid}`) {
                phase = (phase * 31 + character.charCodeAt(0)) % 628;
            }
            targets.push({
                object,
                position,
                rotation,
                phase: phase / 100,
                componentEnabled: component.enabled,
            });
        });
    }
    return targets;
}
function XriftRuntimeVegetationWind({ result }) {
    const targets = useMemo(() => collectRuntimeVegetationTargets(result), [result]);
    const sceneSettings = result.manifest.scenes[result.manifest.entryScene]?.settings;
    const vegetation = isRecord(sceneSettings?.vegetation)
        ? sceneSettings.vegetation
        : null;
    const enabled = vegetation?.enabled === true;
    const windStrength = numberOr(vegetation?.windStrength, 0.08, 0);
    const windSpeed = numberOr(vegetation?.windSpeed, 0.8, 0);
    const gustStrength = numberOr(vegetation?.gustStrength, 0.35, 0);
    useFrame((state) => {
        if (!enabled || targets.length === 0)
            return;
        const elapsed = state.clock.getElapsedTime();
        for (const target of targets) {
            if (!target.componentEnabled)
                continue;
            const wave = Math.sin(elapsed * windSpeed + target.phase) * 0.7 +
                Math.sin(elapsed * windSpeed * 0.37 + target.phase * 1.7) *
                    gustStrength;
            target.object.position.copy(target.position);
            target.object.position.x += wave * windStrength * 0.03;
            target.object.position.y +=
                Math.cos(elapsed * windSpeed * 0.63 + target.phase) *
                    windStrength *
                    0.01;
            target.object.rotation.copy(target.rotation);
            target.object.rotation.z += wave * windStrength * 0.35;
            target.object.rotation.x += wave * windStrength * 0.16;
        }
    });
    return null;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function numberOr(value, fallback, minimum) {
    return typeof value === "number" && Number.isFinite(value) && value >= minimum
        ? value
        : fallback;
}
function XriftRuntimeTimeUniforms({ result }) {
    useFrame((state) => {
        const elapsed = state.clock.getElapsedTime();
        result.root.traverse((object) => {
            const mesh = object;
            const material = mesh.material;
            const specs = material?.userData?.xriftTimeUniforms;
            if (!Array.isArray(specs) || !material)
                return;
            for (const spec of specs) {
                const uniform = material.uniforms[spec.name];
                if (uniform) {
                    applyTimeUniformValue(uniform, spec, elapsed);
                }
            }
        });
    });
    return null;
}
function XriftRuntimeAnimations({ result }) {
    /**
     * One mixer per Entity, not one per clip.
     *
     * A behavior graph can pause, seek or switch the clip an Entity is playing,
     * and that only has a meaning when every clip on that Entity shares a mixer:
     * with one mixer per clip, "switch to clip 2" would leave clip 1 running on
     * its own timeline.
     */
    const entries = useMemo(() => {
        const scene = result.manifest.scenes[result.manifest.entryScene];
        if (!scene)
            return [];
        return Object.values(scene.entities).flatMap((entity) => {
            const target = result.entities.get(entity.id);
            const clips = result.animationClipsByEntity.get(entity.id) ?? [];
            if (!target || clips.length === 0)
                return [];
            /*
             * What plays, and how, comes only from the graph.
             *
             * v1 removed the Animation Component: one Component could name one clip,
             * and a Model whose motion is split across dozens of them had no way to
             * say "all of these". So loop and speed are per cue rather than per
             * Entity, and an Entity with clips gets a mixer whether or not anything
             * has started one yet — a graph can start a clip at any moment.
             */
            const cues = planInteractivityAnimationCues(result.interactionAnimationCuesByEntity.get(entity.id) ?? []).flatMap((plan) => {
                const clip = clips[plan.index];
                return clip ? [{ clip, ...plan }] : [];
            });
            return [
                {
                    entityId: entity.id,
                    target,
                    clips,
                    cues,
                    mixer: new AnimationMixer(target),
                    bridge: null,
                },
            ];
        });
    }, [result]);
    useEffect(() => {
        const cleanups = [];
        for (const entry of entries) {
            for (const cue of entry.cues) {
                const action = entry.mixer.clipAction(cue.clip);
                action.reset();
                action.clampWhenFinished = !cue.loop;
                action.setLoop(cue.loop ? LoopRepeat : LoopOnce, cue.loop ? Infinity : 1);
                action.timeScale = cue.speed;
                if (cue.startTime > 0)
                    action.time = cue.startTime;
                // `flow/setDelay` becomes mixer-clock scheduling rather than a timer, so
                // the wait stays in step with the same clock that advances the clip.
                if (cue.delaySeconds > 0) {
                    action.startAt(entry.mixer.time + cue.delaySeconds);
                }
                action.play();
            }
            // A bridge for every Entity that has clips. What it should play is not
            // known here — a graph can start any clip at any moment — so the bridge
            // carries no clip of its own and no owner id, and the cues above have
            // already started whatever begins with the world.
            const bridge = createXriftAnimationRuntimeBridge({
                componentId: "",
                clipNames: entry.clips.map((clip) => clip.name),
                clipIndex: 0,
                autoplay: false,
                speed: 1,
                loop: false,
            });
            const controller = createXriftAnimationMixerController({
                mixer: entry.mixer,
                clips: entry.clips,
                clipIndex: 0,
                loop: false,
                speed: 1,
            });
            const disconnect = bridge.connect(controller);
            const holder = entry.target.userData;
            holder[XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY] = bridge;
            entry.bridge = bridge;
            cleanups.push(() => {
                disconnect();
                controller.dispose();
                delete holder[XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY];
                entry.bridge = null;
            });
        }
        return () => {
            for (const cleanup of cleanups)
                cleanup();
            for (const entry of entries) {
                entry.mixer.stopAllAction();
                entry.mixer.uncacheRoot(entry.mixer.getRoot());
            }
        };
    }, [entries]);
    useFrame((_, delta) => {
        for (const entry of entries) {
            entry.mixer.update(Math.min(delta, 0.1));
            entry.bridge?.sample();
        }
    });
    return null;
}

const {jsx} = await importShared('react/jsx-runtime');
const MANIFEST_URL = new URL("./xrift/runtime.json", import.meta.url).href;
const World = ({ position = [0, 0, 0], scale = 1 }) => /* @__PURE__ */ jsx("group", { position, scale, children: /* @__PURE__ */ jsx(XriftWorld, { manifest: MANIFEST_URL }) });

export { World };
