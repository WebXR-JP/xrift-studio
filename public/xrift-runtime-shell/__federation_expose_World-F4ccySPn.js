const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["three-icosa.module-DhY13CNW.js","__federation_fn_import-CVj0xDfO.js"])))=>i.map(i=>d[i]);
import { importShared } from './__federation_fn_import-CVj0xDfO.js';
import { _ as __vitePreload } from './preload-helper-CWZBUsdZ.js';
import { DRACOLoader } from './__federation_shared_three/addons/loaders/DRACOLoader.js-Bp9CHQRl.js';
import { c as createDerivedMaterial, d as defineWorkerModule, S as SDFGenerator, t as terminateWorker, v as voidMainRegExp, b as bidiFactory } from './troika-three-utils.esm-trrkNKaz.js';

const {BufferAttribute: BufferAttribute$1,BufferGeometry: BufferGeometry$2,Float32BufferAttribute: Float32BufferAttribute$1,InstancedBufferAttribute: InstancedBufferAttribute$2,InterleavedBuffer: InterleavedBuffer$1,InterleavedBufferAttribute: InterleavedBufferAttribute$1,TriangleFanDrawMode: TriangleFanDrawMode$1,TriangleStripDrawMode: TriangleStripDrawMode$1,TrianglesDrawMode,Vector3: Vector3$5} = await importShared('three');

/**
 * Returns a new indexed geometry based on `TrianglesDrawMode` draw mode.
 * This mode corresponds to the `gl.TRIANGLES` primitive in WebGL.
 *
 * @param {BufferGeometry} geometry - The geometry to convert.
 * @param {number} drawMode - The current draw mode.
 * @return {BufferGeometry} The new geometry using `TrianglesDrawMode`.
 */
function toTrianglesDrawMode( geometry, drawMode ) {

	if ( drawMode === TrianglesDrawMode ) {

		console.warn( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles.' );
		return geometry;

	}

	if ( drawMode === TriangleFanDrawMode$1 || drawMode === TriangleStripDrawMode$1 ) {

		let index = geometry.getIndex();

		// generate index if not present

		if ( index === null ) {

			const indices = [];

			const position = geometry.getAttribute( 'position' );

			if ( position !== undefined ) {

				for ( let i = 0; i < position.count; i ++ ) {

					indices.push( i );

				}

				geometry.setIndex( indices );
				index = geometry.getIndex();

			} else {

				console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible.' );
				return geometry;

			}

		}

		//

		const numberOfTriangles = index.count - 2;
		const newIndices = [];

		if ( drawMode === TriangleFanDrawMode$1 ) {

			// gl.TRIANGLE_FAN

			for ( let i = 1; i <= numberOfTriangles; i ++ ) {

				newIndices.push( index.getX( 0 ) );
				newIndices.push( index.getX( i ) );
				newIndices.push( index.getX( i + 1 ) );

			}

		} else {

			// gl.TRIANGLE_STRIP

			for ( let i = 0; i < numberOfTriangles; i ++ ) {

				if ( i % 2 === 0 ) {

					newIndices.push( index.getX( i ) );
					newIndices.push( index.getX( i + 1 ) );
					newIndices.push( index.getX( i + 2 ) );

				} else {

					newIndices.push( index.getX( i + 2 ) );
					newIndices.push( index.getX( i + 1 ) );
					newIndices.push( index.getX( i ) );

				}

			}

		}

		if ( ( newIndices.length / 3 ) !== numberOfTriangles ) {

			console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.' );

		}

		// build final geometry

		const newGeometry = geometry.clone();
		newGeometry.setIndex( newIndices );
		newGeometry.clearGroups();

		return newGeometry;

	} else {

		console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:', drawMode );
		return geometry;

	}

}

const {AnimationClip: AnimationClip$1,AnimationMixer: AnimationMixer$1,Matrix4: Matrix4$2,Quaternion: Quaternion$1,QuaternionKeyframeTrack: QuaternionKeyframeTrack$1,SkeletonHelper,Vector3: Vector3$4,VectorKeyframeTrack: VectorKeyframeTrack$1} = await importShared('three');
function clone(source) {
  const sourceLookup = /* @__PURE__ */ new Map();
  const cloneLookup = /* @__PURE__ */ new Map();
  const clone2 = source.clone();
  parallelTraverse(source, clone2, function(sourceNode, clonedNode) {
    sourceLookup.set(clonedNode, sourceNode);
    cloneLookup.set(sourceNode, clonedNode);
  });
  clone2.traverse(function(node) {
    if (!node.isSkinnedMesh) return;
    const clonedMesh = node;
    const sourceMesh = sourceLookup.get(node);
    const sourceBones = sourceMesh.skeleton.bones;
    clonedMesh.skeleton = sourceMesh.skeleton.clone();
    clonedMesh.bindMatrix.copy(sourceMesh.bindMatrix);
    clonedMesh.skeleton.bones = sourceBones.map(function(bone) {
      return cloneLookup.get(bone);
    });
    clonedMesh.bind(clonedMesh.skeleton, clonedMesh.bindMatrix);
  });
  return clone2;
}
function parallelTraverse(a, b, callback) {
  callback(a, b);
  for (let i = 0; i < a.children.length; i++) {
    parallelTraverse(a.children[i], b.children[i], callback);
  }
}

const {AnimationClip,Bone,Box3: Box3$1,BufferAttribute,BufferGeometry: BufferGeometry$1,ClampToEdgeWrapping: ClampToEdgeWrapping$1,Color: Color$3,ColorManagement: ColorManagement$1,DirectionalLight: DirectionalLight$1,DoubleSide: DoubleSide$2,FileLoader: FileLoader$2,FrontSide: FrontSide$1,Group: Group$2,ImageBitmapLoader,InstancedMesh,InterleavedBuffer,InterleavedBufferAttribute,Interpolant,InterpolateDiscrete,InterpolateLinear,Line,LineBasicMaterial: LineBasicMaterial$1,LineLoop,LineSegments: LineSegments$1,LinearFilter: LinearFilter$2,LinearMipmapLinearFilter: LinearMipmapLinearFilter$1,LinearMipmapNearestFilter,LinearSRGBColorSpace: LinearSRGBColorSpace$1,Loader: Loader$2,LoaderUtils,Material: Material$1,MathUtils,Matrix4: Matrix4$1,Mesh: Mesh$3,MeshBasicMaterial: MeshBasicMaterial$1,MeshPhysicalMaterial,MeshStandardMaterial: MeshStandardMaterial$1,MirroredRepeatWrapping: MirroredRepeatWrapping$1,NearestFilter: NearestFilter$1,NearestMipmapLinearFilter,NearestMipmapNearestFilter: NearestMipmapNearestFilter$1,NumberKeyframeTrack,Object3D,OrthographicCamera,PerspectiveCamera,PointLight: PointLight$1,Points: Points$1,PointsMaterial: PointsMaterial$1,PropertyBinding,Quaternion,QuaternionKeyframeTrack,RepeatWrapping: RepeatWrapping$1,Skeleton,SkinnedMesh,Sphere: Sphere$1,SpotLight: SpotLight$1,Texture: Texture$2,TextureLoader: TextureLoader$1,TriangleFanDrawMode,TriangleStripDrawMode,Vector2: Vector2$2,Vector3: Vector3$3,VectorKeyframeTrack,SRGBColorSpace: SRGBColorSpace$4,InstancedBufferAttribute: InstancedBufferAttribute$1} = await importShared('three');

/**
 * A loader for the glTF 2.0 format.
 *
 * [glTF](https://www.khronos.org/gltf/) (GL Transmission Format) is an [open format specification]{@link https://github.com/KhronosGroup/glTF/tree/main/specification/2.0)
 * for efficient delivery and loading of 3D content. Assets may be provided either in JSON (.gltf) or binary (.glb)
 * format. External files store textures (.jpg, .png) and additional binary data (.bin). A glTF asset may deliver
 * one or more scenes, including meshes, materials, textures, skins, skeletons, morph targets, animations, lights,
 * and/or cameras.
 *
 * `GLTFLoader` uses {@link ImageBitmapLoader} whenever possible. Be advised that image bitmaps are not
 * automatically GC-collected when they are no longer referenced, and they require special handling during
 * the disposal process.
 *
 * `GLTFLoader` supports the following glTF 2.0 extensions:
 * - KHR_draco_mesh_compression
 * - KHR_materials_clearcoat
 * - KHR_materials_dispersion
 * - KHR_materials_ior
 * - KHR_materials_specular
 * - KHR_materials_transmission
 * - KHR_materials_iridescence
 * - KHR_materials_unlit
 * - KHR_materials_volume
 * - KHR_mesh_quantization
 * - KHR_meshopt_compression
 * - KHR_lights_punctual
 * - KHR_texture_basisu
 * - KHR_texture_transform
 * - EXT_texture_webp
 * - EXT_meshopt_compression
 * - EXT_mesh_gpu_instancing
 *
 * The following glTF 2.0 extension is supported by an external user plugin:
 * - [KHR_materials_variants](https://github.com/takahirox/three-gltf-extensions)
 * - [MSFT_texture_dds](https://github.com/takahirox/three-gltf-extensions)
 * - [KHR_animation_pointer](https://github.com/needle-tools/three-animation-pointer)
 * - [NEEDLE_progressive](https://github.com/needle-tools/gltf-progressive)
 *
 * ```js
 * const loader = new GLTFLoader();
 *
 * // Optional: Provide a DRACOLoader instance to decode compressed mesh data
 * const dracoLoader = new DRACOLoader();
 * dracoLoader.setDecoderPath( '/examples/jsm/libs/draco/' );
 * loader.setDRACOLoader( dracoLoader );
 *
 * const gltf = await loader.loadAsync( 'models/gltf/duck/duck.gltf' );
 * scene.add( gltf.scene );
 * ```
 *
 * @augments Loader
 * @three_import import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
 */
class GLTFLoader extends Loader$2 {

	/**
	 * Constructs a new glTF loader.
	 *
	 * @param {LoadingManager} [manager] - The loading manager.
	 */
	constructor( manager ) {

		super( manager );

		this.dracoLoader = null;
		this.ktx2Loader = null;
		this.meshoptDecoder = null;

		this.pluginCallbacks = [];

		this.register( function ( parser ) {

			return new GLTFMaterialsClearcoatExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsDispersionExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFTextureBasisUExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFTextureWebPExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFTextureAVIFExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsSheenExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsTransmissionExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsVolumeExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsIorExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsEmissiveStrengthExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsSpecularExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsIridescenceExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsAnisotropyExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsBumpExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFLightsExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMeshoptCompression( parser, EXTENSIONS.EXT_MESHOPT_COMPRESSION );

		} );

		this.register( function ( parser ) {

			return new GLTFMeshoptCompression( parser, EXTENSIONS.KHR_MESHOPT_COMPRESSION );

		} );

		this.register( function ( parser ) {

			return new GLTFMeshGpuInstancing( parser );

		} );

	}

	/**
	 * Starts loading from the given URL and passes the loaded glTF asset
	 * to the `onLoad()` callback.
	 *
	 * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
	 * @param {function(GLTFLoader~LoadObject)} onLoad - Executed when the loading process has been finished.
	 * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
	 * @param {onErrorCallback} onError - Executed when errors occur.
	 */
	load( url, onLoad, onProgress, onError ) {

		const scope = this;

		let resourcePath;

		if ( this.resourcePath !== '' ) {

			resourcePath = this.resourcePath;

		} else if ( this.path !== '' ) {

			// If a base path is set, resources will be relative paths from that plus the relative path of the gltf file
			// Example  path = 'https://my-cnd-server.com/', url = 'assets/models/model.gltf'
			// resourcePath = 'https://my-cnd-server.com/assets/models/'
			// referenced resource 'model.bin' will be loaded from 'https://my-cnd-server.com/assets/models/model.bin'
			// referenced resource '../textures/texture.png' will be loaded from 'https://my-cnd-server.com/assets/textures/texture.png'
			const relativeUrl = LoaderUtils.extractUrlBase( url );
			resourcePath = LoaderUtils.resolveURL( relativeUrl, this.path );

		} else {

			resourcePath = LoaderUtils.extractUrlBase( url );

		}

		// Tells the LoadingManager to track an extra item, which resolves after
		// the model is fully loaded. This means the count of items loaded will
		// be incorrect, but ensures manager.onLoad() does not fire early.
		this.manager.itemStart( url );

		const _onError = function ( e ) {

			if ( onError ) {

				onError( e );

			} else {

				console.error( e );

			}

			scope.manager.itemError( url );
			scope.manager.itemEnd( url );

		};

		const loader = new FileLoader$2( this.manager );

		loader.setPath( this.path );
		loader.setResponseType( 'arraybuffer' );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );

		loader.load( url, function ( data ) {

			try {

				scope.parse( data, resourcePath, function ( gltf ) {

					onLoad( gltf );

					scope.manager.itemEnd( url );

				}, _onError );

			} catch ( e ) {

				_onError( e );

			}

		}, onProgress, _onError );

	}

	/**
	 * Sets the given Draco loader to this loader. Required for decoding assets
	 * compressed with the `KHR_draco_mesh_compression` extension.
	 *
	 * @param {DRACOLoader} dracoLoader - The Draco loader to set.
	 * @return {GLTFLoader} A reference to this loader.
	 */
	setDRACOLoader( dracoLoader ) {

		this.dracoLoader = dracoLoader;
		return this;

	}

	/**
	 * Sets the given KTX2 loader to this loader. Required for loading KTX2
	 * compressed textures.
	 *
	 * @param {KTX2Loader} ktx2Loader - The KTX2 loader to set.
	 * @return {GLTFLoader} A reference to this loader.
	 */
	setKTX2Loader( ktx2Loader ) {

		this.ktx2Loader = ktx2Loader;
		return this;

	}

	/**
	 * Sets the given meshopt decoder. Required for decoding assets
	 * compressed with the `EXT_meshopt_compression` extension.
	 *
	 * @param {Object} meshoptDecoder - The meshopt decoder to set.
	 * @return {GLTFLoader} A reference to this loader.
	 */
	setMeshoptDecoder( meshoptDecoder ) {

		this.meshoptDecoder = meshoptDecoder;
		return this;

	}

	/**
	 * Registers a plugin callback. This API is internally used to implement the various
	 * glTF extensions but can also used by third-party code to add additional logic
	 * to the loader.
	 *
	 * @param {function(parser:GLTFParser)} callback - The callback function to register.
	 * @return {GLTFLoader} A reference to this loader.
	 */
	register( callback ) {

		if ( this.pluginCallbacks.indexOf( callback ) === -1 ) {

			this.pluginCallbacks.push( callback );

		}

		return this;

	}

	/**
	 * Unregisters a plugin callback.
	 *
	 * @param {Function} callback - The callback function to unregister.
	 * @return {GLTFLoader} A reference to this loader.
	 */
	unregister( callback ) {

		if ( this.pluginCallbacks.indexOf( callback ) !== -1 ) {

			this.pluginCallbacks.splice( this.pluginCallbacks.indexOf( callback ), 1 );

		}

		return this;

	}

	/**
	 * Parses the given glTF data and returns the resulting group.
	 *
	 * @param {string|ArrayBuffer} data - The raw glTF data.
	 * @param {string} path - The URL base path.
	 * @param {function(GLTFLoader~LoadObject)} onLoad - Executed when the loading process has been finished.
	 * @param {onErrorCallback} onError - Executed when errors occur.
	 */
	parse( data, path, onLoad, onError ) {

		let json;
		const extensions = {};
		const plugins = {};
		const textDecoder = new TextDecoder();

		if ( typeof data === 'string' ) {

			json = JSON.parse( data );

		} else if ( data instanceof ArrayBuffer ) {

			const magic = textDecoder.decode( new Uint8Array( data, 0, 4 ) );

			if ( magic === BINARY_EXTENSION_HEADER_MAGIC ) {

				try {

					extensions[ EXTENSIONS.KHR_BINARY_GLTF ] = new GLTFBinaryExtension( data );

				} catch ( error ) {

					if ( onError ) onError( error );
					return;

				}

				json = JSON.parse( extensions[ EXTENSIONS.KHR_BINARY_GLTF ].content );

			} else {

				json = JSON.parse( textDecoder.decode( data ) );

			}

		} else {

			json = data;

		}

		if ( json.asset === undefined || json.asset.version[ 0 ] < 2 ) {

			if ( onError ) onError( new Error( 'THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported.' ) );
			return;

		}

		const parser = new GLTFParser( json, {

			path: path || this.resourcePath || '',
			crossOrigin: this.crossOrigin,
			requestHeader: this.requestHeader,
			manager: this.manager,
			ktx2Loader: this.ktx2Loader,
			meshoptDecoder: this.meshoptDecoder

		} );

		parser.fileLoader.setRequestHeader( this.requestHeader );

		for ( let i = 0; i < this.pluginCallbacks.length; i ++ ) {

			const plugin = this.pluginCallbacks[ i ]( parser );

			if ( ! plugin.name ) console.error( 'THREE.GLTFLoader: Invalid plugin found: missing name' );

			plugins[ plugin.name ] = plugin;

			// Workaround to avoid determining as unknown extension
			// in addUnknownExtensionsToUserData().
			// Remove this workaround if we move all the existing
			// extension handlers to plugin system
			extensions[ plugin.name ] = true;

		}

		if ( json.extensionsUsed ) {

			for ( let i = 0; i < json.extensionsUsed.length; ++ i ) {

				const extensionName = json.extensionsUsed[ i ];
				const extensionsRequired = json.extensionsRequired || [];

				switch ( extensionName ) {

					case EXTENSIONS.KHR_MATERIALS_UNLIT:
						extensions[ extensionName ] = new GLTFMaterialsUnlitExtension();
						break;

					case EXTENSIONS.KHR_DRACO_MESH_COMPRESSION:
						extensions[ extensionName ] = new GLTFDracoMeshCompressionExtension( json, this.dracoLoader );
						break;

					case EXTENSIONS.KHR_TEXTURE_TRANSFORM:
						extensions[ extensionName ] = new GLTFTextureTransformExtension();
						break;

					case EXTENSIONS.KHR_MESH_QUANTIZATION:
						extensions[ extensionName ] = new GLTFMeshQuantizationExtension();
						break;

					default:

						if ( extensionsRequired.indexOf( extensionName ) >= 0 && plugins[ extensionName ] === undefined ) {

							console.warn( 'THREE.GLTFLoader: Unknown extension "' + extensionName + '".' );

						}

				}

			}

		}

		parser.setExtensions( extensions );
		parser.setPlugins( plugins );
		parser.parse( onLoad, onError );

	}

	/**
	 * Async version of {@link GLTFLoader#parse}.
	 *
	 * @async
	 * @param {string|ArrayBuffer} data - The raw glTF data.
	 * @param {string} path - The URL base path.
	 * @return {Promise<GLTFLoader~LoadObject>} A Promise that resolves with the loaded glTF when the parsing has been finished.
	 */
	parseAsync( data, path ) {

		const scope = this;

		return new Promise( function ( resolve, reject ) {

			scope.parse( data, path, resolve, reject );

		} );

	}

}

/* GLTFREGISTRY */

function GLTFRegistry() {

	let objects = {};

	return	{

		get: function ( key ) {

			return objects[ key ];

		},

		add: function ( key, object ) {

			objects[ key ] = object;

		},

		remove: function ( key ) {

			delete objects[ key ];

		},

		removeAll: function () {

			objects = {};

		}

	};

}

/*********************************/
/********** EXTENSIONS ***********/
/*********************************/

function getMaterialExtension( parser, materialIndex, extensionName ) {

	const materialDef = parser.json.materials[ materialIndex ];

	if ( materialDef.extensions && materialDef.extensions[ extensionName ] ) {

		return materialDef.extensions[ extensionName ];

	}

	return null;

}

const EXTENSIONS = {
	KHR_BINARY_GLTF: 'KHR_binary_glTF',
	KHR_DRACO_MESH_COMPRESSION: 'KHR_draco_mesh_compression',
	KHR_LIGHTS_PUNCTUAL: 'KHR_lights_punctual',
	KHR_MATERIALS_CLEARCOAT: 'KHR_materials_clearcoat',
	KHR_MATERIALS_DISPERSION: 'KHR_materials_dispersion',
	KHR_MATERIALS_IOR: 'KHR_materials_ior',
	KHR_MATERIALS_SHEEN: 'KHR_materials_sheen',
	KHR_MATERIALS_SPECULAR: 'KHR_materials_specular',
	KHR_MATERIALS_TRANSMISSION: 'KHR_materials_transmission',
	KHR_MATERIALS_IRIDESCENCE: 'KHR_materials_iridescence',
	KHR_MATERIALS_ANISOTROPY: 'KHR_materials_anisotropy',
	KHR_MATERIALS_UNLIT: 'KHR_materials_unlit',
	KHR_MATERIALS_VOLUME: 'KHR_materials_volume',
	KHR_TEXTURE_BASISU: 'KHR_texture_basisu',
	KHR_TEXTURE_TRANSFORM: 'KHR_texture_transform',
	KHR_MESH_QUANTIZATION: 'KHR_mesh_quantization',
	KHR_MATERIALS_EMISSIVE_STRENGTH: 'KHR_materials_emissive_strength',
	EXT_MATERIALS_BUMP: 'EXT_materials_bump',
	EXT_TEXTURE_WEBP: 'EXT_texture_webp',
	EXT_TEXTURE_AVIF: 'EXT_texture_avif',
	EXT_MESHOPT_COMPRESSION: 'EXT_meshopt_compression',
	KHR_MESHOPT_COMPRESSION: 'KHR_meshopt_compression',
	EXT_MESH_GPU_INSTANCING: 'EXT_mesh_gpu_instancing'
};

/**
 * Punctual Lights Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_lights_punctual
 *
 * @private
 */
class GLTFLightsExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_LIGHTS_PUNCTUAL;

		// Object3D instance caches
		this.cache = { refs: {}, uses: {} };

	}

	_markDefs() {

		const parser = this.parser;
		const nodeDefs = this.parser.json.nodes || [];

		for ( let nodeIndex = 0, nodeLength = nodeDefs.length; nodeIndex < nodeLength; nodeIndex ++ ) {

			const nodeDef = nodeDefs[ nodeIndex ];

			if ( nodeDef.extensions
					&& nodeDef.extensions[ this.name ]
					&& nodeDef.extensions[ this.name ].light !== undefined ) {

				parser._addNodeRef( this.cache, nodeDef.extensions[ this.name ].light );

			}

		}

	}

	_loadLight( lightIndex ) {

		const parser = this.parser;
		const cacheKey = 'light:' + lightIndex;
		let dependency = parser.cache.get( cacheKey );

		if ( dependency ) return dependency;

		const json = parser.json;
		const extensions = ( json.extensions && json.extensions[ this.name ] ) || {};
		const lightDefs = extensions.lights || [];
		const lightDef = lightDefs[ lightIndex ];
		let lightNode;

		const color = new Color$3( 0xffffff );

		if ( lightDef.color !== undefined ) color.setRGB( lightDef.color[ 0 ], lightDef.color[ 1 ], lightDef.color[ 2 ], LinearSRGBColorSpace$1 );

		const range = lightDef.range !== undefined ? lightDef.range : 0;

		switch ( lightDef.type ) {

			case 'directional':
				lightNode = new DirectionalLight$1( color );
				lightNode.target.position.set( 0, 0, -1 );
				lightNode.add( lightNode.target );
				break;

			case 'point':
				lightNode = new PointLight$1( color );
				lightNode.distance = range;
				break;

			case 'spot':
				lightNode = new SpotLight$1( color );
				lightNode.distance = range;
				// Handle spotlight properties.
				lightDef.spot = lightDef.spot || {};
				lightDef.spot.innerConeAngle = lightDef.spot.innerConeAngle !== undefined ? lightDef.spot.innerConeAngle : 0;
				lightDef.spot.outerConeAngle = lightDef.spot.outerConeAngle !== undefined ? lightDef.spot.outerConeAngle : Math.PI / 4.0;
				lightNode.angle = lightDef.spot.outerConeAngle;
				lightNode.penumbra = 1.0 - lightDef.spot.innerConeAngle / lightDef.spot.outerConeAngle;
				lightNode.target.position.set( 0, 0, -1 );
				lightNode.add( lightNode.target );
				break;

			default:
				throw new Error( 'THREE.GLTFLoader: Unexpected light type: ' + lightDef.type );

		}

		// Some lights (e.g. spot) default to a position other than the origin. Reset the position
		// here, because node-level parsing will only override position if explicitly specified.
		lightNode.position.set( 0, 0, 0 );

		assignExtrasToUserData( lightNode, lightDef );

		if ( lightDef.intensity !== undefined ) lightNode.intensity = lightDef.intensity;

		lightNode.name = parser.createUniqueName( lightDef.name || ( 'light_' + lightIndex ) );

		dependency = Promise.resolve( lightNode );

		parser.cache.add( cacheKey, dependency );

		return dependency;

	}

	getDependency( type, index ) {

		if ( type !== 'light' ) return;

		return this._loadLight( index );

	}

	createNodeAttachment( nodeIndex ) {

		const self = this;
		const parser = this.parser;
		const json = parser.json;
		const nodeDef = json.nodes[ nodeIndex ];
		const lightDef = ( nodeDef.extensions && nodeDef.extensions[ this.name ] ) || {};
		const lightIndex = lightDef.light;

		if ( lightIndex === undefined ) return null;

		return this._loadLight( lightIndex ).then( function ( light ) {

			return parser._getNodeRef( self.cache, lightIndex, light );

		} );

	}

}

/**
 * Unlit Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_unlit
 *
 * @private
 */
class GLTFMaterialsUnlitExtension {

	constructor() {

		this.name = EXTENSIONS.KHR_MATERIALS_UNLIT;

	}

	getMaterialType() {

		return MeshBasicMaterial$1;

	}

	extendParams( materialParams, materialDef, parser ) {

		const pending = [];

		materialParams.color = new Color$3( 1.0, 1.0, 1.0 );
		materialParams.opacity = 1.0;

		const metallicRoughness = materialDef.pbrMetallicRoughness;

		if ( metallicRoughness ) {

			if ( Array.isArray( metallicRoughness.baseColorFactor ) ) {

				const array = metallicRoughness.baseColorFactor;

				materialParams.color.setRGB( array[ 0 ], array[ 1 ], array[ 2 ], LinearSRGBColorSpace$1 );
				materialParams.opacity = array[ 3 ];

			}

			if ( metallicRoughness.baseColorTexture !== undefined ) {

				pending.push( parser.assignTexture( materialParams, 'map', metallicRoughness.baseColorTexture, SRGBColorSpace$4 ) );

			}

		}

		return Promise.all( pending );

	}

}

/**
 * Materials Emissive Strength Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/blob/5768b3ce0ef32bc39cdf1bef10b948586635ead3/extensions/2.0/Khronos/KHR_materials_emissive_strength/README.md
 *
 * @private
 */
class GLTFMaterialsEmissiveStrengthExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_EMISSIVE_STRENGTH;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		if ( extension === null ) return Promise.resolve();

		if ( extension.emissiveStrength !== undefined ) {

			materialParams.emissiveIntensity = extension.emissiveStrength;

		}

		return Promise.resolve();

	}

}

/**
 * Clearcoat Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_clearcoat
 *
 * @private
 */
class GLTFMaterialsClearcoatExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_CLEARCOAT;

	}

	getMaterialType( materialIndex ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		return extension !== null ? MeshPhysicalMaterial : null;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		if ( extension === null ) return Promise.resolve();

		const pending = [];

		if ( extension.clearcoatFactor !== undefined ) {

			materialParams.clearcoat = extension.clearcoatFactor;

		}

		if ( extension.clearcoatTexture !== undefined ) {

			pending.push( this.parser.assignTexture( materialParams, 'clearcoatMap', extension.clearcoatTexture ) );

		}

		if ( extension.clearcoatRoughnessFactor !== undefined ) {

			materialParams.clearcoatRoughness = extension.clearcoatRoughnessFactor;

		}

		if ( extension.clearcoatRoughnessTexture !== undefined ) {

			pending.push( this.parser.assignTexture( materialParams, 'clearcoatRoughnessMap', extension.clearcoatRoughnessTexture ) );

		}

		if ( extension.clearcoatNormalTexture !== undefined ) {

			pending.push( this.parser.assignTexture( materialParams, 'clearcoatNormalMap', extension.clearcoatNormalTexture ) );

			if ( extension.clearcoatNormalTexture.scale !== undefined ) {

				const scale = extension.clearcoatNormalTexture.scale;

				materialParams.clearcoatNormalScale = new Vector2$2( scale, scale );

			}

		}

		return Promise.all( pending );

	}

}

/**
 * Materials dispersion Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_dispersion
 *
 * @private
 */
class GLTFMaterialsDispersionExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_DISPERSION;

	}

	getMaterialType( materialIndex ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		return extension !== null ? MeshPhysicalMaterial : null;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		if ( extension === null ) return Promise.resolve();

		materialParams.dispersion = extension.dispersion !== undefined ? extension.dispersion : 0;

		return Promise.resolve();

	}

}

/**
 * Iridescence Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_iridescence
 *
 * @private
 */
class GLTFMaterialsIridescenceExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_IRIDESCENCE;

	}

	getMaterialType( materialIndex ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		return extension !== null ? MeshPhysicalMaterial : null;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		if ( extension === null ) return Promise.resolve();

		const pending = [];

		if ( extension.iridescenceFactor !== undefined ) {

			materialParams.iridescence = extension.iridescenceFactor;

		}

		if ( extension.iridescenceTexture !== undefined ) {

			pending.push( this.parser.assignTexture( materialParams, 'iridescenceMap', extension.iridescenceTexture ) );

		}

		if ( extension.iridescenceIor !== undefined ) {

			materialParams.iridescenceIOR = extension.iridescenceIor;

		}

		if ( materialParams.iridescenceThicknessRange === undefined ) {

			materialParams.iridescenceThicknessRange = [ 100, 400 ];

		}

		if ( extension.iridescenceThicknessMinimum !== undefined ) {

			materialParams.iridescenceThicknessRange[ 0 ] = extension.iridescenceThicknessMinimum;

		}

		if ( extension.iridescenceThicknessMaximum !== undefined ) {

			materialParams.iridescenceThicknessRange[ 1 ] = extension.iridescenceThicknessMaximum;

		}

		if ( extension.iridescenceThicknessTexture !== undefined ) {

			pending.push( this.parser.assignTexture( materialParams, 'iridescenceThicknessMap', extension.iridescenceThicknessTexture ) );

		}

		return Promise.all( pending );

	}

}

/**
 * Sheen Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_sheen
 *
 * @private
 */
class GLTFMaterialsSheenExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_SHEEN;

	}

	getMaterialType( materialIndex ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		return extension !== null ? MeshPhysicalMaterial : null;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		if ( extension === null ) return Promise.resolve();

		const pending = [];

		materialParams.sheenColor = new Color$3( 0, 0, 0 );
		materialParams.sheenRoughness = 0;
		materialParams.sheen = 1;

		if ( extension.sheenColorFactor !== undefined ) {

			const colorFactor = extension.sheenColorFactor;
			materialParams.sheenColor.setRGB( colorFactor[ 0 ], colorFactor[ 1 ], colorFactor[ 2 ], LinearSRGBColorSpace$1 );

		}

		if ( extension.sheenRoughnessFactor !== undefined ) {

			materialParams.sheenRoughness = extension.sheenRoughnessFactor;

		}

		if ( extension.sheenColorTexture !== undefined ) {

			pending.push( this.parser.assignTexture( materialParams, 'sheenColorMap', extension.sheenColorTexture, SRGBColorSpace$4 ) );

		}

		if ( extension.sheenRoughnessTexture !== undefined ) {

			pending.push( this.parser.assignTexture( materialParams, 'sheenRoughnessMap', extension.sheenRoughnessTexture ) );

		}

		return Promise.all( pending );

	}

}

/**
 * Transmission Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_transmission
 * Draft: https://github.com/KhronosGroup/glTF/pull/1698
 *
 * @private
 */
class GLTFMaterialsTransmissionExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_TRANSMISSION;

	}

	getMaterialType( materialIndex ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		return extension !== null ? MeshPhysicalMaterial : null;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		if ( extension === null ) return Promise.resolve();

		const pending = [];

		if ( extension.transmissionFactor !== undefined ) {

			materialParams.transmission = extension.transmissionFactor;

		}

		if ( extension.transmissionTexture !== undefined ) {

			pending.push( this.parser.assignTexture( materialParams, 'transmissionMap', extension.transmissionTexture ) );

		}

		return Promise.all( pending );

	}

}

/**
 * Materials Volume Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_volume
 *
 * @private
 */
class GLTFMaterialsVolumeExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_VOLUME;

	}

	getMaterialType( materialIndex ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		return extension !== null ? MeshPhysicalMaterial : null;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		if ( extension === null ) return Promise.resolve();

		const pending = [];

		materialParams.thickness = extension.thicknessFactor !== undefined ? extension.thicknessFactor : 0;

		if ( extension.thicknessTexture !== undefined ) {

			pending.push( this.parser.assignTexture( materialParams, 'thicknessMap', extension.thicknessTexture ) );

		}

		materialParams.attenuationDistance = extension.attenuationDistance || Infinity;

		const colorArray = extension.attenuationColor || [ 1, 1, 1 ];
		materialParams.attenuationColor = new Color$3().setRGB( colorArray[ 0 ], colorArray[ 1 ], colorArray[ 2 ], LinearSRGBColorSpace$1 );

		return Promise.all( pending );

	}

}

/**
 * Materials ior Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_ior
 *
 * @private
 */
class GLTFMaterialsIorExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_IOR;

	}

	getMaterialType( materialIndex ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		return extension !== null ? MeshPhysicalMaterial : null;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		if ( extension === null ) return Promise.resolve();

		materialParams.ior = extension.ior !== undefined ? extension.ior : 1.5;

		return Promise.resolve();

	}

}

/**
 * Materials specular Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_specular
 *
 * @private
 */
class GLTFMaterialsSpecularExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_SPECULAR;

	}

	getMaterialType( materialIndex ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		return extension !== null ? MeshPhysicalMaterial : null;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		if ( extension === null ) return Promise.resolve();

		const pending = [];

		materialParams.specularIntensity = extension.specularFactor !== undefined ? extension.specularFactor : 1.0;

		if ( extension.specularTexture !== undefined ) {

			pending.push( this.parser.assignTexture( materialParams, 'specularIntensityMap', extension.specularTexture ) );

		}

		const colorArray = extension.specularColorFactor || [ 1, 1, 1 ];
		materialParams.specularColor = new Color$3().setRGB( colorArray[ 0 ], colorArray[ 1 ], colorArray[ 2 ], LinearSRGBColorSpace$1 );

		if ( extension.specularColorTexture !== undefined ) {

			pending.push( this.parser.assignTexture( materialParams, 'specularColorMap', extension.specularColorTexture, SRGBColorSpace$4 ) );

		}

		return Promise.all( pending );

	}

}


/**
 * Materials bump Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/EXT_materials_bump
 *
 * @private
 */
class GLTFMaterialsBumpExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.EXT_MATERIALS_BUMP;

	}

	getMaterialType( materialIndex ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		return extension !== null ? MeshPhysicalMaterial : null;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		if ( extension === null ) return Promise.resolve();

		const pending = [];

		materialParams.bumpScale = extension.bumpFactor !== undefined ? extension.bumpFactor : 1.0;

		if ( extension.bumpTexture !== undefined ) {

			pending.push( this.parser.assignTexture( materialParams, 'bumpMap', extension.bumpTexture ) );

		}

		return Promise.all( pending );

	}

}

/**
 * Materials anisotropy Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_anisotropy
 *
 * @private
 */
class GLTFMaterialsAnisotropyExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_ANISOTROPY;

	}

	getMaterialType( materialIndex ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		return extension !== null ? MeshPhysicalMaterial : null;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const extension = getMaterialExtension( this.parser, materialIndex, this.name );

		if ( extension === null ) return Promise.resolve();

		const pending = [];

		if ( extension.anisotropyStrength !== undefined ) {

			materialParams.anisotropy = extension.anisotropyStrength;

		}

		if ( extension.anisotropyRotation !== undefined ) {

			materialParams.anisotropyRotation = extension.anisotropyRotation;

		}

		if ( extension.anisotropyTexture !== undefined ) {

			pending.push( this.parser.assignTexture( materialParams, 'anisotropyMap', extension.anisotropyTexture ) );

		}

		return Promise.all( pending );

	}

}

/**
 * BasisU Texture Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_texture_basisu
 *
 * @private
 */
class GLTFTextureBasisUExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_TEXTURE_BASISU;

	}

	loadTexture( textureIndex ) {

		const parser = this.parser;
		const json = parser.json;

		const textureDef = json.textures[ textureIndex ];

		if ( ! textureDef.extensions || ! textureDef.extensions[ this.name ] ) {

			return null;

		}

		const extension = textureDef.extensions[ this.name ];
		const loader = parser.options.ktx2Loader;

		if ( ! loader ) {

			if ( json.extensionsRequired && json.extensionsRequired.indexOf( this.name ) >= 0 ) {

				throw new Error( 'THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures' );

			} else {

				// Assumes that the extension is optional and that a fallback texture is present
				return null;

			}

		}

		return parser.loadTextureImage( textureIndex, extension.source, loader );

	}

}

/**
 * WebP Texture Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Vendor/EXT_texture_webp
 *
 * @private
 */
class GLTFTextureWebPExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.EXT_TEXTURE_WEBP;

	}

	loadTexture( textureIndex ) {

		const name = this.name;
		const parser = this.parser;
		const json = parser.json;

		const textureDef = json.textures[ textureIndex ];

		if ( ! textureDef.extensions || ! textureDef.extensions[ name ] ) {

			return null;

		}

		const extension = textureDef.extensions[ name ];
		const source = json.images[ extension.source ];

		let loader = parser.textureLoader;
		if ( source.uri ) {

			const handler = parser.options.manager.getHandler( source.uri );
			if ( handler !== null ) loader = handler;

		}

		return parser.loadTextureImage( textureIndex, extension.source, loader );

	}

}

/**
 * AVIF Texture Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Vendor/EXT_texture_avif
 *
 * @private
 */
class GLTFTextureAVIFExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.EXT_TEXTURE_AVIF;

	}

	loadTexture( textureIndex ) {

		const name = this.name;
		const parser = this.parser;
		const json = parser.json;

		const textureDef = json.textures[ textureIndex ];

		if ( ! textureDef.extensions || ! textureDef.extensions[ name ] ) {

			return null;

		}

		const extension = textureDef.extensions[ name ];
		const source = json.images[ extension.source ];

		let loader = parser.textureLoader;
		if ( source.uri ) {

			const handler = parser.options.manager.getHandler( source.uri );
			if ( handler !== null ) loader = handler;

		}

		return parser.loadTextureImage( textureIndex, extension.source, loader );

	}

}

/**
 * meshopt BufferView Compression Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Vendor/EXT_meshopt_compression
 *
 * @private
 */
class GLTFMeshoptCompression {

	constructor( parser, name ) {

		this.name = name;
		this.parser = parser;

	}

	loadBufferView( index ) {

		const json = this.parser.json;
		const bufferView = json.bufferViews[ index ];

		if ( bufferView.extensions && bufferView.extensions[ this.name ] ) {

			const extensionDef = bufferView.extensions[ this.name ];

			const buffer = this.parser.getDependency( 'buffer', extensionDef.buffer );
			const decoder = this.parser.options.meshoptDecoder;

			if ( ! decoder || ! decoder.supported ) {

				if ( json.extensionsRequired && json.extensionsRequired.indexOf( this.name ) >= 0 ) {

					throw new Error( 'THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files' );

				} else {

					// Assumes that the extension is optional and that fallback buffer data is present
					return null;

				}

			}

			return buffer.then( function ( res ) {

				const byteOffset = extensionDef.byteOffset || 0;
				const byteLength = extensionDef.byteLength || 0;

				const count = extensionDef.count;
				const stride = extensionDef.byteStride;

				const source = new Uint8Array( res, byteOffset, byteLength );

				if ( decoder.decodeGltfBufferAsync ) {

					return decoder.decodeGltfBufferAsync( count, stride, source, extensionDef.mode, extensionDef.filter ).then( function ( res ) {

						return res.buffer;

					} );

				} else {

					// Support for MeshoptDecoder 0.18 or earlier, without decodeGltfBufferAsync
					return decoder.ready.then( function () {

						const result = new ArrayBuffer( count * stride );
						decoder.decodeGltfBuffer( new Uint8Array( result ), count, stride, source, extensionDef.mode, extensionDef.filter );
						return result;

					} );

				}

			} );

		} else {

			return null;

		}

	}

}

/**
 * GPU Instancing Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Vendor/EXT_mesh_gpu_instancing
 *
 * @private
 */
class GLTFMeshGpuInstancing {

	constructor( parser ) {

		this.name = EXTENSIONS.EXT_MESH_GPU_INSTANCING;
		this.parser = parser;

	}

	createNodeMesh( nodeIndex ) {

		const json = this.parser.json;
		const nodeDef = json.nodes[ nodeIndex ];

		if ( ! nodeDef.extensions || ! nodeDef.extensions[ this.name ] ||
			nodeDef.mesh === undefined ) {

			return null;

		}

		const meshDef = json.meshes[ nodeDef.mesh ];

		// No Points or Lines + Instancing support yet

		for ( const primitive of meshDef.primitives ) {

			if ( primitive.mode !== WEBGL_CONSTANTS.TRIANGLES &&
				 primitive.mode !== WEBGL_CONSTANTS.TRIANGLE_STRIP &&
				 primitive.mode !== WEBGL_CONSTANTS.TRIANGLE_FAN &&
				 primitive.mode !== undefined ) {

				return null;

			}

		}

		const extensionDef = nodeDef.extensions[ this.name ];
		const attributesDef = extensionDef.attributes;

		// @TODO: Can we support InstancedMesh + SkinnedMesh?

		const pending = [];
		const attributes = {};

		for ( const key in attributesDef ) {

			pending.push( this.parser.getDependency( 'accessor', attributesDef[ key ] ).then( accessor => {

				attributes[ key ] = accessor;
				return attributes[ key ];

			} ) );

		}

		if ( pending.length < 1 ) {

			return null;

		}

		pending.push( this.parser.createNodeMesh( nodeIndex ) );

		return Promise.all( pending ).then( results => {

			const nodeObject = results.pop();
			const meshes = nodeObject.isGroup ? nodeObject.children : [ nodeObject ];
			const count = results[ 0 ].count; // All attribute counts should be same
			const instancedMeshes = [];

			for ( const mesh of meshes ) {

				// Temporal variables
				const m = new Matrix4$1();
				const p = new Vector3$3();
				const q = new Quaternion();
				const s = new Vector3$3( 1, 1, 1 );

				const instancedMesh = new InstancedMesh( mesh.geometry, mesh.material, count );

				for ( let i = 0; i < count; i ++ ) {

					if ( attributes.TRANSLATION ) {

						p.fromBufferAttribute( attributes.TRANSLATION, i );

					}

					if ( attributes.ROTATION ) {

						q.fromBufferAttribute( attributes.ROTATION, i );

					}

					if ( attributes.SCALE ) {

						s.fromBufferAttribute( attributes.SCALE, i );

					}

					instancedMesh.setMatrixAt( i, m.compose( p, q, s ) );

				}

				// Add instance attributes to the geometry, excluding TRS.
				for ( const attributeName in attributes ) {

					if ( attributeName === '_COLOR_0' ) {

						const attr = attributes[ attributeName ];
						instancedMesh.instanceColor = new InstancedBufferAttribute$1( attr.array, attr.itemSize, attr.normalized );

					} else if ( attributeName !== 'TRANSLATION' &&
						 attributeName !== 'ROTATION' &&
						 attributeName !== 'SCALE' ) {

						mesh.geometry.setAttribute( attributeName, attributes[ attributeName ] );

					}

				}

				// Just in case
				Object3D.prototype.copy.call( instancedMesh, mesh );

				this.parser.assignFinalMaterial( instancedMesh );

				instancedMeshes.push( instancedMesh );

			}

			if ( nodeObject.isGroup ) {

				nodeObject.clear();

				nodeObject.add( ... instancedMeshes );

				return nodeObject;

			}

			return instancedMeshes[ 0 ];

		} );

	}

}

/* BINARY EXTENSION */
const BINARY_EXTENSION_HEADER_MAGIC = 'glTF';
const BINARY_EXTENSION_HEADER_LENGTH = 12;
const BINARY_EXTENSION_CHUNK_TYPES = { JSON: 0x4E4F534A, BIN: 0x004E4942 };

class GLTFBinaryExtension {

	constructor( data ) {

		this.name = EXTENSIONS.KHR_BINARY_GLTF;
		this.content = null;
		this.body = null;

		const headerView = new DataView( data, 0, BINARY_EXTENSION_HEADER_LENGTH );
		const textDecoder = new TextDecoder();

		this.header = {
			magic: textDecoder.decode( new Uint8Array( data.slice( 0, 4 ) ) ),
			version: headerView.getUint32( 4, true ),
			length: headerView.getUint32( 8, true )
		};

		if ( this.header.magic !== BINARY_EXTENSION_HEADER_MAGIC ) {

			throw new Error( 'THREE.GLTFLoader: Unsupported glTF-Binary header.' );

		} else if ( this.header.version < 2.0 ) {

			throw new Error( 'THREE.GLTFLoader: Legacy binary file detected.' );

		}

		const chunkContentsLength = this.header.length - BINARY_EXTENSION_HEADER_LENGTH;
		const chunkView = new DataView( data, BINARY_EXTENSION_HEADER_LENGTH );
		let chunkIndex = 0;

		while ( chunkIndex < chunkContentsLength ) {

			const chunkLength = chunkView.getUint32( chunkIndex, true );
			chunkIndex += 4;

			const chunkType = chunkView.getUint32( chunkIndex, true );
			chunkIndex += 4;

			if ( chunkType === BINARY_EXTENSION_CHUNK_TYPES.JSON ) {

				const contentArray = new Uint8Array( data, BINARY_EXTENSION_HEADER_LENGTH + chunkIndex, chunkLength );
				this.content = textDecoder.decode( contentArray );

			} else if ( chunkType === BINARY_EXTENSION_CHUNK_TYPES.BIN ) {

				const byteOffset = BINARY_EXTENSION_HEADER_LENGTH + chunkIndex;
				this.body = data.slice( byteOffset, byteOffset + chunkLength );

			}

			// Clients must ignore chunks with unknown types.

			chunkIndex += chunkLength;

		}

		if ( this.content === null ) {

			throw new Error( 'THREE.GLTFLoader: JSON content not found.' );

		}

	}

}

/**
 * DRACO Mesh Compression Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_draco_mesh_compression
 *
 * @private
 */
class GLTFDracoMeshCompressionExtension {

	constructor( json, dracoLoader ) {

		if ( ! dracoLoader ) {

			throw new Error( 'THREE.GLTFLoader: No DRACOLoader instance provided.' );

		}

		this.name = EXTENSIONS.KHR_DRACO_MESH_COMPRESSION;
		this.json = json;
		this.dracoLoader = dracoLoader;
		this.dracoLoader.preload();

	}

	decodePrimitive( primitive, parser ) {

		const json = this.json;
		const dracoLoader = this.dracoLoader;
		const bufferViewIndex = primitive.extensions[ this.name ].bufferView;
		const gltfAttributeMap = primitive.extensions[ this.name ].attributes;
		const threeAttributeMap = {};
		const attributeNormalizedMap = {};
		const attributeTypeMap = {};

		for ( const attributeName in gltfAttributeMap ) {

			const threeAttributeName = ATTRIBUTES[ attributeName ] || attributeName.toLowerCase();

			threeAttributeMap[ threeAttributeName ] = gltfAttributeMap[ attributeName ];

		}

		for ( const attributeName in primitive.attributes ) {

			const threeAttributeName = ATTRIBUTES[ attributeName ] || attributeName.toLowerCase();

			if ( gltfAttributeMap[ attributeName ] !== undefined ) {

				const accessorDef = json.accessors[ primitive.attributes[ attributeName ] ];
				const componentType = WEBGL_COMPONENT_TYPES[ accessorDef.componentType ];

				attributeTypeMap[ threeAttributeName ] = componentType.name;
				attributeNormalizedMap[ threeAttributeName ] = accessorDef.normalized === true;

			}

		}

		return parser.getDependency( 'bufferView', bufferViewIndex ).then( function ( bufferView ) {

			return new Promise( function ( resolve, reject ) {

				dracoLoader.decodeDracoFile( bufferView, function ( geometry ) {

					for ( const attributeName in geometry.attributes ) {

						const attribute = geometry.attributes[ attributeName ];
						const normalized = attributeNormalizedMap[ attributeName ];

						if ( normalized !== undefined ) attribute.normalized = normalized;

					}

					resolve( geometry );

				}, threeAttributeMap, attributeTypeMap, LinearSRGBColorSpace$1, reject );

			} );

		} );

	}

}

/**
 * Texture Transform Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_texture_transform
 *
 * @private
 */
class GLTFTextureTransformExtension {

	constructor() {

		this.name = EXTENSIONS.KHR_TEXTURE_TRANSFORM;

	}

	extendTexture( texture, transform ) {

		if ( ( transform.texCoord === undefined || transform.texCoord === texture.channel )
			&& transform.offset === undefined
			&& transform.rotation === undefined
			&& transform.scale === undefined ) {

			// See https://github.com/mrdoob/three.js/issues/21819.
			return texture;

		}

		texture = texture.clone();

		if ( transform.texCoord !== undefined ) {

			texture.channel = transform.texCoord;

		}

		if ( transform.offset !== undefined ) {

			texture.offset.fromArray( transform.offset );

		}

		if ( transform.rotation !== undefined ) {

			texture.rotation = transform.rotation;

		}

		if ( transform.scale !== undefined ) {

			texture.repeat.fromArray( transform.scale );

		}

		texture.needsUpdate = true;

		return texture;

	}

}

/**
 * Mesh Quantization Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_mesh_quantization
 *
 * @private
 */
class GLTFMeshQuantizationExtension {

	constructor() {

		this.name = EXTENSIONS.KHR_MESH_QUANTIZATION;

	}

}

/*********************************/
/********** INTERPOLATION ********/
/*********************************/

// Spline Interpolation
// Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#appendix-c-spline-interpolation
class GLTFCubicSplineInterpolant extends Interpolant {

	constructor( parameterPositions, sampleValues, sampleSize, resultBuffer ) {

		super( parameterPositions, sampleValues, sampleSize, resultBuffer );

	}

	copySampleValue_( index ) {

		// Copies a sample value to the result buffer. See description of glTF
		// CUBICSPLINE values layout in interpolate_() function below.

		const result = this.resultBuffer,
			values = this.sampleValues,
			valueSize = this.valueSize,
			offset = index * valueSize * 3 + valueSize;

		for ( let i = 0; i !== valueSize; i ++ ) {

			result[ i ] = values[ offset + i ];

		}

		return result;

	}

	interpolate_( i1, t0, t, t1 ) {

		const result = this.resultBuffer;
		const values = this.sampleValues;
		const stride = this.valueSize;

		const stride2 = stride * 2;
		const stride3 = stride * 3;

		const td = t1 - t0;

		const p = ( t - t0 ) / td;
		const pp = p * p;
		const ppp = pp * p;

		const offset1 = i1 * stride3;
		const offset0 = offset1 - stride3;

		const s2 = -2 * ppp + 3 * pp;
		const s3 = ppp - pp;
		const s0 = 1 - s2;
		const s1 = s3 - pp + p;

		// Layout of keyframe output values for CUBICSPLINE animations:
		//   [ inTangent_1, splineVertex_1, outTangent_1, inTangent_2, splineVertex_2, ... ]
		for ( let i = 0; i !== stride; i ++ ) {

			const p0 = values[ offset0 + i + stride ]; // splineVertex_k
			const m0 = values[ offset0 + i + stride2 ] * td; // outTangent_k * (t_k+1 - t_k)
			const p1 = values[ offset1 + i + stride ]; // splineVertex_k+1
			const m1 = values[ offset1 + i ] * td; // inTangent_k+1 * (t_k+1 - t_k)

			result[ i ] = s0 * p0 + s1 * m0 + s2 * p1 + s3 * m1;

		}

		return result;

	}

}

const _quaternion = new Quaternion();

class GLTFCubicSplineQuaternionInterpolant extends GLTFCubicSplineInterpolant {

	interpolate_( i1, t0, t, t1 ) {

		const result = super.interpolate_( i1, t0, t, t1 );

		_quaternion.fromArray( result ).normalize().toArray( result );

		return result;

	}

}


/*********************************/
/********** INTERNALS ************/
/*********************************/

/* CONSTANTS */

const WEBGL_CONSTANTS = {
	POINTS: 0,
	LINES: 1,
	LINE_LOOP: 2,
	LINE_STRIP: 3,
	TRIANGLES: 4,
	TRIANGLE_STRIP: 5,
	TRIANGLE_FAN: 6};

const WEBGL_COMPONENT_TYPES = {
	5120: Int8Array,
	5121: Uint8Array,
	5122: Int16Array,
	5123: Uint16Array,
	5125: Uint32Array,
	5126: Float32Array
};

const WEBGL_FILTERS = {
	9728: NearestFilter$1,
	9729: LinearFilter$2,
	9984: NearestMipmapNearestFilter$1,
	9985: LinearMipmapNearestFilter,
	9986: NearestMipmapLinearFilter,
	9987: LinearMipmapLinearFilter$1
};

const WEBGL_WRAPPINGS = {
	33071: ClampToEdgeWrapping$1,
	33648: MirroredRepeatWrapping$1,
	10497: RepeatWrapping$1
};

const WEBGL_TYPE_SIZES = {
	'SCALAR': 1,
	'VEC2': 2,
	'VEC3': 3,
	'VEC4': 4,
	'MAT2': 4,
	'MAT3': 9,
	'MAT4': 16
};

const ATTRIBUTES = {
	POSITION: 'position',
	NORMAL: 'normal',
	TANGENT: 'tangent',
	TEXCOORD_0: 'uv',
	TEXCOORD_1: 'uv1',
	TEXCOORD_2: 'uv2',
	TEXCOORD_3: 'uv3',
	COLOR_0: 'color',
	WEIGHTS_0: 'skinWeight',
	JOINTS_0: 'skinIndex',
};

const PATH_PROPERTIES = {
	scale: 'scale',
	translation: 'position',
	rotation: 'quaternion',
	weights: 'morphTargetInfluences'
};

const INTERPOLATION = {
	CUBICSPLINE: undefined, // We use a custom interpolant (GLTFCubicSplineInterpolation) for CUBICSPLINE tracks. Each
		                        // keyframe track will be initialized with a default interpolation type, then modified.
	LINEAR: InterpolateLinear,
	STEP: InterpolateDiscrete
};

const ALPHA_MODES = {
	OPAQUE: 'OPAQUE',
	MASK: 'MASK',
	BLEND: 'BLEND'
};

/**
 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#default-material
 *
 * @private
 * @param {Object<string, Material>} cache
 * @return {Material}
 */
function createDefaultMaterial( cache ) {

	if ( cache[ 'DefaultMaterial' ] === undefined ) {

		cache[ 'DefaultMaterial' ] = new MeshStandardMaterial$1( {
			color: 0xFFFFFF,
			emissive: 0x000000,
			metalness: 1,
			roughness: 1,
			transparent: false,
			depthTest: true,
			side: FrontSide$1
		} );

	}

	return cache[ 'DefaultMaterial' ];

}

function addUnknownExtensionsToUserData( knownExtensions, object, objectDef ) {

	// Add unknown glTF extensions to an object's userData.

	for ( const name in objectDef.extensions ) {

		if ( knownExtensions[ name ] === undefined ) {

			object.userData.gltfExtensions = object.userData.gltfExtensions || {};
			object.userData.gltfExtensions[ name ] = objectDef.extensions[ name ];

		}

	}

}

/**
 *
 * @private
 * @param {Object3D|Material|BufferGeometry|Object|AnimationClip} object
 * @param {GLTF.definition} gltfDef
 */
function assignExtrasToUserData( object, gltfDef ) {

	if ( gltfDef.extras !== undefined ) {

		if ( typeof gltfDef.extras === 'object' ) {

			Object.assign( object.userData, gltfDef.extras );

		} else {

			console.warn( 'THREE.GLTFLoader: Ignoring primitive type .extras, ' + gltfDef.extras );

		}

	}

}

/**
 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#morph-targets
 *
 * @private
 * @param {BufferGeometry} geometry
 * @param {Array<GLTF.Target>} targets
 * @param {GLTFParser} parser
 * @return {Promise<BufferGeometry>}
 */
function addMorphTargets( geometry, targets, parser ) {

	let hasMorphPosition = false;
	let hasMorphNormal = false;
	let hasMorphColor = false;

	for ( let i = 0, il = targets.length; i < il; i ++ ) {

		const target = targets[ i ];

		if ( target.POSITION !== undefined ) hasMorphPosition = true;
		if ( target.NORMAL !== undefined ) hasMorphNormal = true;
		if ( target.COLOR_0 !== undefined ) hasMorphColor = true;

		if ( hasMorphPosition && hasMorphNormal && hasMorphColor ) break;

	}

	if ( ! hasMorphPosition && ! hasMorphNormal && ! hasMorphColor ) return Promise.resolve( geometry );

	const pendingPositionAccessors = [];
	const pendingNormalAccessors = [];
	const pendingColorAccessors = [];

	for ( let i = 0, il = targets.length; i < il; i ++ ) {

		const target = targets[ i ];

		if ( hasMorphPosition ) {

			const pendingAccessor = target.POSITION !== undefined
				? parser.getDependency( 'accessor', target.POSITION )
				: geometry.attributes.position;

			pendingPositionAccessors.push( pendingAccessor );

		}

		if ( hasMorphNormal ) {

			const pendingAccessor = target.NORMAL !== undefined
				? parser.getDependency( 'accessor', target.NORMAL )
				: geometry.attributes.normal;

			pendingNormalAccessors.push( pendingAccessor );

		}

		if ( hasMorphColor ) {

			const pendingAccessor = target.COLOR_0 !== undefined
				? parser.getDependency( 'accessor', target.COLOR_0 )
				: geometry.attributes.color;

			pendingColorAccessors.push( pendingAccessor );

		}

	}

	return Promise.all( [
		Promise.all( pendingPositionAccessors ),
		Promise.all( pendingNormalAccessors ),
		Promise.all( pendingColorAccessors )
	] ).then( function ( accessors ) {

		const morphPositions = accessors[ 0 ];
		const morphNormals = accessors[ 1 ];
		const morphColors = accessors[ 2 ];

		if ( hasMorphPosition ) geometry.morphAttributes.position = morphPositions;
		if ( hasMorphNormal ) geometry.morphAttributes.normal = morphNormals;
		if ( hasMorphColor ) geometry.morphAttributes.color = morphColors;
		geometry.morphTargetsRelative = true;

		return geometry;

	} );

}

/**
 *
 * @private
 * @param {Mesh} mesh
 * @param {GLTF.Mesh} meshDef
 */
function updateMorphTargets( mesh, meshDef ) {

	mesh.updateMorphTargets();

	if ( meshDef.weights !== undefined ) {

		for ( let i = 0, il = meshDef.weights.length; i < il; i ++ ) {

			mesh.morphTargetInfluences[ i ] = meshDef.weights[ i ];

		}

	}

	// .extras has user-defined data, so check that .extras.targetNames is an array.
	if ( meshDef.extras && Array.isArray( meshDef.extras.targetNames ) ) {

		const targetNames = meshDef.extras.targetNames;

		if ( mesh.morphTargetInfluences.length === targetNames.length ) {

			mesh.morphTargetDictionary = {};

			for ( let i = 0, il = targetNames.length; i < il; i ++ ) {

				mesh.morphTargetDictionary[ targetNames[ i ] ] = i;

			}

		} else {

			console.warn( 'THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.' );

		}

	}

}

function createPrimitiveKey( primitiveDef ) {

	let geometryKey;

	const dracoExtension = primitiveDef.extensions && primitiveDef.extensions[ EXTENSIONS.KHR_DRACO_MESH_COMPRESSION ];

	if ( dracoExtension ) {

		geometryKey = 'draco:' + dracoExtension.bufferView
				+ ':' + dracoExtension.indices
				+ ':' + createAttributesKey( dracoExtension.attributes );

	} else {

		geometryKey = primitiveDef.indices + ':' + createAttributesKey( primitiveDef.attributes ) + ':' + primitiveDef.mode;

	}

	if ( primitiveDef.targets !== undefined ) {

		for ( let i = 0, il = primitiveDef.targets.length; i < il; i ++ ) {

			geometryKey += ':' + createAttributesKey( primitiveDef.targets[ i ] );

		}

	}

	return geometryKey;

}

function createAttributesKey( attributes ) {

	let attributesKey = '';

	const keys = Object.keys( attributes ).sort();

	for ( let i = 0, il = keys.length; i < il; i ++ ) {

		attributesKey += keys[ i ] + ':' + attributes[ keys[ i ] ] + ';';

	}

	return attributesKey;

}

function getNormalizedComponentScale( constructor ) {

	// Reference:
	// https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_mesh_quantization#encoding-quantized-data

	switch ( constructor ) {

		case Int8Array:
			return 1 / 127;

		case Uint8Array:
			return 1 / 255;

		case Int16Array:
			return 1 / 32767;

		case Uint16Array:
			return 1 / 65535;

		default:
			throw new Error( 'THREE.GLTFLoader: Unsupported normalized accessor component type.' );

	}

}

function getImageURIMimeType( uri ) {

	if ( uri.search( /\.jpe?g($|\?)/i ) > 0 || uri.search( /^data\:image\/jpeg/ ) === 0 ) return 'image/jpeg';
	if ( uri.search( /\.webp($|\?)/i ) > 0 || uri.search( /^data\:image\/webp/ ) === 0 ) return 'image/webp';
	if ( uri.search( /\.ktx2($|\?)/i ) > 0 || uri.search( /^data\:image\/ktx2/ ) === 0 ) return 'image/ktx2';

	return 'image/png';

}

const _identityMatrix = new Matrix4$1();

/* GLTF PARSER */

class GLTFParser {

	constructor( json = {}, options = {} ) {

		this.json = json;
		this.extensions = {};
		this.plugins = {};
		this.options = options;

		// loader object cache
		this.cache = new GLTFRegistry();

		// associations between Three.js objects and glTF elements
		this.associations = new Map();

		// BufferGeometry caching
		this.primitiveCache = {};

		// Node cache
		this.nodeCache = {};

		// Object3D instance caches
		this.meshCache = { refs: {}, uses: {} };
		this.cameraCache = { refs: {}, uses: {} };
		this.lightCache = { refs: {}, uses: {} };

		this.sourceCache = {};
		this.textureCache = {};

		// Track node names, to ensure no duplicates
		this.nodeNamesUsed = {};

		// Use an ImageBitmapLoader if imageBitmaps are supported. Moves much of the
		// expensive work of uploading a texture to the GPU off the main thread.

		let isSafari = false;
		let safariVersion = -1;
		let isFirefox = false;
		let firefoxVersion = -1;

		if ( typeof navigator !== 'undefined' && typeof navigator.userAgent !== 'undefined' ) {

			const userAgent = navigator.userAgent;

			isSafari = /^((?!chrome|android).)*safari/i.test( userAgent ) === true;
			const safariMatch = userAgent.match( /Version\/(\d+)/ );
			safariVersion = isSafari && safariMatch ? parseInt( safariMatch[ 1 ], 10 ) : -1;

			isFirefox = userAgent.indexOf( 'Firefox' ) > -1;
			firefoxVersion = isFirefox ? userAgent.match( /Firefox\/([0-9]+)\./ )[ 1 ] : -1;

		}

		if ( typeof createImageBitmap === 'undefined' || ( isSafari && safariVersion < 17 ) || ( isFirefox && firefoxVersion < 98 ) ) {

			this.textureLoader = new TextureLoader$1( this.options.manager );

		} else {

			this.textureLoader = new ImageBitmapLoader( this.options.manager );

		}

		this.textureLoader.setCrossOrigin( this.options.crossOrigin );
		this.textureLoader.setRequestHeader( this.options.requestHeader );

		this.fileLoader = new FileLoader$2( this.options.manager );
		this.fileLoader.setResponseType( 'arraybuffer' );

		if ( this.options.crossOrigin === 'use-credentials' ) {

			this.fileLoader.setWithCredentials( true );

		}

	}

	setExtensions( extensions ) {

		this.extensions = extensions;

	}

	setPlugins( plugins ) {

		this.plugins = plugins;

	}

	parse( onLoad, onError ) {

		const parser = this;
		const json = this.json;
		const extensions = this.extensions;

		// Clear the loader cache
		this.cache.removeAll();
		this.nodeCache = {};

		// Mark the special nodes/meshes in json for efficient parse
		this._invokeAll( function ( ext ) {

			return ext._markDefs && ext._markDefs();

		} );

		Promise.all( this._invokeAll( function ( ext ) {

			return ext.beforeRoot && ext.beforeRoot();

		} ) ).then( function () {

			return Promise.all( [

				parser.getDependencies( 'scene' ),
				parser.getDependencies( 'animation' ),
				parser.getDependencies( 'camera' ),

			] );

		} ).then( function ( dependencies ) {

			const result = {
				scene: dependencies[ 0 ][ json.scene || 0 ],
				scenes: dependencies[ 0 ],
				animations: dependencies[ 1 ],
				cameras: dependencies[ 2 ],
				asset: json.asset,
				parser: parser,
				userData: {}
			};

			addUnknownExtensionsToUserData( extensions, result, json );

			assignExtrasToUserData( result, json );

			return Promise.all( parser._invokeAll( function ( ext ) {

				return ext.afterRoot && ext.afterRoot( result );

			} ) ).then( function () {

				for ( const scene of result.scenes ) {

					scene.updateMatrixWorld();

				}

				onLoad( result );

			} );

		} ).catch( onError );

	}

	/**
	 * Marks the special nodes/meshes in json for efficient parse.
	 *
	 * @private
	 */
	_markDefs() {

		const nodeDefs = this.json.nodes || [];
		const skinDefs = this.json.skins || [];
		const meshDefs = this.json.meshes || [];

		// Nothing in the node definition indicates whether it is a Bone or an
		// Object3D. Use the skins' joint references to mark bones.
		for ( let skinIndex = 0, skinLength = skinDefs.length; skinIndex < skinLength; skinIndex ++ ) {

			const joints = skinDefs[ skinIndex ].joints;

			for ( let i = 0, il = joints.length; i < il; i ++ ) {

				nodeDefs[ joints[ i ] ].isBone = true;

			}

		}

		// Iterate over all nodes, marking references to shared resources,
		// as well as skeleton joints.
		for ( let nodeIndex = 0, nodeLength = nodeDefs.length; nodeIndex < nodeLength; nodeIndex ++ ) {

			const nodeDef = nodeDefs[ nodeIndex ];

			if ( nodeDef.mesh !== undefined ) {

				this._addNodeRef( this.meshCache, nodeDef.mesh );

				// Nothing in the mesh definition indicates whether it is
				// a SkinnedMesh or Mesh. Use the node's mesh reference
				// to mark SkinnedMesh if node has skin.
				if ( nodeDef.skin !== undefined ) {

					meshDefs[ nodeDef.mesh ].isSkinnedMesh = true;

				}

			}

			if ( nodeDef.camera !== undefined ) {

				this._addNodeRef( this.cameraCache, nodeDef.camera );

			}

		}

	}

	/**
	 * Counts references to shared node / Object3D resources. These resources
	 * can be reused, or "instantiated", at multiple nodes in the scene
	 * hierarchy. Mesh, Camera, and Light instances are instantiated and must
	 * be marked. Non-scenegraph resources (like Materials, Geometries, and
	 * Textures) can be reused directly and are not marked here.
	 *
	 * Example: CesiumMilkTruck sample model reuses "Wheel" meshes.
	 *
	 * @private
	 * @param {Object} cache
	 * @param {Object3D} index
	 */
	_addNodeRef( cache, index ) {

		if ( index === undefined ) return;

		if ( cache.refs[ index ] === undefined ) {

			cache.refs[ index ] = cache.uses[ index ] = 0;

		}

		cache.refs[ index ] ++;

	}

	/**
	 * Returns a reference to a shared resource, cloning it if necessary.
	 *
	 * @private
	 * @param {Object} cache
	 * @param {number} index
	 * @param {Object} object
	 * @return {Object}
	 */
	_getNodeRef( cache, index, object ) {

		if ( cache.refs[ index ] <= 1 ) return object;

		const ref = object.clone();

		// Propagates mappings to the cloned object, prevents mappings on the
		// original object from being lost.
		const updateMappings = ( original, clone ) => {

			const mappings = this.associations.get( original );
			if ( mappings != null ) {

				this.associations.set( clone, mappings );

			}

			for ( const [ i, child ] of original.children.entries() ) {

				updateMappings( child, clone.children[ i ] );

			}

		};

		updateMappings( object, ref );

		ref.name += '_instance_' + ( cache.uses[ index ] ++ );

		return ref;

	}

	_invokeOne( func ) {

		const extensions = Object.values( this.plugins );
		extensions.push( this );

		for ( let i = 0; i < extensions.length; i ++ ) {

			const result = func( extensions[ i ] );

			if ( result ) return result;

		}

		return null;

	}

	_invokeAll( func ) {

		const extensions = Object.values( this.plugins );
		extensions.unshift( this );

		const pending = [];

		for ( let i = 0; i < extensions.length; i ++ ) {

			const result = func( extensions[ i ] );

			if ( result ) pending.push( result );

		}

		return pending;

	}

	/**
	 * Requests the specified dependency asynchronously, with caching.
	 *
	 * @private
	 * @param {string} type
	 * @param {number} index
	 * @return {Promise<Object3D|Material|Texture|AnimationClip|ArrayBuffer|Object>}
	 */
	getDependency( type, index ) {

		const cacheKey = type + ':' + index;
		let dependency = this.cache.get( cacheKey );

		if ( ! dependency ) {

			switch ( type ) {

				case 'scene':
					dependency = this.loadScene( index );
					break;

				case 'node':
					dependency = this._invokeOne( function ( ext ) {

						return ext.loadNode && ext.loadNode( index );

					} );
					break;

				case 'mesh':
					dependency = this._invokeOne( function ( ext ) {

						return ext.loadMesh && ext.loadMesh( index );

					} );
					break;

				case 'accessor':
					dependency = this.loadAccessor( index );
					break;

				case 'bufferView':
					dependency = this._invokeOne( function ( ext ) {

						return ext.loadBufferView && ext.loadBufferView( index );

					} );
					break;

				case 'buffer':
					dependency = this.loadBuffer( index );
					break;

				case 'material':
					dependency = this._invokeOne( function ( ext ) {

						return ext.loadMaterial && ext.loadMaterial( index );

					} );
					break;

				case 'texture':
					dependency = this._invokeOne( function ( ext ) {

						return ext.loadTexture && ext.loadTexture( index );

					} );
					break;

				case 'skin':
					dependency = this.loadSkin( index );
					break;

				case 'animation':
					dependency = this._invokeOne( function ( ext ) {

						return ext.loadAnimation && ext.loadAnimation( index );

					} );
					break;

				case 'camera':
					dependency = this.loadCamera( index );
					break;

				default:
					dependency = this._invokeOne( function ( ext ) {

						return ext != this && ext.getDependency && ext.getDependency( type, index );

					} );

					if ( ! dependency ) {

						throw new Error( 'Unknown type: ' + type );

					}

					break;

			}

			this.cache.add( cacheKey, dependency );

		}

		return dependency;

	}

	/**
	 * Requests all dependencies of the specified type asynchronously, with caching.
	 *
	 * @private
	 * @param {string} type
	 * @return {Promise<Array<Object>>}
	 */
	getDependencies( type ) {

		let dependencies = this.cache.get( type );

		if ( ! dependencies ) {

			const parser = this;
			const defs = this.json[ type + ( type === 'mesh' ? 'es' : 's' ) ] || [];

			dependencies = Promise.all( defs.map( function ( def, index ) {

				return parser.getDependency( type, index );

			} ) );

			this.cache.add( type, dependencies );

		}

		return dependencies;

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#buffers-and-buffer-views
	 *
	 * @private
	 * @param {number} bufferIndex
	 * @return {Promise<ArrayBuffer>}
	 */
	loadBuffer( bufferIndex ) {

		const bufferDef = this.json.buffers[ bufferIndex ];
		const loader = this.fileLoader;

		if ( bufferDef.type && bufferDef.type !== 'arraybuffer' ) {

			throw new Error( 'THREE.GLTFLoader: ' + bufferDef.type + ' buffer type is not supported.' );

		}

		// If present, GLB container is required to be the first buffer.
		if ( bufferDef.uri === undefined && bufferIndex === 0 ) {

			return Promise.resolve( this.extensions[ EXTENSIONS.KHR_BINARY_GLTF ].body );

		}

		const options = this.options;

		return new Promise( function ( resolve, reject ) {

			loader.load( LoaderUtils.resolveURL( bufferDef.uri, options.path ), resolve, undefined, function () {

				reject( new Error( 'THREE.GLTFLoader: Failed to load buffer "' + bufferDef.uri + '".' ) );

			} );

		} );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#buffers-and-buffer-views
	 *
	 * @private
	 * @param {number} bufferViewIndex
	 * @return {Promise<ArrayBuffer>}
	 */
	loadBufferView( bufferViewIndex ) {

		const bufferViewDef = this.json.bufferViews[ bufferViewIndex ];

		return this.getDependency( 'buffer', bufferViewDef.buffer ).then( function ( buffer ) {

			const byteLength = bufferViewDef.byteLength || 0;
			const byteOffset = bufferViewDef.byteOffset || 0;
			return buffer.slice( byteOffset, byteOffset + byteLength );

		} );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#accessors
	 *
	 * @private
	 * @param {number} accessorIndex
	 * @return {Promise<BufferAttribute|InterleavedBufferAttribute>}
	 */
	loadAccessor( accessorIndex ) {

		const parser = this;
		const json = this.json;

		const accessorDef = this.json.accessors[ accessorIndex ];

		if ( accessorDef.bufferView === undefined && accessorDef.sparse === undefined ) {

			const itemSize = WEBGL_TYPE_SIZES[ accessorDef.type ];
			const TypedArray = WEBGL_COMPONENT_TYPES[ accessorDef.componentType ];
			const normalized = accessorDef.normalized === true;

			const array = new TypedArray( accessorDef.count * itemSize );
			return Promise.resolve( new BufferAttribute( array, itemSize, normalized ) );

		}

		const pendingBufferViews = [];

		if ( accessorDef.bufferView !== undefined ) {

			pendingBufferViews.push( this.getDependency( 'bufferView', accessorDef.bufferView ) );

		} else {

			pendingBufferViews.push( null );

		}

		if ( accessorDef.sparse !== undefined ) {

			pendingBufferViews.push( this.getDependency( 'bufferView', accessorDef.sparse.indices.bufferView ) );
			pendingBufferViews.push( this.getDependency( 'bufferView', accessorDef.sparse.values.bufferView ) );

		}

		return Promise.all( pendingBufferViews ).then( function ( bufferViews ) {

			const bufferView = bufferViews[ 0 ];

			const itemSize = WEBGL_TYPE_SIZES[ accessorDef.type ];
			const TypedArray = WEBGL_COMPONENT_TYPES[ accessorDef.componentType ];

			// For VEC3: itemSize is 3, elementBytes is 4, itemBytes is 12.
			const elementBytes = TypedArray.BYTES_PER_ELEMENT;
			const itemBytes = elementBytes * itemSize;
			const byteOffset = accessorDef.byteOffset || 0;
			const byteStride = accessorDef.bufferView !== undefined ? json.bufferViews[ accessorDef.bufferView ].byteStride : undefined;
			const normalized = accessorDef.normalized === true;
			let array, bufferAttribute;

			// The buffer is not interleaved if the stride is the item size in bytes.
			if ( byteStride && byteStride !== itemBytes ) {

				// Each "slice" of the buffer, as defined by 'count' elements of 'byteStride' bytes, gets its own InterleavedBuffer
				// This makes sure that IBA.count reflects accessor.count properly
				const ibSlice = Math.floor( byteOffset / byteStride );
				const ibCacheKey = 'InterleavedBuffer:' + accessorDef.bufferView + ':' + accessorDef.componentType + ':' + ibSlice + ':' + accessorDef.count;
				let ib = parser.cache.get( ibCacheKey );

				if ( ! ib ) {

					array = new TypedArray( bufferView, ibSlice * byteStride, accessorDef.count * byteStride / elementBytes );

					// Integer parameters to IB/IBA are in array elements, not bytes.
					ib = new InterleavedBuffer( array, byteStride / elementBytes );

					parser.cache.add( ibCacheKey, ib );

				}

				bufferAttribute = new InterleavedBufferAttribute( ib, itemSize, ( byteOffset % byteStride ) / elementBytes, normalized );

			} else {

				if ( bufferView === null ) {

					array = new TypedArray( accessorDef.count * itemSize );

				} else {

					array = new TypedArray( bufferView, byteOffset, accessorDef.count * itemSize );

				}

				bufferAttribute = new BufferAttribute( array, itemSize, normalized );

			}

			// https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#sparse-accessors
			if ( accessorDef.sparse !== undefined ) {

				const itemSizeIndices = WEBGL_TYPE_SIZES.SCALAR;
				const TypedArrayIndices = WEBGL_COMPONENT_TYPES[ accessorDef.sparse.indices.componentType ];

				const byteOffsetIndices = accessorDef.sparse.indices.byteOffset || 0;
				const byteOffsetValues = accessorDef.sparse.values.byteOffset || 0;

				const sparseIndices = new TypedArrayIndices( bufferViews[ 1 ], byteOffsetIndices, accessorDef.sparse.count * itemSizeIndices );
				const sparseValues = new TypedArray( bufferViews[ 2 ], byteOffsetValues, accessorDef.sparse.count * itemSize );

				if ( bufferView !== null ) {

					// Avoid modifying the original ArrayBuffer, if the bufferView wasn't initialized with zeroes.
					bufferAttribute = new BufferAttribute( bufferAttribute.array.slice(), bufferAttribute.itemSize, bufferAttribute.normalized );

				}

				// Ignore normalized since we copy from sparse
				bufferAttribute.normalized = false;

				for ( let i = 0, il = sparseIndices.length; i < il; i ++ ) {

					const index = sparseIndices[ i ];

					bufferAttribute.setX( index, sparseValues[ i * itemSize ] );
					if ( itemSize >= 2 ) bufferAttribute.setY( index, sparseValues[ i * itemSize + 1 ] );
					if ( itemSize >= 3 ) bufferAttribute.setZ( index, sparseValues[ i * itemSize + 2 ] );
					if ( itemSize >= 4 ) bufferAttribute.setW( index, sparseValues[ i * itemSize + 3 ] );
					if ( itemSize >= 5 ) throw new Error( 'THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.' );

				}

				bufferAttribute.normalized = normalized;

			}

			return bufferAttribute;

		} );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#textures
	 *
	 * @private
	 * @param {number} textureIndex
	 * @return {Promise<?Texture>}
	 */
	loadTexture( textureIndex ) {

		const json = this.json;
		const options = this.options;
		const textureDef = json.textures[ textureIndex ];
		const sourceIndex = textureDef.source;
		const sourceDef = json.images[ sourceIndex ];

		let loader = this.textureLoader;

		if ( sourceDef.uri ) {

			const handler = options.manager.getHandler( sourceDef.uri );
			if ( handler !== null ) loader = handler;

		}

		return this.loadTextureImage( textureIndex, sourceIndex, loader );

	}

	loadTextureImage( textureIndex, sourceIndex, loader ) {

		const parser = this;
		const json = this.json;

		const textureDef = json.textures[ textureIndex ];
		const sourceDef = json.images[ sourceIndex ];

		const cacheKey = ( sourceDef.uri || sourceDef.bufferView ) + ':' + textureDef.sampler;

		if ( this.textureCache[ cacheKey ] ) {

			// See https://github.com/mrdoob/three.js/issues/21559.
			return this.textureCache[ cacheKey ];

		}

		const promise = this.loadImageSource( sourceIndex, loader ).then( function ( texture ) {

			texture.flipY = false;

			texture.name = textureDef.name || sourceDef.name || '';

			if ( texture.name === '' && typeof sourceDef.uri === 'string' && sourceDef.uri.startsWith( 'data:image/' ) === false ) {

				texture.name = sourceDef.uri;

			}

			const samplers = json.samplers || {};
			const sampler = samplers[ textureDef.sampler ] || {};

			texture.magFilter = WEBGL_FILTERS[ sampler.magFilter ] || LinearFilter$2;
			texture.minFilter = WEBGL_FILTERS[ sampler.minFilter ] || LinearMipmapLinearFilter$1;
			texture.wrapS = WEBGL_WRAPPINGS[ sampler.wrapS ] || RepeatWrapping$1;
			texture.wrapT = WEBGL_WRAPPINGS[ sampler.wrapT ] || RepeatWrapping$1;
			texture.generateMipmaps = ! texture.isCompressedTexture && texture.minFilter !== NearestFilter$1 && texture.minFilter !== LinearFilter$2;

			parser.associations.set( texture, { textures: textureIndex } );

			return texture;

		} ).catch( function () {

			return null;

		} );

		this.textureCache[ cacheKey ] = promise;

		return promise;

	}

	loadImageSource( sourceIndex, loader ) {

		const parser = this;
		const json = this.json;
		const options = this.options;

		if ( this.sourceCache[ sourceIndex ] !== undefined ) {

			return this.sourceCache[ sourceIndex ].then( ( texture ) => texture.clone() );

		}

		const sourceDef = json.images[ sourceIndex ];

		const URL = self.URL || self.webkitURL;

		let sourceURI = sourceDef.uri || '';
		let isObjectURL = false;

		if ( sourceDef.bufferView !== undefined ) {

			// Load binary image data from bufferView, if provided.

			sourceURI = parser.getDependency( 'bufferView', sourceDef.bufferView ).then( function ( bufferView ) {

				isObjectURL = true;
				const blob = new Blob( [ bufferView ], { type: sourceDef.mimeType } );
				sourceURI = URL.createObjectURL( blob );
				return sourceURI;

			} );

		} else if ( sourceDef.uri === undefined ) {

			throw new Error( 'THREE.GLTFLoader: Image ' + sourceIndex + ' is missing URI and bufferView' );

		}

		const promise = Promise.resolve( sourceURI ).then( function ( sourceURI ) {

			return new Promise( function ( resolve, reject ) {

				let onLoad = resolve;

				if ( loader.isImageBitmapLoader === true ) {

					onLoad = function ( imageBitmap ) {

						const texture = new Texture$2( imageBitmap );
						texture.needsUpdate = true;

						resolve( texture );

					};

				}

				loader.load( LoaderUtils.resolveURL( sourceURI, options.path ), onLoad, undefined, reject );

			} );

		} ).then( function ( texture ) {

			// Clean up resources and configure Texture.

			if ( isObjectURL === true ) {

				URL.revokeObjectURL( sourceURI );

			}

			assignExtrasToUserData( texture, sourceDef );

			texture.userData.mimeType = sourceDef.mimeType || getImageURIMimeType( sourceDef.uri );

			return texture;

		} ).catch( function ( error ) {

			console.error( 'THREE.GLTFLoader: Couldn\'t load texture', sourceURI );
			throw error;

		} );

		this.sourceCache[ sourceIndex ] = promise;
		return promise;

	}

	/**
	 * Asynchronously assigns a texture to the given material parameters.
	 *
	 * @private
	 * @param {Object} materialParams
	 * @param {string} mapName
	 * @param {Object} mapDef
	 * @param {string} [colorSpace]
	 * @return {Promise<Texture>}
	 */
	assignTexture( materialParams, mapName, mapDef, colorSpace ) {

		const parser = this;

		return this.getDependency( 'texture', mapDef.index ).then( function ( texture ) {

			if ( ! texture ) return null;

			if ( mapDef.texCoord !== undefined && mapDef.texCoord > 0 ) {

				texture = texture.clone();
				texture.channel = mapDef.texCoord;

			}

			if ( parser.extensions[ EXTENSIONS.KHR_TEXTURE_TRANSFORM ] ) {

				const transform = mapDef.extensions !== undefined ? mapDef.extensions[ EXTENSIONS.KHR_TEXTURE_TRANSFORM ] : undefined;

				if ( transform ) {

					const gltfReference = parser.associations.get( texture );
					texture = parser.extensions[ EXTENSIONS.KHR_TEXTURE_TRANSFORM ].extendTexture( texture, transform );
					parser.associations.set( texture, gltfReference );

				}

			}

			if ( colorSpace !== undefined ) {

				texture.colorSpace = colorSpace;

			}

			materialParams[ mapName ] = texture;

			return texture;

		} );

	}

	/**
	 * Assigns final material to a Mesh, Line, or Points instance. The instance
	 * already has a material (generated from the glTF material options alone)
	 * but reuse of the same glTF material may require multiple threejs materials
	 * to accommodate different primitive types, defines, etc. New materials will
	 * be created if necessary, and reused from a cache.
	 *
	 * @private
	 * @param {Object3D} mesh Mesh, Line, or Points instance.
	 */
	assignFinalMaterial( mesh ) {

		const geometry = mesh.geometry;
		let material = mesh.material;

		const useDerivativeTangents = geometry.attributes.tangent === undefined;
		const useVertexColors = geometry.attributes.color !== undefined;
		const useFlatShading = geometry.attributes.normal === undefined;

		if ( mesh.isPoints ) {

			const cacheKey = 'PointsMaterial:' + material.uuid;

			let pointsMaterial = this.cache.get( cacheKey );

			if ( ! pointsMaterial ) {

				pointsMaterial = new PointsMaterial$1();
				Material$1.prototype.copy.call( pointsMaterial, material );
				pointsMaterial.color.copy( material.color );
				pointsMaterial.map = material.map;
				pointsMaterial.sizeAttenuation = false; // glTF spec says points should be 1px

				this.cache.add( cacheKey, pointsMaterial );

			}

			material = pointsMaterial;

		} else if ( mesh.isLine ) {

			const cacheKey = 'LineBasicMaterial:' + material.uuid;

			let lineMaterial = this.cache.get( cacheKey );

			if ( ! lineMaterial ) {

				lineMaterial = new LineBasicMaterial$1();
				Material$1.prototype.copy.call( lineMaterial, material );
				lineMaterial.color.copy( material.color );
				lineMaterial.map = material.map;

				this.cache.add( cacheKey, lineMaterial );

			}

			material = lineMaterial;

		}

		// Clone the material if it will be modified
		if ( useDerivativeTangents || useVertexColors || useFlatShading ) {

			let cacheKey = 'ClonedMaterial:' + material.uuid + ':';

			if ( useDerivativeTangents ) cacheKey += 'derivative-tangents:';
			if ( useVertexColors ) cacheKey += 'vertex-colors:';
			if ( useFlatShading ) cacheKey += 'flat-shading:';

			let cachedMaterial = this.cache.get( cacheKey );

			if ( ! cachedMaterial ) {

				cachedMaterial = material.clone();

				if ( useVertexColors ) cachedMaterial.vertexColors = true;
				if ( useFlatShading ) cachedMaterial.flatShading = true;

				if ( useDerivativeTangents ) {

					// https://github.com/mrdoob/three.js/issues/11438#issuecomment-507003995
					if ( cachedMaterial.normalScale ) cachedMaterial.normalScale.y *= -1;
					if ( cachedMaterial.clearcoatNormalScale ) cachedMaterial.clearcoatNormalScale.y *= -1;

				}

				this.cache.add( cacheKey, cachedMaterial );

				this.associations.set( cachedMaterial, this.associations.get( material ) );

			}

			material = cachedMaterial;

		}

		mesh.material = material;

	}

	getMaterialType( /* materialIndex */ ) {

		return MeshStandardMaterial$1;

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#materials
	 *
	 * @private
	 * @param {number} materialIndex
	 * @return {Promise<Material>}
	 */
	loadMaterial( materialIndex ) {

		const parser = this;
		const json = this.json;
		const extensions = this.extensions;
		const materialDef = json.materials[ materialIndex ];

		let materialType;
		const materialParams = {};
		const materialExtensions = materialDef.extensions || {};

		const pending = [];

		if ( materialExtensions[ EXTENSIONS.KHR_MATERIALS_UNLIT ] ) {

			const kmuExtension = extensions[ EXTENSIONS.KHR_MATERIALS_UNLIT ];
			materialType = kmuExtension.getMaterialType();
			pending.push( kmuExtension.extendParams( materialParams, materialDef, parser ) );

		} else {

			// Specification:
			// https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#metallic-roughness-material

			const metallicRoughness = materialDef.pbrMetallicRoughness || {};

			materialParams.color = new Color$3( 1.0, 1.0, 1.0 );
			materialParams.opacity = 1.0;

			if ( Array.isArray( metallicRoughness.baseColorFactor ) ) {

				const array = metallicRoughness.baseColorFactor;

				materialParams.color.setRGB( array[ 0 ], array[ 1 ], array[ 2 ], LinearSRGBColorSpace$1 );
				materialParams.opacity = array[ 3 ];

			}

			if ( metallicRoughness.baseColorTexture !== undefined ) {

				pending.push( parser.assignTexture( materialParams, 'map', metallicRoughness.baseColorTexture, SRGBColorSpace$4 ) );

			}

			materialParams.metalness = metallicRoughness.metallicFactor !== undefined ? metallicRoughness.metallicFactor : 1.0;
			materialParams.roughness = metallicRoughness.roughnessFactor !== undefined ? metallicRoughness.roughnessFactor : 1.0;

			if ( metallicRoughness.metallicRoughnessTexture !== undefined ) {

				pending.push( parser.assignTexture( materialParams, 'metalnessMap', metallicRoughness.metallicRoughnessTexture ) );
				pending.push( parser.assignTexture( materialParams, 'roughnessMap', metallicRoughness.metallicRoughnessTexture ) );

			}

			materialType = this._invokeOne( function ( ext ) {

				return ext.getMaterialType && ext.getMaterialType( materialIndex );

			} );

			pending.push( Promise.all( this._invokeAll( function ( ext ) {

				return ext.extendMaterialParams && ext.extendMaterialParams( materialIndex, materialParams );

			} ) ) );

		}

		if ( materialDef.doubleSided === true ) {

			materialParams.side = DoubleSide$2;

		}

		const alphaMode = materialDef.alphaMode || ALPHA_MODES.OPAQUE;

		if ( alphaMode === ALPHA_MODES.BLEND ) {

			materialParams.transparent = true;

			// See: https://github.com/mrdoob/three.js/issues/17706
			materialParams.depthWrite = false;

		} else {

			materialParams.transparent = false;

			if ( alphaMode === ALPHA_MODES.MASK ) {

				materialParams.alphaTest = materialDef.alphaCutoff !== undefined ? materialDef.alphaCutoff : 0.5;

			}

		}

		if ( materialDef.normalTexture !== undefined && materialType !== MeshBasicMaterial$1 ) {

			pending.push( parser.assignTexture( materialParams, 'normalMap', materialDef.normalTexture ) );

			materialParams.normalScale = new Vector2$2( 1, 1 );

			if ( materialDef.normalTexture.scale !== undefined ) {

				const scale = materialDef.normalTexture.scale;

				materialParams.normalScale.set( scale, scale );

			}

		}

		if ( materialDef.occlusionTexture !== undefined && materialType !== MeshBasicMaterial$1 ) {

			pending.push( parser.assignTexture( materialParams, 'aoMap', materialDef.occlusionTexture ) );

			if ( materialDef.occlusionTexture.strength !== undefined ) {

				materialParams.aoMapIntensity = materialDef.occlusionTexture.strength;

			}

		}

		if ( materialDef.emissiveFactor !== undefined && materialType !== MeshBasicMaterial$1 ) {

			const emissiveFactor = materialDef.emissiveFactor;
			materialParams.emissive = new Color$3().setRGB( emissiveFactor[ 0 ], emissiveFactor[ 1 ], emissiveFactor[ 2 ], LinearSRGBColorSpace$1 );

		}

		if ( materialDef.emissiveTexture !== undefined && materialType !== MeshBasicMaterial$1 ) {

			pending.push( parser.assignTexture( materialParams, 'emissiveMap', materialDef.emissiveTexture, SRGBColorSpace$4 ) );

		}

		return Promise.all( pending ).then( function () {

			const material = new materialType( materialParams );

			if ( materialDef.name ) material.name = materialDef.name;

			assignExtrasToUserData( material, materialDef );

			parser.associations.set( material, { materials: materialIndex } );

			if ( materialDef.extensions ) addUnknownExtensionsToUserData( extensions, material, materialDef );

			return material;

		} );

	}

	/**
	 * When Object3D instances are targeted by animation, they need unique names.
	 *
	 * @private
	 * @param {string} originalName
	 * @return {string}
	 */
	createUniqueName( originalName ) {

		const sanitizedName = PropertyBinding.sanitizeNodeName( originalName || '' );

		if ( sanitizedName in this.nodeNamesUsed ) {

			return sanitizedName + '_' + ( ++ this.nodeNamesUsed[ sanitizedName ] );

		} else {

			this.nodeNamesUsed[ sanitizedName ] = 0;

			return sanitizedName;

		}

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#geometry
	 *
	 * Creates BufferGeometries from primitives.
	 *
	 * @private
	 * @param {Array<GLTF.Primitive>} primitives
	 * @return {Promise<Array<BufferGeometry>>}
	 */
	loadGeometries( primitives ) {

		const parser = this;
		const extensions = this.extensions;
		const cache = this.primitiveCache;

		function createDracoPrimitive( primitive ) {

			return extensions[ EXTENSIONS.KHR_DRACO_MESH_COMPRESSION ]
				.decodePrimitive( primitive, parser )
				.then( function ( geometry ) {

					return addPrimitiveAttributes( geometry, primitive, parser );

				} );

		}

		const pending = [];

		for ( let i = 0, il = primitives.length; i < il; i ++ ) {

			const primitive = primitives[ i ];
			const cacheKey = createPrimitiveKey( primitive );

			// See if we've already created this geometry
			const cached = cache[ cacheKey ];

			if ( cached ) {

				// Use the cached geometry if it exists
				pending.push( cached.promise );

			} else {

				let geometryPromise;

				if ( primitive.extensions && primitive.extensions[ EXTENSIONS.KHR_DRACO_MESH_COMPRESSION ] ) {

					// Use DRACO geometry if available
					geometryPromise = createDracoPrimitive( primitive );

				} else {

					// Otherwise create a new geometry
					geometryPromise = addPrimitiveAttributes( new BufferGeometry$1(), primitive, parser );

				}

				// Cache this geometry
				cache[ cacheKey ] = { primitive: primitive, promise: geometryPromise };

				pending.push( geometryPromise );

			}

		}

		return Promise.all( pending );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#meshes
	 *
	 * @private
	 * @param {number} meshIndex
	 * @return {Promise<Group|Mesh|SkinnedMesh|Line|Points>}
	 */
	loadMesh( meshIndex ) {

		const parser = this;
		const json = this.json;
		const extensions = this.extensions;

		const meshDef = json.meshes[ meshIndex ];
		const primitives = meshDef.primitives;

		const pending = [];

		for ( let i = 0, il = primitives.length; i < il; i ++ ) {

			const material = primitives[ i ].material === undefined
				? createDefaultMaterial( this.cache )
				: this.getDependency( 'material', primitives[ i ].material );

			pending.push( material );

		}

		pending.push( parser.loadGeometries( primitives ) );

		return Promise.all( pending ).then( function ( results ) {

			const materials = results.slice( 0, results.length - 1 );
			const geometries = results[ results.length - 1 ];

			const meshes = [];

			for ( let i = 0, il = geometries.length; i < il; i ++ ) {

				const geometry = geometries[ i ];
				const primitive = primitives[ i ];

				// 1. create Mesh

				let mesh;

				const material = materials[ i ];

				if ( primitive.mode === WEBGL_CONSTANTS.TRIANGLES ||
						primitive.mode === WEBGL_CONSTANTS.TRIANGLE_STRIP ||
						primitive.mode === WEBGL_CONSTANTS.TRIANGLE_FAN ||
						primitive.mode === undefined ) {

					// .isSkinnedMesh isn't in glTF spec. See ._markDefs()
					mesh = meshDef.isSkinnedMesh === true
						? new SkinnedMesh( geometry, material )
						: new Mesh$3( geometry, material );

					if ( mesh.isSkinnedMesh === true ) {

						// normalize skin weights to fix malformed assets (see #15319)
						mesh.normalizeSkinWeights();

					}

					if ( primitive.mode === WEBGL_CONSTANTS.TRIANGLE_STRIP ) {

						mesh.geometry = toTrianglesDrawMode( mesh.geometry, TriangleStripDrawMode );

					} else if ( primitive.mode === WEBGL_CONSTANTS.TRIANGLE_FAN ) {

						mesh.geometry = toTrianglesDrawMode( mesh.geometry, TriangleFanDrawMode );

					}

				} else if ( primitive.mode === WEBGL_CONSTANTS.LINES ) {

					mesh = new LineSegments$1( geometry, material );

				} else if ( primitive.mode === WEBGL_CONSTANTS.LINE_STRIP ) {

					mesh = new Line( geometry, material );

				} else if ( primitive.mode === WEBGL_CONSTANTS.LINE_LOOP ) {

					mesh = new LineLoop( geometry, material );

				} else if ( primitive.mode === WEBGL_CONSTANTS.POINTS ) {

					mesh = new Points$1( geometry, material );

				} else {

					throw new Error( 'THREE.GLTFLoader: Primitive mode unsupported: ' + primitive.mode );

				}

				if ( Object.keys( mesh.geometry.morphAttributes ).length > 0 ) {

					updateMorphTargets( mesh, meshDef );

				}

				mesh.name = parser.createUniqueName( meshDef.name || ( 'mesh_' + meshIndex ) );

				assignExtrasToUserData( mesh, meshDef );

				if ( primitive.extensions ) addUnknownExtensionsToUserData( extensions, mesh, primitive );

				parser.assignFinalMaterial( mesh );

				meshes.push( mesh );

			}

			for ( let i = 0, il = meshes.length; i < il; i ++ ) {

				parser.associations.set( meshes[ i ], {
					meshes: meshIndex,
					primitives: i
				} );

			}

			if ( meshes.length === 1 ) {

				if ( meshDef.extensions ) addUnknownExtensionsToUserData( extensions, meshes[ 0 ], meshDef );

				return meshes[ 0 ];

			}

			const group = new Group$2();

			if ( meshDef.extensions ) addUnknownExtensionsToUserData( extensions, group, meshDef );

			parser.associations.set( group, { meshes: meshIndex } );

			for ( let i = 0, il = meshes.length; i < il; i ++ ) {

				group.add( meshes[ i ] );

			}

			return group;

		} );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#cameras
	 *
	 * @private
	 * @param {number} cameraIndex
	 * @return {Promise<Camera>|undefined}
	 */
	loadCamera( cameraIndex ) {

		let camera;
		const cameraDef = this.json.cameras[ cameraIndex ];
		const params = cameraDef[ cameraDef.type ];

		if ( ! params ) {

			console.warn( 'THREE.GLTFLoader: Missing camera parameters.' );
			return;

		}

		if ( cameraDef.type === 'perspective' ) {

			camera = new PerspectiveCamera( MathUtils.radToDeg( params.yfov ), params.aspectRatio || 1, params.znear || 1, params.zfar || 2e6 );

		} else if ( cameraDef.type === 'orthographic' ) {

			camera = new OrthographicCamera( - params.xmag, params.xmag, params.ymag, - params.ymag, params.znear, params.zfar );

		}

		if ( cameraDef.name ) camera.name = this.createUniqueName( cameraDef.name );

		assignExtrasToUserData( camera, cameraDef );

		return Promise.resolve( camera );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#skins
	 *
	 * @private
	 * @param {number} skinIndex
	 * @return {Promise<Skeleton>}
	 */
	loadSkin( skinIndex ) {

		const skinDef = this.json.skins[ skinIndex ];

		const pending = [];

		for ( let i = 0, il = skinDef.joints.length; i < il; i ++ ) {

			pending.push( this._loadNodeShallow( skinDef.joints[ i ] ) );

		}

		if ( skinDef.inverseBindMatrices !== undefined ) {

			pending.push( this.getDependency( 'accessor', skinDef.inverseBindMatrices ) );

		} else {

			pending.push( null );

		}

		return Promise.all( pending ).then( function ( results ) {

			const inverseBindMatrices = results.pop();
			const jointNodes = results;

			// Note that bones (joint nodes) may or may not be in the
			// scene graph at this time.

			const bones = [];
			const boneInverses = [];

			for ( let i = 0, il = jointNodes.length; i < il; i ++ ) {

				const jointNode = jointNodes[ i ];

				if ( jointNode ) {

					bones.push( jointNode );

					const mat = new Matrix4$1();

					if ( inverseBindMatrices !== null ) {

						mat.fromArray( inverseBindMatrices.array, i * 16 );

					}

					boneInverses.push( mat );

				} else {

					console.warn( 'THREE.GLTFLoader: Joint "%s" could not be found.', skinDef.joints[ i ] );

				}

			}

			return new Skeleton( bones, boneInverses );

		} );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#animations
	 *
	 * @private
	 * @param {number} animationIndex
	 * @return {Promise<AnimationClip>}
	 */
	loadAnimation( animationIndex ) {

		const json = this.json;
		const parser = this;

		const animationDef = json.animations[ animationIndex ];
		const animationName = animationDef.name ? animationDef.name : 'animation_' + animationIndex;

		const pendingNodes = [];
		const pendingInputAccessors = [];
		const pendingOutputAccessors = [];
		const pendingSamplers = [];
		const pendingTargets = [];

		for ( let i = 0, il = animationDef.channels.length; i < il; i ++ ) {

			const channel = animationDef.channels[ i ];
			const sampler = animationDef.samplers[ channel.sampler ];
			const target = channel.target;
			const name = target.node;
			const input = animationDef.parameters !== undefined ? animationDef.parameters[ sampler.input ] : sampler.input;
			const output = animationDef.parameters !== undefined ? animationDef.parameters[ sampler.output ] : sampler.output;

			if ( target.node === undefined ) continue;

			pendingNodes.push( this.getDependency( 'node', name ) );
			pendingInputAccessors.push( this.getDependency( 'accessor', input ) );
			pendingOutputAccessors.push( this.getDependency( 'accessor', output ) );
			pendingSamplers.push( sampler );
			pendingTargets.push( target );

		}

		return Promise.all( [

			Promise.all( pendingNodes ),
			Promise.all( pendingInputAccessors ),
			Promise.all( pendingOutputAccessors ),
			Promise.all( pendingSamplers ),
			Promise.all( pendingTargets )

		] ).then( function ( dependencies ) {

			const nodes = dependencies[ 0 ];
			const inputAccessors = dependencies[ 1 ];
			const outputAccessors = dependencies[ 2 ];
			const samplers = dependencies[ 3 ];
			const targets = dependencies[ 4 ];

			const tracks = [];

			for ( let i = 0, il = nodes.length; i < il; i ++ ) {

				const node = nodes[ i ];
				const inputAccessor = inputAccessors[ i ];
				const outputAccessor = outputAccessors[ i ];
				const sampler = samplers[ i ];
				const target = targets[ i ];

				if ( node === undefined ) continue;

				if ( node.updateMatrix ) {

					node.updateMatrix();

				}

				const createdTracks = parser._createAnimationTracks( node, inputAccessor, outputAccessor, sampler, target );

				if ( createdTracks ) {

					for ( let k = 0; k < createdTracks.length; k ++ ) {

						tracks.push( createdTracks[ k ] );

					}

				}

			}

			const animation = new AnimationClip( animationName, undefined, tracks );

			assignExtrasToUserData( animation, animationDef );

			return animation;

		} );

	}

	createNodeMesh( nodeIndex ) {

		const json = this.json;
		const parser = this;
		const nodeDef = json.nodes[ nodeIndex ];

		if ( nodeDef.mesh === undefined ) return null;

		return parser.getDependency( 'mesh', nodeDef.mesh ).then( function ( mesh ) {

			const node = parser._getNodeRef( parser.meshCache, nodeDef.mesh, mesh );

			// if weights are provided on the node, override weights on the mesh.
			if ( nodeDef.weights !== undefined ) {

				node.traverse( function ( o ) {

					if ( ! o.isMesh ) return;

					for ( let i = 0, il = nodeDef.weights.length; i < il; i ++ ) {

						o.morphTargetInfluences[ i ] = nodeDef.weights[ i ];

					}

				} );

			}

			return node;

		} );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#nodes-and-hierarchy
	 *
	 * @private
	 * @param {number} nodeIndex
	 * @return {Promise<Object3D>}
	 */
	loadNode( nodeIndex ) {

		const json = this.json;
		const parser = this;

		const nodeDef = json.nodes[ nodeIndex ];

		const nodePending = parser._loadNodeShallow( nodeIndex );

		const childPending = [];
		const childrenDef = nodeDef.children || [];

		for ( let i = 0, il = childrenDef.length; i < il; i ++ ) {

			childPending.push( parser.getDependency( 'node', childrenDef[ i ] ) );

		}

		const skeletonPending = nodeDef.skin === undefined
			? Promise.resolve( null )
			: parser.getDependency( 'skin', nodeDef.skin );

		return Promise.all( [
			nodePending,
			Promise.all( childPending ),
			skeletonPending
		] ).then( function ( results ) {

			const node = results[ 0 ];
			const children = results[ 1 ];
			const skeleton = results[ 2 ];

			if ( skeleton !== null ) {

				// This full traverse should be fine because
				// child glTF nodes have not been added to this node yet.
				node.traverse( function ( mesh ) {

					if ( ! mesh.isSkinnedMesh ) return;

					mesh.bind( skeleton, _identityMatrix );

				} );

			}

			for ( let i = 0, il = children.length; i < il; i ++ ) {

				node.add( children[ i ] );

			}

			// Reconstruct pivot from container pattern created by GLTFExporter
			// The container has position+pivot, rotation, scale; child has -pivot offset and mesh
			if ( node.userData.pivot !== undefined && children.length > 0 ) {

				const pivot = node.userData.pivot;
				const pivotChild = children[ 0 ];

				// Set pivot on container and adjust transforms
				node.pivot = new Vector3$3().fromArray( pivot );

				// Adjust container position: stored as position + pivot, so subtract pivot
				node.position.x -= pivot[ 0 ];
				node.position.y -= pivot[ 1 ];
				node.position.z -= pivot[ 2 ];

				// Remove the child's -pivot offset since pivot now handles it
				pivotChild.position.set( 0, 0, 0 );

				delete node.userData.pivot;

			}

			return node;

		} );

	}

	// ._loadNodeShallow() parses a single node.
	// skin and child nodes are created and added in .loadNode() (no '_' prefix).
	_loadNodeShallow( nodeIndex ) {

		const json = this.json;
		const extensions = this.extensions;
		const parser = this;

		// This method is called from .loadNode() and .loadSkin().
		// Cache a node to avoid duplication.

		if ( this.nodeCache[ nodeIndex ] !== undefined ) {

			return this.nodeCache[ nodeIndex ];

		}

		const nodeDef = json.nodes[ nodeIndex ];

		// reserve node's name before its dependencies, so the root has the intended name.
		const nodeName = nodeDef.name ? parser.createUniqueName( nodeDef.name ) : '';

		const pending = [];

		const meshPromise = parser._invokeOne( function ( ext ) {

			return ext.createNodeMesh && ext.createNodeMesh( nodeIndex );

		} );

		if ( meshPromise ) {

			pending.push( meshPromise );

		}

		if ( nodeDef.camera !== undefined ) {

			pending.push( parser.getDependency( 'camera', nodeDef.camera ).then( function ( camera ) {

				return parser._getNodeRef( parser.cameraCache, nodeDef.camera, camera );

			} ) );

		}

		parser._invokeAll( function ( ext ) {

			return ext.createNodeAttachment && ext.createNodeAttachment( nodeIndex );

		} ).forEach( function ( promise ) {

			pending.push( promise );

		} );

		this.nodeCache[ nodeIndex ] = Promise.all( pending ).then( function ( objects ) {

			let node;

			// .isBone isn't in glTF spec. See ._markDefs
			if ( nodeDef.isBone === true ) {

				node = new Bone();

			} else if ( objects.length > 1 ) {

				node = new Group$2();

			} else if ( objects.length === 1 ) {

				node = objects[ 0 ];

			} else {

				node = new Object3D();

			}

			if ( node !== objects[ 0 ] ) {

				for ( let i = 0, il = objects.length; i < il; i ++ ) {

					node.add( objects[ i ] );

				}

			}

			if ( nodeDef.name ) {

				node.userData.name = nodeDef.name;
				node.name = nodeName;

			}

			assignExtrasToUserData( node, nodeDef );

			if ( nodeDef.extensions ) addUnknownExtensionsToUserData( extensions, node, nodeDef );

			if ( nodeDef.matrix !== undefined ) {

				const matrix = new Matrix4$1();
				matrix.fromArray( nodeDef.matrix );
				node.applyMatrix4( matrix );

			} else {

				if ( nodeDef.translation !== undefined ) {

					node.position.fromArray( nodeDef.translation );

				}

				if ( nodeDef.rotation !== undefined ) {

					node.quaternion.fromArray( nodeDef.rotation );

				}

				if ( nodeDef.scale !== undefined ) {

					node.scale.fromArray( nodeDef.scale );

				}

			}

			if ( ! parser.associations.has( node ) ) {

				parser.associations.set( node, {} );

			} else if ( nodeDef.mesh !== undefined && parser.meshCache.refs[ nodeDef.mesh ] > 1 ) {

				const mapping = parser.associations.get( node );
				parser.associations.set( node, { ...mapping } );

			}

			parser.associations.get( node ).nodes = nodeIndex;

			return node;

		} );

		return this.nodeCache[ nodeIndex ];

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#scenes
	 *
	 * @private
	 * @param {number} sceneIndex
	 * @return {Promise<Group>}
	 */
	loadScene( sceneIndex ) {

		const extensions = this.extensions;
		const sceneDef = this.json.scenes[ sceneIndex ];
		const parser = this;

		// Loader returns Group, not Scene.
		// See: https://github.com/mrdoob/three.js/issues/18342#issuecomment-578981172
		const scene = new Group$2();
		if ( sceneDef.name ) scene.name = parser.createUniqueName( sceneDef.name );

		assignExtrasToUserData( scene, sceneDef );

		if ( sceneDef.extensions ) addUnknownExtensionsToUserData( extensions, scene, sceneDef );

		const nodeIds = sceneDef.nodes || [];

		const pending = [];

		for ( let i = 0, il = nodeIds.length; i < il; i ++ ) {

			pending.push( parser.getDependency( 'node', nodeIds[ i ] ) );

		}

		return Promise.all( pending ).then( function ( nodes ) {

			for ( let i = 0, il = nodes.length; i < il; i ++ ) {

				const node = nodes[ i ];

				// If the node already has a parent, it means it's being reused across multiple scenes.
				// Clone it to avoid the second scene's add() removing it from the first scene.
				// See: https://github.com/mrdoob/three.js/issues/27993
				if ( node.parent !== null ) {

					scene.add( clone( node ) );

				} else {

					scene.add( node );

				}

			}

			// Removes dangling associations, associations that reference a node that
			// didn't make it into the scene.
			const reduceAssociations = ( node ) => {

				const reducedAssociations = new Map();

				for ( const [ key, value ] of parser.associations ) {

					if ( key instanceof Material$1 || key instanceof Texture$2 ) {

						reducedAssociations.set( key, value );

					}

				}

				node.traverse( ( node ) => {

					const mappings = parser.associations.get( node );

					if ( mappings != null ) {

						reducedAssociations.set( node, mappings );

					}

				} );

				return reducedAssociations;

			};

			parser.associations = reduceAssociations( scene );

			return scene;

		} );

	}

	_createAnimationTracks( node, inputAccessor, outputAccessor, sampler, target ) {

		const tracks = [];

		const targetName = node.name ? node.name : node.uuid;
		const targetNames = [];

		if ( PATH_PROPERTIES[ target.path ] === PATH_PROPERTIES.weights ) {

			node.traverse( function ( object ) {

				if ( object.morphTargetInfluences ) {

					targetNames.push( object.name ? object.name : object.uuid );

				}

			} );

		} else {

			targetNames.push( targetName );

		}

		let TypedKeyframeTrack;

		switch ( PATH_PROPERTIES[ target.path ] ) {

			case PATH_PROPERTIES.weights:

				TypedKeyframeTrack = NumberKeyframeTrack;
				break;

			case PATH_PROPERTIES.rotation:

				TypedKeyframeTrack = QuaternionKeyframeTrack;
				break;

			case PATH_PROPERTIES.translation:
			case PATH_PROPERTIES.scale:

				TypedKeyframeTrack = VectorKeyframeTrack;
				break;

			default:

				switch ( outputAccessor.itemSize ) {

					case 1:
						TypedKeyframeTrack = NumberKeyframeTrack;
						break;
					case 2:
					case 3:
					default:
						TypedKeyframeTrack = VectorKeyframeTrack;
						break;

				}

				break;

		}

		const interpolation = sampler.interpolation !== undefined ? INTERPOLATION[ sampler.interpolation ] : InterpolateLinear;


		const outputArray = this._getArrayFromAccessor( outputAccessor );

		for ( let j = 0, jl = targetNames.length; j < jl; j ++ ) {

			const track = new TypedKeyframeTrack(
				targetNames[ j ] + '.' + PATH_PROPERTIES[ target.path ],
				inputAccessor.array,
				outputArray,
				interpolation
			);

			// Override interpolation with custom factory method.
			if ( sampler.interpolation === 'CUBICSPLINE' ) {

				this._createCubicSplineTrackInterpolant( track );

			}

			tracks.push( track );

		}

		return tracks;

	}

	_getArrayFromAccessor( accessor ) {

		let outputArray = accessor.array;

		if ( accessor.normalized ) {

			const scale = getNormalizedComponentScale( outputArray.constructor );
			const scaled = new Float32Array( outputArray.length );

			for ( let j = 0, jl = outputArray.length; j < jl; j ++ ) {

				scaled[ j ] = outputArray[ j ] * scale;

			}

			outputArray = scaled;

		}

		return outputArray;

	}

	_createCubicSplineTrackInterpolant( track ) {

		track.createInterpolant = function InterpolantFactoryMethodGLTFCubicSpline( result ) {

			// A CUBICSPLINE keyframe in glTF has three output values for each input value,
			// representing inTangent, splineVertex, and outTangent. As a result, track.getValueSize()
			// must be divided by three to get the interpolant's sampleSize argument.

			const interpolantType = ( this instanceof QuaternionKeyframeTrack ) ? GLTFCubicSplineQuaternionInterpolant : GLTFCubicSplineInterpolant;

			return new interpolantType( this.times, this.values, this.getValueSize() / 3, result );

		};

		// Mark as CUBICSPLINE. `track.getInterpolation()` doesn't support custom interpolants.
		track.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline = true;

	}

}

/**
 *
 * @private
 * @param {BufferGeometry} geometry
 * @param {GLTF.Primitive} primitiveDef
 * @param {GLTFParser} parser
 */
function computeBounds( geometry, primitiveDef, parser ) {

	const attributes = primitiveDef.attributes;

	const box = new Box3$1();

	if ( attributes.POSITION !== undefined ) {

		const accessor = parser.json.accessors[ attributes.POSITION ];

		const min = accessor.min;
		const max = accessor.max;

		// glTF requires 'min' and 'max', but VRM (which extends glTF) currently ignores that requirement.

		if ( min !== undefined && max !== undefined ) {

			box.set(
				new Vector3$3( min[ 0 ], min[ 1 ], min[ 2 ] ),
				new Vector3$3( max[ 0 ], max[ 1 ], max[ 2 ] )
			);

			if ( accessor.normalized ) {

				const boxScale = getNormalizedComponentScale( WEBGL_COMPONENT_TYPES[ accessor.componentType ] );
				box.min.multiplyScalar( boxScale );
				box.max.multiplyScalar( boxScale );

			}

		} else {

			console.warn( 'THREE.GLTFLoader: Missing min/max properties for accessor POSITION.' );

			return;

		}

	} else {

		return;

	}

	const targets = primitiveDef.targets;

	if ( targets !== undefined ) {

		const maxDisplacement = new Vector3$3();
		const vector = new Vector3$3();

		for ( let i = 0, il = targets.length; i < il; i ++ ) {

			const target = targets[ i ];

			if ( target.POSITION !== undefined ) {

				const accessor = parser.json.accessors[ target.POSITION ];
				const min = accessor.min;
				const max = accessor.max;

				// glTF requires 'min' and 'max', but VRM (which extends glTF) currently ignores that requirement.

				if ( min !== undefined && max !== undefined ) {

					// we need to get max of absolute components because target weight is [-1,1]
					vector.setX( Math.max( Math.abs( min[ 0 ] ), Math.abs( max[ 0 ] ) ) );
					vector.setY( Math.max( Math.abs( min[ 1 ] ), Math.abs( max[ 1 ] ) ) );
					vector.setZ( Math.max( Math.abs( min[ 2 ] ), Math.abs( max[ 2 ] ) ) );


					if ( accessor.normalized ) {

						const boxScale = getNormalizedComponentScale( WEBGL_COMPONENT_TYPES[ accessor.componentType ] );
						vector.multiplyScalar( boxScale );

					}

					// Note: this assumes that the sum of all weights is at most 1. This isn't quite correct - it's more conservative
					// to assume that each target can have a max weight of 1. However, for some use cases - notably, when morph targets
					// are used to implement key-frame animations and as such only two are active at a time - this results in very large
					// boxes. So for now we make a box that's sometimes a touch too small but is hopefully mostly of reasonable size.
					maxDisplacement.max( vector );

				} else {

					console.warn( 'THREE.GLTFLoader: Missing min/max properties for accessor POSITION.' );

				}

			}

		}

		// As per comment above this box isn't conservative, but has a reasonable size for a very large number of morph targets.
		box.expandByVector( maxDisplacement );

	}

	geometry.boundingBox = box;

	const sphere = new Sphere$1();

	box.getCenter( sphere.center );
	sphere.radius = box.min.distanceTo( box.max ) / 2;

	geometry.boundingSphere = sphere;

}

/**
 *
 * @private
 * @param {BufferGeometry} geometry
 * @param {GLTF.Primitive} primitiveDef
 * @param {GLTFParser} parser
 * @return {Promise<BufferGeometry>}
 */
function addPrimitiveAttributes( geometry, primitiveDef, parser ) {

	const attributes = primitiveDef.attributes;

	const pending = [];

	function assignAttributeAccessor( accessorIndex, attributeName ) {

		return parser.getDependency( 'accessor', accessorIndex )
			.then( function ( accessor ) {

				geometry.setAttribute( attributeName, accessor );

			} );

	}

	for ( const gltfAttributeName in attributes ) {

		const threeAttributeName = ATTRIBUTES[ gltfAttributeName ] || gltfAttributeName.toLowerCase();

		// Skip attributes already provided by e.g. Draco extension.
		if ( threeAttributeName in geometry.attributes ) continue;

		pending.push( assignAttributeAccessor( attributes[ gltfAttributeName ], threeAttributeName ) );

	}

	if ( primitiveDef.indices !== undefined && ! geometry.index ) {

		const accessor = parser.getDependency( 'accessor', primitiveDef.indices ).then( function ( accessor ) {

			geometry.setIndex( accessor );

		} );

		pending.push( accessor );

	}

	if ( ColorManagement$1.workingColorSpace !== LinearSRGBColorSpace$1 && 'COLOR_0' in attributes ) {

		console.warn( `THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${ColorManagement$1.workingColorSpace}" not supported.` );

	}

	assignExtrasToUserData( geometry, primitiveDef );

	computeBounds( geometry, primitiveDef, parser );

	return Promise.all( pending ).then( function () {

		return primitiveDef.targets !== undefined
			? addMorphTargets( geometry, primitiveDef.targets, parser )
			: geometry;

	} );

}

const {BufferGeometry,FileLoader: FileLoader$1,Float32BufferAttribute,Group: Group$1,LineBasicMaterial,LineSegments,Loader: Loader$1,Material,Mesh: Mesh$2,MeshPhongMaterial,Points,PointsMaterial,Vector3: Vector3$2,Color: Color$2,SRGBColorSpace: SRGBColorSpace$3} = await importShared('three');


// o object_name | g group_name
const _object_pattern = /^[og]\s*(.+)?/;
// mtllib file_reference
const _material_library_pattern = /^mtllib /;
// usemtl material_name
const _material_use_pattern = /^usemtl /;
// usemap map_name
const _map_use_pattern = /^usemap /;
const _face_vertex_data_separator_pattern = /\s+/;

const _vA = new Vector3$2();
const _vB = new Vector3$2();
const _vC = new Vector3$2();

const _ab = new Vector3$2();
const _cb = new Vector3$2();

const _color = new Color$2();

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
class OBJLoader extends Loader$1 {

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

		const loader = new FileLoader$1( this.manager );
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
								SRGBColorSpace$3
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

		const container = new Group$1();
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

				const buffergeometry = new BufferGeometry();

				buffergeometry.setAttribute( 'position', new Float32BufferAttribute( geometry.vertices, 3 ) );

				if ( geometry.normals.length > 0 ) {

					buffergeometry.setAttribute( 'normal', new Float32BufferAttribute( geometry.normals, 3 ) );

				}

				if ( geometry.colors.length > 0 ) {

					hasVertexColors = true;
					buffergeometry.setAttribute( 'color', new Float32BufferAttribute( geometry.colors, 3 ) );

				}

				if ( geometry.hasUVIndices === true ) {

					buffergeometry.setAttribute( 'uv', new Float32BufferAttribute( geometry.uvs, 2 ) );

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

						} else if ( isPoints && material && ! ( material instanceof PointsMaterial ) ) {

							const materialPoints = new PointsMaterial( { size: 10, sizeAttenuation: false } );
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

							material = new PointsMaterial( { size: 1, sizeAttenuation: false } );

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

						mesh = new Mesh$2( buffergeometry, createdMaterials );

					}

				} else {

					if ( isLine ) {

						mesh = new LineSegments( buffergeometry, createdMaterials[ 0 ] );

					} else if ( isPoints ) {

						mesh = new Points( buffergeometry, createdMaterials[ 0 ] );

					} else {

						mesh = new Mesh$2( buffergeometry, createdMaterials[ 0 ] );

					}

				}

				mesh.name = object.name;

				container.add( mesh );

			}

		} else {

			// if there is only the default parser state object with no geometry data, interpret data as point cloud

			if ( state.vertices.length > 0 ) {

				const material = new PointsMaterial( { size: 1, sizeAttenuation: false } );

				const buffergeometry = new BufferGeometry();

				buffergeometry.setAttribute( 'position', new Float32BufferAttribute( state.vertices, 3 ) );

				if ( state.colors.length > 0 && state.colors[ 0 ] !== undefined ) {

					buffergeometry.setAttribute( 'color', new Float32BufferAttribute( state.colors, 3 ) );
					material.vertexColors = true;

				}

				const points = new Points( buffergeometry, material );
				container.add( points );

			}

		}

		return container;

	}

}

/**
 * A simple pool for managing Web Workers.
 *
 * @three_import import { WorkerPool } from 'three/addons/utils/WorkerPool.js';
 */
class WorkerPool {

	/**
	 * Constructs a new Worker pool.
	 *
	 * @param {number} [pool=4] - The size of the pool.
	 */
	constructor( pool = 4 ) {

		/**
		 * The size of the pool.
		 *
		 * @type {number}
		 * @default 4
		 */
		this.pool = pool;

		/**
		 * A message queue.
		 *
		 * @type {Array<Object>}
		 */
		this.queue = [];

		/**
		 * An array of Workers.
		 *
		 * @type {Array<Worker>}
		 */
		this.workers = [];

		/**
		 * An array with resolve functions for messages.
		 *
		 * @type {Array<Function>}
		 */
		this.workersResolve = [];

		/**
		 * The current worker status.
		 *
		 * @type {number}
		 */
		this.workerStatus = 0;

		/**
		 * A factory function for creating workers.
		 *
		 * @type {?Function}
		 */
		this.workerCreator = null;

	}

	_initWorker( workerId ) {

		if ( ! this.workers[ workerId ] ) {

			const worker = this.workerCreator();
			worker.addEventListener( 'message', this._onMessage.bind( this, workerId ) );
			this.workers[ workerId ] = worker;

		}

	}

	_getIdleWorker() {

		for ( let i = 0; i < this.pool; i ++ )
			if ( ! ( this.workerStatus & ( 1 << i ) ) ) return i;

		return -1;

	}

	_onMessage( workerId, msg ) {

		const resolve = this.workersResolve[ workerId ];
		resolve && resolve( msg );

		if ( this.queue.length ) {

			const { resolve, msg, transfer } = this.queue.shift();
			this.workersResolve[ workerId ] = resolve;
			this.workers[ workerId ].postMessage( msg, transfer );

		} else {

			this.workerStatus ^= 1 << workerId;

		}

	}

	/**
	 * Sets a function that is responsible for creating Workers.
	 *
	 * @param {Function} workerCreator - The worker creator function.
	 */
	setWorkerCreator( workerCreator ) {

		this.workerCreator = workerCreator;

	}

	/**
	 * Sets the Worker limit
	 *
	 * @param {number} pool - The size of the pool.
	 */
	setWorkerLimit( pool ) {

		this.pool = pool;

	}

	/**
	 * Post a message to an idle Worker. If no Worker is available,
	 * the message is pushed into a message queue for later processing.
	 *
	 * @param {Object} msg - The message.
	 * @param {Array<ArrayBuffer>} transfer - An array with array buffers for data transfer.
	 * @return {Promise} A Promise that resolves when the message has been processed.
	 */
	postMessage( msg, transfer ) {

		return new Promise( ( resolve ) => {

			const workerId = this._getIdleWorker();

			if ( workerId !== -1 ) {

				this._initWorker( workerId );
				this.workerStatus |= 1 << workerId;
				this.workersResolve[ workerId ] = resolve;
				this.workers[ workerId ].postMessage( msg, transfer );

			} else {

				this.queue.push( { resolve, msg, transfer } );

			}

		} );

	}

	/**
	 * Terminates all Workers of this pool. Call this  method whenever this
	 * Worker pool is no longer used in your app.
	 */
	dispose() {

		this.workers.forEach( ( worker ) => worker.terminate() );
		this.workersResolve.length = 0;
		this.workers.length = 0;
		this.queue.length = 0;
		this.workerStatus = 0;

	}

}

const t = 0, n = 2, u = 1, y = 2, S = 0, E = 1, X = 10, it = 0, ht = 9, gt = 15, xt = 16, dt = 22, Ft = 37, Et = 43, te = 76, ae = 83, ue = 97, ye = 100, de = 103, Ae = 109, We = 122, He = 123, qe = 131, Je = 132, Qe = 133, Ze = 134, en = 137, nn = 138, sn = 139, an = 140, rn = 141, on = 142, cn = 145, Un = 146, pn = 148, xn = 152, yn = 153, bn = 154, mn = 155, dn = 156, Dn = 157, wn = 158, Vn = 165, Cn = 166, ri = 1000054e3, oi = 1000054001, ci = 1000054004, Ui = 1000054005, _i = 1000066e3, yi = 1000066004;
class Ci {
  constructor(t2, e2, n2, i2) {
    this._dataView = void 0, this._littleEndian = void 0, this._offset = void 0, this._dataView = new DataView(t2.buffer, t2.byteOffset + e2, n2), this._littleEndian = i2, this._offset = 0;
  }
  _nextUint8() {
    const t2 = this._dataView.getUint8(this._offset);
    return this._offset += 1, t2;
  }
  _nextUint16() {
    const t2 = this._dataView.getUint16(this._offset, this._littleEndian);
    return this._offset += 2, t2;
  }
  _nextUint32() {
    const t2 = this._dataView.getUint32(this._offset, this._littleEndian);
    return this._offset += 4, t2;
  }
  _nextUint64() {
    const t2 = this._dataView.getUint32(this._offset, this._littleEndian) + 2 ** 32 * this._dataView.getUint32(this._offset + 4, this._littleEndian);
    return this._offset += 8, t2;
  }
  _nextInt32() {
    const t2 = this._dataView.getInt32(this._offset, this._littleEndian);
    return this._offset += 4, t2;
  }
  _nextUint8Array(t2) {
    const e2 = new Uint8Array(this._dataView.buffer, this._dataView.byteOffset + this._offset, t2);
    return this._offset += t2, e2;
  }
  _skip(t2) {
    return this._offset += t2, this;
  }
  _scan(t2, e2 = 0) {
    const n2 = this._offset;
    let i2 = 0;
    for (; this._dataView.getUint8(this._offset) !== e2 && i2 < t2; ) i2++, this._offset++;
    return i2 < t2 && this._offset++, new Uint8Array(this._dataView.buffer, this._dataView.byteOffset + n2, i2);
  }
}
const Oi = [171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10];
function Si(t2) {
  return new TextDecoder().decode(t2);
}
function Mi(t2) {
  const e2 = new Uint8Array(t2.buffer, t2.byteOffset, Oi.length);
  if (e2[0] !== Oi[0] || e2[1] !== Oi[1] || e2[2] !== Oi[2] || e2[3] !== Oi[3] || e2[4] !== Oi[4] || e2[5] !== Oi[5] || e2[6] !== Oi[6] || e2[7] !== Oi[7] || e2[8] !== Oi[8] || e2[9] !== Oi[9] || e2[10] !== Oi[10] || e2[11] !== Oi[11]) throw new Error("Missing KTX 2.0 identifier.");
  const n2 = { vkFormat: 0, typeSize: 1, pixelWidth: 0, pixelHeight: 0, pixelDepth: 0, layerCount: 0, faceCount: 1, levelCount: 0, supercompressionScheme: 0, levels: [], dataFormatDescriptor: [{ vendorId: 0, descriptorType: 0, versionNumber: 2, colorModel: 0, colorPrimaries: 1, transferFunction: 2, flags: 0, texelBlockDimension: [0, 0, 0, 0], bytesPlane: [0, 0, 0, 0, 0, 0, 0, 0], samples: [] }], keyValue: {}, globalData: null }, i2 = 17 * Uint32Array.BYTES_PER_ELEMENT, s2 = new Ci(t2, Oi.length, i2, true);
  n2.vkFormat = s2._nextUint32(), n2.typeSize = s2._nextUint32(), n2.pixelWidth = s2._nextUint32(), n2.pixelHeight = s2._nextUint32(), n2.pixelDepth = s2._nextUint32(), n2.layerCount = s2._nextUint32(), n2.faceCount = s2._nextUint32(), n2.levelCount = s2._nextUint32(), n2.supercompressionScheme = s2._nextUint32();
  const a2 = s2._nextUint32(), r2 = s2._nextUint32(), o2 = s2._nextUint32(), l2 = s2._nextUint32(), f2 = s2._nextUint64(), c2 = s2._nextUint64(), U2 = 3 * Math.max(n2.levelCount, 1) * 8, h2 = new Ci(t2, Oi.length + i2, U2, true);
  for (let e3 = 0, i3 = Math.max(n2.levelCount, 1); e3 < i3; e3++) n2.levels.push({ levelData: new Uint8Array(t2.buffer, t2.byteOffset + h2._nextUint64(), h2._nextUint64()), uncompressedByteLength: h2._nextUint64() });
  const p2 = new Ci(t2, a2, r2, true);
  p2._skip(4);
  const _2 = p2._nextUint16(), u2 = p2._nextUint16(), g2 = p2._nextUint16(), x2 = p2._nextUint16(), y2 = { vendorId: _2, descriptorType: u2, versionNumber: g2, colorModel: p2._nextUint8(), colorPrimaries: p2._nextUint8(), transferFunction: p2._nextUint8(), flags: p2._nextUint8(), texelBlockDimension: [p2._nextUint8(), p2._nextUint8(), p2._nextUint8(), p2._nextUint8()], bytesPlane: [p2._nextUint8(), p2._nextUint8(), p2._nextUint8(), p2._nextUint8(), p2._nextUint8(), p2._nextUint8(), p2._nextUint8(), p2._nextUint8()], samples: [] }, b2 = (x2 / 4 - 6) / 4;
  for (let t3 = 0; t3 < b2; t3++) {
    const e3 = { bitOffset: p2._nextUint16(), bitLength: p2._nextUint8(), channelType: p2._nextUint8(), samplePosition: [p2._nextUint8(), p2._nextUint8(), p2._nextUint8(), p2._nextUint8()], sampleLower: Number.NEGATIVE_INFINITY, sampleUpper: Number.POSITIVE_INFINITY };
    64 & e3.channelType ? (e3.sampleLower = p2._nextInt32(), e3.sampleUpper = p2._nextInt32()) : (e3.sampleLower = p2._nextUint32(), e3.sampleUpper = p2._nextUint32()), y2.samples[t3] = e3;
  }
  n2.dataFormatDescriptor.length = 0, n2.dataFormatDescriptor.push(y2);
  const m2 = new Ci(t2, o2, l2, true);
  for (; m2._offset < l2; ) {
    const t3 = m2._nextUint32(), e3 = m2._scan(t3), i3 = Si(e3);
    if (n2.keyValue[i3] = m2._nextUint8Array(t3 - e3.byteLength - 1), i3.match(/^ktx/i)) {
      const t4 = Si(n2.keyValue[i3]);
      n2.keyValue[i3] = t4.substring(0, t4.lastIndexOf("\0"));
    }
    m2._skip(t3 % 4 ? 4 - t3 % 4 : 0);
  }
  if (c2 <= 0) return n2;
  const d2 = new Ci(t2, f2, c2, true), D2 = d2._nextUint16(), w2 = d2._nextUint16(), v2 = d2._nextUint32(), B2 = d2._nextUint32(), L2 = d2._nextUint32(), A2 = d2._nextUint32(), k2 = [];
  for (let t3 = 0, e3 = Math.max(n2.levelCount, 1); t3 < e3; t3++) k2.push({ imageFlags: d2._nextUint32(), rgbSliceByteOffset: d2._nextUint32(), rgbSliceByteLength: d2._nextUint32(), alphaSliceByteOffset: d2._nextUint32(), alphaSliceByteLength: d2._nextUint32() });
  const I2 = f2 + d2._offset, V2 = I2 + v2, C2 = V2 + B2, F2 = C2 + L2, O2 = new Uint8Array(t2.buffer, t2.byteOffset + I2, v2), T2 = new Uint8Array(t2.buffer, t2.byteOffset + V2, B2), S2 = new Uint8Array(t2.buffer, t2.byteOffset + C2, L2), E2 = new Uint8Array(t2.buffer, t2.byteOffset + F2, A2);
  return n2.globalData = { endpointCount: D2, selectorCount: w2, imageDescs: k2, endpointsData: O2, selectorsData: T2, tablesData: S2, extendedData: E2 }, n2;
}

let A,I,B;const g={env:{emscripten_notify_memory_growth:function(A){B=new Uint8Array(I.exports.memory.buffer);}}};class Q{init(){return A||(A="undefined"!=typeof fetch?fetch("data:application/wasm;base64,"+C).then(A=>A.arrayBuffer()).then(A=>WebAssembly.instantiate(A,g)).then(this._init):WebAssembly.instantiate(Buffer.from(C,"base64"),g).then(this._init),A)}_init(A){I=A.instance,g.env.emscripten_notify_memory_growth(0);}decode(A,g=0){if(!I)throw new Error("ZSTDDecoder: Await .init() before decoding.");const Q=A.byteLength,C=I.exports.malloc(Q);B.set(A,C),g=g||Number(I.exports.ZSTD_findDecompressedSize(C,Q));const E=I.exports.malloc(g),i=I.exports.ZSTD_decompress(E,g,C,Q),D=B.slice(E,E+i);return I.exports.free(C),I.exports.free(E),D}}const C="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IAMNACAEQQNxBEADQCACRQ0FIAAgAkF/aiICaiIDIAEgAmotAAA6AAAgA0EDcQ0ACwsgAkEDTQ0AA0AgACACQXxqIgJqIAEgAmooAgA2AgAgAkEDSw0ACwsgAkUNAgNAIAAgAkF/aiICaiABIAJqLQAAOgAAIAINAAsMAgsgAkEDTQ0AIAIhBANAIAMgASgCADYCACABQQRqIQEgA0EEaiEDIARBfGoiBEEDSw0ACyACQQNxIQILIAJFDQADQCADIAEtAAA6AAAgA0EBaiEDIAFBAWohASACQX9qIgINAAsLIAAL8wICAn8BfgJAIAJFDQAgACACaiIDQX9qIAE6AAAgACABOgAAIAJBA0kNACADQX5qIAE6AAAgACABOgABIANBfWogAToAACAAIAE6AAIgAkEHSQ0AIANBfGogAToAACAAIAE6AAMgAkEJSQ0AIABBACAAa0EDcSIEaiIDIAFB/wFxQYGChAhsIgE2AgAgAyACIARrQXxxIgRqIgJBfGogATYCACAEQQlJDQAgAyABNgIIIAMgATYCBCACQXhqIAE2AgAgAkF0aiABNgIAIARBGUkNACADIAE2AhggAyABNgIUIAMgATYCECADIAE2AgwgAkFwaiABNgIAIAJBbGogATYCACACQWhqIAE2AgAgAkFkaiABNgIAIAQgA0EEcUEYciIEayICQSBJDQAgAa0iBUIghiAFhCEFIAMgBGohAQNAIAEgBTcDGCABIAU3AxAgASAFNwMIIAEgBTcDACABQSBqIQEgAkFgaiICQR9LDQALCyAACy8BAn8gACgCBCAAKAIAQQJ0aiICLQACIQMgACACLwEAIAEgAi0AAxAIajYCACADCy8BAn8gACgCBCAAKAIAQQJ0aiICLQACIQMgACACLwEAIAEgAi0AAxAFajYCACADCx8AIAAgASACKAIEEAg2AgAgARAEGiAAIAJBCGo2AgQLCAAgAGdBH3MLugUBDX8jAEEQayIKJAACfyAEQQNNBEAgCkEANgIMIApBDGogAyAEEAsaIAAgASACIApBDGpBBBAVIgBBbCAAEAMbIAAgACAESxsMAQsgAEEAIAEoAgBBAXRBAmoQECENQVQgAygAACIGQQ9xIgBBCksNABogAiAAQQVqNgIAIAMgBGoiAkF8aiEMIAJBeWohDiACQXtqIRAgAEEGaiELQQQhBSAGQQR2IQRBICAAdCIAQQFyIQkgASgCACEPQQAhAiADIQYCQANAIAlBAkggAiAPS3JFBEAgAiEHAkAgCARAA0AgBEH//wNxQf//A0YEQCAHQRhqIQcgBiAQSQR/IAZBAmoiBigAACAFdgUgBUEQaiEFIARBEHYLIQQMAQsLA0AgBEEDcSIIQQNGBEAgBUECaiEFIARBAnYhBCAHQQNqIQcMAQsLIAcgCGoiByAPSw0EIAVBAmohBQNAIAIgB0kEQCANIAJBAXRqQQA7AQAgAkEBaiECDAELCyAGIA5LQQAgBiAFQQN1aiIHIAxLG0UEQCAHKAAAIAVBB3EiBXYhBAwCCyAEQQJ2IQQLIAYhBwsCfyALQX9qIAQgAEF/anEiBiAAQQF0QX9qIgggCWsiEUkNABogBCAIcSIEQQAgESAEIABIG2shBiALCyEIIA0gAkEBdGogBkF/aiIEOwEAIAlBASAGayAEIAZBAUgbayEJA0AgCSAASARAIABBAXUhACALQX9qIQsMAQsLAn8gByAOS0EAIAcgBSAIaiIFQQN1aiIGIAxLG0UEQCAFQQdxDAELIAUgDCIGIAdrQQN0awshBSACQQFqIQIgBEUhCCAGKAAAIAVBH3F2IQQMAQsLQWwgCUEBRyAFQSBKcg0BGiABIAJBf2o2AgAgBiAFQQdqQQN1aiADawwBC0FQCyEAIApBEGokACAACwkAQQFBBSAAGwsMACAAIAEoAAA2AAALqgMBCn8jAEHwAGsiCiQAIAJBAWohDiAAQQhqIQtBgIAEIAVBf2p0QRB1IQxBACECQQEhBkEBIAV0IglBf2oiDyEIA0AgAiAORkUEQAJAIAEgAkEBdCINai8BACIHQf//A0YEQCALIAhBA3RqIAI2AgQgCEF/aiEIQQEhBwwBCyAGQQAgDCAHQRB0QRB1ShshBgsgCiANaiAHOwEAIAJBAWohAgwBCwsgACAFNgIEIAAgBjYCACAJQQN2IAlBAXZqQQNqIQxBACEAQQAhBkEAIQIDQCAGIA5GBEADQAJAIAAgCUYNACAKIAsgAEEDdGoiASgCBCIGQQF0aiICIAIvAQAiAkEBajsBACABIAUgAhAUayIIOgADIAEgAiAIQf8BcXQgCWs7AQAgASAEIAZBAnQiAmooAgA6AAIgASACIANqKAIANgIEIABBAWohAAwBCwsFIAEgBkEBdGouAQAhDUEAIQcDQCAHIA1ORQRAIAsgAkEDdGogBjYCBANAIAIgDGogD3EiAiAISw0ACyAHQQFqIQcMAQsLIAZBAWohBgwBCwsgCkHwAGokAAsjAEIAIAEQCSAAhUKHla+vmLbem55/fkLj3MqV/M7y9YV/fAsQACAAQn43AwggACABNgIACyQBAX8gAARAIAEoAgQiAgRAIAEoAgggACACEQEADwsgABAmCwsfACAAIAEgAi8BABAINgIAIAEQBBogACACQQRqNgIEC0oBAX9BoCAoAgAiASAAaiIAQX9MBEBBiCBBMDYCAEF/DwsCQCAAPwBBEHRNDQAgABBmDQBBiCBBMDYCAEF/DwtBoCAgADYCACABC9cBAQh/Qbp/IQoCQCACKAIEIgggAigCACIJaiIOIAEgAGtLDQBBbCEKIAkgBCADKAIAIgtrSw0AIAAgCWoiBCACKAIIIgxrIQ0gACABQWBqIg8gCyAJQQAQKSADIAkgC2o2AgACQAJAIAwgBCAFa00EQCANIQUMAQsgDCAEIAZrSw0CIAcgDSAFayIAaiIBIAhqIAdNBEAgBCABIAgQDxoMAgsgBCABQQAgAGsQDyEBIAIgACAIaiIINgIEIAEgAGshBAsgBCAPIAUgCEEBECkLIA4hCgsgCgubAgEBfyMAQYABayINJAAgDSADNgJ8AkAgAkEDSwRAQX8hCQwBCwJAAkACQAJAIAJBAWsOAwADAgELIAZFBEBBuH8hCQwEC0FsIQkgBS0AACICIANLDQMgACAHIAJBAnQiAmooAgAgAiAIaigCABA7IAEgADYCAEEBIQkMAwsgASAJNgIAQQAhCQwCCyAKRQRAQWwhCQwCC0EAIQkgC0UgDEEZSHINAUEIIAR0QQhqIQBBACECA0AgAiAATw0CIAJBQGshAgwAAAsAC0FsIQkgDSANQfwAaiANQfgAaiAFIAYQFSICEAMNACANKAJ4IgMgBEsNACAAIA0gDSgCfCAHIAggAxAYIAEgADYCACACIQkLIA1BgAFqJAAgCQsLACAAIAEgAhALGgsQACAALwAAIAAtAAJBEHRyCy8AAn9BuH8gAUEISQ0AGkFyIAAoAAQiAEF3Sw0AGkG4fyAAQQhqIgAgACABSxsLCwkAIAAgATsAAAsDAAELigYBBX8gACAAKAIAIgVBfnE2AgBBACAAIAVBAXZqQYQgKAIAIgQgAEYbIQECQAJAIAAoAgQiAkUNACACKAIAIgNBAXENACACQQhqIgUgA0EBdkF4aiIDQQggA0EISxtnQR9zQQJ0QYAfaiIDKAIARgRAIAMgAigCDDYCAAsgAigCCCIDBEAgAyACKAIMNgIECyACKAIMIgMEQCADIAIoAgg2AgALIAIgAigCACAAKAIAQX5xajYCAEGEICEAAkACQCABRQ0AIAEgAjYCBCABKAIAIgNBAXENASADQQF2QXhqIgNBCCADQQhLG2dBH3NBAnRBgB9qIgMoAgAgAUEIakYEQCADIAEoAgw2AgALIAEoAggiAwRAIAMgASgCDDYCBAsgASgCDCIDBEAgAyABKAIINgIAQYQgKAIAIQQLIAIgAigCACABKAIAQX5xajYCACABIARGDQAgASABKAIAQQF2akEEaiEACyAAIAI2AgALIAIoAgBBAXZBeGoiAEEIIABBCEsbZ0Efc0ECdEGAH2oiASgCACEAIAEgBTYCACACIAA2AgwgAkEANgIIIABFDQEgACAFNgIADwsCQCABRQ0AIAEoAgAiAkEBcQ0AIAJBAXZBeGoiAkEIIAJBCEsbZ0Efc0ECdEGAH2oiAigCACABQQhqRgRAIAIgASgCDDYCAAsgASgCCCICBEAgAiABKAIMNgIECyABKAIMIgIEQCACIAEoAgg2AgBBhCAoAgAhBAsgACAAKAIAIAEoAgBBfnFqIgI2AgACQCABIARHBEAgASABKAIAQQF2aiAANgIEIAAoAgAhAgwBC0GEICAANgIACyACQQF2QXhqIgFBCCABQQhLG2dBH3NBAnRBgB9qIgIoAgAhASACIABBCGoiAjYCACAAIAE2AgwgAEEANgIIIAFFDQEgASACNgIADwsgBUEBdkF4aiIBQQggAUEISxtnQR9zQQJ0QYAfaiICKAIAIQEgAiAAQQhqIgI2AgAgACABNgIMIABBADYCCCABRQ0AIAEgAjYCAAsLDgAgAARAIABBeGoQJQsLgAIBA38CQCAAQQ9qQXhxQYQgKAIAKAIAQQF2ayICEB1Bf0YNAAJAQYQgKAIAIgAoAgAiAUEBcQ0AIAFBAXZBeGoiAUEIIAFBCEsbZ0Efc0ECdEGAH2oiASgCACAAQQhqRgRAIAEgACgCDDYCAAsgACgCCCIBBEAgASAAKAIMNgIECyAAKAIMIgFFDQAgASAAKAIINgIAC0EBIQEgACAAKAIAIAJBAXRqIgI2AgAgAkEBcQ0AIAJBAXZBeGoiAkEIIAJBCEsbZ0Efc0ECdEGAH2oiAygCACECIAMgAEEIaiIDNgIAIAAgAjYCDCAAQQA2AgggAkUNACACIAM2AgALIAELtwIBA38CQAJAIABBASAAGyICEDgiAA0AAkACQEGEICgCACIARQ0AIAAoAgAiA0EBcQ0AIAAgA0EBcjYCACADQQF2QXhqIgFBCCABQQhLG2dBH3NBAnRBgB9qIgEoAgAgAEEIakYEQCABIAAoAgw2AgALIAAoAggiAQRAIAEgACgCDDYCBAsgACgCDCIBBEAgASAAKAIINgIACyACECchAkEAIQFBhCAoAgAhACACDQEgACAAKAIAQX5xNgIAQQAPCyACQQ9qQXhxIgMQHSICQX9GDQIgAkEHakF4cSIAIAJHBEAgACACaxAdQX9GDQMLAkBBhCAoAgAiAUUEQEGAICAANgIADAELIAAgATYCBAtBhCAgADYCACAAIANBAXRBAXI2AgAMAQsgAEUNAQsgAEEIaiEBCyABC7kDAQJ/IAAgA2ohBQJAIANBB0wEQANAIAAgBU8NAiAAIAItAAA6AAAgAEEBaiEAIAJBAWohAgwAAAsACyAEQQFGBEACQCAAIAJrIgZBB00EQCAAIAItAAA6AAAgACACLQABOgABIAAgAi0AAjoAAiAAIAItAAM6AAMgAEEEaiACIAZBAnQiBkHAHmooAgBqIgIQFyACIAZB4B5qKAIAayECDAELIAAgAhAMCyACQQhqIQIgAEEIaiEACwJAAkACQAJAIAUgAU0EQCAAIANqIQEgBEEBRyAAIAJrQQ9Kcg0BA0AgACACEAwgAkEIaiECIABBCGoiACABSQ0ACwwFCyAAIAFLBEAgACEBDAQLIARBAUcgACACa0EPSnINASAAIQMgAiEEA0AgAyAEEAwgBEEIaiEEIANBCGoiAyABSQ0ACwwCCwNAIAAgAhAHIAJBEGohAiAAQRBqIgAgAUkNAAsMAwsgACEDIAIhBANAIAMgBBAHIARBEGohBCADQRBqIgMgAUkNAAsLIAIgASAAa2ohAgsDQCABIAVPDQEgASACLQAAOgAAIAFBAWohASACQQFqIQIMAAALAAsLQQECfyAAIAAoArjgASIDNgLE4AEgACgCvOABIQQgACABNgK84AEgACABIAJqNgK44AEgACABIAQgA2tqNgLA4AELpgEBAX8gACAAKALs4QEQFjYCyOABIABCADcD+OABIABCADcDuOABIABBwOABakIANwMAIABBqNAAaiIBQYyAgOAANgIAIABBADYCmOIBIABCADcDiOEBIABCAzcDgOEBIABBrNABakHgEikCADcCACAAQbTQAWpB6BIoAgA2AgAgACABNgIMIAAgAEGYIGo2AgggACAAQaAwajYCBCAAIABBEGo2AgALYQEBf0G4fyEDAkAgAUEDSQ0AIAIgABAhIgFBA3YiADYCCCACIAFBAXE2AgQgAiABQQF2QQNxIgM2AgACQCADQX9qIgFBAksNAAJAIAFBAWsOAgEAAgtBbA8LIAAhAwsgAwsMACAAIAEgAkEAEC4LiAQCA38CfiADEBYhBCAAQQBBKBAQIQAgBCACSwRAIAQPCyABRQRAQX8PCwJAAkAgA0EBRg0AIAEoAAAiBkGo6r5pRg0AQXYhAyAGQXBxQdDUtMIBRw0BQQghAyACQQhJDQEgAEEAQSgQECEAIAEoAAQhASAAQQE2AhQgACABrTcDAEEADwsgASACIAMQLyIDIAJLDQAgACADNgIYQXIhAyABIARqIgVBf2otAAAiAkEIcQ0AIAJBIHEiBkUEQEFwIQMgBS0AACIFQacBSw0BIAVBB3GtQgEgBUEDdkEKaq2GIgdCA4h+IAd8IQggBEEBaiEECyACQQZ2IQMgAkECdiEFAkAgAkEDcUF/aiICQQJLBEBBACECDAELAkACQAJAIAJBAWsOAgECAAsgASAEai0AACECIARBAWohBAwCCyABIARqLwAAIQIgBEECaiEEDAELIAEgBGooAAAhAiAEQQRqIQQLIAVBAXEhBQJ+AkACQAJAIANBf2oiA0ECTQRAIANBAWsOAgIDAQtCfyAGRQ0DGiABIARqMQAADAMLIAEgBGovAACtQoACfAwCCyABIARqKAAArQwBCyABIARqKQAACyEHIAAgBTYCICAAIAI2AhwgACAHNwMAQQAhAyAAQQA2AhQgACAHIAggBhsiBzcDCCAAIAdCgIAIIAdCgIAIVBs+AhALIAMLWwEBf0G4fyEDIAIQFiICIAFNBH8gACACakF/ai0AACIAQQNxQQJ0QaAeaigC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C0Egak8NAQsgByAHKQNoNwMQIAcgBykDYDcDCCAEIA0gB0EIaiAHQdwAaiAPIA4gESAQEB4hCwwBCyACIARqIQggBCAKEAcgAkERTwRAIARBEGohAgNAIAIgCkEQaiIKEAcgAkEQaiICIAhJDQALCyAIIAlrIQIgByATNgJcIAkgCCAOa0sEQCAJIAggEWtLBEBBbCELDAILIBAgAiAOayICaiIKIANqIBBNBEAgCCAKIAMQDxoMAgsgCCAKQQAgAmsQDyEIIAcgAiADaiIDNgJkIAggAmshCCAOIQILIAlBEE8EQCADIAhqIQMDQCAIIAIQByACQRBqIQIgCEEQaiIIIANJDQALDAELAkAgCUEHTQRAIAggAi0AADoAACAIIAItAAE6AAEgCCACLQACOgACIAggAi0AAzoAAyAIQQRqIAIgCUECdCIDQcAeaigCAGoiAhAXIAIgA0HgHmooAgBrIQIgBygCZCEDDAELIAggAhAMCyADQQlJDQAgAyAIaiEDIAhBCGoiCCACQQhqIgJrQQ9MBEADQCAIIAIQDCACQQhqIQIgCEEIaiIIIANJDQAMAgALAAsDQCAIIAIQByACQRBqIQIgCEEQaiIIIANJDQALCyAHQRhqEAQaIAsgDCALEAMiAhshDCAEIAQgC2ogAhshBCAFQX9qIgUNAAsgDBADDQFBbCEMIAdBGGoQBEECSQ0BQQAhCANAIAhBA0cEQCAAIAhBAnQiAmpBrNABaiACIAdqKAJENgIAIAhBAWohCAwBCwsgBygCXCEIC0G6fyEMIA8gCGsiACANIARrSw0AIAQEfyAEIAggABALIABqBUEACyABayEMCyAHQfAAaiQAIAwLkRcCFn8FfiMAQdABayIHJAAgByAAKALw4QEiCDYCvAEgASACaiESIAggACgCgOIBaiETAkACQCAFRQRAIAEhAwwBCyAAKALE4AEhESAAKALA4AEhFSAAKAK84AEhDyAAQQE2AozhAUEAIQgDQCAIQQNHBEAgByAIQQJ0IgJqIAAgAmpBrNABaigCADYCVCAIQQFqIQgMAQsLIAcgETYCZCAHIA82AmAgByABIA9rNgJoQWwhECAHQShqIAMgBBAGEAMNASAFQQQgBUEESBshFyAHQTxqIAdBKGogACgCABATIAdBxABqIAdBKGogACgCCBATIAdBzABqIAdB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IAdB0AFqJAAgEAslACAAQgA3AgAgAEEAOwEIIABBADoACyAAIAE2AgwgACACOgAKC7QFAQN/IwBBMGsiBCQAIABB/wFqIgVBfWohBgJAIAMvAQIEQCAEQRhqIAEgAhAGIgIQAw0BIARBEGogBEEYaiADEBwgBEEIaiAEQRhqIAMQHCAAIQMDQAJAIARBGGoQBCADIAZPckUEQCADIARBEGogBEEYahASOgAAIAMgBEEIaiAEQRhqEBI6AAEgBEEYahAERQ0BIANBAmohAwsgBUF+aiEFAn8DQEG6fyECIAMiASAFSw0FIAEgBEEQaiAEQRhqEBI6AAAgAUEBaiEDIARBGGoQBEEDRgRAQQIhAiAEQQhqDAILIAMgBUsNBSABIARBCGogBEEYahASOgABIAFBAmohA0EDIQIgBEEYahAEQQNHDQALIARBEGoLIQUgAyAFIARBGGoQEjoAACABIAJqIABrIQIMAwsgAyAEQRBqIARBGGoQEjoAAiADIARBCGogBEEYahASOgADIANBBGohAwwAAAsACyAEQRhqIAEgAhAGIgIQAw0AIARBEGogBEEYaiADEBwgBEEIaiAEQRhqIAMQHCAAIQMDQAJAIARBGGoQBCADIAZPckUEQCADIARBEGogBEEYahAROgAAIAMgBEEIaiAEQRhqEBE6AAEgBEEYahAERQ0BIANBAmohAwsgBUF+aiEFAn8DQEG6fyECIAMiASAFSw0EIAEgBEEQaiAEQRhqEBE6AAAgAUEBaiEDIARBGGoQBEEDRgRAQQIhAiAEQQhqDAILIAMgBUsNBCABIARBCGogBEEYahAROgABIAFBAmohA0EDIQIgBEEYahAEQQNHDQALIARBEGoLIQUgAyAFIARBGGoQEToAACABIAJqIABrIQIMAgsgAyAEQRBqIARBGGoQEToAAiADIARBCGogBEEYahAROgADIANBBGohAwwAAAsACyAEQTBqJAAgAgtpAQF/An8CQAJAIAJBB00NACABKAAAQbfIwuF+Rw0AIAAgASgABDYCmOIBQWIgAEEQaiABIAIQPiIDEAMNAhogAEKBgICAEDcDiOEBIAAgASADaiACIANrECoMAQsgACABIAIQKgtBAAsLrQMBBn8jAEGAAWsiAyQAQWIhCAJAIAJBCUkNACAAQZjQAGogAUEIaiIEIAJBeGogAEGY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wOABCwutAgIEfwF+IwBBQGoiBCQAAkACQCACQQhJDQAgASgAAEFwcUHQ1LTCAUcNACABIAIQIiEBIABCADcDCCAAQQA2AgQgACABNgIADAELIARBGGogASACEC0iAxADBEAgACADEBoMAQsgAwRAIABBuH8QGgwBCyACIAQoAjAiA2shAiABIANqIQMDQAJAIAAgAyACIARBCGoQLCIFEAMEfyAFBSACIAVBA2oiBU8NAUG4fwsQGgwCCyAGQQFqIQYgAiAFayECIAMgBWohAyAEKAIMRQ0ACyAEKAI4BEAgAkEDTQRAIABBuH8QGgwCCyADQQRqIQMLIAQoAighAiAEKQMYIQcgAEEANgIEIAAgAyABazYCACAAIAIgBmytIAcgB0J/URs3AwgLIARBQGskAAslAQF/IwBBEGsiAiQAIAIgACABEFEgAigCACEAIAJBEGokACAAC30BBH8jAEGQBGsiBCQAIARB/wE2AggCQCAEQRBqIARBCGogBEEMaiABIAIQFSIGEAMEQCAGIQUMAQtBVCEFIAQoAgwiB0EGSw0AIAMgBEEQaiAEKAIIIAcQQSIFEAMNACAAIAEgBmogAiAGayADEDwhBQsgBEGQBGokACAFC4cBAgJ/An5BABAWIQMCQANAIAEgA08EQAJAIAAoAABBcHFB0NS0wgFGBEAgACABECIiAhADRQ0BQn4PCyAAIAEQVSIEQn1WDQMgBCAFfCIFIARUIQJCfiEEIAINAyAAIAEQUiICEAMNAwsgASACayEBIAAgAmohAAwBCwtCfiAFIAEbIQQLIAQLPwIBfwF+IwBBMGsiAiQAAn5CfiACQQhqIAAgARAtDQAaQgAgAigCHEEBRg0AGiACKQMICyEDIAJBMGokACADC40BAQJ/IwBBMGsiASQAAkAgAEUNACAAKAKI4gENACABIABB/OEBaigCADYCKCABIAApAvThATcDICAAEDAgACgCqOIBIQIgASABKAIoNgIYIAEgASkDIDcDECACIAFBEGoQGyAAQQA2AqjiASABIAEoAig2AgggASABKQMgNwMAIAAgARAbCyABQTBqJAALKgECfyMAQRBrIgAkACAAQQA2AgggAEIANwMAIAAQWCEBIABBEGokACABC4cBAQN/IwBBEGsiAiQAAkAgACgCAEUgACgCBEVzDQAgAiAAKAIINgIIIAIgACkCADcDAAJ/IAIoAgAiAQRAIAIoAghBqOMJIAERBQAMAQtBqOMJECgLIgFFDQAgASAAKQIANwL04QEgAUH84QFqIAAoAgg2AgAgARBZIAEhAwsgAkEQaiQAIAMLywEBAn8jAEEgayIBJAAgAEGBgIDAADYCtOIBIABBADYCiOIBIABBADYC7OEBIABCADcDkOIBIABBADYCpOMJIABBADYC3OIBIABCADcCzOIBIABBADYCvOIBIABBADYCxOABIABCADcCnOIBIABBpOIBakIANwIAIABBrOIBakEANgIAIAFCADcCECABQgA3AhggASABKQMYNwMIIAEgASkDEDcDACABKAIIQQh2QQFxIQIgAEEANgLg4gEgACACNgKM4gEgAUEgaiQAC3YBA38jAEEwayIBJAAgAARAIAEgAEHE0AFqIgIoAgA2AiggASAAKQK80AE3AyAgACgCACEDIAEgAigCADYCGCABIAApArzQATcDECADIAFBEGoQGyABIAEoAig2AgggASABKQMgNwMAIAAgARAbCyABQTBqJAALzAEBAX8gACABKAK00AE2ApjiASAAIAEoAgQiAjYCwOABIAAgAjYCvOABIAAgAiABKAIIaiICNgK44AEgACACNgLE4AEgASgCuNABBEAgAEKBgICAEDcDiOEBIAAgAUGk0ABqNgIMIAAgAUGUIGo2AgggACABQZwwajYCBCAAIAFBDGo2AgAgAEGs0AFqIAFBqNABaigCADYCACAAQbDQAWogAUGs0AFqKAIANgIAIABBtNABaiABQbDQAWooAgA2AgAPCyAAQgA3A4jhAQs7ACACRQRAQbp/DwsgBEUEQEFsDwsgAiAEEGAEQCAAIAEgAiADIAQgBRBhDwsgACABIAIgAyAEIAUQZQtGAQF/IwBBEGsiBSQAIAVBCGogBBAOAn8gBS0ACQRAIAAgASACIAMgBBAyDAELIAAgASACIAMgBBA0CyEAIAVBEGokACAACzQAIAAgAyAEIAUQNiIFEAMEQCAFDwsgBSAESQR/IAEgAiADIAVqIAQgBWsgABA1BUG4fwsLRgEBfyMAQRBrIgUkACAFQQhqIAQQDgJ/IAUtAAkEQCAAIAEgAiADIAQQYgwBCyAAIAEgAiADIAQQNQshACAFQRBqJAAgAAtZAQF/QQ8hAiABIABJBEAgAUEEdCAAbiECCyAAQQh2IgEgAkEYbCIAQYwIaigCAGwgAEGICGooAgBqIgJBA3YgAmogAEGACGooAgAgAEGECGooAgAgAWxqSQs3ACAAIAMgBCAFQYAQEDMiBRADBEAgBQ8LIAUgBEkEfyABIAIgAyAFaiAEIAVrIAAQMgVBuH8LC78DAQN/IwBBIGsiBSQAIAVBCGogAiADEAYiAhADRQRAIAAgAWoiB0F9aiEGIAUgBBAOIARBBGohAiAFLQACIQMDQEEAIAAgBkkgBUEIahAEGwRAIAAgAiAFQQhqIAMQAkECdGoiBC8BADsAACAFQQhqIAQtAAIQASAAIAQtAANqIgQgAiAFQQhqIAMQAkECdGoiAC8BADsAACAFQQhqIAAtAAIQASAEIAAtAANqIQAMAQUgB0F+aiEEA0AgBUEIahAEIAAgBEtyRQRAIAAgAiAFQQhqIAMQAkECdGoiBi8BADsAACAFQQhqIAYtAAIQASAAIAYtAANqIQAMAQsLA0AgACAES0UEQCAAIAIgBUEIaiADEAJBAnRqIgYvAQA7AAAgBUEIaiAGLQACEAEgACAGLQADaiEADAELCwJAIAAgB08NACAAIAIgBUEIaiADEAIiA0ECdGoiAC0AADoAACAALQADQQFGBEAgBUEIaiAALQACEAEMAQsgBSgCDEEfSw0AIAVBCGogAiADQQJ0ai0AAhABIAUoAgxBIUkNACAFQSA2AgwLIAFBbCAFQQhqEAobIQILCwsgBUEgaiQAIAILkgIBBH8jAEFAaiIJJAAgCSADQTQQCyEDAkAgBEECSA0AIAMgBEECdGooAgAhCSADQTxqIAgQIyADQQE6AD8gAyACOgA+QQAhBCADKAI8IQoDQCAEIAlGDQEgACAEQQJ0aiAKNgEAIARBAWohBAwAAAsAC0EAIQkDQCAGIAlGRQRAIAMgBSAJQQF0aiIKLQABIgtBAnRqIgwoAgAhBCADQTxqIAotAABBCHQgCGpB//8DcRAjIANBAjoAPyADIAcgC2siCiACajoAPiAEQQEgASAKa3RqIQogAygCPCELA0AgACAEQQJ0aiALNgEAIARBAWoiBCAKSQ0ACyAMIAo2AgAgCUEBaiEJDAELCyADQUBrJAALowIBCX8jAEHQAGsiCSQAIAlBEGogBUE0EAsaIAcgBmshDyAHIAFrIRADQAJAIAMgCkcEQEEBIAEgByACIApBAXRqIgYtAAEiDGsiCGsiC3QhDSAGLQAAIQ4gCUEQaiAMQQJ0aiIMKAIAIQYgCyAPTwRAIAAgBkECdGogCyAIIAUgCEE0bGogCCAQaiIIQQEgCEEBShsiCCACIAQgCEECdGooAgAiCEEBdGogAyAIayAHIA4QYyAGIA1qIQgMAgsgCUEMaiAOECMgCUEBOgAPIAkgCDoADiAGIA1qIQggCSgCDCELA0AgBiAITw0CIAAgBkECdGogCzYBACAGQQFqIQYMAAALAAsgCUHQAGokAA8LIAwgCDYCACAKQQFqIQoMAAALAAs0ACAAIAMgBCAFEDYiBRADBEAgBQ8LIAUgBEkEfyABIAIgAyAFaiAEIAVrIAAQNAVBuH8LCyMAIAA/AEEQdGtB//8DakEQdkAAQX9GBEBBAA8LQQAQAEEBCzsBAX8gAgRAA0AgACABIAJBgCAgAkGAIEkbIgMQCyEAIAFBgCBqIQEgAEGAIGohACACIANrIgINAAsLCwYAIAAQAwsLqBUJAEGICAsNAQAAAAEAAAACAAAAAgBBoAgLswYBAAAAAQAAAAIAAAACAAAAJgAAAIIAAAAhBQAASgAAAGcIAAAmAAAAwAEAAIAAAABJBQAASgAAAL4IAAApAAAALAIAAIAAAABJBQAASgAAAL4IAAAvAAAAygIAAIAAAACKBQAASgAAAIQJAAA1AAAAcwMAAIAAAACdBQAASgAAAKAJAAA9AAAAgQMAAIAAAADrBQAASwAAAD4KAABEAAAAngMAAIAAAABNBgAASwAAAKoKAABLAAAAswMAAIAAAADBBgAATQAAAB8NAABNAAAAUwQAAIAAAAAjCAAAUQAAAKYPAABUAAAAmQQAAIAAAABLCQAAVwAAALESAABYAAAA2gQAAIAAAABvCQAAXQAAACMUAABUAAAARQUAAIAAAABUCgAAagAAAIwUAABqAAAArwUAAIAAAAB2CQAAfAAAAE4QAAB8AAAA0gIAAIAAAABjBwAAkQAAAJAHAACSAAAAAAAAAAEAAAABAAAABQAAAA0AAAAdAAAAPQAAAH0AAAD9AAAA/QEAAP0DAAD9BwAA/Q8AAP0fAAD9PwAA/X8AAP3/AAD9/wEA/f8DAP3/BwD9/w8A/f8fAP3/PwD9/38A/f//AP3//wH9//8D/f//B/3//w/9//8f/f//P/3//38AAAAAAQAAAAIAAAADAAAABAAAAAUAAAAGAAAABwAAAAgAAAAJAAAACgAAAAsAAAAMAAAADQAAAA4AAAAPAAAAEAAAABEAAAASAAAAEwAAABQAAAAVAAAAFgAAABcAAAAYAAAAGQAAABoAAAAbAAAAHAAAAB0AAAAeAAAAHwAAAAMAAAAEAAAABQAAAAYAAAAHAAAACAAAAAkAAAAKAAAACwAAAAwAAAANAAAADgAAAA8AAAAQAAAAEQAAABIAAAATAAAAFAAAABUAAAAWAAAAFwAAABgAAAAZAAAAGgAAABsAAAAcAAAAHQAAAB4AAAAfAAAAIAAAACEAAAAiAAAAIwAAACUAAAAnAAAAKQAAACsAAAAvAAAAMwAAADsAAABDAAAAUwAAAGMAAACDAAAAAwEAAAMCAAADBAAAAwgAAAMQAAADIAAAA0AAAAOAAAADAAEAQeAPC1EBAAAAAQAAAAEAAAABAAAAAgAAAAIAAAADAAAAAwAAAAQAAAAEAAAABQAAAAcAAAAIAAAACQAAAAoAAAALAAAADAAAAA0AAAAOAAAADwAAABAAQcQQC4sBAQAAAAIAAAADAAAABAAAAAUAAAAGAAAABwAAAAgAAAAJAAAACgAAAAsAAAAMAAAADQAAAA4AAAAPAAAAEAAAABIAAAAUAAAAFgAAABgAAAAcAAAAIAAAACgAAAAwAAAAQAAAAIAAAAAAAQAAAAIAAAAEAAAACAAAABAAAAAgAAAAQAAAAIAAAAAAAQBBkBIL5gQBAAAAAQAAAAEAAAABAAAAAgAAAAIAAAADAAAAAwAAAAQAAAAGAAAABwAAAAgAAAAJAAAACgAAAAsAAAAMAAAADQAAAA4AAAAPAAAAEAAAAAEAAAAEAAAACAAAAAAAAAABAAEBBgAAAAAAAAQAAAAAEAAABAAAAAAgAAAFAQAAAAAAAAUDAAAAAAAABQQAAAAAAAAFBgAAAAAAAAUHAAAAAAAABQkAAAAAAAAFCgAAAAAAAAUMAAAAAAAABg4AAAAAAAEFEAAAAAAAAQUUAAAAAAABBRYAAAAAAAIFHAAAAAAAAwUgAAAAAAAEBTAAAAAgAAYFQAAAAAAABwWAAAAAAAAIBgABAAAAAAoGAAQAAAAADAYAEAAAIAAABAAAAAAAAAAEAQAAAAAAAAUCAAAAIAAABQQAAAAAAAAFBQAAACAAAAUHAAAAAAAABQgAAAAgAAAFCgAAAAAAAAULAAAAAAAABg0AAAAgAAEFEAAAAAAAAQUSAAAAIAABBRYAAAAAAAIFGAAAACAAAwUgAAAAAAADBSgAAAAAAAYEQAAAABAABgRAAAAAIAAHBYAAAAAAAAkGAAIAAAAACwYACAAAMAAABAAAAAAQAAAEAQAAACAAAAUCAAAAIAAABQMAAAAgAAAFBQAAACAAAAUGAAAAIAAABQgAAAAgAAAFCQAAACAAAAULAAAAIAAABQwAAAAAAAAGDwAAACAAAQUSAAAAIAABBRQAAAAgAAIFGAAAACAAAgUcAAAAIAADBSgAAAAgAAQFMAAAAAAAEAYAAAEAAAAPBgCAAAAAAA4GAEAAAAAADQYAIABBgBcLhwIBAAEBBQAAAAAAAAUAAAAAAAAGBD0AAAAAAAkF/QEAAAAADwX9fwAAAAAVBf3/HwAAAAMFBQAAAAAABwR9AAAAAAAMBf0PAAAAABIF/f8DAAAAFwX9/38AAAAFBR0AAAAAAAgE/QAAAAAADgX9PwAAAAAUBf3/DwAAAAIFAQAAABAABwR9AAAAAAALBf0HAAAAABEF/f8BAAAAFgX9/z8AAAAEBQ0AAAAQAAgE/QAAAAAADQX9HwAAAAATBf3/BwAAAAEFAQAAABAABgQ9AAAAAAAKBf0DAAAAABAF/f8AAAAAHAX9//8PAAAbBf3//wcAABoF/f//AwAAGQX9//8BAAAYBf3//wBBkBkLhgQBAAEBBgAAAAAAAAYDAAAAAAAABAQAAAAgAAAFBQAAAAAAAAUGAAAAAAAABQgAAAAAAAAFCQAAAAAAAAULAAAAAAAABg0AAAAAAAAGEAAAAAAAAAYTAAAAAAAABhYAAAAAAAAGGQAAAAAAAAYcAAAAAAAABh8AAAAAAAAGIgAAAAAAAQYlAAAAAAABBikAAAAAAAIGLwAAAAAAAwY7AAAAAAAEBlMAAAAAAAcGgwAAAAAACQYDAgAAEAAABAQAAAAAAAAEBQAAACAAAAUGAAAAAAAABQcAAAAgAAAFCQAAAAAAAAUKAAAAAAAABgwAAAAAAAAGDwAAAAAAAAYSAAAAAAAABhUAAAAAAAAGGAAAAAAAAAYbAAAAAAAABh4AAAAAAAAGIQAAAAAAAQYjAAAAAAABBicAAAAAAAIGKwAAAAAAAwYzAAAAAAAEBkMAAAAAAAUGYwAAAAAACAYDAQAAIAAABAQAAAAwAAAEBAAAABAAAAQFAAAAIAAABQcAAAAgAAAFCAAAACAAAAUKAAAAIAAABQsAAAAAAAAGDgAAAAAAAAYRAAAAAAAABhQAAAAAAAAGFwAAAAAAAAYaAAAAAAAABh0AAAAAAAAGIAAAAAAAEAYDAAEAAAAPBgOAAAAAAA4GA0AAAAAADQYDIAAAAAAMBgMQAAAAAAsGAwgAAAAACgYDBABBpB0L2QEBAAAAAwAAAAcAAAAPAAAAHwAAAD8AAAB/AAAA/wAAAP8BAAD/AwAA/wcAAP8PAAD/HwAA/z8AAP9/AAD//wAA//8BAP//AwD//wcA//8PAP//HwD//z8A//9/AP///wD///8B////A////wf///8P////H////z////9/AAAAAAEAAAACAAAABAAAAAAAAAACAAAABAAAAAgAAAAAAAAAAQAAAAIAAAABAAAABAAAAAQAAAAEAAAABAAAAAgAAAAIAAAACAAAAAcAAAAIAAAACQAAAAoAAAALAEGgIAsDwBBQ";

const {LinearTransfer,Matrix3: Matrix3$1,SRGBTransfer,SRGBColorSpace: SRGBColorSpace$2,ColorManagement} = await importShared('three');

/**
 * Display-P3 color space.
 *
 * @type {string}
 * @constant
 */
const DisplayP3ColorSpace = 'display-p3';

/**
 * Display-P3-Linear color space.
 *
 * @type {string}
 * @constant
 */
const LinearDisplayP3ColorSpace = 'display-p3-linear';

/**
 * Implementation object for the Extended-sRGB color space.
 *
 * @type {module:ColorSpaces~ColorSpaceImpl}
 * @constant
 */
({
	...ColorManagement.spaces[ SRGBColorSpace$2 ]});

/**
 * An object holding the color space implementation.
 *
 * @typedef {Object} module:ColorSpaces~ColorSpaceImpl
 * @property {Array<number>} primaries - The primaries.
 * @property {Array<number>} whitePoint - The white point.
 * @property {Matrix3} toXYZ - A color space conversion matrix, converting to CIE XYZ.
 * @property {Matrix3} fromXYZ - A color space conversion matrix, converting from CIE XYZ.
 * @property {Array<number>} luminanceCoefficients - The luminance coefficients.
 * @property {{unpackColorSpace:string}} [workingColorSpaceConfig] - The working color space config.
 * @property {{drawingBufferColorSpace:string}} [outputColorSpaceConfig] - The drawing buffer color space config.
 **/

const {CompressedArrayTexture,CompressedCubeTexture,CompressedTexture,Data3DTexture,DataTexture: DataTexture$1,FileLoader,FloatType: FloatType$1,HalfFloatType,LinearFilter: LinearFilter$1,LinearMipmapLinearFilter,NearestFilter,NearestMipmapNearestFilter,LinearSRGBColorSpace,Loader,NoColorSpace,RGBAFormat: RGBAFormat$1,RGBA_ASTC_4x4_Format,RGBA_ASTC_6x6_Format,RGBA_BPTC_Format,RGBA_ETC2_EAC_Format,R11_EAC_Format,SIGNED_R11_EAC_Format,RG11_EAC_Format,SIGNED_RG11_EAC_Format,RGBA_PVRTC_4BPPV1_Format,RGBA_PVRTC_2BPPV1_Format,RGBA_S3TC_DXT1_Format,RGBA_S3TC_DXT5_Format,RGB_BPTC_UNSIGNED_Format,RGB_ETC1_Format,RGB_ETC2_Format,RGB_PVRTC_4BPPV1_Format,RGB_S3TC_DXT1_Format,SIGNED_RED_GREEN_RGTC2_Format,SIGNED_RED_RGTC1_Format,RED_GREEN_RGTC2_Format,RED_RGTC1_Format,RGBFormat,RGFormat,RedFormat,SRGBColorSpace: SRGBColorSpace$1,UnsignedByteType,UnsignedInt5999Type,UnsignedInt101111Type} = await importShared('three');

const _taskCache = new WeakMap();

let _activeLoaders = 0;

let _zstd;

/**
 * A loader for KTX 2.0 GPU Texture containers.
 *
 * KTX 2.0 is a container format for various GPU texture formats. The loader supports Basis Universal GPU textures,
 * which can be quickly transcoded to a wide variety of GPU texture compression formats. While KTX 2.0 also allows
 * other hardware-specific formats, this loader does not yet parse them.
 *
 * This loader parses the KTX 2.0 container and transcodes to a supported GPU compressed texture format.
 * The required WASM transcoder and JS wrapper are available from the `examples/jsm/libs/basis` directory.
 *
 * This loader relies on Web Assembly which is not supported in older browsers.
 *
 * References:
 * - [KTX specification](http://github.khronos.org/KTX-Specification/)
 * - [DFD](https://www.khronos.org/registry/DataFormat/specs/1.3/dataformat.1.3.html#basicdescriptor)
 * - [BasisU HDR](https://github.com/BinomialLLC/basis_universal/wiki/UASTC-HDR-Texture-Specification-v1.0)
 *
 * ```js
 * const loader = new KTX2Loader();
 * loader.setTranscoderPath( 'examples/jsm/libs/basis/' );
 * loader.detectSupport( renderer );
 * const texture = loader.loadAsync( 'diffuse.ktx2' );
 * ```
 *
 * @augments Loader
 * @three_import import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
 */
class KTX2Loader extends Loader {

	/**
	 * Constructs a new KTX2 loader.
	 *
	 * @param {LoadingManager} [manager] - The loading manager.
	 */
	constructor( manager ) {

		super( manager );

		this.transcoderPath = '';
		this.transcoderBinary = null;
		this.transcoderPending = null;

		this.workerPool = new WorkerPool();
		this.workerSourceURL = '';
		this.workerConfig = null;

		if ( typeof MSC_TRANSCODER !== 'undefined' ) {

			console.warn(

				'THREE.KTX2Loader: Please update to latest "basis_transcoder".'
				+ ' "msc_basis_transcoder" is no longer supported in three.js r125+.'

			);

		}

	}

	/**
	 * Sets the transcoder path.
	 *
	 * The WASM transcoder and JS wrapper are available from the `examples/jsm/libs/basis` directory.
	 *
	 * @param {string} path - The transcoder path to set.
	 * @return {KTX2Loader} A reference to this loader.
	 */
	setTranscoderPath( path ) {

		this.transcoderPath = path;

		return this;

	}

	/**
	 * Sets the maximum number of Web Workers to be allocated by this instance.
	 *
	 * @param {number} workerLimit - The worker limit.
	 * @return {KTX2Loader} A reference to this loader.
	 */
	setWorkerLimit( workerLimit ) {

		this.workerPool.setWorkerLimit( workerLimit );

		return this;

	}


	/**
	 * Async version of {@link KTX2Loader#detectSupport}.
	 *
	 * @async
	 * @deprecated
	 * @param {WebGPURenderer} renderer - The renderer.
	 * @return {Promise} A Promise that resolves when the support has been detected.
	 */
	async detectSupportAsync( renderer ) {

		console.warn( 'KTX2Loader: "detectSupportAsync()" has been deprecated. Use "detectSupport()" and "await renderer.init();" when creating the renderer.' ); // @deprecated r181

		await renderer.init();

		return this.detectSupport( renderer );

	}

	/**
	 * Detects hardware support for available compressed texture formats, to determine
	 * the output format for the transcoder. Must be called before loading a texture.
	 *
	 * @param {WebGPURenderer|WebGLRenderer} renderer - The renderer.
	 * @return {KTX2Loader} A reference to this loader.
	 */
	detectSupport( renderer ) {

		if ( renderer.isWebGPURenderer === true ) {

			this.workerConfig = {
				astcSupported: renderer.hasFeature( 'texture-compression-astc' ),
				astcHDRSupported: false, // https://github.com/gpuweb/gpuweb/issues/3856
				etc1Supported: renderer.hasFeature( 'texture-compression-etc1' ),
				etc2Supported: renderer.hasFeature( 'texture-compression-etc2' ),
				dxtSupported: renderer.hasFeature( 'texture-compression-s3tc' ),
				bptcSupported: renderer.hasFeature( 'texture-compression-bc' ),
				pvrtcSupported: renderer.hasFeature( 'texture-compression-pvrtc' )
			};

		} else {

			this.workerConfig = {
				astcSupported: renderer.extensions.has( 'WEBGL_compressed_texture_astc' ),
				astcHDRSupported: renderer.extensions.has( 'WEBGL_compressed_texture_astc' )
					&& renderer.extensions.get( 'WEBGL_compressed_texture_astc' ).getSupportedProfiles().includes( 'hdr' ),
				etc1Supported: renderer.extensions.has( 'WEBGL_compressed_texture_etc1' ),
				etc2Supported: renderer.extensions.has( 'WEBGL_compressed_texture_etc' ),
				dxtSupported: renderer.extensions.has( 'WEBGL_compressed_texture_s3tc' ),
				bptcSupported: renderer.extensions.has( 'EXT_texture_compression_bptc' ),
				pvrtcSupported: renderer.extensions.has( 'WEBGL_compressed_texture_pvrtc' )
					|| renderer.extensions.has( 'WEBKIT_WEBGL_compressed_texture_pvrtc' )
			};

			if ( typeof navigator !== 'undefined' &&
				typeof navigator.platform !== 'undefined' && typeof navigator.userAgent !== 'undefined' &&
				navigator.platform.indexOf( 'Linux' ) >= 0 && navigator.userAgent.indexOf( 'Firefox' ) >= 0 &&
				this.workerConfig.astcSupported && this.workerConfig.etc2Supported &&
				this.workerConfig.bptcSupported && this.workerConfig.dxtSupported ) {

				// On Linux, Mesa drivers for AMD and Intel GPUs expose ETC2 and ASTC even though the hardware doesn't support these.
				// Using these extensions will result in expensive software decompression on the main thread inside the driver, causing performance issues.
				// When using ANGLE (e.g. via Chrome), these extensions are not exposed except for some specific Intel GPU models - however, Firefox doesn't perform this filtering.
				// Since a granular filter is a little too fragile and we can transcode into other GPU formats, disable formats that are likely to be emulated.

				this.workerConfig.astcSupported = false;
				this.workerConfig.etc2Supported = false;

			}

		}

		return this;

	}

	// TODO: Make this method private

	init() {

		if ( ! this.transcoderPending ) {

			// Load transcoder wrapper.
			const jsLoader = new FileLoader( this.manager );
			jsLoader.setPath( this.transcoderPath );
			jsLoader.setWithCredentials( this.withCredentials );
			const jsContent = jsLoader.loadAsync( 'basis_transcoder.js' );

			// Load transcoder WASM binary.
			const binaryLoader = new FileLoader( this.manager );
			binaryLoader.setPath( this.transcoderPath );
			binaryLoader.setResponseType( 'arraybuffer' );
			binaryLoader.setWithCredentials( this.withCredentials );
			const binaryContent = binaryLoader.loadAsync( 'basis_transcoder.wasm' );

			this.transcoderPending = Promise.all( [ jsContent, binaryContent ] )
				.then( ( [ jsContent, binaryContent ] ) => {

					const fn = KTX2Loader.BasisWorker.toString();

					const body = [
						'/* constants */',
						'let _EngineFormat = ' + JSON.stringify( KTX2Loader.EngineFormat ),
						'let _EngineType = ' + JSON.stringify( KTX2Loader.EngineType ),
						'let _TranscoderFormat = ' + JSON.stringify( KTX2Loader.TranscoderFormat ),
						'let _BasisFormat = ' + JSON.stringify( KTX2Loader.BasisFormat ),
						'/* basis_transcoder.js */',
						jsContent,
						'/* worker */',
						fn.substring( fn.indexOf( '{' ) + 1, fn.lastIndexOf( '}' ) )
					].join( '\n' );

					this.workerSourceURL = URL.createObjectURL( new Blob( [ body ] ) );
					this.transcoderBinary = binaryContent;

					this.workerPool.setWorkerCreator( () => {

						const worker = new Worker( this.workerSourceURL );
						const transcoderBinary = this.transcoderBinary.slice( 0 );

						worker.postMessage( { type: 'init', config: this.workerConfig, transcoderBinary }, [ transcoderBinary ] );

						return worker;

					} );

				} );

			if ( _activeLoaders > 0 ) {

				// Each instance loads a transcoder and allocates workers, increasing network and memory cost.

				console.warn(

					'THREE.KTX2Loader: Multiple active KTX2 loaders may cause performance issues.'
					+ ' Use a single KTX2Loader instance, or call .dispose() on old instances.'

				);

			}

			_activeLoaders ++;

		}

		return this.transcoderPending;

	}

	/**
	 * Starts loading from the given URL and passes the loaded KTX2 texture
	 * to the `onLoad()` callback.
	 *
	 * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
	 * @param {function(CompressedTexture)} onLoad - Executed when the loading process has been finished.
	 * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
	 * @param {onErrorCallback} onError - Executed when errors occur.
	 */
	load( url, onLoad, onProgress, onError ) {

		if ( this.workerConfig === null ) {

			throw new Error( 'THREE.KTX2Loader: Missing initialization with `.detectSupport( renderer )`.' );

		}

		const loader = new FileLoader( this.manager );

		loader.setPath( this.path );
		loader.setCrossOrigin( this.crossOrigin );
		loader.setWithCredentials( this.withCredentials );
		loader.setRequestHeader( this.requestHeader );
		loader.setResponseType( 'arraybuffer' );

		loader.load( url, ( buffer ) => {

			this.parse( buffer, onLoad, onError );

		}, onProgress, onError );

	}

	/**
	 * Parses the given KTX2 data.
	 *
	 * @param {ArrayBuffer} buffer - The raw KTX2 data as an array buffer.
	 * @param {function(CompressedTexture)} onLoad - Executed when the loading/parsing process has been finished.
	 * @param {onErrorCallback} onError - Executed when errors occur.
	 * @returns {Promise} A Promise that resolves when the parsing has been finished.
	 */
	parse( buffer, onLoad, onError ) {

		if ( this.workerConfig === null ) {

			throw new Error( 'THREE.KTX2Loader: Missing initialization with `.detectSupport( renderer )`.' );

		}

		// Check for an existing task using this buffer. A transferred buffer cannot be transferred
		// again from this thread.
		if ( _taskCache.has( buffer ) ) {

			const cachedTask = _taskCache.get( buffer );

			return cachedTask.promise.then( onLoad ).catch( onError );

		}

		this._createTexture( buffer )
			.then( ( texture ) => onLoad ? onLoad( texture ) : null )
			.catch( onError );

	}

	_createTextureFrom( transcodeResult, container ) {

		const { type: messageType, error, data: { faces, width, height, format, type, dfdFlags } } = transcodeResult;

		if ( messageType === 'error' ) return Promise.reject( error );

		let texture;

		if ( container.faceCount === 6 ) {

			texture = new CompressedCubeTexture( faces, format, type );

		} else {

			const mipmaps = faces[ 0 ].mipmaps;

			texture = container.layerCount > 1
				? new CompressedArrayTexture( mipmaps, width, height, container.layerCount, format, type )
				: new CompressedTexture( mipmaps, width, height, format, type );

		}

		texture.minFilter = faces[ 0 ].mipmaps.length === 1 ? LinearFilter$1 : LinearMipmapLinearFilter;
		texture.magFilter = LinearFilter$1;
		texture.generateMipmaps = false;

		texture.needsUpdate = true;
		texture.colorSpace = parseColorSpace( container );
		texture.premultiplyAlpha = !! ( dfdFlags & u );

		return texture;

	}

	/**
	 * @private
	 * @param {ArrayBuffer} buffer
	 * @param {?Object} config
	 * @return {Promise<CompressedTexture|CompressedArrayTexture|DataTexture|Data3DTexture>}
	 */
	async _createTexture( buffer, config = {} ) {

		const container = Mi( new Uint8Array( buffer ) );

		// Basis UASTC HDR is a subset of ASTC, which can be transcoded efficiently
		// to BC6H. To detect whether a KTX2 file uses Basis UASTC HDR, or default
		// ASTC, inspect the DFD color model.
		//
		// Source: https://github.com/BinomialLLC/basis_universal/issues/381
		const isBasisHDR = container.vkFormat === _i
			&& container.dataFormatDescriptor[ 0 ].colorModel === 0xA7;

		// If the device supports ASTC, Basis UASTC HDR requires no transcoder.
		const needsTranscoder = container.vkFormat === it
			|| isBasisHDR && ! this.workerConfig.astcHDRSupported;

		if ( ! needsTranscoder ) {

			return createRawTexture( container );

		}

		//
		const taskConfig = config;
		const texturePending = this.init().then( () => {

			return this.workerPool.postMessage( { type: 'transcode', buffer, taskConfig: taskConfig }, [ buffer ] );

		} ).then( ( e ) => this._createTextureFrom( e.data, container ) );

		// Cache the task result.
		_taskCache.set( buffer, { promise: texturePending } );

		return texturePending;

	}

	/**
	 * Frees internal resources. This method should be called
	 * when the loader is no longer required.
	 */
	dispose() {

		this.workerPool.dispose();
		if ( this.workerSourceURL ) URL.revokeObjectURL( this.workerSourceURL );

		_activeLoaders --;

	}

}


/* CONSTANTS */

KTX2Loader.BasisFormat = {
	ETC1S: 0,
	UASTC: 1,
	UASTC_HDR: 2,
};

// Source: https://github.com/BinomialLLC/basis_universal/blob/master/webgl/texture_test/index.html
KTX2Loader.TranscoderFormat = {
	ETC1: 0,
	ETC2: 1,
	BC1: 2,
	BC3: 3,
	BC4: 4,
	BC5: 5,
	BC7_M6_OPAQUE_ONLY: 6,
	BC7_M5: 7,
	PVRTC1_4_RGB: 8,
	PVRTC1_4_RGBA: 9,
	ASTC_4x4: 10,
	ATC_RGB: 11,
	ATC_RGBA_INTERPOLATED_ALPHA: 12,
	RGBA32: 13,
	RGB565: 14,
	BGR565: 15,
	RGBA4444: 16,
	BC6H: 22,
	RGB_HALF: 24,
	RGBA_HALF: 25,
};

KTX2Loader.EngineFormat = {
	RGBAFormat: RGBAFormat$1,
	RGBA_ASTC_4x4_Format: RGBA_ASTC_4x4_Format,
	RGB_BPTC_UNSIGNED_Format: RGB_BPTC_UNSIGNED_Format,
	RGBA_BPTC_Format: RGBA_BPTC_Format,
	RGBA_ETC2_EAC_Format: RGBA_ETC2_EAC_Format,
	RGBA_PVRTC_4BPPV1_Format: RGBA_PVRTC_4BPPV1_Format,
	RGBA_S3TC_DXT5_Format: RGBA_S3TC_DXT5_Format,
	RGB_ETC1_Format: RGB_ETC1_Format,
	RGB_ETC2_Format: RGB_ETC2_Format,
	RGB_PVRTC_4BPPV1_Format: RGB_PVRTC_4BPPV1_Format,
	RGBA_S3TC_DXT1_Format: RGBA_S3TC_DXT1_Format,
};

KTX2Loader.EngineType = {
	UnsignedByteType: UnsignedByteType,
	HalfFloatType: HalfFloatType,
	FloatType: FloatType$1,
};

/* WEB WORKER */

KTX2Loader.BasisWorker = function () {

	let config;
	let transcoderPending;
	let BasisModule;

	const EngineFormat = _EngineFormat; // eslint-disable-line no-undef
	const EngineType = _EngineType; // eslint-disable-line no-undef
	const TranscoderFormat = _TranscoderFormat; // eslint-disable-line no-undef
	const BasisFormat = _BasisFormat; // eslint-disable-line no-undef

	self.addEventListener( 'message', function ( e ) {

		const message = e.data;

		switch ( message.type ) {

			case 'init':
				config = message.config;
				init( message.transcoderBinary );
				break;

			case 'transcode':
				transcoderPending.then( () => {

					try {

						const { faces, buffers, width, height, hasAlpha, format, type, dfdFlags } = transcode( message.buffer );

						self.postMessage( { type: 'transcode', id: message.id, data: { faces, width, height, hasAlpha, format, type, dfdFlags } }, buffers );

					} catch ( error ) {

						console.error( error );

						self.postMessage( { type: 'error', id: message.id, error: error.message } );

					}

				} );
				break;

		}

	} );

	function init( wasmBinary ) {

		transcoderPending = new Promise( ( resolve ) => {

			BasisModule = { wasmBinary, onRuntimeInitialized: resolve };
			BASIS( BasisModule ); // eslint-disable-line no-undef

		} ).then( () => {

			BasisModule.initializeBasis();

			if ( BasisModule.KTX2File === undefined ) {

				console.warn( 'THREE.KTX2Loader: Please update Basis Universal transcoder.' );

			}

		} );

	}

	function transcode( buffer ) {

		const ktx2File = new BasisModule.KTX2File( new Uint8Array( buffer ) );

		function cleanup() {

			ktx2File.close();
			ktx2File.delete();

		}

		if ( ! ktx2File.isValid() ) {

			cleanup();
			throw new Error( 'THREE.KTX2Loader:	Invalid or unsupported .ktx2 file' );

		}

		let basisFormat;

		if ( ktx2File.isUASTC() ) {

			basisFormat = BasisFormat.UASTC;

		} else if ( ktx2File.isETC1S() ) {

			basisFormat = BasisFormat.ETC1S;

		} else if ( ktx2File.isHDR() ) {

			basisFormat = BasisFormat.UASTC_HDR;

		} else {

			throw new Error( 'THREE.KTX2Loader: Unknown Basis encoding' );

		}

		const width = ktx2File.getWidth();
		const height = ktx2File.getHeight();
		const layerCount = ktx2File.getLayers() || 1;
		const levelCount = ktx2File.getLevels();
		const faceCount = ktx2File.getFaces();
		const hasAlpha = ktx2File.getHasAlpha();
		const dfdFlags = ktx2File.getDFDFlags();

		const { transcoderFormat, engineFormat, engineType } = getTranscoderFormat( basisFormat, width, height, hasAlpha );

		if ( ! width || ! height || ! levelCount ) {

			cleanup();
			throw new Error( 'THREE.KTX2Loader:	Invalid texture' );

		}

		if ( ! ktx2File.startTranscoding() ) {

			cleanup();
			throw new Error( 'THREE.KTX2Loader: .startTranscoding failed' );

		}

		const faces = [];
		const buffers = [];

		for ( let face = 0; face < faceCount; face ++ ) {

			const mipmaps = [];

			for ( let mip = 0; mip < levelCount; mip ++ ) {

				const layerMips = [];

				let mipWidth, mipHeight;

				for ( let layer = 0; layer < layerCount; layer ++ ) {

					const levelInfo = ktx2File.getImageLevelInfo( mip, layer, face );

					if ( face === 0 && mip === 0 && layer === 0 && ( levelInfo.origWidth % 4 !== 0 || levelInfo.origHeight % 4 !== 0 ) ) {

						console.warn( 'THREE.KTX2Loader: ETC1S and UASTC textures should use multiple-of-four dimensions.' );

					}

					if ( levelCount > 1 ) {

						mipWidth = levelInfo.origWidth;
						mipHeight = levelInfo.origHeight;

					} else {

						// Handles non-multiple-of-four dimensions in textures without mipmaps. Textures with
						// mipmaps must use multiple-of-four dimensions, for some texture formats and APIs.
						// See mrdoob/three.js#25908.
						mipWidth = levelInfo.width;
						mipHeight = levelInfo.height;

					}

					let dst = new Uint8Array( ktx2File.getImageTranscodedSizeInBytes( mip, layer, 0, transcoderFormat ) );
					const status = ktx2File.transcodeImage( dst, mip, layer, face, transcoderFormat, 0, -1, -1 );

					if ( engineType === EngineType.HalfFloatType ) {

						dst = new Uint16Array( dst.buffer, dst.byteOffset, dst.byteLength / Uint16Array.BYTES_PER_ELEMENT );

					}

					if ( ! status ) {

						cleanup();
						throw new Error( 'THREE.KTX2Loader: .transcodeImage failed.' );

					}

					layerMips.push( dst );

				}

				const mipData = concat( layerMips );

				mipmaps.push( { data: mipData, width: mipWidth, height: mipHeight } );
				buffers.push( mipData.buffer );

			}

			faces.push( { mipmaps, width, height, format: engineFormat, type: engineType } );

		}

		cleanup();

		return { faces, buffers, width, height, hasAlpha, dfdFlags, format: engineFormat, type: engineType };

	}

	//

	// Optimal choice of a transcoder target format depends on the Basis format (ETC1S, UASTC, or
	// UASTC HDR), device capabilities, and texture dimensions. The list below ranks the formats
	// separately for each format. Currently, priority is assigned based on:
	//
	//   high quality > low quality > uncompressed
	//
	// Prioritization may be revisited, or exposed for configuration, in the future.
	//
	// Reference: https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXDeveloperGuide.md
	const FORMAT_OPTIONS = [
		{
			if: 'astcSupported',
			basisFormat: [ BasisFormat.UASTC ],
			transcoderFormat: [ TranscoderFormat.ASTC_4x4, TranscoderFormat.ASTC_4x4 ],
			engineFormat: [ EngineFormat.RGBA_ASTC_4x4_Format, EngineFormat.RGBA_ASTC_4x4_Format ],
			engineType: [ EngineType.UnsignedByteType ],
			priorityETC1S: Infinity,
			priorityUASTC: 1,
			needsPowerOfTwo: false,
		},
		{
			if: 'bptcSupported',
			basisFormat: [ BasisFormat.ETC1S, BasisFormat.UASTC ],
			transcoderFormat: [ TranscoderFormat.BC7_M5, TranscoderFormat.BC7_M5 ],
			engineFormat: [ EngineFormat.RGBA_BPTC_Format, EngineFormat.RGBA_BPTC_Format ],
			engineType: [ EngineType.UnsignedByteType ],
			priorityETC1S: 3,
			priorityUASTC: 2,
			needsPowerOfTwo: false,
		},
		{
			if: 'dxtSupported',
			basisFormat: [ BasisFormat.ETC1S, BasisFormat.UASTC ],
			transcoderFormat: [ TranscoderFormat.BC1, TranscoderFormat.BC3 ],
			engineFormat: [ EngineFormat.RGBA_S3TC_DXT1_Format, EngineFormat.RGBA_S3TC_DXT5_Format ],
			engineType: [ EngineType.UnsignedByteType ],
			priorityETC1S: 4,
			priorityUASTC: 5,
			needsPowerOfTwo: false,
		},
		{
			if: 'etc2Supported',
			basisFormat: [ BasisFormat.ETC1S, BasisFormat.UASTC ],
			transcoderFormat: [ TranscoderFormat.ETC1, TranscoderFormat.ETC2 ],
			engineFormat: [ EngineFormat.RGB_ETC2_Format, EngineFormat.RGBA_ETC2_EAC_Format ],
			engineType: [ EngineType.UnsignedByteType ],
			priorityETC1S: 1,
			priorityUASTC: 3,
			needsPowerOfTwo: false,
		},
		{
			if: 'etc1Supported',
			basisFormat: [ BasisFormat.ETC1S, BasisFormat.UASTC ],
			transcoderFormat: [ TranscoderFormat.ETC1 ],
			engineFormat: [ EngineFormat.RGB_ETC1_Format ],
			engineType: [ EngineType.UnsignedByteType ],
			priorityETC1S: 2,
			priorityUASTC: 4,
			needsPowerOfTwo: false,
		},
		{
			if: 'pvrtcSupported',
			basisFormat: [ BasisFormat.ETC1S, BasisFormat.UASTC ],
			transcoderFormat: [ TranscoderFormat.PVRTC1_4_RGB, TranscoderFormat.PVRTC1_4_RGBA ],
			engineFormat: [ EngineFormat.RGB_PVRTC_4BPPV1_Format, EngineFormat.RGBA_PVRTC_4BPPV1_Format ],
			engineType: [ EngineType.UnsignedByteType ],
			priorityETC1S: 5,
			priorityUASTC: 6,
			needsPowerOfTwo: true,
		},
		{
			if: 'bptcSupported',
			basisFormat: [ BasisFormat.UASTC_HDR ],
			transcoderFormat: [ TranscoderFormat.BC6H ],
			engineFormat: [ EngineFormat.RGB_BPTC_UNSIGNED_Format ],
			engineType: [ EngineType.HalfFloatType ],
			priorityHDR: 1,
			needsPowerOfTwo: false,
		},

		// Uncompressed fallbacks.

		{
			basisFormat: [ BasisFormat.ETC1S, BasisFormat.UASTC ],
			transcoderFormat: [ TranscoderFormat.RGBA32, TranscoderFormat.RGBA32 ],
			engineFormat: [ EngineFormat.RGBAFormat, EngineFormat.RGBAFormat ],
			engineType: [ EngineType.UnsignedByteType, EngineType.UnsignedByteType ],
			priorityETC1S: 100,
			priorityUASTC: 100,
			needsPowerOfTwo: false,
		},
		{
			basisFormat: [ BasisFormat.UASTC_HDR ],
			transcoderFormat: [ TranscoderFormat.RGBA_HALF ],
			engineFormat: [ EngineFormat.RGBAFormat ],
			engineType: [ EngineType.HalfFloatType ],
			priorityHDR: 100,
			needsPowerOfTwo: false,
		}
	];

	const OPTIONS = {
		[ BasisFormat.ETC1S ]: FORMAT_OPTIONS
			.filter( ( opt ) => opt.basisFormat.includes( BasisFormat.ETC1S ) )
			.sort( ( a, b ) => a.priorityETC1S - b.priorityETC1S ),

		[ BasisFormat.UASTC ]: FORMAT_OPTIONS
			.filter( ( opt ) => opt.basisFormat.includes( BasisFormat.UASTC ) )
			.sort( ( a, b ) => a.priorityUASTC - b.priorityUASTC ),

		[ BasisFormat.UASTC_HDR ]: FORMAT_OPTIONS
			.filter( ( opt ) => opt.basisFormat.includes( BasisFormat.UASTC_HDR ) )
			.sort( ( a, b ) => a.priorityHDR - b.priorityHDR ),
	};

	function getTranscoderFormat( basisFormat, width, height, hasAlpha ) {

		const options = OPTIONS[ basisFormat ];

		for ( let i = 0; i < options.length; i ++ ) {

			const opt = options[ i ];

			if ( opt.if && ! config[ opt.if ] ) continue;
			if ( ! opt.basisFormat.includes( basisFormat ) ) continue;
			if ( hasAlpha && opt.transcoderFormat.length < 2 ) continue;
			if ( opt.needsPowerOfTwo && ! ( isPowerOfTwo( width ) && isPowerOfTwo( height ) ) ) continue;

			const transcoderFormat = opt.transcoderFormat[ hasAlpha ? 1 : 0 ];
			const engineFormat = opt.engineFormat[ hasAlpha ? 1 : 0 ];
			const engineType = opt.engineType[ 0 ];

			return { transcoderFormat, engineFormat, engineType };

		}

		throw new Error( 'THREE.KTX2Loader: Failed to identify transcoding target.' );

	}

	function isPowerOfTwo( value ) {

		if ( value <= 2 ) return true;

		return ( value & ( value - 1 ) ) === 0 && value !== 0;

	}

	/**
	 * Concatenates N byte arrays.
	 *
	 * @param {Uint8Array[]} arrays
	 * @return {Uint8Array}
	 */
	function concat( arrays ) {

		if ( arrays.length === 1 ) return arrays[ 0 ];

		let totalByteLength = 0;

		for ( let i = 0; i < arrays.length; i ++ ) {

			const array = arrays[ i ];
			totalByteLength += array.byteLength;

		}

		const result = new Uint8Array( totalByteLength );

		let byteOffset = 0;

		for ( let i = 0; i < arrays.length; i ++ ) {

			const array = arrays[ i ];
			result.set( array, byteOffset );

			byteOffset += array.byteLength;

		}

		return result;

	}

};

// Parsing for non-Basis textures. These textures may have supercompression
// like Zstd, but they do not require transcoding.

const UNCOMPRESSED_FORMATS = new Set( [ RGBAFormat$1, RGBFormat, RGFormat, RedFormat ] );

const FORMAT_MAP = {

	[ Ae ]: RGBAFormat$1,
	[ de ]: RGFormat,
	[ ye ]: RedFormat,

	[ ue ]: RGBAFormat$1,
	[ ae ]: RGFormat,
	[ te ]: RedFormat,

	[ Et ]: RGBAFormat$1,
	[ Ft ]: RGBAFormat$1,
	[ dt ]: RGFormat,
	[ xt ]: RGFormat,
	[ gt ]: RedFormat,
	[ ht ]: RedFormat,

	[ He ]: RGBFormat,
	[ We ]: RGBFormat,

	[ xn ]: RGBA_ETC2_EAC_Format,
	[ pn ]: RGB_ETC2_Format,
	[ yn ]: R11_EAC_Format,
	[ bn ]: SIGNED_R11_EAC_Format,
	[ mn ]: RG11_EAC_Format,
	[ dn ]: SIGNED_RG11_EAC_Format,

	[ _i ]: RGBA_ASTC_4x4_Format,
	[ wn ]: RGBA_ASTC_4x4_Format,
	[ Dn ]: RGBA_ASTC_4x4_Format,
	[ yi ]: RGBA_ASTC_6x6_Format,
	[ Cn ]: RGBA_ASTC_6x6_Format,
	[ Vn ]: RGBA_ASTC_6x6_Format,

	[ Ze ]: RGBA_S3TC_DXT1_Format,
	[ Qe ]: RGBA_S3TC_DXT1_Format,
	[ Je ]: RGB_S3TC_DXT1_Format,
	[ qe ]: RGB_S3TC_DXT1_Format,

	[ nn ]: RGBA_S3TC_DXT5_Format,
	[ en ]: RGBA_S3TC_DXT5_Format,

	[ an ]: SIGNED_RED_RGTC1_Format,
	[ sn ]: RED_RGTC1_Format,

	[ on ]: SIGNED_RED_GREEN_RGTC2_Format,
	[ rn ]: RED_GREEN_RGTC2_Format,

	[ Un ]: RGBA_BPTC_Format,
	[ cn ]: RGBA_BPTC_Format,

	[ Ui ]: RGBA_PVRTC_4BPPV1_Format,
	[ oi ]: RGBA_PVRTC_4BPPV1_Format,
	[ ci ]: RGBA_PVRTC_2BPPV1_Format,
	[ ri ]: RGBA_PVRTC_2BPPV1_Format,

};

const TYPE_MAP = {

	[ Ae ]: FloatType$1,
	[ de ]: FloatType$1,
	[ ye ]: FloatType$1,

	[ ue ]: HalfFloatType,
	[ ae ]: HalfFloatType,
	[ te ]: HalfFloatType,

	[ Et ]: UnsignedByteType,
	[ Ft ]: UnsignedByteType,
	[ dt ]: UnsignedByteType,
	[ xt ]: UnsignedByteType,
	[ gt ]: UnsignedByteType,
	[ ht ]: UnsignedByteType,

	[ He ]: UnsignedInt5999Type,
	[ We ]: UnsignedInt101111Type,

	[ xn ]: UnsignedByteType,
	[ pn ]: UnsignedByteType,
	[ yn ]: UnsignedByteType,
	[ bn ]: UnsignedByteType,
	[ mn ]: UnsignedByteType,
	[ dn ]: UnsignedByteType,

	[ _i ]: HalfFloatType,
	[ wn ]: UnsignedByteType,
	[ Dn ]: UnsignedByteType,
	[ yi ]: HalfFloatType,
	[ Cn ]: UnsignedByteType,
	[ Vn ]: UnsignedByteType,

	[ Ze ]: UnsignedByteType,
	[ Qe ]: UnsignedByteType,
	[ Je ]: UnsignedByteType,
	[ qe ]: UnsignedByteType,

	[ nn ]: UnsignedByteType,
	[ en ]: UnsignedByteType,

	[ an ]: UnsignedByteType,
	[ sn ]: UnsignedByteType,

	[ on ]: UnsignedByteType,
	[ rn ]: UnsignedByteType,

	[ Un ]: UnsignedByteType,
	[ cn ]: UnsignedByteType,

	[ Ui ]: UnsignedByteType,
	[ oi ]: UnsignedByteType,
	[ ci ]: UnsignedByteType,
	[ ri ]: UnsignedByteType,

};

async function createRawTexture( container ) {

	const { vkFormat } = container;

	if ( FORMAT_MAP[ vkFormat ] === undefined ) {

		throw new Error( 'THREE.KTX2Loader: Unsupported vkFormat: ' + vkFormat );

	}

	// TODO: Merge the TYPE_MAP warning into the thrown error above, after r190.
	if ( TYPE_MAP[ vkFormat ] === undefined ) {

		console.warn( 'THREE.KTX2Loader: Missing ".type" for vkFormat: ' + vkFormat );

	}

	//

	let zstd;

	if ( container.supercompressionScheme === n ) {

		if ( ! _zstd ) {

			_zstd = new Promise( async ( resolve ) => {

				const zstd = new Q();
				await zstd.init();
				resolve( zstd );

			} );

		}

		zstd = await _zstd;

	}

	//

	const mipmaps = [];

	for ( let levelIndex = 0; levelIndex < container.levels.length; levelIndex ++ ) {

		const levelWidth = Math.max( 1, container.pixelWidth >> levelIndex );
		const levelHeight = Math.max( 1, container.pixelHeight >> levelIndex );
		const levelDepth = container.pixelDepth ? Math.max( 1, container.pixelDepth >> levelIndex ) : 0;

		const level = container.levels[ levelIndex ];

		let levelData;

		if ( container.supercompressionScheme === t ) {

			levelData = level.levelData;

		} else if ( container.supercompressionScheme === n ) {

			levelData = zstd.decode( level.levelData, level.uncompressedByteLength );

		} else {

			throw new Error( 'THREE.KTX2Loader: Unsupported supercompressionScheme.' );

		}

		let data;

		if ( TYPE_MAP[ vkFormat ] === FloatType$1 ) {

			data = new Float32Array(

				levelData.buffer,
				levelData.byteOffset,
				levelData.byteLength / Float32Array.BYTES_PER_ELEMENT

			);

		} else if ( TYPE_MAP[ vkFormat ] === HalfFloatType ) {

			data = new Uint16Array(

				levelData.buffer,
				levelData.byteOffset,
				levelData.byteLength / Uint16Array.BYTES_PER_ELEMENT

			);

		} else if ( TYPE_MAP[ vkFormat ] === UnsignedInt5999Type || TYPE_MAP[ vkFormat ] === UnsignedInt101111Type ) {

			data = new Uint32Array(

				levelData.buffer,
				levelData.byteOffset,
				levelData.byteLength / Uint32Array.BYTES_PER_ELEMENT

			);

		} else {

			data = levelData;

		}

		mipmaps.push( {

			data: data,
			width: levelWidth,
			height: levelHeight,
			depth: levelDepth,

		} );

	}

	// levelCount = 0 implies runtime-generated mipmaps.
	const useMipmaps = container.levelCount === 0 || mipmaps.length > 1;

	let texture;

	if ( UNCOMPRESSED_FORMATS.has( FORMAT_MAP[ vkFormat ] ) ) {

		texture = container.pixelDepth === 0
			? new DataTexture$1( mipmaps[ 0 ].data, container.pixelWidth, container.pixelHeight )
			: new Data3DTexture( mipmaps[ 0 ].data, container.pixelWidth, container.pixelHeight, container.pixelDepth );
		texture.minFilter = useMipmaps ? NearestMipmapNearestFilter : NearestFilter;
		texture.magFilter = NearestFilter;
		texture.generateMipmaps = container.levelCount === 0;

	} else {

		if ( container.pixelDepth > 0 ) throw new Error( 'THREE.KTX2Loader: Unsupported pixelDepth.' );

		texture = new CompressedTexture( mipmaps, container.pixelWidth, container.pixelHeight );
		texture.minFilter = useMipmaps ? LinearMipmapLinearFilter : LinearFilter$1;
		texture.magFilter = LinearFilter$1;

	}

	texture.mipmaps = mipmaps;

	texture.type = TYPE_MAP[ vkFormat ];
	texture.format = FORMAT_MAP[ vkFormat ];
	texture.colorSpace = parseColorSpace( container );
	texture.needsUpdate = true;

	//

	return Promise.resolve( texture );

}

function parseColorSpace( container ) {

	const dfd = container.dataFormatDescriptor[ 0 ];

	if ( dfd.colorPrimaries === E ) {

		return dfd.transferFunction === y ? SRGBColorSpace$1 : LinearSRGBColorSpace;

	} else if ( dfd.colorPrimaries === X ) {

		return dfd.transferFunction === y ? DisplayP3ColorSpace : LinearDisplayP3ColorSpace;

	} else if ( dfd.colorPrimaries === S ) {

		return NoColorSpace;

	} else {

		console.warn( `THREE.KTX2Loader: Unsupported color primaries, "${ dfd.colorPrimaries }"` );
		return NoColorSpace;

	}

}

const {Texture: Texture$1,LinearFilter,Color: Color$1,InstancedBufferGeometry,Sphere,Box3,InstancedBufferAttribute,PlaneGeometry: PlaneGeometry$1,Vector2: Vector2$1,Vector4: Vector4$1,Matrix3,Mesh: Mesh$1,MeshBasicMaterial,DoubleSide: DoubleSide$1,Matrix4,Vector3: Vector3$1,DataTexture,RGBAFormat,FloatType,DynamicDrawUsage} = await importShared('three');
/*!
Custom build of Typr.ts (https://github.com/fredli74/Typr.ts) for use in Troika text rendering.
Original MIT license applies: https://github.com/fredli74/Typr.ts/blob/master/LICENSE
*/
function typrFactory() {
  return "undefined" == typeof window && (self.window = self), (function(r) {
    var e = { parse: function(r2) {
      var t2 = e._bin, a2 = new Uint8Array(r2);
      if ("ttcf" == t2.readASCII(a2, 0, 4)) {
        var n = 4;
        t2.readUshort(a2, n), n += 2, t2.readUshort(a2, n), n += 2;
        var o = t2.readUint(a2, n);
        n += 4;
        for (var s = [], i = 0; i < o; i++) {
          var h = t2.readUint(a2, n);
          n += 4, s.push(e._readFont(a2, h));
        }
        return s;
      }
      return [e._readFont(a2, 0)];
    }, _readFont: function(r2, t2) {
      var a2 = e._bin, n = t2;
      a2.readFixed(r2, t2), t2 += 4;
      var o = a2.readUshort(r2, t2);
      t2 += 2, a2.readUshort(r2, t2), t2 += 2, a2.readUshort(r2, t2), t2 += 2, a2.readUshort(r2, t2), t2 += 2;
      for (var s = ["cmap", "head", "hhea", "maxp", "hmtx", "name", "OS/2", "post", "loca", "glyf", "kern", "CFF ", "GDEF", "GPOS", "GSUB", "SVG "], i = { _data: r2, _offset: n }, h = {}, d = 0; d < o; d++) {
        var f = a2.readASCII(r2, t2, 4);
        t2 += 4, a2.readUint(r2, t2), t2 += 4;
        var u = a2.readUint(r2, t2);
        t2 += 4;
        var l = a2.readUint(r2, t2);
        t2 += 4, h[f] = { offset: u, length: l };
      }
      for (d = 0; d < s.length; d++) {
        var v = s[d];
        h[v] && (i[v.trim()] = e[v.trim()].parse(r2, h[v].offset, h[v].length, i));
      }
      return i;
    }, _tabOffset: function(r2, t2, a2) {
      for (var n = e._bin, o = n.readUshort(r2, a2 + 4), s = a2 + 12, i = 0; i < o; i++) {
        var h = n.readASCII(r2, s, 4);
        s += 4, n.readUint(r2, s), s += 4;
        var d = n.readUint(r2, s);
        if (s += 4, n.readUint(r2, s), s += 4, h == t2) return d;
      }
      return 0;
    } };
    e._bin = { readFixed: function(r2, e2) {
      return (r2[e2] << 8 | r2[e2 + 1]) + (r2[e2 + 2] << 8 | r2[e2 + 3]) / 65540;
    }, readF2dot14: function(r2, t2) {
      return e._bin.readShort(r2, t2) / 16384;
    }, readInt: function(r2, t2) {
      return e._bin._view(r2).getInt32(t2);
    }, readInt8: function(r2, t2) {
      return e._bin._view(r2).getInt8(t2);
    }, readShort: function(r2, t2) {
      return e._bin._view(r2).getInt16(t2);
    }, readUshort: function(r2, t2) {
      return e._bin._view(r2).getUint16(t2);
    }, readUshorts: function(r2, t2, a2) {
      for (var n = [], o = 0; o < a2; o++) n.push(e._bin.readUshort(r2, t2 + 2 * o));
      return n;
    }, readUint: function(r2, t2) {
      return e._bin._view(r2).getUint32(t2);
    }, readUint64: function(r2, t2) {
      return 4294967296 * e._bin.readUint(r2, t2) + e._bin.readUint(r2, t2 + 4);
    }, readASCII: function(r2, e2, t2) {
      for (var a2 = "", n = 0; n < t2; n++) a2 += String.fromCharCode(r2[e2 + n]);
      return a2;
    }, readUnicode: function(r2, e2, t2) {
      for (var a2 = "", n = 0; n < t2; n++) {
        var o = r2[e2++] << 8 | r2[e2++];
        a2 += String.fromCharCode(o);
      }
      return a2;
    }, _tdec: "undefined" != typeof window && window.TextDecoder ? new window.TextDecoder() : null, readUTF8: function(r2, t2, a2) {
      var n = e._bin._tdec;
      return n && 0 == t2 && a2 == r2.length ? n.decode(r2) : e._bin.readASCII(r2, t2, a2);
    }, readBytes: function(r2, e2, t2) {
      for (var a2 = [], n = 0; n < t2; n++) a2.push(r2[e2 + n]);
      return a2;
    }, readASCIIArray: function(r2, e2, t2) {
      for (var a2 = [], n = 0; n < t2; n++) a2.push(String.fromCharCode(r2[e2 + n]));
      return a2;
    }, _view: function(r2) {
      return r2._dataView || (r2._dataView = r2.buffer ? new DataView(r2.buffer, r2.byteOffset, r2.byteLength) : new DataView(new Uint8Array(r2).buffer));
    } }, e._lctf = {}, e._lctf.parse = function(r2, t2, a2, n, o) {
      var s = e._bin, i = {}, h = t2;
      s.readFixed(r2, t2), t2 += 4;
      var d = s.readUshort(r2, t2);
      t2 += 2;
      var f = s.readUshort(r2, t2);
      t2 += 2;
      var u = s.readUshort(r2, t2);
      return t2 += 2, i.scriptList = e._lctf.readScriptList(r2, h + d), i.featureList = e._lctf.readFeatureList(r2, h + f), i.lookupList = e._lctf.readLookupList(r2, h + u, o), i;
    }, e._lctf.readLookupList = function(r2, t2, a2) {
      var n = e._bin, o = t2, s = [], i = n.readUshort(r2, t2);
      t2 += 2;
      for (var h = 0; h < i; h++) {
        var d = n.readUshort(r2, t2);
        t2 += 2;
        var f = e._lctf.readLookupTable(r2, o + d, a2);
        s.push(f);
      }
      return s;
    }, e._lctf.readLookupTable = function(r2, t2, a2) {
      var n = e._bin, o = t2, s = { tabs: [] };
      s.ltype = n.readUshort(r2, t2), t2 += 2, s.flag = n.readUshort(r2, t2), t2 += 2;
      var i = n.readUshort(r2, t2);
      t2 += 2;
      for (var h = s.ltype, d = 0; d < i; d++) {
        var f = n.readUshort(r2, t2);
        t2 += 2;
        var u = a2(r2, h, o + f, s);
        s.tabs.push(u);
      }
      return s;
    }, e._lctf.numOfOnes = function(r2) {
      for (var e2 = 0, t2 = 0; t2 < 32; t2++) 0 != (r2 >>> t2 & 1) && e2++;
      return e2;
    }, e._lctf.readClassDef = function(r2, t2) {
      var a2 = e._bin, n = [], o = a2.readUshort(r2, t2);
      if (t2 += 2, 1 == o) {
        var s = a2.readUshort(r2, t2);
        t2 += 2;
        var i = a2.readUshort(r2, t2);
        t2 += 2;
        for (var h = 0; h < i; h++) n.push(s + h), n.push(s + h), n.push(a2.readUshort(r2, t2)), t2 += 2;
      }
      if (2 == o) {
        var d = a2.readUshort(r2, t2);
        t2 += 2;
        for (h = 0; h < d; h++) n.push(a2.readUshort(r2, t2)), t2 += 2, n.push(a2.readUshort(r2, t2)), t2 += 2, n.push(a2.readUshort(r2, t2)), t2 += 2;
      }
      return n;
    }, e._lctf.getInterval = function(r2, e2) {
      for (var t2 = 0; t2 < r2.length; t2 += 3) {
        var a2 = r2[t2], n = r2[t2 + 1];
        if (r2[t2 + 2], a2 <= e2 && e2 <= n) return t2;
      }
      return -1;
    }, e._lctf.readCoverage = function(r2, t2) {
      var a2 = e._bin, n = {};
      n.fmt = a2.readUshort(r2, t2), t2 += 2;
      var o = a2.readUshort(r2, t2);
      return t2 += 2, 1 == n.fmt && (n.tab = a2.readUshorts(r2, t2, o)), 2 == n.fmt && (n.tab = a2.readUshorts(r2, t2, 3 * o)), n;
    }, e._lctf.coverageIndex = function(r2, t2) {
      var a2 = r2.tab;
      if (1 == r2.fmt) return a2.indexOf(t2);
      if (2 == r2.fmt) {
        var n = e._lctf.getInterval(a2, t2);
        if (-1 != n) return a2[n + 2] + (t2 - a2[n]);
      }
      return -1;
    }, e._lctf.readFeatureList = function(r2, t2) {
      var a2 = e._bin, n = t2, o = [], s = a2.readUshort(r2, t2);
      t2 += 2;
      for (var i = 0; i < s; i++) {
        var h = a2.readASCII(r2, t2, 4);
        t2 += 4;
        var d = a2.readUshort(r2, t2);
        t2 += 2;
        var f = e._lctf.readFeatureTable(r2, n + d);
        f.tag = h.trim(), o.push(f);
      }
      return o;
    }, e._lctf.readFeatureTable = function(r2, t2) {
      var a2 = e._bin, n = t2, o = {}, s = a2.readUshort(r2, t2);
      t2 += 2, s > 0 && (o.featureParams = n + s);
      var i = a2.readUshort(r2, t2);
      t2 += 2, o.tab = [];
      for (var h = 0; h < i; h++) o.tab.push(a2.readUshort(r2, t2 + 2 * h));
      return o;
    }, e._lctf.readScriptList = function(r2, t2) {
      var a2 = e._bin, n = t2, o = {}, s = a2.readUshort(r2, t2);
      t2 += 2;
      for (var i = 0; i < s; i++) {
        var h = a2.readASCII(r2, t2, 4);
        t2 += 4;
        var d = a2.readUshort(r2, t2);
        t2 += 2, o[h.trim()] = e._lctf.readScriptTable(r2, n + d);
      }
      return o;
    }, e._lctf.readScriptTable = function(r2, t2) {
      var a2 = e._bin, n = t2, o = {}, s = a2.readUshort(r2, t2);
      t2 += 2, s > 0 && (o.default = e._lctf.readLangSysTable(r2, n + s));
      var i = a2.readUshort(r2, t2);
      t2 += 2;
      for (var h = 0; h < i; h++) {
        var d = a2.readASCII(r2, t2, 4);
        t2 += 4;
        var f = a2.readUshort(r2, t2);
        t2 += 2, o[d.trim()] = e._lctf.readLangSysTable(r2, n + f);
      }
      return o;
    }, e._lctf.readLangSysTable = function(r2, t2) {
      var a2 = e._bin, n = {};
      a2.readUshort(r2, t2), t2 += 2, n.reqFeature = a2.readUshort(r2, t2), t2 += 2;
      var o = a2.readUshort(r2, t2);
      return t2 += 2, n.features = a2.readUshorts(r2, t2, o), n;
    }, e.CFF = {}, e.CFF.parse = function(r2, t2, a2) {
      var n = e._bin;
      (r2 = new Uint8Array(r2.buffer, t2, a2))[t2 = 0], r2[++t2], r2[++t2], r2[++t2], t2++;
      var o = [];
      t2 = e.CFF.readIndex(r2, t2, o);
      for (var s = [], i = 0; i < o.length - 1; i++) s.push(n.readASCII(r2, t2 + o[i], o[i + 1] - o[i]));
      t2 += o[o.length - 1];
      var h = [];
      t2 = e.CFF.readIndex(r2, t2, h);
      var d = [];
      for (i = 0; i < h.length - 1; i++) d.push(e.CFF.readDict(r2, t2 + h[i], t2 + h[i + 1]));
      t2 += h[h.length - 1];
      var f = d[0], u = [];
      t2 = e.CFF.readIndex(r2, t2, u);
      var l = [];
      for (i = 0; i < u.length - 1; i++) l.push(n.readASCII(r2, t2 + u[i], u[i + 1] - u[i]));
      if (t2 += u[u.length - 1], e.CFF.readSubrs(r2, t2, f), f.CharStrings) {
        t2 = f.CharStrings;
        u = [];
        t2 = e.CFF.readIndex(r2, t2, u);
        var v = [];
        for (i = 0; i < u.length - 1; i++) v.push(n.readBytes(r2, t2 + u[i], u[i + 1] - u[i]));
        f.CharStrings = v;
      }
      if (f.ROS) {
        t2 = f.FDArray;
        var c = [];
        t2 = e.CFF.readIndex(r2, t2, c), f.FDArray = [];
        for (i = 0; i < c.length - 1; i++) {
          var p = e.CFF.readDict(r2, t2 + c[i], t2 + c[i + 1]);
          e.CFF._readFDict(r2, p, l), f.FDArray.push(p);
        }
        t2 += c[c.length - 1], t2 = f.FDSelect, f.FDSelect = [];
        var U = r2[t2];
        if (t2++, 3 != U) throw U;
        var g = n.readUshort(r2, t2);
        t2 += 2;
        for (i = 0; i < g + 1; i++) f.FDSelect.push(n.readUshort(r2, t2), r2[t2 + 2]), t2 += 3;
      }
      return f.Encoding && (f.Encoding = e.CFF.readEncoding(r2, f.Encoding, f.CharStrings.length)), f.charset && (f.charset = e.CFF.readCharset(r2, f.charset, f.CharStrings.length)), e.CFF._readFDict(r2, f, l), f;
    }, e.CFF._readFDict = function(r2, t2, a2) {
      var n;
      for (var o in t2.Private && (n = t2.Private[1], t2.Private = e.CFF.readDict(r2, n, n + t2.Private[0]), t2.Private.Subrs && e.CFF.readSubrs(r2, n + t2.Private.Subrs, t2.Private)), t2) -1 != ["FamilyName", "FontName", "FullName", "Notice", "version", "Copyright"].indexOf(o) && (t2[o] = a2[t2[o] - 426 + 35]);
    }, e.CFF.readSubrs = function(r2, t2, a2) {
      var n = e._bin, o = [];
      t2 = e.CFF.readIndex(r2, t2, o);
      var s, i = o.length;
      s = i < 1240 ? 107 : i < 33900 ? 1131 : 32768, a2.Bias = s, a2.Subrs = [];
      for (var h = 0; h < o.length - 1; h++) a2.Subrs.push(n.readBytes(r2, t2 + o[h], o[h + 1] - o[h]));
    }, e.CFF.tableSE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 0, 111, 112, 113, 114, 0, 115, 116, 117, 118, 119, 120, 121, 122, 0, 123, 0, 124, 125, 126, 127, 128, 129, 130, 131, 0, 132, 133, 0, 134, 135, 136, 137, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 138, 0, 139, 0, 0, 0, 0, 140, 141, 142, 143, 0, 0, 0, 0, 0, 144, 0, 0, 0, 145, 0, 0, 146, 147, 148, 149, 0, 0, 0, 0], e.CFF.glyphByUnicode = function(r2, e2) {
      for (var t2 = 0; t2 < r2.charset.length; t2++) if (r2.charset[t2] == e2) return t2;
      return -1;
    }, e.CFF.glyphBySE = function(r2, t2) {
      return t2 < 0 || t2 > 255 ? -1 : e.CFF.glyphByUnicode(r2, e.CFF.tableSE[t2]);
    }, e.CFF.readEncoding = function(r2, t2, a2) {
      e._bin;
      var n = [".notdef"], o = r2[t2];
      if (t2++, 0 != o) throw "error: unknown encoding format: " + o;
      var s = r2[t2];
      t2++;
      for (var i = 0; i < s; i++) n.push(r2[t2 + i]);
      return n;
    }, e.CFF.readCharset = function(r2, t2, a2) {
      var n = e._bin, o = [".notdef"], s = r2[t2];
      if (t2++, 0 == s) for (var i = 0; i < a2; i++) {
        var h = n.readUshort(r2, t2);
        t2 += 2, o.push(h);
      }
      else {
        if (1 != s && 2 != s) throw "error: format: " + s;
        for (; o.length < a2; ) {
          h = n.readUshort(r2, t2);
          t2 += 2;
          var d = 0;
          1 == s ? (d = r2[t2], t2++) : (d = n.readUshort(r2, t2), t2 += 2);
          for (i = 0; i <= d; i++) o.push(h), h++;
        }
      }
      return o;
    }, e.CFF.readIndex = function(r2, t2, a2) {
      var n = e._bin, o = n.readUshort(r2, t2) + 1, s = r2[t2 += 2];
      if (t2++, 1 == s) for (var i = 0; i < o; i++) a2.push(r2[t2 + i]);
      else if (2 == s) for (i = 0; i < o; i++) a2.push(n.readUshort(r2, t2 + 2 * i));
      else if (3 == s) for (i = 0; i < o; i++) a2.push(16777215 & n.readUint(r2, t2 + 3 * i - 1));
      else if (1 != o) throw "unsupported offset size: " + s + ", count: " + o;
      return (t2 += o * s) - 1;
    }, e.CFF.getCharString = function(r2, t2, a2) {
      var n = e._bin, o = r2[t2], s = r2[t2 + 1];
      r2[t2 + 2], r2[t2 + 3], r2[t2 + 4];
      var i = 1, h = null, d = null;
      o <= 20 && (h = o, i = 1), 12 == o && (h = 100 * o + s, i = 2), 21 <= o && o <= 27 && (h = o, i = 1), 28 == o && (d = n.readShort(r2, t2 + 1), i = 3), 29 <= o && o <= 31 && (h = o, i = 1), 32 <= o && o <= 246 && (d = o - 139, i = 1), 247 <= o && o <= 250 && (d = 256 * (o - 247) + s + 108, i = 2), 251 <= o && o <= 254 && (d = 256 * -(o - 251) - s - 108, i = 2), 255 == o && (d = n.readInt(r2, t2 + 1) / 65535, i = 5), a2.val = null != d ? d : "o" + h, a2.size = i;
    }, e.CFF.readCharString = function(r2, t2, a2) {
      for (var n = t2 + a2, o = e._bin, s = []; t2 < n; ) {
        var i = r2[t2], h = r2[t2 + 1];
        r2[t2 + 2], r2[t2 + 3], r2[t2 + 4];
        var d = 1, f = null, u = null;
        i <= 20 && (f = i, d = 1), 12 == i && (f = 100 * i + h, d = 2), 19 != i && 20 != i || (f = i, d = 2), 21 <= i && i <= 27 && (f = i, d = 1), 28 == i && (u = o.readShort(r2, t2 + 1), d = 3), 29 <= i && i <= 31 && (f = i, d = 1), 32 <= i && i <= 246 && (u = i - 139, d = 1), 247 <= i && i <= 250 && (u = 256 * (i - 247) + h + 108, d = 2), 251 <= i && i <= 254 && (u = 256 * -(i - 251) - h - 108, d = 2), 255 == i && (u = o.readInt(r2, t2 + 1) / 65535, d = 5), s.push(null != u ? u : "o" + f), t2 += d;
      }
      return s;
    }, e.CFF.readDict = function(r2, t2, a2) {
      for (var n = e._bin, o = {}, s = []; t2 < a2; ) {
        var i = r2[t2], h = r2[t2 + 1];
        r2[t2 + 2], r2[t2 + 3], r2[t2 + 4];
        var d = 1, f = null, u = null;
        if (28 == i && (u = n.readShort(r2, t2 + 1), d = 3), 29 == i && (u = n.readInt(r2, t2 + 1), d = 5), 32 <= i && i <= 246 && (u = i - 139, d = 1), 247 <= i && i <= 250 && (u = 256 * (i - 247) + h + 108, d = 2), 251 <= i && i <= 254 && (u = 256 * -(i - 251) - h - 108, d = 2), 255 == i) throw u = n.readInt(r2, t2 + 1) / 65535, d = 5, "unknown number";
        if (30 == i) {
          var l = [];
          for (d = 1; ; ) {
            var v = r2[t2 + d];
            d++;
            var c = v >> 4, p = 15 & v;
            if (15 != c && l.push(c), 15 != p && l.push(p), 15 == p) break;
          }
          for (var U = "", g = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, ".", "e", "e-", "reserved", "-", "endOfNumber"], S = 0; S < l.length; S++) U += g[l[S]];
          u = parseFloat(U);
        }
        if (i <= 21) {
          if (f = ["version", "Notice", "FullName", "FamilyName", "Weight", "FontBBox", "BlueValues", "OtherBlues", "FamilyBlues", "FamilyOtherBlues", "StdHW", "StdVW", "escape", "UniqueID", "XUID", "charset", "Encoding", "CharStrings", "Private", "Subrs", "defaultWidthX", "nominalWidthX"][i], d = 1, 12 == i) f = ["Copyright", "isFixedPitch", "ItalicAngle", "UnderlinePosition", "UnderlineThickness", "PaintType", "CharstringType", "FontMatrix", "StrokeWidth", "BlueScale", "BlueShift", "BlueFuzz", "StemSnapH", "StemSnapV", "ForceBold", 0, 0, "LanguageGroup", "ExpansionFactor", "initialRandomSeed", "SyntheticBase", "PostScript", "BaseFontName", "BaseFontBlend", 0, 0, 0, 0, 0, 0, "ROS", "CIDFontVersion", "CIDFontRevision", "CIDFontType", "CIDCount", "UIDBase", "FDArray", "FDSelect", "FontName"][h], d = 2;
        }
        null != f ? (o[f] = 1 == s.length ? s[0] : s, s = []) : s.push(u), t2 += d;
      }
      return o;
    }, e.cmap = {}, e.cmap.parse = function(r2, t2, a2) {
      r2 = new Uint8Array(r2.buffer, t2, a2), t2 = 0;
      var n = e._bin, o = {};
      n.readUshort(r2, t2), t2 += 2;
      var s = n.readUshort(r2, t2);
      t2 += 2;
      var i = [];
      o.tables = [];
      for (var h = 0; h < s; h++) {
        var d = n.readUshort(r2, t2);
        t2 += 2;
        var f = n.readUshort(r2, t2);
        t2 += 2;
        var u = n.readUint(r2, t2);
        t2 += 4;
        var l = "p" + d + "e" + f, v = i.indexOf(u);
        if (-1 == v) {
          var c;
          v = o.tables.length, i.push(u);
          var p = n.readUshort(r2, u);
          0 == p ? c = e.cmap.parse0(r2, u) : 4 == p ? c = e.cmap.parse4(r2, u) : 6 == p ? c = e.cmap.parse6(r2, u) : 12 == p ? c = e.cmap.parse12(r2, u) : console.debug("unknown format: " + p, d, f, u), o.tables.push(c);
        }
        if (null != o[l]) throw "multiple tables for one platform+encoding";
        o[l] = v;
      }
      return o;
    }, e.cmap.parse0 = function(r2, t2) {
      var a2 = e._bin, n = {};
      n.format = a2.readUshort(r2, t2), t2 += 2;
      var o = a2.readUshort(r2, t2);
      t2 += 2, a2.readUshort(r2, t2), t2 += 2, n.map = [];
      for (var s = 0; s < o - 6; s++) n.map.push(r2[t2 + s]);
      return n;
    }, e.cmap.parse4 = function(r2, t2) {
      var a2 = e._bin, n = t2, o = {};
      o.format = a2.readUshort(r2, t2), t2 += 2;
      var s = a2.readUshort(r2, t2);
      t2 += 2, a2.readUshort(r2, t2), t2 += 2;
      var i = a2.readUshort(r2, t2);
      t2 += 2;
      var h = i / 2;
      o.searchRange = a2.readUshort(r2, t2), t2 += 2, o.entrySelector = a2.readUshort(r2, t2), t2 += 2, o.rangeShift = a2.readUshort(r2, t2), t2 += 2, o.endCount = a2.readUshorts(r2, t2, h), t2 += 2 * h, t2 += 2, o.startCount = a2.readUshorts(r2, t2, h), t2 += 2 * h, o.idDelta = [];
      for (var d = 0; d < h; d++) o.idDelta.push(a2.readShort(r2, t2)), t2 += 2;
      for (o.idRangeOffset = a2.readUshorts(r2, t2, h), t2 += 2 * h, o.glyphIdArray = []; t2 < n + s; ) o.glyphIdArray.push(a2.readUshort(r2, t2)), t2 += 2;
      return o;
    }, e.cmap.parse6 = function(r2, t2) {
      var a2 = e._bin, n = {};
      n.format = a2.readUshort(r2, t2), t2 += 2, a2.readUshort(r2, t2), t2 += 2, a2.readUshort(r2, t2), t2 += 2, n.firstCode = a2.readUshort(r2, t2), t2 += 2;
      var o = a2.readUshort(r2, t2);
      t2 += 2, n.glyphIdArray = [];
      for (var s = 0; s < o; s++) n.glyphIdArray.push(a2.readUshort(r2, t2)), t2 += 2;
      return n;
    }, e.cmap.parse12 = function(r2, t2) {
      var a2 = e._bin, n = {};
      n.format = a2.readUshort(r2, t2), t2 += 2, t2 += 2, a2.readUint(r2, t2), t2 += 4, a2.readUint(r2, t2), t2 += 4;
      var o = a2.readUint(r2, t2);
      t2 += 4, n.groups = [];
      for (var s = 0; s < o; s++) {
        var i = t2 + 12 * s, h = a2.readUint(r2, i + 0), d = a2.readUint(r2, i + 4), f = a2.readUint(r2, i + 8);
        n.groups.push([h, d, f]);
      }
      return n;
    }, e.glyf = {}, e.glyf.parse = function(r2, e2, t2, a2) {
      for (var n = [], o = 0; o < a2.maxp.numGlyphs; o++) n.push(null);
      return n;
    }, e.glyf._parseGlyf = function(r2, t2) {
      var a2 = e._bin, n = r2._data, o = e._tabOffset(n, "glyf", r2._offset) + r2.loca[t2];
      if (r2.loca[t2] == r2.loca[t2 + 1]) return null;
      var s = {};
      if (s.noc = a2.readShort(n, o), o += 2, s.xMin = a2.readShort(n, o), o += 2, s.yMin = a2.readShort(n, o), o += 2, s.xMax = a2.readShort(n, o), o += 2, s.yMax = a2.readShort(n, o), o += 2, s.xMin >= s.xMax || s.yMin >= s.yMax) return null;
      if (s.noc > 0) {
        s.endPts = [];
        for (var i = 0; i < s.noc; i++) s.endPts.push(a2.readUshort(n, o)), o += 2;
        var h = a2.readUshort(n, o);
        if (o += 2, n.length - o < h) return null;
        s.instructions = a2.readBytes(n, o, h), o += h;
        var d = s.endPts[s.noc - 1] + 1;
        s.flags = [];
        for (i = 0; i < d; i++) {
          var f = n[o];
          if (o++, s.flags.push(f), 0 != (8 & f)) {
            var u = n[o];
            o++;
            for (var l = 0; l < u; l++) s.flags.push(f), i++;
          }
        }
        s.xs = [];
        for (i = 0; i < d; i++) {
          var v = 0 != (2 & s.flags[i]), c = 0 != (16 & s.flags[i]);
          v ? (s.xs.push(c ? n[o] : -n[o]), o++) : c ? s.xs.push(0) : (s.xs.push(a2.readShort(n, o)), o += 2);
        }
        s.ys = [];
        for (i = 0; i < d; i++) {
          v = 0 != (4 & s.flags[i]), c = 0 != (32 & s.flags[i]);
          v ? (s.ys.push(c ? n[o] : -n[o]), o++) : c ? s.ys.push(0) : (s.ys.push(a2.readShort(n, o)), o += 2);
        }
        var p = 0, U = 0;
        for (i = 0; i < d; i++) p += s.xs[i], U += s.ys[i], s.xs[i] = p, s.ys[i] = U;
      } else {
        var g;
        s.parts = [];
        do {
          g = a2.readUshort(n, o), o += 2;
          var S = { m: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, p1: -1, p2: -1 };
          if (s.parts.push(S), S.glyphIndex = a2.readUshort(n, o), o += 2, 1 & g) {
            var m = a2.readShort(n, o);
            o += 2;
            var b = a2.readShort(n, o);
            o += 2;
          } else {
            m = a2.readInt8(n, o);
            o++;
            b = a2.readInt8(n, o);
            o++;
          }
          2 & g ? (S.m.tx = m, S.m.ty = b) : (S.p1 = m, S.p2 = b), 8 & g ? (S.m.a = S.m.d = a2.readF2dot14(n, o), o += 2) : 64 & g ? (S.m.a = a2.readF2dot14(n, o), o += 2, S.m.d = a2.readF2dot14(n, o), o += 2) : 128 & g && (S.m.a = a2.readF2dot14(n, o), o += 2, S.m.b = a2.readF2dot14(n, o), o += 2, S.m.c = a2.readF2dot14(n, o), o += 2, S.m.d = a2.readF2dot14(n, o), o += 2);
        } while (32 & g);
        if (256 & g) {
          var y = a2.readUshort(n, o);
          o += 2, s.instr = [];
          for (i = 0; i < y; i++) s.instr.push(n[o]), o++;
        }
      }
      return s;
    }, e.GDEF = {}, e.GDEF.parse = function(r2, t2, a2, n) {
      var o = t2;
      t2 += 4;
      var s = e._bin.readUshort(r2, t2);
      return { glyphClassDef: 0 === s ? null : e._lctf.readClassDef(r2, o + s) };
    }, e.GPOS = {}, e.GPOS.parse = function(r2, t2, a2, n) {
      return e._lctf.parse(r2, t2, a2, n, e.GPOS.subt);
    }, e.GPOS.subt = function(r2, t2, a2, n) {
      var o = e._bin, s = a2, i = {};
      if (i.fmt = o.readUshort(r2, a2), a2 += 2, 1 == t2 || 2 == t2 || 3 == t2 || 7 == t2 || 8 == t2 && i.fmt <= 2) {
        var h = o.readUshort(r2, a2);
        a2 += 2, i.coverage = e._lctf.readCoverage(r2, h + s);
      }
      if (1 == t2 && 1 == i.fmt) {
        var d = o.readUshort(r2, a2);
        a2 += 2, 0 != d && (i.pos = e.GPOS.readValueRecord(r2, a2, d));
      } else if (2 == t2 && i.fmt >= 1 && i.fmt <= 2) {
        d = o.readUshort(r2, a2);
        a2 += 2;
        var f = o.readUshort(r2, a2);
        a2 += 2;
        var u = e._lctf.numOfOnes(d), l = e._lctf.numOfOnes(f);
        if (1 == i.fmt) {
          i.pairsets = [];
          var v = o.readUshort(r2, a2);
          a2 += 2;
          for (var c = 0; c < v; c++) {
            var p = s + o.readUshort(r2, a2);
            a2 += 2;
            var U = o.readUshort(r2, p);
            p += 2;
            for (var g = [], S = 0; S < U; S++) {
              var m = o.readUshort(r2, p);
              p += 2, 0 != d && (P = e.GPOS.readValueRecord(r2, p, d), p += 2 * u), 0 != f && (x = e.GPOS.readValueRecord(r2, p, f), p += 2 * l), g.push({ gid2: m, val1: P, val2: x });
            }
            i.pairsets.push(g);
          }
        }
        if (2 == i.fmt) {
          var b = o.readUshort(r2, a2);
          a2 += 2;
          var y = o.readUshort(r2, a2);
          a2 += 2;
          var F = o.readUshort(r2, a2);
          a2 += 2;
          var C = o.readUshort(r2, a2);
          a2 += 2, i.classDef1 = e._lctf.readClassDef(r2, s + b), i.classDef2 = e._lctf.readClassDef(r2, s + y), i.matrix = [];
          for (c = 0; c < F; c++) {
            var _ = [];
            for (S = 0; S < C; S++) {
              var P = null, x = null;
              0 != d && (P = e.GPOS.readValueRecord(r2, a2, d), a2 += 2 * u), 0 != f && (x = e.GPOS.readValueRecord(r2, a2, f), a2 += 2 * l), _.push({ val1: P, val2: x });
            }
            i.matrix.push(_);
          }
        }
      } else if (4 == t2 && 1 == i.fmt) i.markCoverage = e._lctf.readCoverage(r2, o.readUshort(r2, a2) + s), i.baseCoverage = e._lctf.readCoverage(r2, o.readUshort(r2, a2 + 2) + s), i.markClassCount = o.readUshort(r2, a2 + 4), i.markArray = e.GPOS.readMarkArray(r2, o.readUshort(r2, a2 + 6) + s), i.baseArray = e.GPOS.readBaseArray(r2, o.readUshort(r2, a2 + 8) + s, i.markClassCount);
      else if (6 == t2 && 1 == i.fmt) i.mark1Coverage = e._lctf.readCoverage(r2, o.readUshort(r2, a2) + s), i.mark2Coverage = e._lctf.readCoverage(r2, o.readUshort(r2, a2 + 2) + s), i.markClassCount = o.readUshort(r2, a2 + 4), i.mark1Array = e.GPOS.readMarkArray(r2, o.readUshort(r2, a2 + 6) + s), i.mark2Array = e.GPOS.readBaseArray(r2, o.readUshort(r2, a2 + 8) + s, i.markClassCount);
      else {
        if (9 == t2 && 1 == i.fmt) {
          var I = o.readUshort(r2, a2);
          a2 += 2;
          var w = o.readUint(r2, a2);
          if (a2 += 4, 9 == n.ltype) n.ltype = I;
          else if (n.ltype != I) throw "invalid extension substitution";
          return e.GPOS.subt(r2, n.ltype, s + w);
        }
        console.debug("unsupported GPOS table LookupType", t2, "format", i.fmt);
      }
      return i;
    }, e.GPOS.readValueRecord = function(r2, t2, a2) {
      var n = e._bin, o = [];
      return o.push(1 & a2 ? n.readShort(r2, t2) : 0), t2 += 1 & a2 ? 2 : 0, o.push(2 & a2 ? n.readShort(r2, t2) : 0), t2 += 2 & a2 ? 2 : 0, o.push(4 & a2 ? n.readShort(r2, t2) : 0), t2 += 4 & a2 ? 2 : 0, o.push(8 & a2 ? n.readShort(r2, t2) : 0), t2 += 8 & a2 ? 2 : 0, o;
    }, e.GPOS.readBaseArray = function(r2, t2, a2) {
      var n = e._bin, o = [], s = t2, i = n.readUshort(r2, t2);
      t2 += 2;
      for (var h = 0; h < i; h++) {
        for (var d = [], f = 0; f < a2; f++) d.push(e.GPOS.readAnchorRecord(r2, s + n.readUshort(r2, t2))), t2 += 2;
        o.push(d);
      }
      return o;
    }, e.GPOS.readMarkArray = function(r2, t2) {
      var a2 = e._bin, n = [], o = t2, s = a2.readUshort(r2, t2);
      t2 += 2;
      for (var i = 0; i < s; i++) {
        var h = e.GPOS.readAnchorRecord(r2, a2.readUshort(r2, t2 + 2) + o);
        h.markClass = a2.readUshort(r2, t2), n.push(h), t2 += 4;
      }
      return n;
    }, e.GPOS.readAnchorRecord = function(r2, t2) {
      var a2 = e._bin, n = {};
      return n.fmt = a2.readUshort(r2, t2), n.x = a2.readShort(r2, t2 + 2), n.y = a2.readShort(r2, t2 + 4), n;
    }, e.GSUB = {}, e.GSUB.parse = function(r2, t2, a2, n) {
      return e._lctf.parse(r2, t2, a2, n, e.GSUB.subt);
    }, e.GSUB.subt = function(r2, t2, a2, n) {
      var o = e._bin, s = a2, i = {};
      if (i.fmt = o.readUshort(r2, a2), a2 += 2, 1 != t2 && 2 != t2 && 4 != t2 && 5 != t2 && 6 != t2) return null;
      if (1 == t2 || 2 == t2 || 4 == t2 || 5 == t2 && i.fmt <= 2 || 6 == t2 && i.fmt <= 2) {
        var h = o.readUshort(r2, a2);
        a2 += 2, i.coverage = e._lctf.readCoverage(r2, s + h);
      }
      if (1 == t2 && i.fmt >= 1 && i.fmt <= 2) {
        if (1 == i.fmt) i.delta = o.readShort(r2, a2), a2 += 2;
        else if (2 == i.fmt) {
          var d = o.readUshort(r2, a2);
          a2 += 2, i.newg = o.readUshorts(r2, a2, d), a2 += 2 * i.newg.length;
        }
      } else if (2 == t2 && 1 == i.fmt) {
        d = o.readUshort(r2, a2);
        a2 += 2, i.seqs = [];
        for (var f = 0; f < d; f++) {
          var u = o.readUshort(r2, a2) + s;
          a2 += 2;
          var l = o.readUshort(r2, u);
          i.seqs.push(o.readUshorts(r2, u + 2, l));
        }
      } else if (4 == t2) {
        i.vals = [];
        d = o.readUshort(r2, a2);
        a2 += 2;
        for (f = 0; f < d; f++) {
          var v = o.readUshort(r2, a2);
          a2 += 2, i.vals.push(e.GSUB.readLigatureSet(r2, s + v));
        }
      } else if (5 == t2 && 2 == i.fmt) {
        if (2 == i.fmt) {
          var c = o.readUshort(r2, a2);
          a2 += 2, i.cDef = e._lctf.readClassDef(r2, s + c), i.scset = [];
          var p = o.readUshort(r2, a2);
          a2 += 2;
          for (f = 0; f < p; f++) {
            var U = o.readUshort(r2, a2);
            a2 += 2, i.scset.push(0 == U ? null : e.GSUB.readSubClassSet(r2, s + U));
          }
        }
      } else if (6 == t2 && 3 == i.fmt) {
        if (3 == i.fmt) {
          for (f = 0; f < 3; f++) {
            d = o.readUshort(r2, a2);
            a2 += 2;
            for (var g = [], S = 0; S < d; S++) g.push(e._lctf.readCoverage(r2, s + o.readUshort(r2, a2 + 2 * S)));
            a2 += 2 * d, 0 == f && (i.backCvg = g), 1 == f && (i.inptCvg = g), 2 == f && (i.ahedCvg = g);
          }
          d = o.readUshort(r2, a2);
          a2 += 2, i.lookupRec = e.GSUB.readSubstLookupRecords(r2, a2, d);
        }
      } else {
        if (7 == t2 && 1 == i.fmt) {
          var m = o.readUshort(r2, a2);
          a2 += 2;
          var b = o.readUint(r2, a2);
          if (a2 += 4, 9 == n.ltype) n.ltype = m;
          else if (n.ltype != m) throw "invalid extension substitution";
          return e.GSUB.subt(r2, n.ltype, s + b);
        }
        console.debug("unsupported GSUB table LookupType", t2, "format", i.fmt);
      }
      return i;
    }, e.GSUB.readSubClassSet = function(r2, t2) {
      var a2 = e._bin.readUshort, n = t2, o = [], s = a2(r2, t2);
      t2 += 2;
      for (var i = 0; i < s; i++) {
        var h = a2(r2, t2);
        t2 += 2, o.push(e.GSUB.readSubClassRule(r2, n + h));
      }
      return o;
    }, e.GSUB.readSubClassRule = function(r2, t2) {
      var a2 = e._bin.readUshort, n = {}, o = a2(r2, t2), s = a2(r2, t2 += 2);
      t2 += 2, n.input = [];
      for (var i = 0; i < o - 1; i++) n.input.push(a2(r2, t2)), t2 += 2;
      return n.substLookupRecords = e.GSUB.readSubstLookupRecords(r2, t2, s), n;
    }, e.GSUB.readSubstLookupRecords = function(r2, t2, a2) {
      for (var n = e._bin.readUshort, o = [], s = 0; s < a2; s++) o.push(n(r2, t2), n(r2, t2 + 2)), t2 += 4;
      return o;
    }, e.GSUB.readChainSubClassSet = function(r2, t2) {
      var a2 = e._bin, n = t2, o = [], s = a2.readUshort(r2, t2);
      t2 += 2;
      for (var i = 0; i < s; i++) {
        var h = a2.readUshort(r2, t2);
        t2 += 2, o.push(e.GSUB.readChainSubClassRule(r2, n + h));
      }
      return o;
    }, e.GSUB.readChainSubClassRule = function(r2, t2) {
      for (var a2 = e._bin, n = {}, o = ["backtrack", "input", "lookahead"], s = 0; s < o.length; s++) {
        var i = a2.readUshort(r2, t2);
        t2 += 2, 1 == s && i--, n[o[s]] = a2.readUshorts(r2, t2, i), t2 += 2 * n[o[s]].length;
      }
      i = a2.readUshort(r2, t2);
      return t2 += 2, n.subst = a2.readUshorts(r2, t2, 2 * i), t2 += 2 * n.subst.length, n;
    }, e.GSUB.readLigatureSet = function(r2, t2) {
      var a2 = e._bin, n = t2, o = [], s = a2.readUshort(r2, t2);
      t2 += 2;
      for (var i = 0; i < s; i++) {
        var h = a2.readUshort(r2, t2);
        t2 += 2, o.push(e.GSUB.readLigature(r2, n + h));
      }
      return o;
    }, e.GSUB.readLigature = function(r2, t2) {
      var a2 = e._bin, n = { chain: [] };
      n.nglyph = a2.readUshort(r2, t2), t2 += 2;
      var o = a2.readUshort(r2, t2);
      t2 += 2;
      for (var s = 0; s < o - 1; s++) n.chain.push(a2.readUshort(r2, t2)), t2 += 2;
      return n;
    }, e.head = {}, e.head.parse = function(r2, t2, a2) {
      var n = e._bin, o = {};
      return n.readFixed(r2, t2), t2 += 4, o.fontRevision = n.readFixed(r2, t2), t2 += 4, n.readUint(r2, t2), t2 += 4, n.readUint(r2, t2), t2 += 4, o.flags = n.readUshort(r2, t2), t2 += 2, o.unitsPerEm = n.readUshort(r2, t2), t2 += 2, o.created = n.readUint64(r2, t2), t2 += 8, o.modified = n.readUint64(r2, t2), t2 += 8, o.xMin = n.readShort(r2, t2), t2 += 2, o.yMin = n.readShort(r2, t2), t2 += 2, o.xMax = n.readShort(r2, t2), t2 += 2, o.yMax = n.readShort(r2, t2), t2 += 2, o.macStyle = n.readUshort(r2, t2), t2 += 2, o.lowestRecPPEM = n.readUshort(r2, t2), t2 += 2, o.fontDirectionHint = n.readShort(r2, t2), t2 += 2, o.indexToLocFormat = n.readShort(r2, t2), t2 += 2, o.glyphDataFormat = n.readShort(r2, t2), t2 += 2, o;
    }, e.hhea = {}, e.hhea.parse = function(r2, t2, a2) {
      var n = e._bin, o = {};
      return n.readFixed(r2, t2), t2 += 4, o.ascender = n.readShort(r2, t2), t2 += 2, o.descender = n.readShort(r2, t2), t2 += 2, o.lineGap = n.readShort(r2, t2), t2 += 2, o.advanceWidthMax = n.readUshort(r2, t2), t2 += 2, o.minLeftSideBearing = n.readShort(r2, t2), t2 += 2, o.minRightSideBearing = n.readShort(r2, t2), t2 += 2, o.xMaxExtent = n.readShort(r2, t2), t2 += 2, o.caretSlopeRise = n.readShort(r2, t2), t2 += 2, o.caretSlopeRun = n.readShort(r2, t2), t2 += 2, o.caretOffset = n.readShort(r2, t2), t2 += 2, t2 += 8, o.metricDataFormat = n.readShort(r2, t2), t2 += 2, o.numberOfHMetrics = n.readUshort(r2, t2), t2 += 2, o;
    }, e.hmtx = {}, e.hmtx.parse = function(r2, t2, a2, n) {
      for (var o = e._bin, s = { aWidth: [], lsBearing: [] }, i = 0, h = 0, d = 0; d < n.maxp.numGlyphs; d++) d < n.hhea.numberOfHMetrics && (i = o.readUshort(r2, t2), t2 += 2, h = o.readShort(r2, t2), t2 += 2), s.aWidth.push(i), s.lsBearing.push(h);
      return s;
    }, e.kern = {}, e.kern.parse = function(r2, t2, a2, n) {
      var o = e._bin, s = o.readUshort(r2, t2);
      if (t2 += 2, 1 == s) return e.kern.parseV1(r2, t2 - 2, a2, n);
      var i = o.readUshort(r2, t2);
      t2 += 2;
      for (var h = { glyph1: [], rval: [] }, d = 0; d < i; d++) {
        t2 += 2;
        a2 = o.readUshort(r2, t2);
        t2 += 2;
        var f = o.readUshort(r2, t2);
        t2 += 2;
        var u = f >>> 8;
        if (0 != (u &= 15)) throw "unknown kern table format: " + u;
        t2 = e.kern.readFormat0(r2, t2, h);
      }
      return h;
    }, e.kern.parseV1 = function(r2, t2, a2, n) {
      var o = e._bin;
      o.readFixed(r2, t2), t2 += 4;
      var s = o.readUint(r2, t2);
      t2 += 4;
      for (var i = { glyph1: [], rval: [] }, h = 0; h < s; h++) {
        o.readUint(r2, t2), t2 += 4;
        var d = o.readUshort(r2, t2);
        t2 += 2, o.readUshort(r2, t2), t2 += 2;
        var f = d >>> 8;
        if (0 != (f &= 15)) throw "unknown kern table format: " + f;
        t2 = e.kern.readFormat0(r2, t2, i);
      }
      return i;
    }, e.kern.readFormat0 = function(r2, t2, a2) {
      var n = e._bin, o = -1, s = n.readUshort(r2, t2);
      t2 += 2, n.readUshort(r2, t2), t2 += 2, n.readUshort(r2, t2), t2 += 2, n.readUshort(r2, t2), t2 += 2;
      for (var i = 0; i < s; i++) {
        var h = n.readUshort(r2, t2);
        t2 += 2;
        var d = n.readUshort(r2, t2);
        t2 += 2;
        var f = n.readShort(r2, t2);
        t2 += 2, h != o && (a2.glyph1.push(h), a2.rval.push({ glyph2: [], vals: [] }));
        var u = a2.rval[a2.rval.length - 1];
        u.glyph2.push(d), u.vals.push(f), o = h;
      }
      return t2;
    }, e.loca = {}, e.loca.parse = function(r2, t2, a2, n) {
      var o = e._bin, s = [], i = n.head.indexToLocFormat, h = n.maxp.numGlyphs + 1;
      if (0 == i) for (var d = 0; d < h; d++) s.push(o.readUshort(r2, t2 + (d << 1)) << 1);
      if (1 == i) for (d = 0; d < h; d++) s.push(o.readUint(r2, t2 + (d << 2)));
      return s;
    }, e.maxp = {}, e.maxp.parse = function(r2, t2, a2) {
      var n = e._bin, o = {}, s = n.readUint(r2, t2);
      return t2 += 4, o.numGlyphs = n.readUshort(r2, t2), t2 += 2, 65536 == s && (o.maxPoints = n.readUshort(r2, t2), t2 += 2, o.maxContours = n.readUshort(r2, t2), t2 += 2, o.maxCompositePoints = n.readUshort(r2, t2), t2 += 2, o.maxCompositeContours = n.readUshort(r2, t2), t2 += 2, o.maxZones = n.readUshort(r2, t2), t2 += 2, o.maxTwilightPoints = n.readUshort(r2, t2), t2 += 2, o.maxStorage = n.readUshort(r2, t2), t2 += 2, o.maxFunctionDefs = n.readUshort(r2, t2), t2 += 2, o.maxInstructionDefs = n.readUshort(r2, t2), t2 += 2, o.maxStackElements = n.readUshort(r2, t2), t2 += 2, o.maxSizeOfInstructions = n.readUshort(r2, t2), t2 += 2, o.maxComponentElements = n.readUshort(r2, t2), t2 += 2, o.maxComponentDepth = n.readUshort(r2, t2), t2 += 2), o;
    }, e.name = {}, e.name.parse = function(r2, t2, a2) {
      var n = e._bin, o = {};
      n.readUshort(r2, t2), t2 += 2;
      var s = n.readUshort(r2, t2);
      t2 += 2, n.readUshort(r2, t2);
      for (var i, h = ["copyright", "fontFamily", "fontSubfamily", "ID", "fullName", "version", "postScriptName", "trademark", "manufacturer", "designer", "description", "urlVendor", "urlDesigner", "licence", "licenceURL", "---", "typoFamilyName", "typoSubfamilyName", "compatibleFull", "sampleText", "postScriptCID", "wwsFamilyName", "wwsSubfamilyName", "lightPalette", "darkPalette"], d = t2 += 2, f = 0; f < s; f++) {
        var u = n.readUshort(r2, t2);
        t2 += 2;
        var l = n.readUshort(r2, t2);
        t2 += 2;
        var v = n.readUshort(r2, t2);
        t2 += 2;
        var c = n.readUshort(r2, t2);
        t2 += 2;
        var p = n.readUshort(r2, t2);
        t2 += 2;
        var U = n.readUshort(r2, t2);
        t2 += 2;
        var g, S = h[c], m = d + 12 * s + U;
        if (0 == u) g = n.readUnicode(r2, m, p / 2);
        else if (3 == u && 0 == l) g = n.readUnicode(r2, m, p / 2);
        else if (0 == l) g = n.readASCII(r2, m, p);
        else if (1 == l) g = n.readUnicode(r2, m, p / 2);
        else if (3 == l) g = n.readUnicode(r2, m, p / 2);
        else {
          if (1 != u) throw "unknown encoding " + l + ", platformID: " + u;
          g = n.readASCII(r2, m, p), console.debug("reading unknown MAC encoding " + l + " as ASCII");
        }
        var b = "p" + u + "," + v.toString(16);
        null == o[b] && (o[b] = {}), o[b][void 0 !== S ? S : c] = g, o[b]._lang = v;
      }
      for (var y in o) if (null != o[y].postScriptName && 1033 == o[y]._lang) return o[y];
      for (var y in o) if (null != o[y].postScriptName && 0 == o[y]._lang) return o[y];
      for (var y in o) if (null != o[y].postScriptName && 3084 == o[y]._lang) return o[y];
      for (var y in o) if (null != o[y].postScriptName) return o[y];
      for (var y in o) {
        i = y;
        break;
      }
      return console.debug("returning name table with languageID " + o[i]._lang), o[i];
    }, e["OS/2"] = {}, e["OS/2"].parse = function(r2, t2, a2) {
      var n = e._bin.readUshort(r2, t2);
      t2 += 2;
      var o = {};
      if (0 == n) e["OS/2"].version0(r2, t2, o);
      else if (1 == n) e["OS/2"].version1(r2, t2, o);
      else if (2 == n || 3 == n || 4 == n) e["OS/2"].version2(r2, t2, o);
      else {
        if (5 != n) throw "unknown OS/2 table version: " + n;
        e["OS/2"].version5(r2, t2, o);
      }
      return o;
    }, e["OS/2"].version0 = function(r2, t2, a2) {
      var n = e._bin;
      return a2.xAvgCharWidth = n.readShort(r2, t2), t2 += 2, a2.usWeightClass = n.readUshort(r2, t2), t2 += 2, a2.usWidthClass = n.readUshort(r2, t2), t2 += 2, a2.fsType = n.readUshort(r2, t2), t2 += 2, a2.ySubscriptXSize = n.readShort(r2, t2), t2 += 2, a2.ySubscriptYSize = n.readShort(r2, t2), t2 += 2, a2.ySubscriptXOffset = n.readShort(r2, t2), t2 += 2, a2.ySubscriptYOffset = n.readShort(r2, t2), t2 += 2, a2.ySuperscriptXSize = n.readShort(r2, t2), t2 += 2, a2.ySuperscriptYSize = n.readShort(r2, t2), t2 += 2, a2.ySuperscriptXOffset = n.readShort(r2, t2), t2 += 2, a2.ySuperscriptYOffset = n.readShort(r2, t2), t2 += 2, a2.yStrikeoutSize = n.readShort(r2, t2), t2 += 2, a2.yStrikeoutPosition = n.readShort(r2, t2), t2 += 2, a2.sFamilyClass = n.readShort(r2, t2), t2 += 2, a2.panose = n.readBytes(r2, t2, 10), t2 += 10, a2.ulUnicodeRange1 = n.readUint(r2, t2), t2 += 4, a2.ulUnicodeRange2 = n.readUint(r2, t2), t2 += 4, a2.ulUnicodeRange3 = n.readUint(r2, t2), t2 += 4, a2.ulUnicodeRange4 = n.readUint(r2, t2), t2 += 4, a2.achVendID = [n.readInt8(r2, t2), n.readInt8(r2, t2 + 1), n.readInt8(r2, t2 + 2), n.readInt8(r2, t2 + 3)], t2 += 4, a2.fsSelection = n.readUshort(r2, t2), t2 += 2, a2.usFirstCharIndex = n.readUshort(r2, t2), t2 += 2, a2.usLastCharIndex = n.readUshort(r2, t2), t2 += 2, a2.sTypoAscender = n.readShort(r2, t2), t2 += 2, a2.sTypoDescender = n.readShort(r2, t2), t2 += 2, a2.sTypoLineGap = n.readShort(r2, t2), t2 += 2, a2.usWinAscent = n.readUshort(r2, t2), t2 += 2, a2.usWinDescent = n.readUshort(r2, t2), t2 += 2;
    }, e["OS/2"].version1 = function(r2, t2, a2) {
      var n = e._bin;
      return t2 = e["OS/2"].version0(r2, t2, a2), a2.ulCodePageRange1 = n.readUint(r2, t2), t2 += 4, a2.ulCodePageRange2 = n.readUint(r2, t2), t2 += 4;
    }, e["OS/2"].version2 = function(r2, t2, a2) {
      var n = e._bin;
      return t2 = e["OS/2"].version1(r2, t2, a2), a2.sxHeight = n.readShort(r2, t2), t2 += 2, a2.sCapHeight = n.readShort(r2, t2), t2 += 2, a2.usDefault = n.readUshort(r2, t2), t2 += 2, a2.usBreak = n.readUshort(r2, t2), t2 += 2, a2.usMaxContext = n.readUshort(r2, t2), t2 += 2;
    }, e["OS/2"].version5 = function(r2, t2, a2) {
      var n = e._bin;
      return t2 = e["OS/2"].version2(r2, t2, a2), a2.usLowerOpticalPointSize = n.readUshort(r2, t2), t2 += 2, a2.usUpperOpticalPointSize = n.readUshort(r2, t2), t2 += 2;
    }, e.post = {}, e.post.parse = function(r2, t2, a2) {
      var n = e._bin, o = {};
      return o.version = n.readFixed(r2, t2), t2 += 4, o.italicAngle = n.readFixed(r2, t2), t2 += 4, o.underlinePosition = n.readShort(r2, t2), t2 += 2, o.underlineThickness = n.readShort(r2, t2), t2 += 2, o;
    }, null == e && (e = {}), null == e.U && (e.U = {}), e.U.codeToGlyph = function(r2, e2) {
      var t2 = r2.cmap, a2 = -1;
      if (null != t2.p0e4 ? a2 = t2.p0e4 : null != t2.p3e1 ? a2 = t2.p3e1 : null != t2.p1e0 ? a2 = t2.p1e0 : null != t2.p0e3 && (a2 = t2.p0e3), -1 == a2) throw "no familiar platform and encoding!";
      var n = t2.tables[a2];
      if (0 == n.format) return e2 >= n.map.length ? 0 : n.map[e2];
      if (4 == n.format) {
        for (var o = -1, s = 0; s < n.endCount.length; s++) if (e2 <= n.endCount[s]) {
          o = s;
          break;
        }
        if (-1 == o) return 0;
        if (n.startCount[o] > e2) return 0;
        return 65535 & (0 != n.idRangeOffset[o] ? n.glyphIdArray[e2 - n.startCount[o] + (n.idRangeOffset[o] >> 1) - (n.idRangeOffset.length - o)] : e2 + n.idDelta[o]);
      }
      if (12 == n.format) {
        if (e2 > n.groups[n.groups.length - 1][1]) return 0;
        for (s = 0; s < n.groups.length; s++) {
          var i = n.groups[s];
          if (i[0] <= e2 && e2 <= i[1]) return i[2] + (e2 - i[0]);
        }
        return 0;
      }
      throw "unknown cmap table format " + n.format;
    }, e.U.glyphToPath = function(r2, t2) {
      var a2 = { cmds: [], crds: [] };
      if (r2.SVG && r2.SVG.entries[t2]) {
        var n = r2.SVG.entries[t2];
        return null == n ? a2 : ("string" == typeof n && (n = e.SVG.toPath(n), r2.SVG.entries[t2] = n), n);
      }
      if (r2.CFF) {
        var o = { x: 0, y: 0, stack: [], nStems: 0, haveWidth: false, width: r2.CFF.Private ? r2.CFF.Private.defaultWidthX : 0, open: false }, s = r2.CFF, i = r2.CFF.Private;
        if (s.ROS) {
          for (var h = 0; s.FDSelect[h + 2] <= t2; ) h += 2;
          i = s.FDArray[s.FDSelect[h + 1]].Private;
        }
        e.U._drawCFF(r2.CFF.CharStrings[t2], o, s, i, a2);
      } else r2.glyf && e.U._drawGlyf(t2, r2, a2);
      return a2;
    }, e.U._drawGlyf = function(r2, t2, a2) {
      var n = t2.glyf[r2];
      null == n && (n = t2.glyf[r2] = e.glyf._parseGlyf(t2, r2)), null != n && (n.noc > -1 ? e.U._simpleGlyph(n, a2) : e.U._compoGlyph(n, t2, a2));
    }, e.U._simpleGlyph = function(r2, t2) {
      for (var a2 = 0; a2 < r2.noc; a2++) {
        for (var n = 0 == a2 ? 0 : r2.endPts[a2 - 1] + 1, o = r2.endPts[a2], s = n; s <= o; s++) {
          var i = s == n ? o : s - 1, h = s == o ? n : s + 1, d = 1 & r2.flags[s], f = 1 & r2.flags[i], u = 1 & r2.flags[h], l = r2.xs[s], v = r2.ys[s];
          if (s == n) if (d) {
            if (!f) {
              e.U.P.moveTo(t2, l, v);
              continue;
            }
            e.U.P.moveTo(t2, r2.xs[i], r2.ys[i]);
          } else f ? e.U.P.moveTo(t2, r2.xs[i], r2.ys[i]) : e.U.P.moveTo(t2, (r2.xs[i] + l) / 2, (r2.ys[i] + v) / 2);
          d ? f && e.U.P.lineTo(t2, l, v) : u ? e.U.P.qcurveTo(t2, l, v, r2.xs[h], r2.ys[h]) : e.U.P.qcurveTo(t2, l, v, (l + r2.xs[h]) / 2, (v + r2.ys[h]) / 2);
        }
        e.U.P.closePath(t2);
      }
    }, e.U._compoGlyph = function(r2, t2, a2) {
      for (var n = 0; n < r2.parts.length; n++) {
        var o = { cmds: [], crds: [] }, s = r2.parts[n];
        e.U._drawGlyf(s.glyphIndex, t2, o);
        for (var i = s.m, h = 0; h < o.crds.length; h += 2) {
          var d = o.crds[h], f = o.crds[h + 1];
          a2.crds.push(d * i.a + f * i.b + i.tx), a2.crds.push(d * i.c + f * i.d + i.ty);
        }
        for (h = 0; h < o.cmds.length; h++) a2.cmds.push(o.cmds[h]);
      }
    }, e.U._getGlyphClass = function(r2, t2) {
      var a2 = e._lctf.getInterval(t2, r2);
      return -1 == a2 ? 0 : t2[a2 + 2];
    }, e.U._applySubs = function(r2, t2, a2, n) {
      for (var o = r2.length - t2 - 1, s = 0; s < a2.tabs.length; s++) if (null != a2.tabs[s]) {
        var i, h = a2.tabs[s];
        if (!h.coverage || -1 != (i = e._lctf.coverageIndex(h.coverage, r2[t2]))) {
          if (1 == a2.ltype) r2[t2], 1 == h.fmt ? r2[t2] = r2[t2] + h.delta : r2[t2] = h.newg[i];
          else if (4 == a2.ltype) for (var d = h.vals[i], f = 0; f < d.length; f++) {
            var u = d[f], l = u.chain.length;
            if (!(l > o)) {
              for (var v = true, c = 0, p = 0; p < l; p++) {
                for (; -1 == r2[t2 + c + (1 + p)]; ) c++;
                u.chain[p] != r2[t2 + c + (1 + p)] && (v = false);
              }
              if (v) {
                r2[t2] = u.nglyph;
                for (p = 0; p < l + c; p++) r2[t2 + p + 1] = -1;
                break;
              }
            }
          }
          else if (5 == a2.ltype && 2 == h.fmt) for (var U = e._lctf.getInterval(h.cDef, r2[t2]), g = h.cDef[U + 2], S = h.scset[g], m = 0; m < S.length; m++) {
            var b = S[m], y = b.input;
            if (!(y.length > o)) {
              for (v = true, p = 0; p < y.length; p++) {
                var F = e._lctf.getInterval(h.cDef, r2[t2 + 1 + p]);
                if (-1 == U && h.cDef[F + 2] != y[p]) {
                  v = false;
                  break;
                }
              }
              if (v) {
                var C = b.substLookupRecords;
                for (f = 0; f < C.length; f += 2) C[f], C[f + 1];
              }
            }
          }
          else if (6 == a2.ltype && 3 == h.fmt) {
            if (!e.U._glsCovered(r2, h.backCvg, t2 - h.backCvg.length)) continue;
            if (!e.U._glsCovered(r2, h.inptCvg, t2)) continue;
            if (!e.U._glsCovered(r2, h.ahedCvg, t2 + h.inptCvg.length)) continue;
            var _ = h.lookupRec;
            for (m = 0; m < _.length; m += 2) {
              U = _[m];
              var P = n[_[m + 1]];
              e.U._applySubs(r2, t2 + U, P, n);
            }
          }
        }
      }
    }, e.U._glsCovered = function(r2, t2, a2) {
      for (var n = 0; n < t2.length; n++) {
        if (-1 == e._lctf.coverageIndex(t2[n], r2[a2 + n])) return false;
      }
      return true;
    }, e.U.glyphsToPath = function(r2, t2, a2) {
      for (var n = { cmds: [], crds: [] }, o = 0, s = 0; s < t2.length; s++) {
        var i = t2[s];
        if (-1 != i) {
          for (var h = s < t2.length - 1 && -1 != t2[s + 1] ? t2[s + 1] : 0, d = e.U.glyphToPath(r2, i), f = 0; f < d.crds.length; f += 2) n.crds.push(d.crds[f] + o), n.crds.push(d.crds[f + 1]);
          a2 && n.cmds.push(a2);
          for (f = 0; f < d.cmds.length; f++) n.cmds.push(d.cmds[f]);
          a2 && n.cmds.push("X"), o += r2.hmtx.aWidth[i], s < t2.length - 1 && (o += e.U.getPairAdjustment(r2, i, h));
        }
      }
      return n;
    }, e.U.P = {}, e.U.P.moveTo = function(r2, e2, t2) {
      r2.cmds.push("M"), r2.crds.push(e2, t2);
    }, e.U.P.lineTo = function(r2, e2, t2) {
      r2.cmds.push("L"), r2.crds.push(e2, t2);
    }, e.U.P.curveTo = function(r2, e2, t2, a2, n, o, s) {
      r2.cmds.push("C"), r2.crds.push(e2, t2, a2, n, o, s);
    }, e.U.P.qcurveTo = function(r2, e2, t2, a2, n) {
      r2.cmds.push("Q"), r2.crds.push(e2, t2, a2, n);
    }, e.U.P.closePath = function(r2) {
      r2.cmds.push("Z");
    }, e.U._drawCFF = function(r2, t2, a2, n, o) {
      for (var s = t2.stack, i = t2.nStems, h = t2.haveWidth, d = t2.width, f = t2.open, u = 0, l = t2.x, v = t2.y, c = 0, p = 0, U = 0, g = 0, S = 0, m = 0, b = 0, y = 0, F = 0, C = 0, _ = { val: 0, size: 0 }; u < r2.length; ) {
        e.CFF.getCharString(r2, u, _);
        var P = _.val;
        if (u += _.size, "o1" == P || "o18" == P) s.length % 2 != 0 && !h && (d = s.shift() + n.nominalWidthX), i += s.length >> 1, s.length = 0, h = true;
        else if ("o3" == P || "o23" == P) {
          s.length % 2 != 0 && !h && (d = s.shift() + n.nominalWidthX), i += s.length >> 1, s.length = 0, h = true;
        } else if ("o4" == P) s.length > 1 && !h && (d = s.shift() + n.nominalWidthX, h = true), f && e.U.P.closePath(o), v += s.pop(), e.U.P.moveTo(o, l, v), f = true;
        else if ("o5" == P) for (; s.length > 0; ) l += s.shift(), v += s.shift(), e.U.P.lineTo(o, l, v);
        else if ("o6" == P || "o7" == P) for (var x = s.length, I = "o6" == P, w = 0; w < x; w++) {
          var k = s.shift();
          I ? l += k : v += k, I = !I, e.U.P.lineTo(o, l, v);
        }
        else if ("o8" == P || "o24" == P) {
          x = s.length;
          for (var G = 0; G + 6 <= x; ) c = l + s.shift(), p = v + s.shift(), U = c + s.shift(), g = p + s.shift(), l = U + s.shift(), v = g + s.shift(), e.U.P.curveTo(o, c, p, U, g, l, v), G += 6;
          "o24" == P && (l += s.shift(), v += s.shift(), e.U.P.lineTo(o, l, v));
        } else {
          if ("o11" == P) break;
          if ("o1234" == P || "o1235" == P || "o1236" == P || "o1237" == P) "o1234" == P && (p = v, U = (c = l + s.shift()) + s.shift(), C = g = p + s.shift(), m = g, y = v, l = (b = (S = (F = U + s.shift()) + s.shift()) + s.shift()) + s.shift(), e.U.P.curveTo(o, c, p, U, g, F, C), e.U.P.curveTo(o, S, m, b, y, l, v)), "o1235" == P && (c = l + s.shift(), p = v + s.shift(), U = c + s.shift(), g = p + s.shift(), F = U + s.shift(), C = g + s.shift(), S = F + s.shift(), m = C + s.shift(), b = S + s.shift(), y = m + s.shift(), l = b + s.shift(), v = y + s.shift(), s.shift(), e.U.P.curveTo(o, c, p, U, g, F, C), e.U.P.curveTo(o, S, m, b, y, l, v)), "o1236" == P && (c = l + s.shift(), p = v + s.shift(), U = c + s.shift(), C = g = p + s.shift(), m = g, b = (S = (F = U + s.shift()) + s.shift()) + s.shift(), y = m + s.shift(), l = b + s.shift(), e.U.P.curveTo(o, c, p, U, g, F, C), e.U.P.curveTo(o, S, m, b, y, l, v)), "o1237" == P && (c = l + s.shift(), p = v + s.shift(), U = c + s.shift(), g = p + s.shift(), F = U + s.shift(), C = g + s.shift(), S = F + s.shift(), m = C + s.shift(), b = S + s.shift(), y = m + s.shift(), Math.abs(b - l) > Math.abs(y - v) ? l = b + s.shift() : v = y + s.shift(), e.U.P.curveTo(o, c, p, U, g, F, C), e.U.P.curveTo(o, S, m, b, y, l, v));
          else if ("o14" == P) {
            if (s.length > 0 && !h && (d = s.shift() + a2.nominalWidthX, h = true), 4 == s.length) {
              var O = s.shift(), T = s.shift(), D = s.shift(), B = s.shift(), A = e.CFF.glyphBySE(a2, D), R = e.CFF.glyphBySE(a2, B);
              e.U._drawCFF(a2.CharStrings[A], t2, a2, n, o), t2.x = O, t2.y = T, e.U._drawCFF(a2.CharStrings[R], t2, a2, n, o);
            }
            f && (e.U.P.closePath(o), f = false);
          } else if ("o19" == P || "o20" == P) {
            s.length % 2 != 0 && !h && (d = s.shift() + n.nominalWidthX), i += s.length >> 1, s.length = 0, h = true, u += i + 7 >> 3;
          } else if ("o21" == P) s.length > 2 && !h && (d = s.shift() + n.nominalWidthX, h = true), v += s.pop(), l += s.pop(), f && e.U.P.closePath(o), e.U.P.moveTo(o, l, v), f = true;
          else if ("o22" == P) s.length > 1 && !h && (d = s.shift() + n.nominalWidthX, h = true), l += s.pop(), f && e.U.P.closePath(o), e.U.P.moveTo(o, l, v), f = true;
          else if ("o25" == P) {
            for (; s.length > 6; ) l += s.shift(), v += s.shift(), e.U.P.lineTo(o, l, v);
            c = l + s.shift(), p = v + s.shift(), U = c + s.shift(), g = p + s.shift(), l = U + s.shift(), v = g + s.shift(), e.U.P.curveTo(o, c, p, U, g, l, v);
          } else if ("o26" == P) for (s.length % 2 && (l += s.shift()); s.length > 0; ) c = l, p = v + s.shift(), l = U = c + s.shift(), v = (g = p + s.shift()) + s.shift(), e.U.P.curveTo(o, c, p, U, g, l, v);
          else if ("o27" == P) for (s.length % 2 && (v += s.shift()); s.length > 0; ) p = v, U = (c = l + s.shift()) + s.shift(), g = p + s.shift(), l = U + s.shift(), v = g, e.U.P.curveTo(o, c, p, U, g, l, v);
          else if ("o10" == P || "o29" == P) {
            var L = "o10" == P ? n : a2;
            if (0 == s.length) console.debug("error: empty stack");
            else {
              var W = s.pop(), M = L.Subrs[W + L.Bias];
              t2.x = l, t2.y = v, t2.nStems = i, t2.haveWidth = h, t2.width = d, t2.open = f, e.U._drawCFF(M, t2, a2, n, o), l = t2.x, v = t2.y, i = t2.nStems, h = t2.haveWidth, d = t2.width, f = t2.open;
            }
          } else if ("o30" == P || "o31" == P) {
            var V = s.length, E = (G = 0, "o31" == P);
            for (G += V - (x = -3 & V); G < x; ) E ? (p = v, U = (c = l + s.shift()) + s.shift(), v = (g = p + s.shift()) + s.shift(), x - G == 5 ? (l = U + s.shift(), G++) : l = U, E = false) : (c = l, p = v + s.shift(), U = c + s.shift(), g = p + s.shift(), l = U + s.shift(), x - G == 5 ? (v = g + s.shift(), G++) : v = g, E = true), e.U.P.curveTo(o, c, p, U, g, l, v), G += 4;
          } else {
            if ("o" == (P + "").charAt(0)) throw console.debug("Unknown operation: " + P, r2), P;
            s.push(P);
          }
        }
      }
      t2.x = l, t2.y = v, t2.nStems = i, t2.haveWidth = h, t2.width = d, t2.open = f;
    };
    var t = e, a = { Typr: t };
    return r.Typr = t, r.default = a, Object.defineProperty(r, "__esModule", { value: true }), r;
  })({}).Typr;
}
/*!
Custom bundle of woff2otf (https://github.com/arty-name/woff2otf) with fflate
(https://github.com/101arrowz/fflate) for use in Troika text rendering. 
Original licenses apply: 
- fflate: https://github.com/101arrowz/fflate/blob/master/LICENSE (MIT)
- woff2otf.js: https://github.com/arty-name/woff2otf/blob/master/woff2otf.js (Apache2)
*/
function woff2otfFactory() {
  return (function(r) {
    var e = Uint8Array, n = Uint16Array, t = Uint32Array, a = new e([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 0, 0, 0]), i = new e([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 0, 0]), o = new e([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]), f = function(r2, e2) {
      for (var a2 = new n(31), i2 = 0; i2 < 31; ++i2) a2[i2] = e2 += 1 << r2[i2 - 1];
      var o2 = new t(a2[30]);
      for (i2 = 1; i2 < 30; ++i2) for (var f2 = a2[i2]; f2 < a2[i2 + 1]; ++f2) o2[f2] = f2 - a2[i2] << 5 | i2;
      return [a2, o2];
    }, u = f(a, 2), v = u[0], s = u[1];
    v[28] = 258, s[258] = 28;
    for (var l = f(i, 0)[0], c = new n(32768), g = 0; g < 32768; ++g) {
      var h = (43690 & g) >>> 1 | (21845 & g) << 1;
      h = (61680 & (h = (52428 & h) >>> 2 | (13107 & h) << 2)) >>> 4 | (3855 & h) << 4, c[g] = ((65280 & h) >>> 8 | (255 & h) << 8) >>> 1;
    }
    var w = function(r2, e2, t2) {
      for (var a2 = r2.length, i2 = 0, o2 = new n(e2); i2 < a2; ++i2) ++o2[r2[i2] - 1];
      var f2, u2 = new n(e2);
      for (i2 = 0; i2 < e2; ++i2) u2[i2] = u2[i2 - 1] + o2[i2 - 1] << 1;
      {
        f2 = new n(1 << e2);
        var v2 = 15 - e2;
        for (i2 = 0; i2 < a2; ++i2) if (r2[i2]) for (var s2 = i2 << 4 | r2[i2], l2 = e2 - r2[i2], g2 = u2[r2[i2] - 1]++ << l2, h2 = g2 | (1 << l2) - 1; g2 <= h2; ++g2) f2[c[g2] >>> v2] = s2;
      }
      return f2;
    }, d = new e(288);
    for (g = 0; g < 144; ++g) d[g] = 8;
    for (g = 144; g < 256; ++g) d[g] = 9;
    for (g = 256; g < 280; ++g) d[g] = 7;
    for (g = 280; g < 288; ++g) d[g] = 8;
    var m = new e(32);
    for (g = 0; g < 32; ++g) m[g] = 5;
    var b = w(d, 9), p = w(m, 5), y = function(r2) {
      for (var e2 = r2[0], n2 = 1; n2 < r2.length; ++n2) r2[n2] > e2 && (e2 = r2[n2]);
      return e2;
    }, L = function(r2, e2, n2) {
      var t2 = e2 / 8 | 0;
      return (r2[t2] | r2[t2 + 1] << 8) >> (7 & e2) & n2;
    }, U = function(r2, e2) {
      var n2 = e2 / 8 | 0;
      return (r2[n2] | r2[n2 + 1] << 8 | r2[n2 + 2] << 16) >> (7 & e2);
    }, k = ["unexpected EOF", "invalid block type", "invalid length/literal", "invalid distance", "stream finished", "no stream handler", , "no callback", "invalid UTF-8 data", "extra field too long", "date not in range 1980-2099", "filename too long", "stream finishing", "invalid zip data"], T = function(r2, e2, n2) {
      var t2 = new Error(e2 || k[r2]);
      if (t2.code = r2, Error.captureStackTrace && Error.captureStackTrace(t2, T), !n2) throw t2;
      return t2;
    }, O = function(r2, f2, u2) {
      var s2 = r2.length;
      if (!s2 || u2 && !u2.l && s2 < 5) return f2 || new e(0);
      var c2 = !f2 || u2, g2 = !u2 || u2.i;
      u2 || (u2 = {}), f2 || (f2 = new e(3 * s2));
      var h2, d2 = function(r3) {
        var n2 = f2.length;
        if (r3 > n2) {
          var t2 = new e(Math.max(2 * n2, r3));
          t2.set(f2), f2 = t2;
        }
      }, m2 = u2.f || 0, k2 = u2.p || 0, O2 = u2.b || 0, A2 = u2.l, x2 = u2.d, E = u2.m, D = u2.n, M = 8 * s2;
      do {
        if (!A2) {
          u2.f = m2 = L(r2, k2, 1);
          var S = L(r2, k2 + 1, 3);
          if (k2 += 3, !S) {
            var V = r2[(I = ((h2 = k2) / 8 | 0) + (7 & h2 && 1) + 4) - 4] | r2[I - 3] << 8, _ = I + V;
            if (_ > s2) {
              g2 && T(0);
              break;
            }
            c2 && d2(O2 + V), f2.set(r2.subarray(I, _), O2), u2.b = O2 += V, u2.p = k2 = 8 * _;
            continue;
          }
          if (1 == S) A2 = b, x2 = p, E = 9, D = 5;
          else if (2 == S) {
            var j = L(r2, k2, 31) + 257, z = L(r2, k2 + 10, 15) + 4, C = j + L(r2, k2 + 5, 31) + 1;
            k2 += 14;
            for (var F = new e(C), P = new e(19), q = 0; q < z; ++q) P[o[q]] = L(r2, k2 + 3 * q, 7);
            k2 += 3 * z;
            var B = y(P), G = (1 << B) - 1, H = w(P, B);
            for (q = 0; q < C; ) {
              var I, J = H[L(r2, k2, G)];
              if (k2 += 15 & J, (I = J >>> 4) < 16) F[q++] = I;
              else {
                var K = 0, N = 0;
                for (16 == I ? (N = 3 + L(r2, k2, 3), k2 += 2, K = F[q - 1]) : 17 == I ? (N = 3 + L(r2, k2, 7), k2 += 3) : 18 == I && (N = 11 + L(r2, k2, 127), k2 += 7); N--; ) F[q++] = K;
              }
            }
            var Q = F.subarray(0, j), R = F.subarray(j);
            E = y(Q), D = y(R), A2 = w(Q, E), x2 = w(R, D);
          } else T(1);
          if (k2 > M) {
            g2 && T(0);
            break;
          }
        }
        c2 && d2(O2 + 131072);
        for (var W = (1 << E) - 1, X = (1 << D) - 1, Y = k2; ; Y = k2) {
          var Z = (K = A2[U(r2, k2) & W]) >>> 4;
          if ((k2 += 15 & K) > M) {
            g2 && T(0);
            break;
          }
          if (K || T(2), Z < 256) f2[O2++] = Z;
          else {
            if (256 == Z) {
              Y = k2, A2 = null;
              break;
            }
            var $ = Z - 254;
            if (Z > 264) {
              var rr = a[q = Z - 257];
              $ = L(r2, k2, (1 << rr) - 1) + v[q], k2 += rr;
            }
            var er = x2[U(r2, k2) & X], nr = er >>> 4;
            er || T(3), k2 += 15 & er;
            R = l[nr];
            if (nr > 3) {
              rr = i[nr];
              R += U(r2, k2) & (1 << rr) - 1, k2 += rr;
            }
            if (k2 > M) {
              g2 && T(0);
              break;
            }
            c2 && d2(O2 + 131072);
            for (var tr = O2 + $; O2 < tr; O2 += 4) f2[O2] = f2[O2 - R], f2[O2 + 1] = f2[O2 + 1 - R], f2[O2 + 2] = f2[O2 + 2 - R], f2[O2 + 3] = f2[O2 + 3 - R];
            O2 = tr;
          }
        }
        u2.l = A2, u2.p = Y, u2.b = O2, A2 && (m2 = 1, u2.m = E, u2.d = x2, u2.n = D);
      } while (!m2);
      return O2 == f2.length ? f2 : (function(r3, a2, i2) {
        (null == i2 || i2 > r3.length) && (i2 = r3.length);
        var o2 = new (r3 instanceof n ? n : r3 instanceof t ? t : e)(i2 - a2);
        return o2.set(r3.subarray(a2, i2)), o2;
      })(f2, 0, O2);
    }, A = new e(0);
    var x = "undefined" != typeof TextDecoder && new TextDecoder();
    try {
      x.decode(A, { stream: true }), 1;
    } catch (r2) {
    }
    return r.convert_streams = function(r2) {
      var e2 = new DataView(r2), n2 = 0;
      function t2() {
        var r3 = e2.getUint16(n2);
        return n2 += 2, r3;
      }
      function a2() {
        var r3 = e2.getUint32(n2);
        return n2 += 4, r3;
      }
      function i2(r3) {
        m2.setUint16(b2, r3), b2 += 2;
      }
      function o2(r3) {
        m2.setUint32(b2, r3), b2 += 4;
      }
      for (var f2 = { signature: a2(), flavor: a2(), length: a2(), numTables: t2(), reserved: t2(), totalSfntSize: a2(), majorVersion: t2(), minorVersion: t2(), metaOffset: a2(), metaLength: a2(), metaOrigLength: a2(), privOffset: a2(), privLength: a2() }, u2 = 0; Math.pow(2, u2) <= f2.numTables; ) u2++;
      u2--;
      for (var v2 = 16 * Math.pow(2, u2), s2 = 16 * f2.numTables - v2, l2 = 12, c2 = [], g2 = 0; g2 < f2.numTables; g2++) c2.push({ tag: a2(), offset: a2(), compLength: a2(), origLength: a2(), origChecksum: a2() }), l2 += 16;
      var h2, w2 = new Uint8Array(12 + 16 * c2.length + c2.reduce((function(r3, e3) {
        return r3 + e3.origLength + 4;
      }), 0)), d2 = w2.buffer, m2 = new DataView(d2), b2 = 0;
      return o2(f2.flavor), i2(f2.numTables), i2(v2), i2(u2), i2(s2), c2.forEach((function(r3) {
        o2(r3.tag), o2(r3.origChecksum), o2(l2), o2(r3.origLength), r3.outOffset = l2, (l2 += r3.origLength) % 4 != 0 && (l2 += 4 - l2 % 4);
      })), c2.forEach((function(e3) {
        var n3, t3 = r2.slice(e3.offset, e3.offset + e3.compLength);
        if (e3.compLength != e3.origLength) {
          var a3 = new Uint8Array(e3.origLength);
          n3 = new Uint8Array(t3, 2), O(n3, a3);
        } else a3 = new Uint8Array(t3);
        w2.set(a3, e3.outOffset);
        var i3 = 0;
        (l2 = e3.outOffset + e3.origLength) % 4 != 0 && (i3 = 4 - l2 % 4), w2.set(new Uint8Array(i3).buffer, e3.outOffset + e3.origLength), h2 = l2 + i3;
      })), d2.slice(0, h2);
    }, Object.defineProperty(r, "__esModule", { value: true }), r;
  })({}).convert_streams;
}
function parserFactory(Typr, woff2otf) {
  const cmdArgLengths = {
    M: 2,
    L: 2,
    Q: 4,
    C: 6,
    Z: 0
  };
  const joiningTypeRawData = { "C": "18g,ca,368,1kz", "D": "17k,6,2,2+4,5+c,2+6,2+1,10+1,9+f,j+11,2+1,a,2,2+1,15+2,3,j+2,6+3,2+8,2,2,2+1,w+a,4+e,3+3,2,3+2,3+5,23+w,2f+4,3,2+9,2,b,2+3,3,1k+9,6+1,3+1,2+2,2+d,30g,p+y,1,1+1g,f+x,2,sd2+1d,jf3+4,f+3,2+4,2+2,b+3,42,2,4+2,2+1,2,3,t+1,9f+w,2,el+2,2+g,d+2,2l,2+1,5,3+1,2+1,2,3,6,16wm+1v", "R": "17m+3,2,2,6+3,m,15+2,2+2,h+h,13,3+8,2,2,3+1,2,p+1,x,5+4,5,a,2,2,3,u,c+2,g+1,5,2+1,4+1,5j,6+1,2,b,2+2,f,2+1,1s+2,2,3+1,7,1ez0,2,2+1,4+4,b,4,3,b,42,2+2,4,3,2+1,2,o+3,ae,ep,x,2o+2,3+1,3,5+1,6", "L": "x9u,jff,a,fd,jv", "T": "4t,gj+33,7o+4,1+1,7c+18,2,2+1,2+1,2,21+a,2,1b+k,h,2u+6,3+5,3+1,2+3,y,2,v+q,2k+a,1n+8,a,p+3,2+8,2+2,2+4,18+2,3c+e,2+v,1k,2,5+7,5,4+6,b+1,u,1n,5+3,9,l+1,r,3+1,1m,5+1,5+1,3+2,4,v+1,4,c+1,1m,5+4,2+1,5,l+1,n+5,2,1n,3,2+3,9,8+1,c+1,v,1q,d,1f,4,1m+2,6+2,2+3,8+1,c+1,u,1n,3,7,6+1,l+1,t+1,1m+1,5+3,9,l+1,u,21,8+2,2,2j,3+6,d+7,2r,3+8,c+5,23+1,s,2,2,1k+d,2+4,2+1,6+a,2+z,a,2v+3,2+5,2+1,3+1,q+1,5+2,h+3,e,3+1,7,g,jk+2,qb+2,u+2,u+1,v+1,1t+1,2+6,9,3+a,a,1a+2,3c+1,z,3b+2,5+1,a,7+2,64+1,3,1n,2+6,2,2,3+7,7+9,3,1d+d,1,1+1,1s+3,1d,2+4,2,6,15+8,d+1,x+3,3+1,2+2,1l,2+1,4,2+2,1n+7,3+1,49+2,2+c,2+6,5,7,4+1,5j+1l,2+4,ek,3+1,r+4,1e+4,6+5,2p+c,1+3,1,1+2,1+b,2db+2,3y,2p+v,ff+3,30+1,n9x,1+2,2+9,x+1,29+1,7l,4,5,q+1,6,48+1,r+h,e,13+7,q+a,1b+2,1d,3+3,3+1,14,1w+5,3+1,3+1,d,9,1c,1g,2+2,3+1,6+1,2,17+1,9,6n,3,5,fn5,ki+f,h+f,5s,6y+2,ea,6b,46+4,1af+2,2+1,6+3,15+2,5,4m+1,fy+3,as+1,4a+a,4x,1j+e,1l+2,1e+3,3+1,1y+2,11+4,2+7,1r,d+1,1h+8,b+3,3,2o+2,3,2+1,7,4h,4+7,m+1,1m+1,4,12+6,4+4,5g+7,3+2,2,o,2d+5,2,5+1,2+1,6n+3,7+1,2+1,s+1,2e+7,3,2+1,2z,2,3+5,2,2u+2,3+3,2+4,78+8,2+1,75+1,2,5,41+3,3+1,5,x+9,15+5,3+3,9,a+5,3+2,1b+c,2+1,bb+6,2+5,2,2b+l,3+6,2+1,2+1,3f+5,4,2+1,2+6,2,21+1,4,2,9o+1,470+8,at4+4,1o+6,t5,1s+3,2a,f5l+1,2+3,43o+2,a+7,1+7,3+6,v+3,45+2,1j0+1i,5+1d,9,f,n+4,2+e,11t+6,2+g,3+6,2+1,2+4,7a+6,c6+3,15t+6,32+6,1,gzau,v+2n,3l+6n" };
  const JT_LEFT = 1, JT_RIGHT = 2, JT_DUAL = 4, JT_TRANSPARENT = 8, JT_JOIN_CAUSING = 16, JT_NON_JOINING = 32;
  let joiningTypeMap;
  function getCharJoiningType(ch) {
    if (!joiningTypeMap) {
      const m = {
        R: JT_RIGHT,
        L: JT_LEFT,
        D: JT_DUAL,
        C: JT_JOIN_CAUSING,
        U: JT_NON_JOINING,
        T: JT_TRANSPARENT
      };
      joiningTypeMap = /* @__PURE__ */ new Map();
      for (let type in joiningTypeRawData) {
        let lastCode = 0;
        joiningTypeRawData[type].split(",").forEach((range) => {
          let [skip, step] = range.split("+");
          skip = parseInt(skip, 36);
          step = step ? parseInt(step, 36) : 0;
          joiningTypeMap.set(lastCode += skip, m[type]);
          for (let i = step; i--; ) {
            joiningTypeMap.set(++lastCode, m[type]);
          }
        });
      }
    }
    return joiningTypeMap.get(ch) || JT_NON_JOINING;
  }
  const ISOL = 1, INIT = 2, FINA = 3, MEDI = 4;
  const formsToFeatures = [null, "isol", "init", "fina", "medi"];
  function detectJoiningForms(str) {
    const joiningForms = new Uint8Array(str.length);
    let prevJoiningType = JT_NON_JOINING;
    let prevForm = ISOL;
    let prevIndex = -1;
    for (let i = 0; i < str.length; i++) {
      const code = str.codePointAt(i);
      let joiningType = getCharJoiningType(code) | 0;
      let form = ISOL;
      if (joiningType & JT_TRANSPARENT) {
        continue;
      }
      if (prevJoiningType & (JT_LEFT | JT_DUAL | JT_JOIN_CAUSING)) {
        if (joiningType & (JT_RIGHT | JT_DUAL | JT_JOIN_CAUSING)) {
          form = FINA;
          if (prevForm === ISOL || prevForm === FINA) {
            joiningForms[prevIndex]++;
          }
        } else if (joiningType & (JT_LEFT | JT_NON_JOINING)) {
          if (prevForm === INIT || prevForm === MEDI) {
            joiningForms[prevIndex]--;
          }
        }
      } else if (prevJoiningType & (JT_RIGHT | JT_NON_JOINING)) {
        if (prevForm === INIT || prevForm === MEDI) {
          joiningForms[prevIndex]--;
        }
      }
      prevForm = joiningForms[i] = form;
      prevJoiningType = joiningType;
      prevIndex = i;
      if (code > 65535) i++;
    }
    return joiningForms;
  }
  function stringToGlyphs(font, str) {
    const glyphIds = [];
    for (let i = 0; i < str.length; i++) {
      const cc = str.codePointAt(i);
      if (cc > 65535) i++;
      glyphIds.push(Typr.U.codeToGlyph(font, cc));
    }
    const gsub = font["GSUB"];
    if (gsub) {
      const { lookupList, featureList } = gsub;
      let joiningForms;
      const supportedFeatures = /^(rlig|liga|mset|isol|init|fina|medi|half|pres|blws|ccmp)$/;
      const usedLookups = [];
      featureList.forEach((feature) => {
        if (supportedFeatures.test(feature.tag)) {
          for (let ti = 0; ti < feature.tab.length; ti++) {
            if (usedLookups[feature.tab[ti]]) continue;
            usedLookups[feature.tab[ti]] = true;
            const tab = lookupList[feature.tab[ti]];
            const isJoiningFeature = /^(isol|init|fina|medi)$/.test(feature.tag);
            if (isJoiningFeature && !joiningForms) {
              joiningForms = detectJoiningForms(str);
            }
            for (let ci = 0; ci < glyphIds.length; ci++) {
              if (!joiningForms || !isJoiningFeature || formsToFeatures[joiningForms[ci]] === feature.tag) {
                Typr.U._applySubs(glyphIds, ci, tab, lookupList);
              }
            }
          }
        }
      });
    }
    return glyphIds;
  }
  function calcGlyphPositions(font, glyphIds) {
    const positions = new Int16Array(glyphIds.length * 3);
    let glyphIndex = 0;
    for (; glyphIndex < glyphIds.length; glyphIndex++) {
      const glyphId = glyphIds[glyphIndex];
      if (glyphId === -1) continue;
      positions[glyphIndex * 3 + 2] = font.hmtx.aWidth[glyphId];
      const gpos = font.GPOS;
      if (gpos) {
        const llist = gpos.lookupList;
        for (let i = 0; i < llist.length; i++) {
          const lookup = llist[i];
          for (let j = 0; j < lookup.tabs.length; j++) {
            const tab = lookup.tabs[j];
            if (lookup.ltype === 1) {
              const ind = Typr._lctf.coverageIndex(tab.coverage, glyphId);
              if (ind !== -1 && tab.pos) {
                applyValueRecord(tab.pos, glyphIndex);
                break;
              }
            } else if (lookup.ltype === 2) {
              let adj = null;
              let prevGlyphIndex = getPrevGlyphIndex();
              if (prevGlyphIndex !== -1) {
                const coverageIndex = Typr._lctf.coverageIndex(tab.coverage, glyphIds[prevGlyphIndex]);
                if (coverageIndex !== -1) {
                  if (tab.fmt === 1) {
                    const right = tab.pairsets[coverageIndex];
                    for (let k = 0; k < right.length; k++) {
                      if (right[k].gid2 === glyphId) adj = right[k];
                    }
                  } else if (tab.fmt === 2) {
                    const c1 = Typr.U._getGlyphClass(glyphIds[prevGlyphIndex], tab.classDef1);
                    const c2 = Typr.U._getGlyphClass(glyphId, tab.classDef2);
                    adj = tab.matrix[c1][c2];
                  }
                  if (adj) {
                    if (adj.val1) applyValueRecord(adj.val1, prevGlyphIndex);
                    if (adj.val2) applyValueRecord(adj.val2, glyphIndex);
                    break;
                  }
                }
              }
            } else if (lookup.ltype === 4) {
              const markArrIndex = Typr._lctf.coverageIndex(tab.markCoverage, glyphId);
              if (markArrIndex !== -1) {
                const baseGlyphIndex = getPrevGlyphIndex(isBaseGlyph);
                const baseArrIndex = baseGlyphIndex === -1 ? -1 : Typr._lctf.coverageIndex(tab.baseCoverage, glyphIds[baseGlyphIndex]);
                if (baseArrIndex !== -1) {
                  const markRecord = tab.markArray[markArrIndex];
                  const baseAnchor = tab.baseArray[baseArrIndex][markRecord.markClass];
                  positions[glyphIndex * 3] = baseAnchor.x - markRecord.x + positions[baseGlyphIndex * 3] - positions[baseGlyphIndex * 3 + 2];
                  positions[glyphIndex * 3 + 1] = baseAnchor.y - markRecord.y + positions[baseGlyphIndex * 3 + 1];
                  break;
                }
              }
            } else if (lookup.ltype === 6) {
              const mark1ArrIndex = Typr._lctf.coverageIndex(tab.mark1Coverage, glyphId);
              if (mark1ArrIndex !== -1) {
                const prevGlyphIndex = getPrevGlyphIndex();
                if (prevGlyphIndex !== -1) {
                  const prevGlyphId = glyphIds[prevGlyphIndex];
                  if (getGlyphClass(font, prevGlyphId) === 3) {
                    const mark2ArrIndex = Typr._lctf.coverageIndex(tab.mark2Coverage, prevGlyphId);
                    if (mark2ArrIndex !== -1) {
                      const mark1Record = tab.mark1Array[mark1ArrIndex];
                      const mark2Anchor = tab.mark2Array[mark2ArrIndex][mark1Record.markClass];
                      positions[glyphIndex * 3] = mark2Anchor.x - mark1Record.x + positions[prevGlyphIndex * 3] - positions[prevGlyphIndex * 3 + 2];
                      positions[glyphIndex * 3 + 1] = mark2Anchor.y - mark1Record.y + positions[prevGlyphIndex * 3 + 1];
                      break;
                    }
                  }
                }
              }
            }
          }
        }
      } else if (font.kern && !font.cff) {
        const prevGlyphIndex = getPrevGlyphIndex();
        if (prevGlyphIndex !== -1) {
          const ind1 = font.kern.glyph1.indexOf(glyphIds[prevGlyphIndex]);
          if (ind1 !== -1) {
            const ind2 = font.kern.rval[ind1].glyph2.indexOf(glyphId);
            if (ind2 !== -1) {
              positions[prevGlyphIndex * 3 + 2] += font.kern.rval[ind1].vals[ind2];
            }
          }
        }
      }
    }
    return positions;
    function getPrevGlyphIndex(filter) {
      for (let i = glyphIndex - 1; i >= 0; i--) {
        if (glyphIds[i] !== -1 && (!filter || filter(glyphIds[i]))) {
          return i;
        }
      }
      return -1;
    }
    function isBaseGlyph(glyphId) {
      return getGlyphClass(font, glyphId) === 1;
    }
    function applyValueRecord(source, gi) {
      for (let i = 0; i < 3; i++) {
        positions[gi * 3 + i] += source[i] || 0;
      }
    }
  }
  function getGlyphClass(font, glyphId) {
    const classDef = font.GDEF && font.GDEF.glyphClassDef;
    return classDef ? Typr.U._getGlyphClass(glyphId, classDef) : 0;
  }
  function firstNum(...args) {
    for (let i = 0; i < args.length; i++) {
      if (typeof args[i] === "number") {
        return args[i];
      }
    }
  }
  function wrapFontObj(typrFont) {
    const glyphMap = /* @__PURE__ */ Object.create(null);
    const os2 = typrFont["OS/2"];
    const hhea = typrFont.hhea;
    const unitsPerEm = typrFont.head.unitsPerEm;
    const ascender = firstNum(os2 && os2.sTypoAscender, hhea && hhea.ascender, unitsPerEm);
    const fontObj = {
      unitsPerEm,
      ascender,
      descender: firstNum(os2 && os2.sTypoDescender, hhea && hhea.descender, 0),
      capHeight: firstNum(os2 && os2.sCapHeight, ascender),
      xHeight: firstNum(os2 && os2.sxHeight, ascender),
      lineGap: firstNum(os2 && os2.sTypoLineGap, hhea && hhea.lineGap),
      supportsCodePoint(code) {
        return Typr.U.codeToGlyph(typrFont, code) > 0;
      },
      forEachGlyph(text, fontSize, letterSpacing, callback) {
        let penX = 0;
        const fontScale = 1 / fontObj.unitsPerEm * fontSize;
        const glyphIds = stringToGlyphs(typrFont, text);
        let charIndex = 0;
        const positions = calcGlyphPositions(typrFont, glyphIds);
        glyphIds.forEach((glyphId, i) => {
          if (glyphId !== -1) {
            let glyphObj = glyphMap[glyphId];
            if (!glyphObj) {
              const { cmds, crds } = Typr.U.glyphToPath(typrFont, glyphId);
              let path = "";
              let crdsIdx = 0;
              for (let i2 = 0, len = cmds.length; i2 < len; i2++) {
                const numArgs = cmdArgLengths[cmds[i2]];
                path += cmds[i2];
                for (let j = 1; j <= numArgs; j++) {
                  path += (j > 1 ? "," : "") + crds[crdsIdx++];
                }
              }
              let xMin, yMin, xMax, yMax;
              if (crds.length) {
                xMin = yMin = Infinity;
                xMax = yMax = -Infinity;
                for (let i2 = 0, len = crds.length; i2 < len; i2 += 2) {
                  let x = crds[i2];
                  let y = crds[i2 + 1];
                  if (x < xMin) xMin = x;
                  if (y < yMin) yMin = y;
                  if (x > xMax) xMax = x;
                  if (y > yMax) yMax = y;
                }
              } else {
                xMin = xMax = yMin = yMax = 0;
              }
              glyphObj = glyphMap[glyphId] = {
                index: glyphId,
                advanceWidth: typrFont.hmtx.aWidth[glyphId],
                xMin,
                yMin,
                xMax,
                yMax,
                path
              };
            }
            callback.call(
              null,
              glyphObj,
              penX + positions[i * 3] * fontScale,
              positions[i * 3 + 1] * fontScale,
              charIndex
            );
            penX += positions[i * 3 + 2] * fontScale;
            if (letterSpacing) {
              penX += letterSpacing * fontSize;
            }
          }
          charIndex += text.codePointAt(charIndex) > 65535 ? 2 : 1;
        });
        return penX;
      }
    };
    return fontObj;
  }
  return function parse(buffer) {
    const peek = new Uint8Array(buffer, 0, 4);
    const tag = Typr._bin.readASCII(peek, 0, 4);
    if (tag === "wOFF") {
      buffer = woff2otf(buffer);
    } else if (tag === "wOF2") {
      throw new Error("woff2 fonts not supported");
    }
    return wrapFontObj(Typr.parse(buffer)[0]);
  };
}
const workerModule = /* @__PURE__ */ defineWorkerModule({
  name: "Typr Font Parser",
  dependencies: [typrFactory, woff2otfFactory, parserFactory],
  init(typrFactory2, woff2otfFactory2, parserFactory2) {
    const Typr = typrFactory2();
    const woff2otf = woff2otfFactory2();
    return parserFactory2(Typr, woff2otf);
  }
});
/*!
Custom bundle of @unicode-font-resolver/client v1.0.2 (https://github.com/lojjic/unicode-font-resolver)
for use in Troika text rendering. 
Original MIT license applies
*/
function unicodeFontResolverClientFactory() {
  return (function(t) {
    var n = function() {
      this.buckets = /* @__PURE__ */ new Map();
    };
    n.prototype.add = function(t2) {
      var n2 = t2 >> 5;
      this.buckets.set(n2, (this.buckets.get(n2) || 0) | 1 << (31 & t2));
    }, n.prototype.has = function(t2) {
      var n2 = this.buckets.get(t2 >> 5);
      return void 0 !== n2 && 0 != (n2 & 1 << (31 & t2));
    }, n.prototype.serialize = function() {
      var t2 = [];
      return this.buckets.forEach((function(n2, r2) {
        t2.push((+r2).toString(36) + ":" + n2.toString(36));
      })), t2.join(",");
    }, n.prototype.deserialize = function(t2) {
      var n2 = this;
      this.buckets.clear(), t2.split(",").forEach((function(t3) {
        var r2 = t3.split(":");
        n2.buckets.set(parseInt(r2[0], 36), parseInt(r2[1], 36));
      }));
    };
    var r = Math.pow(2, 8), e = r - 1, o = ~e;
    function a(t2) {
      var n2 = (function(t3) {
        return t3 & o;
      })(t2).toString(16), e2 = (function(t3) {
        return (t3 & o) + r - 1;
      })(t2).toString(16);
      return "codepoint-index/plane" + (t2 >> 16) + "/" + n2 + "-" + e2 + ".json";
    }
    function i(t2, n2) {
      var r2 = t2 & e, o2 = n2.codePointAt(r2 / 6 | 0);
      return 0 != ((o2 = (o2 || 48) - 48) & 1 << r2 % 6);
    }
    function u(t2, n2) {
      var r2;
      (r2 = t2, r2.replace(/U\+/gi, "").replace(/^,+|,+$/g, "").split(/,+/).map((function(t3) {
        return t3.split("-").map((function(t4) {
          return parseInt(t4.trim(), 16);
        }));
      }))).forEach((function(t3) {
        var r3 = t3[0], e2 = t3[1];
        void 0 === e2 && (e2 = r3), n2(r3, e2);
      }));
    }
    function c(t2, n2) {
      u(t2, (function(t3, r2) {
        for (var e2 = t3; e2 <= r2; e2++) n2(e2);
      }));
    }
    var s = {}, f = {}, l = /* @__PURE__ */ new WeakMap(), v = "https://cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver@v1.0.1/packages/data";
    function d(t2) {
      var r2 = l.get(t2);
      return r2 || (r2 = new n(), c(t2.ranges, (function(t3) {
        return r2.add(t3);
      })), l.set(t2, r2)), r2;
    }
    var h, p = /* @__PURE__ */ new Map();
    function g(t2, n2, r2) {
      return t2[n2] ? n2 : t2[r2] ? r2 : (function(t3) {
        for (var n3 in t3) return n3;
      })(t2);
    }
    function w(t2, n2) {
      var r2 = n2;
      if (!t2.includes(r2)) {
        r2 = 1 / 0;
        for (var e2 = 0; e2 < t2.length; e2++) Math.abs(t2[e2] - n2) < Math.abs(r2 - n2) && (r2 = t2[e2]);
      }
      return r2;
    }
    function k(t2) {
      return h || (h = /* @__PURE__ */ new Set(), c("9-D,20,85,A0,1680,2000-200A,2028-202F,205F,3000", (function(t3) {
        h.add(t3);
      }))), h.has(t2);
    }
    return t.CodePointSet = n, t.clearCache = function() {
      s = {}, f = {};
    }, t.getFontsForString = function(t2, n2) {
      void 0 === n2 && (n2 = {});
      var r2, e2 = n2.lang;
      void 0 === e2 && (e2 = /\p{Script=Hangul}/u.test(r2 = t2) ? "ko" : /\p{Script=Hiragana}|\p{Script=Katakana}/u.test(r2) ? "ja" : "en");
      var o2 = n2.category;
      void 0 === o2 && (o2 = "sans-serif");
      var u2 = n2.style;
      void 0 === u2 && (u2 = "normal");
      var c2 = n2.weight;
      void 0 === c2 && (c2 = 400);
      var l2 = (n2.dataUrl || v).replace(/\/$/g, ""), h2 = /* @__PURE__ */ new Map(), y = new Uint8Array(t2.length), b = {}, m = {}, A = new Array(t2.length), S = /* @__PURE__ */ new Map(), j = false;
      function M(t3) {
        var n3 = p.get(t3);
        return n3 || (n3 = fetch(l2 + "/" + t3).then((function(t4) {
          if (!t4.ok) throw new Error(t4.statusText);
          return t4.json().then((function(t5) {
            if (!Array.isArray(t5) || 1 !== t5[0]) throw new Error("Incorrect schema version; need 1, got " + t5[0]);
            return t5[1];
          }));
        })).catch((function(n4) {
          if (l2 !== v) return j || (console.error('unicode-font-resolver: Failed loading from dataUrl "' + l2 + '", trying default CDN. ' + n4.message), j = true), l2 = v, p.delete(t3), M(t3);
          throw n4;
        })), p.set(t3, n3)), n3;
      }
      for (var P = function(n3) {
        var r3 = t2.codePointAt(n3), e3 = a(r3);
        A[n3] = e3, s[e3] || S.has(e3) || S.set(e3, M(e3).then((function(t3) {
          s[e3] = t3;
        }))), r3 > 65535 && (n3++, E = n3);
      }, E = 0; E < t2.length; E++) P(E);
      return Promise.all(S.values()).then((function() {
        S.clear();
        for (var n3 = function(n4) {
          var o3 = t2.codePointAt(n4), a2 = null, u3 = s[A[n4]], c3 = void 0;
          for (var l3 in u3) {
            var v2 = m[l3];
            if (void 0 === v2 && (v2 = m[l3] = new RegExp(l3).test(e2 || "en")), v2) {
              for (var d2 in c3 = l3, u3[l3]) if (i(o3, u3[l3][d2])) {
                a2 = d2;
                break;
              }
              break;
            }
          }
          if (!a2) {
            t: for (var h3 in u3) if (h3 !== c3) {
              for (var p2 in u3[h3]) if (i(o3, u3[h3][p2])) {
                a2 = p2;
                break t;
              }
            }
          }
          a2 || (console.debug("No font coverage for U+" + o3.toString(16)), a2 = "latin"), A[n4] = a2, f[a2] || S.has(a2) || S.set(a2, M("font-meta/" + a2 + ".json").then((function(t3) {
            f[a2] = t3;
          }))), o3 > 65535 && (n4++, r3 = n4);
        }, r3 = 0; r3 < t2.length; r3++) n3(r3);
        return Promise.all(S.values());
      })).then((function() {
        for (var n3, r3 = null, e3 = 0; e3 < t2.length; e3++) {
          var a2 = t2.codePointAt(e3);
          if (r3 && (k(a2) || d(r3).has(a2))) y[e3] = y[e3 - 1];
          else {
            r3 = f[A[e3]];
            var i2 = b[r3.id];
            if (!i2) {
              var s2 = r3.typeforms, v2 = g(s2, o2, "sans-serif"), p2 = g(s2[v2], u2, "normal"), m2 = w(null === (n3 = s2[v2]) || void 0 === n3 ? void 0 : n3[p2], c2);
              i2 = b[r3.id] = l2 + "/font-files/" + r3.id + "/" + v2 + "." + p2 + "." + m2 + ".woff";
            }
            var S2 = h2.get(i2);
            null == S2 && (S2 = h2.size, h2.set(i2, S2)), y[e3] = S2;
          }
          a2 > 65535 && (e3++, y[e3] = y[e3 - 1]);
        }
        return { fontUrls: Array.from(h2.keys()), chars: y };
      }));
    }, Object.defineProperty(t, "__esModule", { value: true }), t;
  })({});
}
function createFontResolver(fontParser, unicodeFontResolverClient) {
  const parsedFonts = /* @__PURE__ */ Object.create(null);
  const loadingFonts = /* @__PURE__ */ Object.create(null);
  function doLoadFont(url, callback) {
    const onError = (err) => {
      console.error(`Failure loading font ${url}`, err);
    };
    try {
      const request = new XMLHttpRequest();
      request.open("get", url, true);
      request.responseType = "arraybuffer";
      request.onload = function() {
        if (request.status >= 400) {
          onError(new Error(request.statusText));
        } else if (request.status > 0) {
          try {
            const fontObj = fontParser(request.response);
            fontObj.src = url;
            callback(fontObj);
          } catch (e) {
            onError(e);
          }
        }
      };
      request.onerror = onError;
      request.send();
    } catch (err) {
      onError(err);
    }
  }
  function loadFont(fontUrl, callback) {
    let font = parsedFonts[fontUrl];
    if (font) {
      callback(font);
    } else if (loadingFonts[fontUrl]) {
      loadingFonts[fontUrl].push(callback);
    } else {
      loadingFonts[fontUrl] = [callback];
      doLoadFont(fontUrl, (fontObj) => {
        fontObj.src = fontUrl;
        parsedFonts[fontUrl] = fontObj;
        loadingFonts[fontUrl].forEach((cb) => cb(fontObj));
        delete loadingFonts[fontUrl];
      });
    }
  }
  return function(text, callback, {
    lang,
    fonts: userFonts = [],
    style = "normal",
    weight = "normal",
    unicodeFontsURL
  } = {}) {
    const charResolutions = new Uint8Array(text.length);
    const fontResolutions = [];
    if (!text.length) {
      allDone();
    }
    const fontIndices = /* @__PURE__ */ new Map();
    const fallbackRanges = [];
    if (style !== "italic") style = "normal";
    if (typeof weight !== "number") {
      weight = weight === "bold" ? 700 : 400;
    }
    if (userFonts && !Array.isArray(userFonts)) {
      userFonts = [userFonts];
    }
    userFonts = userFonts.slice().filter((def) => !def.lang || def.lang.test(lang)).reverse();
    if (userFonts.length) {
      const UNKNOWN = 0;
      const RESOLVED = 1;
      const NEEDS_FALLBACK = 2;
      let prevCharResult = UNKNOWN;
      (function resolveUserFonts(startIndex = 0) {
        for (let i = startIndex, iLen = text.length; i < iLen; i++) {
          const codePoint = text.codePointAt(i);
          if (prevCharResult === RESOLVED && fontResolutions[charResolutions[i - 1]].supportsCodePoint(codePoint) || i > 0 && /\s/.test(text[i])) {
            charResolutions[i] = charResolutions[i - 1];
            if (prevCharResult === NEEDS_FALLBACK) {
              fallbackRanges[fallbackRanges.length - 1][1] = i;
            }
          } else {
            for (let j = charResolutions[i], jLen = userFonts.length; j <= jLen; j++) {
              if (j === jLen) {
                const range = prevCharResult === NEEDS_FALLBACK ? fallbackRanges[fallbackRanges.length - 1] : fallbackRanges[fallbackRanges.length] = [i, i];
                range[1] = i;
                prevCharResult = NEEDS_FALLBACK;
              } else {
                charResolutions[i] = j;
                const { src, unicodeRange } = userFonts[j];
                if (!unicodeRange || isCodeInRanges(codePoint, unicodeRange)) {
                  const fontObj = parsedFonts[src];
                  if (!fontObj) {
                    loadFont(src, () => {
                      resolveUserFonts(i);
                    });
                    return;
                  }
                  if (fontObj.supportsCodePoint(codePoint)) {
                    let fontIndex = fontIndices.get(fontObj);
                    if (typeof fontIndex !== "number") {
                      fontIndex = fontResolutions.length;
                      fontResolutions.push(fontObj);
                      fontIndices.set(fontObj, fontIndex);
                    }
                    charResolutions[i] = fontIndex;
                    prevCharResult = RESOLVED;
                    break;
                  }
                }
              }
            }
          }
          if (codePoint > 65535 && i + 1 < iLen) {
            charResolutions[i + 1] = charResolutions[i];
            i++;
            if (prevCharResult === NEEDS_FALLBACK) {
              fallbackRanges[fallbackRanges.length - 1][1] = i;
            }
          }
        }
        resolveFallbacks();
      })();
    } else {
      fallbackRanges.push([0, text.length - 1]);
      resolveFallbacks();
    }
    function resolveFallbacks() {
      if (fallbackRanges.length) {
        const fallbackString = fallbackRanges.map((range) => text.substring(range[0], range[1] + 1)).join("\n");
        unicodeFontResolverClient.getFontsForString(fallbackString, {
          lang: lang || void 0,
          style,
          weight,
          dataUrl: unicodeFontsURL
        }).then(({ fontUrls, chars }) => {
          const fontIndexOffset = fontResolutions.length;
          let charIdx = 0;
          fallbackRanges.forEach((range) => {
            for (let i = 0, endIdx = range[1] - range[0]; i <= endIdx; i++) {
              charResolutions[range[0] + i] = chars[charIdx++] + fontIndexOffset;
            }
            charIdx++;
          });
          let loadedCount = 0;
          fontUrls.forEach((url, i) => {
            loadFont(url, (fontObj) => {
              fontResolutions[i + fontIndexOffset] = fontObj;
              if (++loadedCount === fontUrls.length) {
                allDone();
              }
            });
          });
        });
      } else {
        allDone();
      }
    }
    function allDone() {
      callback({
        chars: charResolutions,
        fonts: fontResolutions
      });
    }
    function isCodeInRanges(code, ranges) {
      for (let k = 0; k < ranges.length; k++) {
        const [start, end = start] = ranges[k];
        if (start <= code && code <= end) {
          return true;
        }
      }
      return false;
    }
  };
}
const fontResolverWorkerModule = /* @__PURE__ */ defineWorkerModule({
  name: "FontResolver",
  dependencies: [
    createFontResolver,
    workerModule,
    unicodeFontResolverClientFactory
  ],
  init(createFontResolver2, fontParser, unicodeFontResolverClientFactory2) {
    return createFontResolver2(fontParser, unicodeFontResolverClientFactory2());
  }
});
function createTypesetter(resolveFonts, bidi) {
  const INF = Infinity;
  const DEFAULT_IGNORABLE_CHARS = /[\u00AD\u034F\u061C\u115F-\u1160\u17B4-\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFF8]/;
  const lineBreakingWhiteSpace = `[^\\S\\u00A0]`;
  const BREAK_AFTER_CHARS = new RegExp(`${lineBreakingWhiteSpace}|[\\-\\u007C\\u00AD\\u2010\\u2012-\\u2014\\u2027\\u2056\\u2E17\\u2E40]`);
  function calculateFontRuns({ text, lang, fonts, style, weight, preResolvedFonts, unicodeFontsURL }, onDone) {
    const onResolved = ({ chars, fonts: parsedFonts }) => {
      let curRun, prevVal;
      const runs = [];
      for (let i = 0; i < chars.length; i++) {
        if (chars[i] !== prevVal) {
          prevVal = chars[i];
          runs.push(curRun = { start: i, end: i, fontObj: parsedFonts[chars[i]] });
        } else {
          curRun.end = i;
        }
      }
      onDone(runs);
    };
    if (preResolvedFonts) {
      onResolved(preResolvedFonts);
    } else {
      resolveFonts(
        text,
        onResolved,
        { lang, fonts, style, weight, unicodeFontsURL }
      );
    }
  }
  function typeset({
    text = "",
    font,
    lang,
    sdfGlyphSize = 64,
    fontSize = 400,
    fontWeight = 1,
    fontStyle = "normal",
    letterSpacing = 0,
    lineHeight = "normal",
    maxWidth = INF,
    direction,
    textAlign = "left",
    textIndent = 0,
    whiteSpace = "normal",
    overflowWrap = "normal",
    anchorX = 0,
    anchorY = 0,
    metricsOnly = false,
    unicodeFontsURL,
    preResolvedFonts = null,
    includeCaretPositions = false,
    chunkedBoundsSize = 8192,
    colorRanges = null
  }, callback) {
    const mainStart = now2();
    const timings = { fontLoad: 0, typesetting: 0 };
    if (text.indexOf("\r") > -1) {
      console.info("Typesetter: got text with \\r chars; normalizing to \\n");
      text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    }
    fontSize = +fontSize;
    letterSpacing = +letterSpacing;
    maxWidth = +maxWidth;
    lineHeight = lineHeight || "normal";
    textIndent = +textIndent;
    calculateFontRuns({
      text,
      lang,
      style: fontStyle,
      weight: fontWeight,
      fonts: typeof font === "string" ? [{ src: font }] : font,
      unicodeFontsURL,
      preResolvedFonts
    }, (runs) => {
      timings.fontLoad = now2() - mainStart;
      const hasMaxWidth = isFinite(maxWidth);
      let glyphIds = null;
      let glyphFontIndices = null;
      let glyphPositions = null;
      let glyphData = null;
      let glyphColors = null;
      let caretPositions = null;
      let visibleBounds = null;
      let chunkedBounds = null;
      let maxLineWidth = 0;
      let renderableGlyphCount = 0;
      let canWrap = whiteSpace !== "nowrap";
      const metricsByFont = /* @__PURE__ */ new Map();
      const typesetStart = now2();
      let lineXOffset = textIndent;
      let prevRunEndX = 0;
      let currentLine = new TextLine();
      const lines = [currentLine];
      runs.forEach((run) => {
        const { fontObj } = run;
        const { ascender, descender, unitsPerEm, lineGap, capHeight, xHeight } = fontObj;
        let fontData2 = metricsByFont.get(fontObj);
        if (!fontData2) {
          const fontSizeMult2 = fontSize / unitsPerEm;
          const calcLineHeight = lineHeight === "normal" ? (ascender - descender + lineGap) * fontSizeMult2 : lineHeight * fontSize;
          const halfLeading = (calcLineHeight - (ascender - descender) * fontSizeMult2) / 2;
          const caretHeight = Math.min(calcLineHeight, (ascender - descender) * fontSizeMult2);
          const caretTop = (ascender + descender) / 2 * fontSizeMult2 + caretHeight / 2;
          fontData2 = {
            index: metricsByFont.size,
            src: fontObj.src,
            fontObj,
            fontSizeMult: fontSizeMult2,
            unitsPerEm,
            ascender: ascender * fontSizeMult2,
            descender: descender * fontSizeMult2,
            capHeight: capHeight * fontSizeMult2,
            xHeight: xHeight * fontSizeMult2,
            lineHeight: calcLineHeight,
            baseline: -halfLeading - ascender * fontSizeMult2,
            // baseline offset from top of line height
            // cap: -halfLeading - capHeight * fontSizeMult, // cap from top of line height
            // ex: -halfLeading - xHeight * fontSizeMult, // ex from top of line height
            caretTop,
            caretBottom: caretTop - caretHeight
          };
          metricsByFont.set(fontObj, fontData2);
        }
        const { fontSizeMult } = fontData2;
        const runText = text.slice(run.start, run.end + 1);
        let prevGlyphX, prevGlyphObj;
        fontObj.forEachGlyph(runText, fontSize, letterSpacing, (glyphObj, glyphX, glyphY, charIndex) => {
          glyphX += prevRunEndX;
          charIndex += run.start;
          prevGlyphX = glyphX;
          prevGlyphObj = glyphObj;
          const char = text.charAt(charIndex);
          const glyphWidth = glyphObj.advanceWidth * fontSizeMult;
          const curLineCount = currentLine.count;
          let nextLine;
          if (!("isEmpty" in glyphObj)) {
            glyphObj.isWhitespace = !!char && new RegExp(lineBreakingWhiteSpace).test(char);
            glyphObj.canBreakAfter = !!char && BREAK_AFTER_CHARS.test(char);
            glyphObj.isEmpty = glyphObj.xMin === glyphObj.xMax || glyphObj.yMin === glyphObj.yMax || DEFAULT_IGNORABLE_CHARS.test(char);
          }
          if (!glyphObj.isWhitespace && !glyphObj.isEmpty) {
            renderableGlyphCount++;
          }
          if (canWrap && hasMaxWidth && !glyphObj.isWhitespace && glyphX + glyphWidth + lineXOffset > maxWidth && curLineCount) {
            if (currentLine.glyphAt(curLineCount - 1).glyphObj.canBreakAfter) {
              nextLine = new TextLine();
              lineXOffset = -glyphX;
            } else {
              for (let i = curLineCount; i--; ) {
                if (i === 0 && overflowWrap === "break-word") {
                  nextLine = new TextLine();
                  lineXOffset = -glyphX;
                  break;
                } else if (currentLine.glyphAt(i).glyphObj.canBreakAfter) {
                  nextLine = currentLine.splitAt(i + 1);
                  const adjustX = nextLine.glyphAt(0).x;
                  lineXOffset -= adjustX;
                  for (let j = nextLine.count; j--; ) {
                    nextLine.glyphAt(j).x -= adjustX;
                  }
                  break;
                }
              }
            }
            if (nextLine) {
              currentLine.isSoftWrapped = true;
              currentLine = nextLine;
              lines.push(currentLine);
              maxLineWidth = maxWidth;
            }
          }
          let fly = currentLine.glyphAt(currentLine.count);
          fly.glyphObj = glyphObj;
          fly.x = glyphX + lineXOffset;
          fly.y = glyphY;
          fly.width = glyphWidth;
          fly.charIndex = charIndex;
          fly.fontData = fontData2;
          if (char === "\n") {
            currentLine = new TextLine();
            lines.push(currentLine);
            lineXOffset = -(glyphX + glyphWidth + letterSpacing * fontSize) + textIndent;
          }
        });
        prevRunEndX = prevGlyphX + prevGlyphObj.advanceWidth * fontSizeMult + letterSpacing * fontSize;
      });
      let totalHeight = 0;
      lines.forEach((line) => {
        let isTrailingWhitespace = true;
        for (let i = line.count; i--; ) {
          const glyphInfo = line.glyphAt(i);
          if (isTrailingWhitespace && !glyphInfo.glyphObj.isWhitespace) {
            line.width = glyphInfo.x + glyphInfo.width;
            if (line.width > maxLineWidth) {
              maxLineWidth = line.width;
            }
            isTrailingWhitespace = false;
          }
          let { lineHeight: lineHeight2, capHeight, xHeight, baseline } = glyphInfo.fontData;
          if (lineHeight2 > line.lineHeight) line.lineHeight = lineHeight2;
          const baselineDiff = baseline - line.baseline;
          if (baselineDiff < 0) {
            line.baseline += baselineDiff;
            line.cap += baselineDiff;
            line.ex += baselineDiff;
          }
          line.cap = Math.max(line.cap, line.baseline + capHeight);
          line.ex = Math.max(line.ex, line.baseline + xHeight);
        }
        line.baseline -= totalHeight;
        line.cap -= totalHeight;
        line.ex -= totalHeight;
        totalHeight += line.lineHeight;
      });
      let anchorXOffset = 0;
      let anchorYOffset = 0;
      if (anchorX) {
        if (typeof anchorX === "number") {
          anchorXOffset = -anchorX;
        } else if (typeof anchorX === "string") {
          anchorXOffset = -maxLineWidth * (anchorX === "left" ? 0 : anchorX === "center" ? 0.5 : anchorX === "right" ? 1 : parsePercent(anchorX));
        }
      }
      if (anchorY) {
        if (typeof anchorY === "number") {
          anchorYOffset = -anchorY;
        } else if (typeof anchorY === "string") {
          anchorYOffset = anchorY === "top" ? 0 : anchorY === "top-baseline" ? -lines[0].baseline : anchorY === "top-cap" ? -lines[0].cap : anchorY === "top-ex" ? -lines[0].ex : anchorY === "middle" ? totalHeight / 2 : anchorY === "bottom" ? totalHeight : anchorY === "bottom-baseline" ? -lines[lines.length - 1].baseline : parsePercent(anchorY) * totalHeight;
        }
      }
      if (!metricsOnly) {
        const bidiLevelsResult = bidi.getEmbeddingLevels(text, direction);
        glyphIds = new Uint16Array(renderableGlyphCount);
        glyphFontIndices = new Uint8Array(renderableGlyphCount);
        glyphPositions = new Float32Array(renderableGlyphCount * 2);
        glyphData = {};
        visibleBounds = [INF, INF, -INF, -INF];
        chunkedBounds = [];
        if (includeCaretPositions) {
          caretPositions = new Float32Array(text.length * 4);
        }
        if (colorRanges) {
          glyphColors = new Uint8Array(renderableGlyphCount * 3);
        }
        let renderableGlyphIndex = 0;
        let prevCharIndex = -1;
        let colorCharIndex = -1;
        let chunk;
        let currentColor;
        lines.forEach((line, lineIndex) => {
          let { count: lineGlyphCount, width: lineWidth } = line;
          if (lineGlyphCount > 0) {
            let trailingWhitespaceCount = 0;
            for (let i = lineGlyphCount; i-- && line.glyphAt(i).glyphObj.isWhitespace; ) {
              trailingWhitespaceCount++;
            }
            let lineXOffset2 = 0;
            let justifyAdjust = 0;
            if (textAlign === "center") {
              lineXOffset2 = (maxLineWidth - lineWidth) / 2;
            } else if (textAlign === "right") {
              lineXOffset2 = maxLineWidth - lineWidth;
            } else if (textAlign === "justify" && line.isSoftWrapped) {
              let whitespaceCount = 0;
              for (let i = lineGlyphCount - trailingWhitespaceCount; i--; ) {
                if (line.glyphAt(i).glyphObj.isWhitespace) {
                  whitespaceCount++;
                }
              }
              justifyAdjust = (maxLineWidth - lineWidth) / whitespaceCount;
            }
            if (justifyAdjust || lineXOffset2) {
              let justifyOffset = 0;
              for (let i = 0; i < lineGlyphCount; i++) {
                let glyphInfo = line.glyphAt(i);
                const glyphObj2 = glyphInfo.glyphObj;
                glyphInfo.x += lineXOffset2 + justifyOffset;
                if (justifyAdjust !== 0 && glyphObj2.isWhitespace && i < lineGlyphCount - trailingWhitespaceCount) {
                  justifyOffset += justifyAdjust;
                  glyphInfo.width += justifyAdjust;
                }
              }
            }
            const flips = bidi.getReorderSegments(
              text,
              bidiLevelsResult,
              line.glyphAt(0).charIndex,
              line.glyphAt(line.count - 1).charIndex
            );
            for (let fi = 0; fi < flips.length; fi++) {
              const [start, end] = flips[fi];
              let left = Infinity, right = -Infinity;
              for (let i = 0; i < lineGlyphCount; i++) {
                if (line.glyphAt(i).charIndex >= start) {
                  let startInLine = i, endInLine = i;
                  for (; endInLine < lineGlyphCount; endInLine++) {
                    let info = line.glyphAt(endInLine);
                    if (info.charIndex > end) {
                      break;
                    }
                    if (endInLine < lineGlyphCount - trailingWhitespaceCount) {
                      left = Math.min(left, info.x);
                      right = Math.max(right, info.x + info.width);
                    }
                  }
                  for (let j = startInLine; j < endInLine; j++) {
                    const glyphInfo = line.glyphAt(j);
                    glyphInfo.x = right - (glyphInfo.x + glyphInfo.width - left);
                  }
                  break;
                }
              }
            }
            let glyphObj;
            const setGlyphObj = (g) => glyphObj = g;
            for (let i = 0; i < lineGlyphCount; i++) {
              const glyphInfo = line.glyphAt(i);
              glyphObj = glyphInfo.glyphObj;
              const glyphId = glyphObj.index;
              const rtl = bidiLevelsResult.levels[glyphInfo.charIndex] & 1;
              if (rtl) {
                const mirrored = bidi.getMirroredCharacter(text[glyphInfo.charIndex]);
                if (mirrored) {
                  glyphInfo.fontData.fontObj.forEachGlyph(mirrored, 0, 0, setGlyphObj);
                }
              }
              if (includeCaretPositions) {
                const { charIndex, fontData: fontData2 } = glyphInfo;
                const caretLeft = glyphInfo.x + anchorXOffset;
                const caretRight = glyphInfo.x + glyphInfo.width + anchorXOffset;
                caretPositions[charIndex * 4] = rtl ? caretRight : caretLeft;
                caretPositions[charIndex * 4 + 1] = rtl ? caretLeft : caretRight;
                caretPositions[charIndex * 4 + 2] = line.baseline + fontData2.caretBottom + anchorYOffset;
                caretPositions[charIndex * 4 + 3] = line.baseline + fontData2.caretTop + anchorYOffset;
                const ligCount = charIndex - prevCharIndex;
                if (ligCount > 1) {
                  fillLigatureCaretPositions(caretPositions, prevCharIndex, ligCount);
                }
                prevCharIndex = charIndex;
              }
              if (colorRanges) {
                const { charIndex } = glyphInfo;
                while (charIndex > colorCharIndex) {
                  colorCharIndex++;
                  if (colorRanges.hasOwnProperty(colorCharIndex)) {
                    currentColor = colorRanges[colorCharIndex];
                  }
                }
              }
              if (!glyphObj.isWhitespace && !glyphObj.isEmpty) {
                const idx = renderableGlyphIndex++;
                const { fontSizeMult, src: fontSrc, index: fontIndex } = glyphInfo.fontData;
                const fontGlyphData = glyphData[fontSrc] || (glyphData[fontSrc] = {});
                if (!fontGlyphData[glyphId]) {
                  fontGlyphData[glyphId] = {
                    path: glyphObj.path,
                    pathBounds: [glyphObj.xMin, glyphObj.yMin, glyphObj.xMax, glyphObj.yMax]
                  };
                }
                const glyphX = glyphInfo.x + anchorXOffset;
                const glyphY = glyphInfo.y + line.baseline + anchorYOffset;
                glyphPositions[idx * 2] = glyphX;
                glyphPositions[idx * 2 + 1] = glyphY;
                const visX0 = glyphX + glyphObj.xMin * fontSizeMult;
                const visY0 = glyphY + glyphObj.yMin * fontSizeMult;
                const visX1 = glyphX + glyphObj.xMax * fontSizeMult;
                const visY1 = glyphY + glyphObj.yMax * fontSizeMult;
                if (visX0 < visibleBounds[0]) visibleBounds[0] = visX0;
                if (visY0 < visibleBounds[1]) visibleBounds[1] = visY0;
                if (visX1 > visibleBounds[2]) visibleBounds[2] = visX1;
                if (visY1 > visibleBounds[3]) visibleBounds[3] = visY1;
                if (idx % chunkedBoundsSize === 0) {
                  chunk = { start: idx, end: idx, rect: [INF, INF, -INF, -INF] };
                  chunkedBounds.push(chunk);
                }
                chunk.end++;
                const chunkRect = chunk.rect;
                if (visX0 < chunkRect[0]) chunkRect[0] = visX0;
                if (visY0 < chunkRect[1]) chunkRect[1] = visY0;
                if (visX1 > chunkRect[2]) chunkRect[2] = visX1;
                if (visY1 > chunkRect[3]) chunkRect[3] = visY1;
                glyphIds[idx] = glyphId;
                glyphFontIndices[idx] = fontIndex;
                if (colorRanges) {
                  const start = idx * 3;
                  glyphColors[start] = currentColor >> 16 & 255;
                  glyphColors[start + 1] = currentColor >> 8 & 255;
                  glyphColors[start + 2] = currentColor & 255;
                }
              }
            }
          }
        });
        if (caretPositions) {
          const ligCount = text.length - prevCharIndex;
          if (ligCount > 1) {
            fillLigatureCaretPositions(caretPositions, prevCharIndex, ligCount);
          }
        }
      }
      const fontData = [];
      metricsByFont.forEach(({ index, src, unitsPerEm, ascender, descender, lineHeight: lineHeight2, capHeight, xHeight }) => {
        fontData[index] = { src, unitsPerEm, ascender, descender, lineHeight: lineHeight2, capHeight, xHeight };
      });
      timings.typesetting = now2() - typesetStart;
      callback({
        glyphIds,
        //id for each glyph, specific to that glyph's font
        glyphFontIndices,
        //index into fontData for each glyph
        glyphPositions,
        //x,y of each glyph's origin in layout
        glyphData,
        //dict holding data about each glyph appearing in the text
        fontData,
        //data about each font used in the text
        caretPositions,
        //startX,endX,bottomY caret positions for each char
        // caretHeight, //height of cursor from bottom to top - todo per glyph?
        glyphColors,
        //color for each glyph, if color ranges supplied
        chunkedBounds,
        //total rects per (n=chunkedBoundsSize) consecutive glyphs
        fontSize,
        //calculated em height
        topBaseline: anchorYOffset + lines[0].baseline,
        //y coordinate of the top line's baseline
        blockBounds: [
          //bounds for the whole block of text, including vertical padding for lineHeight
          anchorXOffset,
          anchorYOffset - totalHeight,
          anchorXOffset + maxLineWidth,
          anchorYOffset
        ],
        visibleBounds,
        //total bounds of visible text paths, may be larger or smaller than blockBounds
        timings
      });
    });
  }
  function measure(args, callback) {
    typeset({ ...args, metricsOnly: true }, (result) => {
      const [x0, y0, x1, y1] = result.blockBounds;
      callback({
        width: x1 - x0,
        height: y1 - y0
      });
    });
  }
  function parsePercent(str) {
    let match = str.match(/^([\d.]+)%$/);
    let pct = match ? parseFloat(match[1]) : NaN;
    return isNaN(pct) ? 0 : pct / 100;
  }
  function fillLigatureCaretPositions(caretPositions, ligStartIndex, ligCount) {
    const ligStartX = caretPositions[ligStartIndex * 4];
    const ligEndX = caretPositions[ligStartIndex * 4 + 1];
    const ligBottom = caretPositions[ligStartIndex * 4 + 2];
    const ligTop = caretPositions[ligStartIndex * 4 + 3];
    const guessedAdvanceX = (ligEndX - ligStartX) / ligCount;
    for (let i = 0; i < ligCount; i++) {
      const startIndex = (ligStartIndex + i) * 4;
      caretPositions[startIndex] = ligStartX + guessedAdvanceX * i;
      caretPositions[startIndex + 1] = ligStartX + guessedAdvanceX * (i + 1);
      caretPositions[startIndex + 2] = ligBottom;
      caretPositions[startIndex + 3] = ligTop;
    }
  }
  function now2() {
    return (self.performance || Date).now();
  }
  function TextLine() {
    this.data = [];
  }
  const textLineProps = ["glyphObj", "x", "y", "width", "charIndex", "fontData"];
  TextLine.prototype = {
    width: 0,
    lineHeight: 0,
    baseline: 0,
    cap: 0,
    ex: 0,
    isSoftWrapped: false,
    get count() {
      return Math.ceil(this.data.length / textLineProps.length);
    },
    glyphAt(i) {
      let fly = TextLine.flyweight;
      fly.data = this.data;
      fly.index = i;
      return fly;
    },
    splitAt(i) {
      let newLine = new TextLine();
      newLine.data = this.data.splice(i * textLineProps.length);
      return newLine;
    }
  };
  TextLine.flyweight = textLineProps.reduce((obj, prop, i, all) => {
    Object.defineProperty(obj, prop, {
      get() {
        return this.data[this.index * textLineProps.length + i];
      },
      set(val) {
        this.data[this.index * textLineProps.length + i] = val;
      }
    });
    return obj;
  }, { data: null, index: 0 });
  return {
    typeset,
    measure
  };
}
const now = () => (self.performance || Date).now();
const mainThreadGenerator = /* @__PURE__ */ SDFGenerator();
let warned;
function generateSDF(width, height, path, viewBox, distance, exponent, canvas, x, y, channel, useWebGL = true) {
  if (!useWebGL) {
    return generateSDF_JS_Worker(width, height, path, viewBox, distance, exponent, canvas, x, y, channel);
  }
  return generateSDF_GL(width, height, path, viewBox, distance, exponent, canvas, x, y, channel).then(
    null,
    (err) => {
      if (!warned) {
        console.warn(`WebGL SDF generation failed, falling back to JS`, err);
        warned = true;
      }
      return generateSDF_JS_Worker(width, height, path, viewBox, distance, exponent, canvas, x, y, channel);
    }
  );
}
const queue = [];
const chunkTimeBudget = 5;
let timer = 0;
function nextChunk() {
  const start = now();
  while (queue.length && now() - start < chunkTimeBudget) {
    queue.shift()();
  }
  timer = queue.length ? setTimeout(nextChunk, 0) : 0;
}
const generateSDF_GL = (...args) => {
  return new Promise((resolve, reject) => {
    queue.push(() => {
      const start = now();
      try {
        mainThreadGenerator.webgl.generateIntoCanvas(...args);
        resolve({ timing: now() - start });
      } catch (err) {
        reject(err);
      }
    });
    if (!timer) {
      timer = setTimeout(nextChunk, 0);
    }
  });
};
const threadCount = 4;
const idleTimeout = 2e3;
const threads = {};
let callNum = 0;
function generateSDF_JS_Worker(width, height, path, viewBox, distance, exponent, canvas, x, y, channel) {
  const workerId = "TroikaTextSDFGenerator_JS_" + callNum++ % threadCount;
  let thread = threads[workerId];
  if (!thread) {
    thread = threads[workerId] = {
      workerModule: defineWorkerModule({
        name: workerId,
        workerId,
        dependencies: [
          SDFGenerator,
          now
        ],
        init(_createSDFGenerator, now2) {
          const generate = _createSDFGenerator().javascript.generate;
          return function(...args) {
            const start = now2();
            const textureData = generate(...args);
            return {
              textureData,
              timing: now2() - start
            };
          };
        },
        getTransferables(result) {
          return [result.textureData.buffer];
        }
      }),
      requests: 0,
      idleTimer: null
    };
  }
  thread.requests++;
  clearTimeout(thread.idleTimer);
  return thread.workerModule(width, height, path, viewBox, distance, exponent).then(({ textureData, timing }) => {
    const start = now();
    const imageData = new Uint8Array(textureData.length * 4);
    for (let i = 0; i < textureData.length; i++) {
      imageData[i * 4 + channel] = textureData[i];
    }
    mainThreadGenerator.webglUtils.renderImageData(canvas, imageData, x, y, width, height, 1 << 3 - channel);
    timing += now() - start;
    if (--thread.requests === 0) {
      thread.idleTimer = setTimeout(() => {
        terminateWorker(workerId);
      }, idleTimeout);
    }
    return { timing };
  });
}
function warmUpSDFCanvas(canvas) {
  if (!canvas._warm) {
    mainThreadGenerator.webgl.isSupported(canvas);
    canvas._warm = true;
  }
}
const resizeWebGLCanvasWithoutClearing = mainThreadGenerator.webglUtils.resizeWebGLCanvasWithoutClearing;
const CONFIG = {
  unicodeFontsURL: null,
  sdfGlyphSize: 64,
  sdfMargin: 1 / 16,
  sdfExponent: 9,
  textureWidth: 2048};
const tempColor = /* @__PURE__ */ new Color$1();
function now$1() {
  return (self.performance || Date).now();
}
const atlases = /* @__PURE__ */ Object.create(null);
function getTextRenderInfo(args, callback) {
  args = assign({}, args);
  const totalStart = now$1();
  const fonts = [];
  if (args.font) {
    fonts.push({ label: "user", src: toAbsoluteURL(args.font) });
  }
  args.font = fonts;
  args.text = "" + args.text;
  args.sdfGlyphSize = args.sdfGlyphSize || CONFIG.sdfGlyphSize;
  args.unicodeFontsURL = args.unicodeFontsURL || CONFIG.unicodeFontsURL;
  if (args.colorRanges != null) {
    let colors = {};
    for (let key in args.colorRanges) {
      if (args.colorRanges.hasOwnProperty(key)) {
        let val = args.colorRanges[key];
        if (typeof val !== "number") {
          val = tempColor.set(val).getHex();
        }
        colors[key] = val;
      }
    }
    args.colorRanges = colors;
  }
  Object.freeze(args);
  const { textureWidth, sdfExponent } = CONFIG;
  const { sdfGlyphSize } = args;
  const glyphsPerRow = textureWidth / sdfGlyphSize * 4;
  let atlas = atlases[sdfGlyphSize];
  if (!atlas) {
    const canvas = document.createElement("canvas");
    canvas.width = textureWidth;
    canvas.height = sdfGlyphSize * 256 / glyphsPerRow;
    atlas = atlases[sdfGlyphSize] = {
      glyphCount: 0,
      sdfGlyphSize,
      sdfCanvas: canvas,
      sdfTexture: new Texture$1(
        canvas,
        void 0,
        void 0,
        void 0,
        LinearFilter,
        LinearFilter
      ),
      contextLost: false,
      glyphsByFont: /* @__PURE__ */ new Map()
    };
    atlas.sdfTexture.generateMipmaps = false;
    initContextLossHandling(atlas);
  }
  const { sdfTexture, sdfCanvas } = atlas;
  const typeset = typesetInWorker ;
  typeset(args).then((result) => {
    const { glyphIds, glyphFontIndices, fontData, glyphPositions, fontSize, timings } = result;
    const neededSDFs = [];
    const glyphBounds = new Float32Array(glyphIds.length * 4);
    let boundsIdx = 0;
    let positionsIdx = 0;
    const quadsStart = now$1();
    const fontGlyphMaps = fontData.map((font) => {
      let map = atlas.glyphsByFont.get(font.src);
      if (!map) {
        atlas.glyphsByFont.set(font.src, map = /* @__PURE__ */ new Map());
      }
      return map;
    });
    glyphIds.forEach((glyphId, i) => {
      const fontIndex = glyphFontIndices[i];
      const { src: fontSrc, unitsPerEm } = fontData[fontIndex];
      let glyphInfo = fontGlyphMaps[fontIndex].get(glyphId);
      if (!glyphInfo) {
        const { path, pathBounds } = result.glyphData[fontSrc][glyphId];
        const fontUnitsMargin = Math.max(pathBounds[2] - pathBounds[0], pathBounds[3] - pathBounds[1]) / sdfGlyphSize * (CONFIG.sdfMargin * sdfGlyphSize + 0.5);
        const atlasIndex = atlas.glyphCount++;
        const sdfViewBox2 = [
          pathBounds[0] - fontUnitsMargin,
          pathBounds[1] - fontUnitsMargin,
          pathBounds[2] + fontUnitsMargin,
          pathBounds[3] + fontUnitsMargin
        ];
        fontGlyphMaps[fontIndex].set(glyphId, glyphInfo = { path, atlasIndex, sdfViewBox: sdfViewBox2 });
        neededSDFs.push(glyphInfo);
      }
      const { sdfViewBox } = glyphInfo;
      const posX = glyphPositions[positionsIdx++];
      const posY = glyphPositions[positionsIdx++];
      const fontSizeMult = fontSize / unitsPerEm;
      glyphBounds[boundsIdx++] = posX + sdfViewBox[0] * fontSizeMult;
      glyphBounds[boundsIdx++] = posY + sdfViewBox[1] * fontSizeMult;
      glyphBounds[boundsIdx++] = posX + sdfViewBox[2] * fontSizeMult;
      glyphBounds[boundsIdx++] = posY + sdfViewBox[3] * fontSizeMult;
      glyphIds[i] = glyphInfo.atlasIndex;
    });
    timings.quads = (timings.quads || 0) + (now$1() - quadsStart);
    const sdfStart = now$1();
    timings.sdf = {};
    const currentHeight = sdfCanvas.height;
    const neededRows = Math.ceil(atlas.glyphCount / glyphsPerRow);
    const neededHeight = Math.pow(2, Math.ceil(Math.log2(neededRows * sdfGlyphSize)));
    if (neededHeight > currentHeight) {
      console.info(`Increasing SDF texture size ${currentHeight}->${neededHeight}`);
      resizeWebGLCanvasWithoutClearing(sdfCanvas, textureWidth, neededHeight);
      sdfTexture.dispose();
    }
    Promise.all(neededSDFs.map(
      (glyphInfo) => generateGlyphSDF(glyphInfo, atlas, args.gpuAccelerateSDF).then(({ timing }) => {
        timings.sdf[glyphInfo.atlasIndex] = timing;
      })
    )).then(() => {
      if (neededSDFs.length && !atlas.contextLost) {
        safariPre15Workaround(atlas);
        sdfTexture.needsUpdate = true;
      }
      timings.sdfTotal = now$1() - sdfStart;
      timings.total = now$1() - totalStart;
      callback(Object.freeze({
        parameters: args,
        sdfTexture,
        sdfGlyphSize,
        sdfExponent,
        glyphBounds,
        glyphAtlasIndices: glyphIds,
        glyphColors: result.glyphColors,
        caretPositions: result.caretPositions,
        chunkedBounds: result.chunkedBounds,
        ascender: result.ascender,
        descender: result.descender,
        lineHeight: result.lineHeight,
        capHeight: result.capHeight,
        xHeight: result.xHeight,
        topBaseline: result.topBaseline,
        blockBounds: result.blockBounds,
        visibleBounds: result.visibleBounds,
        timings: result.timings
      }));
    });
  });
  Promise.resolve().then(() => {
    if (!atlas.contextLost) {
      warmUpSDFCanvas(sdfCanvas);
    }
  });
}
function generateGlyphSDF({ path, atlasIndex, sdfViewBox }, { sdfGlyphSize, sdfCanvas, contextLost }, useGPU) {
  if (contextLost) {
    return Promise.resolve({ timing: -1 });
  }
  const { textureWidth, sdfExponent } = CONFIG;
  const maxDist = Math.max(sdfViewBox[2] - sdfViewBox[0], sdfViewBox[3] - sdfViewBox[1]);
  const squareIndex = Math.floor(atlasIndex / 4);
  const x = squareIndex % (textureWidth / sdfGlyphSize) * sdfGlyphSize;
  const y = Math.floor(squareIndex / (textureWidth / sdfGlyphSize)) * sdfGlyphSize;
  const channel = atlasIndex % 4;
  return generateSDF(sdfGlyphSize, sdfGlyphSize, path, sdfViewBox, maxDist, sdfExponent, sdfCanvas, x, y, channel, useGPU);
}
function initContextLossHandling(atlas) {
  const canvas = atlas.sdfCanvas;
  canvas.addEventListener("webglcontextlost", (event) => {
    console.log("Context Lost", event);
    event.preventDefault();
    atlas.contextLost = true;
  });
  canvas.addEventListener("webglcontextrestored", (event) => {
    console.log("Context Restored", event);
    atlas.contextLost = false;
    const promises = [];
    atlas.glyphsByFont.forEach((glyphMap) => {
      glyphMap.forEach((glyph) => {
        promises.push(generateGlyphSDF(glyph, atlas, true));
      });
    });
    Promise.all(promises).then(() => {
      safariPre15Workaround(atlas);
      atlas.sdfTexture.needsUpdate = true;
    });
  });
}
function assign(toObj, fromObj) {
  for (let key in fromObj) {
    if (fromObj.hasOwnProperty(key)) {
      toObj[key] = fromObj[key];
    }
  }
  return toObj;
}
let linkEl;
function toAbsoluteURL(path) {
  if (!linkEl) {
    linkEl = typeof document === "undefined" ? {} : document.createElement("a");
  }
  linkEl.href = path;
  return linkEl.href;
}
function safariPre15Workaround(atlas) {
  if (typeof createImageBitmap !== "function") {
    console.info("Safari<15: applying SDF canvas workaround");
    const { sdfCanvas, sdfTexture } = atlas;
    const { width, height } = sdfCanvas;
    const gl = atlas.sdfCanvas.getContext("webgl");
    let pixels = sdfTexture.image.data;
    if (!pixels || pixels.length !== width * height * 4) {
      pixels = new Uint8Array(width * height * 4);
      sdfTexture.image = { width, height, data: pixels };
      sdfTexture.flipY = false;
      sdfTexture.isDataTexture = true;
    }
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  }
}
const typesetterWorkerModule = /* @__PURE__ */ defineWorkerModule({
  name: "Typesetter",
  dependencies: [
    createTypesetter,
    fontResolverWorkerModule,
    bidiFactory
  ],
  init(createTypesetter2, fontResolver, bidiFactory2) {
    return createTypesetter2(fontResolver, bidiFactory2());
  }
});
const typesetInWorker = /* @__PURE__ */ defineWorkerModule({
  name: "Typesetter",
  dependencies: [
    typesetterWorkerModule
  ],
  init(typesetter) {
    return function(args) {
      return new Promise((resolve) => {
        typesetter.typeset(args, resolve);
      });
    };
  },
  getTransferables(result) {
    const transferables = [];
    for (let p in result) {
      if (result[p] && result[p].buffer) {
        transferables.push(result[p].buffer);
      }
    }
    return transferables;
  }
});
typesetInWorker.onMainThread;
const templateGeometries = {};
function getTemplateGeometry(detail) {
  let geom = templateGeometries[detail];
  if (!geom) {
    geom = templateGeometries[detail] = new PlaneGeometry$1(1, 1, detail, detail).translate(0.5, 0.5, 0);
  }
  return geom;
}
const glyphBoundsAttrName = "aTroikaGlyphBounds";
const glyphIndexAttrName = "aTroikaGlyphIndex";
const glyphColorAttrName = "aTroikaGlyphColor";
class GlyphsGeometry extends InstancedBufferGeometry {
  constructor() {
    super();
    this.detail = 1;
    this.curveRadius = 0;
    this.groups = [
      { start: 0, count: Infinity, materialIndex: 0 },
      { start: 0, count: Infinity, materialIndex: 1 }
    ];
    this.boundingSphere = new Sphere();
    this.boundingBox = new Box3();
  }
  computeBoundingSphere() {
  }
  computeBoundingBox() {
  }
  set detail(detail) {
    if (detail !== this._detail) {
      this._detail = detail;
      if (typeof detail !== "number" || detail < 1) {
        detail = 1;
      }
      let tpl = getTemplateGeometry(detail);
      ["position", "normal", "uv"].forEach((attr) => {
        this.attributes[attr] = tpl.attributes[attr].clone();
      });
      this.setIndex(tpl.getIndex().clone());
    }
  }
  get detail() {
    return this._detail;
  }
  set curveRadius(r) {
    if (r !== this._curveRadius) {
      this._curveRadius = r;
      this._updateBounds();
    }
  }
  get curveRadius() {
    return this._curveRadius;
  }
  /**
   * Update the geometry for a new set of glyphs.
   * @param {Float32Array} glyphBounds - An array holding the planar bounds for all glyphs
   *        to be rendered, 4 entries for each glyph: x1,x2,y1,y1
   * @param {Float32Array} glyphAtlasIndices - An array holding the index of each glyph within
   *        the SDF atlas texture.
   * @param {Array} blockBounds - An array holding the [minX, minY, maxX, maxY] across all glyphs
   * @param {Array} [chunkedBounds] - An array of objects describing bounds for each chunk of N
   *        consecutive glyphs: `{start:N, end:N, rect:[minX, minY, maxX, maxY]}`. This can be
   *        used with `applyClipRect` to choose an optimized `instanceCount`.
   * @param {Uint8Array} [glyphColors] - An array holding r,g,b values for each glyph.
   */
  updateGlyphs(glyphBounds, glyphAtlasIndices, blockBounds, chunkedBounds, glyphColors) {
    this.updateAttributeData(glyphBoundsAttrName, glyphBounds, 4);
    this.updateAttributeData(glyphIndexAttrName, glyphAtlasIndices, 1);
    this.updateAttributeData(glyphColorAttrName, glyphColors, 3);
    this._blockBounds = blockBounds;
    this._chunkedBounds = chunkedBounds;
    this.instanceCount = glyphAtlasIndices.length;
    this._updateBounds();
  }
  _updateBounds() {
    const bounds = this._blockBounds;
    if (bounds) {
      const { curveRadius, boundingBox: bbox } = this;
      if (curveRadius) {
        const { PI, floor, min, max, sin, cos } = Math;
        const halfPi = PI / 2;
        const twoPi = PI * 2;
        const absR = Math.abs(curveRadius);
        const leftAngle = bounds[0] / absR;
        const rightAngle = bounds[2] / absR;
        const minX = floor((leftAngle + halfPi) / twoPi) !== floor((rightAngle + halfPi) / twoPi) ? -absR : min(sin(leftAngle) * absR, sin(rightAngle) * absR);
        const maxX = floor((leftAngle - halfPi) / twoPi) !== floor((rightAngle - halfPi) / twoPi) ? absR : max(sin(leftAngle) * absR, sin(rightAngle) * absR);
        const maxZ = floor((leftAngle + PI) / twoPi) !== floor((rightAngle + PI) / twoPi) ? absR * 2 : max(absR - cos(leftAngle) * absR, absR - cos(rightAngle) * absR);
        bbox.min.set(minX, bounds[1], curveRadius < 0 ? -maxZ : 0);
        bbox.max.set(maxX, bounds[3], curveRadius < 0 ? 0 : maxZ);
      } else {
        bbox.min.set(bounds[0], bounds[1], 0);
        bbox.max.set(bounds[2], bounds[3], 0);
      }
      bbox.getBoundingSphere(this.boundingSphere);
    }
  }
  /**
   * Given a clipping rect, and the chunkedBounds from the last updateGlyphs call, choose the lowest
   * `instanceCount` that will show all glyphs within the clipped view. This is an optimization
   * for long blocks of text that are clipped, to skip vertex shader evaluation for glyphs that would
   * be clipped anyway.
   *
   * Note that since `drawElementsInstanced[ANGLE]` only accepts an instance count and not a starting
   * offset, this optimization becomes less effective as the clipRect moves closer to the end of the
   * text block. We could fix that by switching from instancing to a full geometry with a drawRange,
   * but at the expense of much larger attribute buffers (see classdoc above.)
   *
   * @param {Vector4} clipRect
   */
  applyClipRect(clipRect) {
    let count = this.getAttribute(glyphIndexAttrName).count;
    let chunks = this._chunkedBounds;
    if (chunks) {
      for (let i = chunks.length; i--; ) {
        count = chunks[i].end;
        let rect = chunks[i].rect;
        if (rect[1] < clipRect.w && rect[3] > clipRect.y && rect[0] < clipRect.z && rect[2] > clipRect.x) {
          break;
        }
      }
    }
    this.instanceCount = count;
  }
  /**
   * Utility for updating instance attributes with automatic resizing
   */
  updateAttributeData(attrName, newArray, itemSize) {
    const attr = this.getAttribute(attrName);
    if (newArray) {
      if (attr && attr.array.length === newArray.length) {
        attr.array.set(newArray);
        attr.needsUpdate = true;
      } else {
        this.setAttribute(attrName, new InstancedBufferAttribute(newArray, itemSize));
        delete this._maxInstanceCount;
        this.dispose();
      }
    } else if (attr) {
      this.deleteAttribute(attrName);
    }
  }
}
const VERTEX_DEFS = `
uniform vec2 uTroikaSDFTextureSize;
uniform float uTroikaSDFGlyphSize;
uniform vec4 uTroikaTotalBounds;
uniform vec4 uTroikaClipRect;
uniform mat3 uTroikaOrient;
uniform bool uTroikaUseGlyphColors;
uniform float uTroikaEdgeOffset;
uniform float uTroikaBlurRadius;
uniform vec2 uTroikaPositionOffset;
uniform float uTroikaCurveRadius;
attribute vec4 aTroikaGlyphBounds;
attribute float aTroikaGlyphIndex;
attribute vec3 aTroikaGlyphColor;
varying vec2 vTroikaGlyphUV;
varying vec4 vTroikaTextureUVBounds;
varying float vTroikaTextureChannel;
varying vec3 vTroikaGlyphColor;
varying vec2 vTroikaGlyphDimensions;
`;
const VERTEX_TRANSFORM = `
vec4 bounds = aTroikaGlyphBounds;
bounds.xz += uTroikaPositionOffset.x;
bounds.yw -= uTroikaPositionOffset.y;

vec4 outlineBounds = vec4(
  bounds.xy - uTroikaEdgeOffset - uTroikaBlurRadius,
  bounds.zw + uTroikaEdgeOffset + uTroikaBlurRadius
);
vec4 clippedBounds = vec4(
  clamp(outlineBounds.xy, uTroikaClipRect.xy, uTroikaClipRect.zw),
  clamp(outlineBounds.zw, uTroikaClipRect.xy, uTroikaClipRect.zw)
);

vec2 clippedXY = (mix(clippedBounds.xy, clippedBounds.zw, position.xy) - bounds.xy) / (bounds.zw - bounds.xy);

position.xy = mix(bounds.xy, bounds.zw, clippedXY);

uv = (position.xy - uTroikaTotalBounds.xy) / (uTroikaTotalBounds.zw - uTroikaTotalBounds.xy);

float rad = uTroikaCurveRadius;
if (rad != 0.0) {
  float angle = position.x / rad;
  position.xz = vec2(sin(angle) * rad, rad - cos(angle) * rad);
  normal.xz = vec2(sin(angle), cos(angle));
}
  
position = uTroikaOrient * position;
normal = uTroikaOrient * normal;

vTroikaGlyphUV = clippedXY.xy;
vTroikaGlyphDimensions = vec2(bounds[2] - bounds[0], bounds[3] - bounds[1]);

${""}
float txCols = uTroikaSDFTextureSize.x / uTroikaSDFGlyphSize;
vec2 txUvPerSquare = uTroikaSDFGlyphSize / uTroikaSDFTextureSize;
vec2 txStartUV = txUvPerSquare * vec2(
  mod(floor(aTroikaGlyphIndex / 4.0), txCols),
  floor(floor(aTroikaGlyphIndex / 4.0) / txCols)
);
vTroikaTextureUVBounds = vec4(txStartUV, vec2(txStartUV) + txUvPerSquare);
vTroikaTextureChannel = mod(aTroikaGlyphIndex, 4.0);
`;
const FRAGMENT_DEFS = `
uniform sampler2D uTroikaSDFTexture;
uniform vec2 uTroikaSDFTextureSize;
uniform float uTroikaSDFGlyphSize;
uniform float uTroikaSDFExponent;
uniform float uTroikaEdgeOffset;
uniform float uTroikaFillOpacity;
uniform float uTroikaBlurRadius;
uniform vec3 uTroikaStrokeColor;
uniform float uTroikaStrokeWidth;
uniform float uTroikaStrokeOpacity;
uniform bool uTroikaSDFDebug;
varying vec2 vTroikaGlyphUV;
varying vec4 vTroikaTextureUVBounds;
varying float vTroikaTextureChannel;
varying vec2 vTroikaGlyphDimensions;

float troikaSdfValueToSignedDistance(float alpha) {
  // Inverse of exponential encoding in webgl-sdf-generator
  ${""}
  float maxDimension = max(vTroikaGlyphDimensions.x, vTroikaGlyphDimensions.y);
  float absDist = (1.0 - pow(2.0 * (alpha > 0.5 ? 1.0 - alpha : alpha), 1.0 / uTroikaSDFExponent)) * maxDimension;
  float signedDist = absDist * (alpha > 0.5 ? -1.0 : 1.0);
  return signedDist;
}

float troikaGlyphUvToSdfValue(vec2 glyphUV) {
  vec2 textureUV = mix(vTroikaTextureUVBounds.xy, vTroikaTextureUVBounds.zw, glyphUV);
  vec4 rgba = texture2D(uTroikaSDFTexture, textureUV);
  float ch = floor(vTroikaTextureChannel + 0.5); //NOTE: can't use round() in WebGL1
  return ch == 0.0 ? rgba.r : ch == 1.0 ? rgba.g : ch == 2.0 ? rgba.b : rgba.a;
}

float troikaGlyphUvToDistance(vec2 uv) {
  return troikaSdfValueToSignedDistance(troikaGlyphUvToSdfValue(uv));
}

float troikaGetAADist() {
  ${""}
  #if defined(GL_OES_standard_derivatives) || __VERSION__ >= 300
  return length(fwidth(vTroikaGlyphUV * vTroikaGlyphDimensions)) * 0.5;
  #else
  return vTroikaGlyphDimensions.x / 64.0;
  #endif
}

float troikaGetFragDistValue() {
  vec2 clampedGlyphUV = clamp(vTroikaGlyphUV, 0.5 / uTroikaSDFGlyphSize, 1.0 - 0.5 / uTroikaSDFGlyphSize);
  float distance = troikaGlyphUvToDistance(clampedGlyphUV);
 
  // Extrapolate distance when outside bounds:
  distance += clampedGlyphUV == vTroikaGlyphUV ? 0.0 : 
    length((vTroikaGlyphUV - clampedGlyphUV) * vTroikaGlyphDimensions);

  ${""}

  return distance;
}

float troikaGetEdgeAlpha(float distance, float distanceOffset, float aaDist) {
  #if defined(IS_DEPTH_MATERIAL) || defined(IS_DISTANCE_MATERIAL)
  float alpha = step(-distanceOffset, -distance);
  #else

  float alpha = smoothstep(
    distanceOffset + aaDist,
    distanceOffset - aaDist,
    distance
  );
  #endif

  return alpha;
}
`;
const FRAGMENT_TRANSFORM = `
float aaDist = troikaGetAADist();
float fragDistance = troikaGetFragDistValue();
float edgeAlpha = uTroikaSDFDebug ?
  troikaGlyphUvToSdfValue(vTroikaGlyphUV) :
  troikaGetEdgeAlpha(fragDistance, uTroikaEdgeOffset, max(aaDist, uTroikaBlurRadius));

#if !defined(IS_DEPTH_MATERIAL) && !defined(IS_DISTANCE_MATERIAL)
vec4 fillRGBA = gl_FragColor;
fillRGBA.a *= uTroikaFillOpacity;
vec4 strokeRGBA = uTroikaStrokeWidth == 0.0 ? fillRGBA : vec4(uTroikaStrokeColor, uTroikaStrokeOpacity);
if (fillRGBA.a == 0.0) fillRGBA.rgb = strokeRGBA.rgb;
gl_FragColor = mix(fillRGBA, strokeRGBA, smoothstep(
  -uTroikaStrokeWidth - aaDist,
  -uTroikaStrokeWidth + aaDist,
  fragDistance
));
gl_FragColor.a *= edgeAlpha;
#endif

if (edgeAlpha == 0.0) {
  discard;
}
`;
function createTextDerivedMaterial(baseMaterial) {
  const textMaterial = createDerivedMaterial(baseMaterial, {
    chained: true,
    extensions: {
      derivatives: true
    },
    uniforms: {
      uTroikaSDFTexture: { value: null },
      uTroikaSDFTextureSize: { value: new Vector2$1() },
      uTroikaSDFGlyphSize: { value: 0 },
      uTroikaSDFExponent: { value: 0 },
      uTroikaTotalBounds: { value: new Vector4$1(0, 0, 0, 0) },
      uTroikaClipRect: { value: new Vector4$1(0, 0, 0, 0) },
      uTroikaEdgeOffset: { value: 0 },
      uTroikaFillOpacity: { value: 1 },
      uTroikaPositionOffset: { value: new Vector2$1() },
      uTroikaCurveRadius: { value: 0 },
      uTroikaBlurRadius: { value: 0 },
      uTroikaStrokeWidth: { value: 0 },
      uTroikaStrokeColor: { value: new Color$1() },
      uTroikaStrokeOpacity: { value: 1 },
      uTroikaOrient: { value: new Matrix3() },
      uTroikaUseGlyphColors: { value: true },
      uTroikaSDFDebug: { value: false }
    },
    vertexDefs: VERTEX_DEFS,
    vertexTransform: VERTEX_TRANSFORM,
    fragmentDefs: FRAGMENT_DEFS,
    fragmentColorTransform: FRAGMENT_TRANSFORM,
    customRewriter({ vertexShader, fragmentShader }) {
      let uDiffuseRE = /\buniform\s+vec3\s+diffuse\b/;
      if (uDiffuseRE.test(fragmentShader)) {
        fragmentShader = fragmentShader.replace(uDiffuseRE, "varying vec3 vTroikaGlyphColor").replace(/\bdiffuse\b/g, "vTroikaGlyphColor");
        if (!uDiffuseRE.test(vertexShader)) {
          vertexShader = vertexShader.replace(
            voidMainRegExp,
            "uniform vec3 diffuse;\n$&\nvTroikaGlyphColor = uTroikaUseGlyphColors ? aTroikaGlyphColor / 255.0 : diffuse;\n"
          );
        }
      }
      return { vertexShader, fragmentShader };
    }
  });
  textMaterial.transparent = true;
  textMaterial.forceSinglePass = true;
  Object.defineProperties(textMaterial, {
    isTroikaTextMaterial: { value: true },
    // WebGLShadowMap reverses the side of the shadow material by default, which fails
    // for planes, so here we force the `shadowSide` to always match the main side.
    shadowSide: {
      get() {
        return this.side;
      },
      set() {
      }
    }
  });
  return textMaterial;
}
const defaultMaterial = /* @__PURE__ */ new MeshBasicMaterial({
  color: 16777215,
  side: DoubleSide$1,
  transparent: true
});
const defaultStrokeColor = 8421504;
const tempMat4 = /* @__PURE__ */ new Matrix4();
const tempVec3a = /* @__PURE__ */ new Vector3$1();
const tempVec3b = /* @__PURE__ */ new Vector3$1();
const tempArray = [];
const origin = /* @__PURE__ */ new Vector3$1();
const defaultOrient = "+x+y";
function first(o) {
  return Array.isArray(o) ? o[0] : o;
}
let getFlatRaycastMesh = () => {
  const mesh = new Mesh$1(
    new PlaneGeometry$1(1, 1),
    defaultMaterial
  );
  getFlatRaycastMesh = () => mesh;
  return mesh;
};
let getCurvedRaycastMesh = () => {
  const mesh = new Mesh$1(
    new PlaneGeometry$1(1, 1, 32, 1),
    defaultMaterial
  );
  getCurvedRaycastMesh = () => mesh;
  return mesh;
};
const syncStartEvent = { type: "syncstart" };
const syncCompleteEvent = { type: "synccomplete" };
const SYNCABLE_PROPS = [
  "font",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "lang",
  "letterSpacing",
  "lineHeight",
  "maxWidth",
  "overflowWrap",
  "text",
  "direction",
  "textAlign",
  "textIndent",
  "whiteSpace",
  "anchorX",
  "anchorY",
  "colorRanges",
  "sdfGlyphSize"
];
const COPYABLE_PROPS = SYNCABLE_PROPS.concat(
  "material",
  "color",
  "depthOffset",
  "clipRect",
  "curveRadius",
  "orientation",
  "glyphGeometryDetail"
);
class Text extends Mesh$1 {
  constructor() {
    const geometry = new GlyphsGeometry();
    super(geometry, null);
    this.text = "";
    this.anchorX = 0;
    this.anchorY = 0;
    this.curveRadius = 0;
    this.direction = "auto";
    this.font = null;
    this.unicodeFontsURL = null;
    this.fontSize = 0.1;
    this.fontWeight = "normal";
    this.fontStyle = "normal";
    this.lang = null;
    this.letterSpacing = 0;
    this.lineHeight = "normal";
    this.maxWidth = Infinity;
    this.overflowWrap = "normal";
    this.textAlign = "left";
    this.textIndent = 0;
    this.whiteSpace = "normal";
    this.material = null;
    this.color = null;
    this.colorRanges = null;
    this.outlineWidth = 0;
    this.outlineColor = 0;
    this.outlineOpacity = 1;
    this.outlineBlur = 0;
    this.outlineOffsetX = 0;
    this.outlineOffsetY = 0;
    this.strokeWidth = 0;
    this.strokeColor = defaultStrokeColor;
    this.strokeOpacity = 1;
    this.fillOpacity = 1;
    this.depthOffset = 0;
    this.clipRect = null;
    this.orientation = defaultOrient;
    this.glyphGeometryDetail = 1;
    this.sdfGlyphSize = null;
    this.gpuAccelerateSDF = true;
    this.debugSDF = false;
  }
  /**
   * Updates the text rendering according to the current text-related configuration properties.
   * This is an async process, so you can pass in a callback function to be executed when it
   * finishes.
   * @param {function} [callback]
   */
  sync(callback) {
    if (this._needsSync) {
      this._needsSync = false;
      if (this._isSyncing) {
        (this._queuedSyncs || (this._queuedSyncs = [])).push(callback);
      } else {
        this._isSyncing = true;
        this.dispatchEvent(syncStartEvent);
        getTextRenderInfo({
          text: this.text,
          font: this.font,
          lang: this.lang,
          fontSize: this.fontSize || 0.1,
          fontWeight: this.fontWeight || "normal",
          fontStyle: this.fontStyle || "normal",
          letterSpacing: this.letterSpacing || 0,
          lineHeight: this.lineHeight || "normal",
          maxWidth: this.maxWidth,
          direction: this.direction || "auto",
          textAlign: this.textAlign,
          textIndent: this.textIndent,
          whiteSpace: this.whiteSpace,
          overflowWrap: this.overflowWrap,
          anchorX: this.anchorX,
          anchorY: this.anchorY,
          colorRanges: this.colorRanges,
          includeCaretPositions: true,
          //TODO parameterize
          sdfGlyphSize: this.sdfGlyphSize,
          gpuAccelerateSDF: this.gpuAccelerateSDF,
          unicodeFontsURL: this.unicodeFontsURL
        }, (textRenderInfo) => {
          this._isSyncing = false;
          this._textRenderInfo = textRenderInfo;
          this.geometry.updateGlyphs(
            textRenderInfo.glyphBounds,
            textRenderInfo.glyphAtlasIndices,
            textRenderInfo.blockBounds,
            textRenderInfo.chunkedBounds,
            textRenderInfo.glyphColors
          );
          const queued = this._queuedSyncs;
          if (queued) {
            this._queuedSyncs = null;
            this._needsSync = true;
            this.sync(() => {
              queued.forEach((fn) => fn && fn());
            });
          }
          this.dispatchEvent(syncCompleteEvent);
          if (callback) {
            callback();
          }
        });
      }
    }
  }
  /**
   * Initiate a sync if needed - note it won't complete until next frame at the
   * earliest so if possible it's a good idea to call sync() manually as soon as
   * all the properties have been set.
   * @override
   */
  onBeforeRender(renderer, scene, camera, geometry, material, group) {
    this.sync();
    if (material.isTroikaTextMaterial) {
      this._prepareForRender(material);
    }
  }
  /**
   * Shortcut to dispose the geometry specific to this instance.
   * Note: we don't also dispose the derived material here because if anything else is
   * sharing the same base material it will result in a pause next frame as the program
   * is recompiled. Instead users can dispose the base material manually, like normal,
   * and we'll also dispose the derived material at that time.
   */
  dispose() {
    this.geometry.dispose();
  }
  /**
   * @property {TroikaTextRenderInfo|null} textRenderInfo
   * @readonly
   * The current processed rendering data for this TextMesh, returned by the TextBuilder after
   * a `sync()` call. This will be `null` initially, and may be stale for a short period until
   * the asynchrous `sync()` process completes.
   */
  get textRenderInfo() {
    return this._textRenderInfo || null;
  }
  /**
   * Create the text derived material from the base material. Can be overridden to use a custom
   * derived material.
   */
  createDerivedMaterial(baseMaterial) {
    return createTextDerivedMaterial(baseMaterial);
  }
  // Handler for automatically wrapping the base material with our upgrades. We do the wrapping
  // lazily on _read_ rather than write to avoid unnecessary wrapping on transient values.
  get material() {
    let derivedMaterial = this._derivedMaterial;
    const baseMaterial = this._baseMaterial || this._defaultMaterial || (this._defaultMaterial = defaultMaterial.clone());
    if (!derivedMaterial || !derivedMaterial.isDerivedFrom(baseMaterial)) {
      derivedMaterial = this._derivedMaterial = this.createDerivedMaterial(baseMaterial);
      baseMaterial.addEventListener("dispose", function onDispose() {
        baseMaterial.removeEventListener("dispose", onDispose);
        derivedMaterial.dispose();
      });
    }
    if (this.hasOutline()) {
      let outlineMaterial = derivedMaterial._outlineMtl;
      if (!outlineMaterial) {
        outlineMaterial = derivedMaterial._outlineMtl = Object.create(derivedMaterial, {
          id: { value: derivedMaterial.id + 0.1 }
        });
        outlineMaterial.isTextOutlineMaterial = true;
        outlineMaterial.depthWrite = false;
        outlineMaterial.map = null;
        derivedMaterial.addEventListener("dispose", function onDispose() {
          derivedMaterial.removeEventListener("dispose", onDispose);
          outlineMaterial.dispose();
        });
      }
      return [
        outlineMaterial,
        derivedMaterial
      ];
    } else {
      return derivedMaterial;
    }
  }
  set material(baseMaterial) {
    if (baseMaterial && baseMaterial.isTroikaTextMaterial) {
      this._derivedMaterial = baseMaterial;
      this._baseMaterial = baseMaterial.baseMaterial;
    } else {
      this._baseMaterial = baseMaterial;
    }
  }
  hasOutline() {
    return !!(this.outlineWidth || this.outlineBlur || this.outlineOffsetX || this.outlineOffsetY);
  }
  get glyphGeometryDetail() {
    return this.geometry.detail;
  }
  set glyphGeometryDetail(detail) {
    this.geometry.detail = detail;
  }
  get curveRadius() {
    return this.geometry.curveRadius;
  }
  set curveRadius(r) {
    this.geometry.curveRadius = r;
  }
  // Create and update material for shadows upon request:
  get customDepthMaterial() {
    return first(this.material).getDepthMaterial();
  }
  set customDepthMaterial(m) {
  }
  get customDistanceMaterial() {
    return first(this.material).getDistanceMaterial();
  }
  set customDistanceMaterial(m) {
  }
  _prepareForRender(material) {
    const isOutline = material.isTextOutlineMaterial;
    const uniforms = material.uniforms;
    const textInfo = this.textRenderInfo;
    if (textInfo) {
      const { sdfTexture, blockBounds } = textInfo;
      uniforms.uTroikaSDFTexture.value = sdfTexture;
      uniforms.uTroikaSDFTextureSize.value.set(sdfTexture.image.width, sdfTexture.image.height);
      uniforms.uTroikaSDFGlyphSize.value = textInfo.sdfGlyphSize;
      uniforms.uTroikaSDFExponent.value = textInfo.sdfExponent;
      uniforms.uTroikaTotalBounds.value.fromArray(blockBounds);
      uniforms.uTroikaUseGlyphColors.value = !isOutline && !!textInfo.glyphColors;
      let distanceOffset = 0;
      let blurRadius = 0;
      let strokeWidth = 0;
      let fillOpacity;
      let strokeOpacity;
      let strokeColor;
      let offsetX = 0;
      let offsetY = 0;
      if (isOutline) {
        let { outlineWidth, outlineOffsetX, outlineOffsetY, outlineBlur, outlineOpacity } = this;
        distanceOffset = this._parsePercent(outlineWidth) || 0;
        blurRadius = Math.max(0, this._parsePercent(outlineBlur) || 0);
        fillOpacity = outlineOpacity;
        offsetX = this._parsePercent(outlineOffsetX) || 0;
        offsetY = this._parsePercent(outlineOffsetY) || 0;
      } else {
        strokeWidth = Math.max(0, this._parsePercent(this.strokeWidth) || 0);
        if (strokeWidth) {
          strokeColor = this.strokeColor;
          uniforms.uTroikaStrokeColor.value.set(strokeColor == null ? defaultStrokeColor : strokeColor);
          strokeOpacity = this.strokeOpacity;
          if (strokeOpacity == null) strokeOpacity = 1;
        }
        fillOpacity = this.fillOpacity;
      }
      uniforms.uTroikaEdgeOffset.value = distanceOffset;
      uniforms.uTroikaPositionOffset.value.set(offsetX, offsetY);
      uniforms.uTroikaBlurRadius.value = blurRadius;
      uniforms.uTroikaStrokeWidth.value = strokeWidth;
      uniforms.uTroikaStrokeOpacity.value = strokeOpacity;
      uniforms.uTroikaFillOpacity.value = fillOpacity == null ? 1 : fillOpacity;
      uniforms.uTroikaCurveRadius.value = this.curveRadius || 0;
      let clipRect = this.clipRect;
      if (clipRect && Array.isArray(clipRect) && clipRect.length === 4) {
        uniforms.uTroikaClipRect.value.fromArray(clipRect);
      } else {
        const pad = (this.fontSize || 0.1) * 100;
        uniforms.uTroikaClipRect.value.set(
          blockBounds[0] - pad,
          blockBounds[1] - pad,
          blockBounds[2] + pad,
          blockBounds[3] + pad
        );
      }
      this.geometry.applyClipRect(uniforms.uTroikaClipRect.value);
    }
    uniforms.uTroikaSDFDebug.value = !!this.debugSDF;
    material.polygonOffset = !!this.depthOffset;
    material.polygonOffsetFactor = material.polygonOffsetUnits = this.depthOffset || 0;
    const color = isOutline ? this.outlineColor || 0 : this.color;
    if (color == null) {
      delete material.color;
    } else {
      const colorObj = material.hasOwnProperty("color") ? material.color : material.color = new Color$1();
      if (color !== colorObj._input || typeof color === "object") {
        colorObj.set(colorObj._input = color);
      }
    }
    let orient = this.orientation || defaultOrient;
    if (orient !== material._orientation) {
      let rotMat = uniforms.uTroikaOrient.value;
      orient = orient.replace(/[^-+xyz]/g, "");
      let match = orient !== defaultOrient && orient.match(/^([-+])([xyz])([-+])([xyz])$/);
      if (match) {
        let [, hSign, hAxis, vSign, vAxis] = match;
        tempVec3a.set(0, 0, 0)[hAxis] = hSign === "-" ? 1 : -1;
        tempVec3b.set(0, 0, 0)[vAxis] = vSign === "-" ? -1 : 1;
        tempMat4.lookAt(origin, tempVec3a.cross(tempVec3b), tempVec3b);
        rotMat.setFromMatrix4(tempMat4);
      } else {
        rotMat.identity();
      }
      material._orientation = orient;
    }
  }
  _parsePercent(value) {
    if (typeof value === "string") {
      let match = value.match(/^(-?[\d.]+)%$/);
      let pct = match ? parseFloat(match[1]) : NaN;
      value = (isNaN(pct) ? 0 : pct / 100) * this.fontSize;
    }
    return value;
  }
  /**
   * Translate a point in local space to an x/y in the text plane.
   */
  localPositionToTextCoords(position, target = new Vector2$1()) {
    target.copy(position);
    const r = this.curveRadius;
    if (r) {
      target.x = Math.atan2(position.x, Math.abs(r) - Math.abs(position.z)) * Math.abs(r);
    }
    return target;
  }
  /**
   * Translate a point in world space to an x/y in the text plane.
   */
  worldPositionToTextCoords(position, target = new Vector2$1()) {
    tempVec3a.copy(position);
    return this.localPositionToTextCoords(this.worldToLocal(tempVec3a), target);
  }
  /**
   * @override Custom raycasting to test against the whole text block's max rectangular bounds
   * TODO is there any reason to make this more granular, like within individual line or glyph rects?
   */
  raycast(raycaster, intersects) {
    const { textRenderInfo, curveRadius } = this;
    if (textRenderInfo) {
      const bounds = textRenderInfo.blockBounds;
      const raycastMesh = curveRadius ? getCurvedRaycastMesh() : getFlatRaycastMesh();
      const geom = raycastMesh.geometry;
      const { position, uv } = geom.attributes;
      for (let i = 0; i < uv.count; i++) {
        let x = bounds[0] + uv.getX(i) * (bounds[2] - bounds[0]);
        const y = bounds[1] + uv.getY(i) * (bounds[3] - bounds[1]);
        let z = 0;
        if (curveRadius) {
          z = curveRadius - Math.cos(x / curveRadius) * curveRadius;
          x = Math.sin(x / curveRadius) * curveRadius;
        }
        position.setXYZ(i, x, y, z);
      }
      geom.boundingSphere = this.geometry.boundingSphere;
      geom.boundingBox = this.geometry.boundingBox;
      raycastMesh.matrixWorld = this.matrixWorld;
      raycastMesh.material.side = this.material.side;
      tempArray.length = 0;
      raycastMesh.raycast(raycaster, tempArray);
      for (let i = 0; i < tempArray.length; i++) {
        tempArray[i].object = this;
        intersects.push(tempArray[i]);
      }
    }
  }
  copy(source) {
    const geom = this.geometry;
    super.copy(source);
    this.geometry = geom;
    COPYABLE_PROPS.forEach((prop) => {
      this[prop] = source[prop];
    });
    return this;
  }
  clone() {
    return new this.constructor().copy(this);
  }
}
SYNCABLE_PROPS.forEach((prop) => {
  const privateKey = "_private_" + prop;
  Object.defineProperty(Text.prototype, prop, {
    get() {
      return this[privateKey];
    },
    set(value) {
      if (value !== this[privateKey]) {
        this[privateKey] = value;
        this._needsSync = true;
      }
    }
  });
});
new Box3();
new Color$1();

const XRIFT_STUDIO_RUNTIME_FORMAT = "xrift-studio.runtime";
const XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION = "1.0.0";
function isXriftRuntimeManifest(value) {
    if (!isRecord(value))
        return false;
    return (value.format === XRIFT_STUDIO_RUNTIME_FORMAT &&
        value.schemaVersion === XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION &&
        value.generator === "xrift-studio" &&
        (value.projectKind === "world" || value.projectKind === "item") &&
        typeof value.entryScene === "string" &&
        isRecord(value.scenes) &&
        isRecord(value.assets) &&
        isRecord(value.scenes[value.entryScene]));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

const {AmbientLight,BackSide,BoxGeometry,ClampToEdgeWrapping,Color,ConeGeometry,CylinderGeometry,DirectionalLight,DoubleSide,FrontSide,Group,HemisphereLight,LoadingManager,Mesh,MeshStandardMaterial,MirroredRepeatWrapping,PlaneGeometry,PointLight,RectAreaLight,RepeatWrapping,SphereGeometry,SpotLight,ShaderMaterial,SRGBColorSpace,Vector2,Vector3,Vector4,Texture,TextureLoader} = await importShared('three');
const DEFAULT_KTX2_TRANSCODER_PATH = "https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master/basis/";
const DEFAULT_DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
class XriftThreeLoader {
  constructor(options = {}) {
    this.assetBaseUrl = options.assetBaseUrl;
    this.manager = options.manager ?? new LoadingManager();
    this.renderer = options.renderer;
    this.ktx2TranscoderPath = options.ktx2TranscoderPath ?? DEFAULT_KTX2_TRANSCODER_PATH;
    this.dracoDecoderPath = options.dracoDecoderPath ?? DEFAULT_DRACO_DECODER_PATH;
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
    const assets = Object.values(manifest.assets);
    const modelAssets = assets.filter((asset) => asset.kind === "model");
    const textureAssets = assets.filter((asset) => asset.kind === "texture");
    const [modelEntries, textureEntries] = await Promise.all([
      Promise.all(modelAssets.map(async (asset) => [
        asset.id,
        await this.loadModel(asset, assetBase)
      ])),
      Promise.all(textureAssets.map(async (asset) => [
        asset.id,
        await this.loadTexture(asset, assetBase)
      ]))
    ]);
    const models = new Map(modelEntries);
    const textures = new Map(textureEntries);
    const materials = this.createMaterials(manifest, textures, diagnostics);
    const entities = /* @__PURE__ */ new Map();
    const animations = [];
    const animationClipsByEntity = /* @__PURE__ */ new Map();
    const interactionAnimationIndicesByEntity = /* @__PURE__ */ new Map();
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
      if (!group)
        continue;
      const parent = entity.parentId ? entities.get(entity.parentId) : void 0;
      (parent ?? null)?.add(group);
    }
    const root = new Group();
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
          models,
          materials,
          animations,
          animationClipsByEntity,
          interactionAnimationIndicesByEntity,
          diagnostics
        });
        if (object)
          group.add(object);
      }
    }
    return {
      root,
      animations,
      animationClipsByEntity,
      interactionAnimationIndicesByEntity,
      entities,
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
  async loadModel(asset, assetBase) {
    const url = new URL(asset.url, assetBase).toString();
    if (asset.sourceFormat === "obj") {
      const root = await new OBJLoader(this.manager).loadAsync(url);
      root.scale.multiplyScalar(asset.scale);
      return {
        root,
        animations: [],
        interactionAnimationIndices: [],
        sourceMaterials: /* @__PURE__ */ new Map()
      };
    }
    const loader = new GLTFLoader(this.manager);
    const dracoLoader = new DRACOLoader(this.manager).setDecoderPath(this.dracoDecoderPath);
    loader.setDRACOLoader(dracoLoader);
    if (asset.openBrush?.renderer === "three-icosa") {
      const { GLTFGoogleTiltBrushMaterialExtension } = await __vitePreload(async () => { const { GLTFGoogleTiltBrushMaterialExtension } = await import('./three-icosa.module-DhY13CNW.js');return { GLTFGoogleTiltBrushMaterialExtension }},true              ?__vite__mapDeps([0,1]):void 0);
      loader.register((parser) => new GLTFGoogleTiltBrushMaterialExtension(parser, asset.openBrush.brushBaseUrl));
    }
    let gltf;
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
      interactionAnimationIndices: getKhrInteractivityOnStartAnimationIndices(gltf.parser.json?.extensions?.KHR_interactivity),
      sourceMaterials: collectSourceMaterials(gltf.scene)
    };
  }
  async loadTexture(asset, assetBase) {
    const url = new URL(asset.url, assetBase).toString();
    const texture = asset.sourceFormat === "ktx2" ? await this.loadKtx2Texture(url) : await new TextureLoader(this.manager).loadAsync(url);
    texture.flipY = asset.flipY;
    if (asset.colorSpace === "srgb")
      texture.colorSpace = SRGBColorSpace;
    texture.wrapS = runtimeTextureWrapping(asset.sampler.wrapS);
    texture.wrapT = runtimeTextureWrapping(asset.sampler.wrapT);
    return texture;
  }
  async loadKtx2Texture(url) {
    if (!this.renderer) {
      throw new Error("KTX2 texture loading requires XriftThreeLoaderOptions.renderer");
    }
    const loader = new KTX2Loader(this.manager).setTranscoderPath(this.ktx2TranscoderPath).detectSupport(this.renderer);
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
      const pbr = asRecord(properties.pbrMetallicRoughness);
      const baseColor = asNumberArray(pbr?.baseColorFactor, 4) ?? [1, 1, 1, 1];
      const [red = 1, green = 1, blue = 1, alpha = 1] = baseColor;
      const material = new MeshStandardMaterial({
        color: new Color(red, green, blue),
        opacity: alpha,
        transparent: properties.alphaMode === "BLEND" || alpha < 1,
        alphaTest: properties.alphaMode === "MASK" && typeof properties.alphaCutoff === "number" ? properties.alphaCutoff : 0,
        metalness: typeof pbr?.metallicFactor === "number" ? pbr.metallicFactor : 0,
        roughness: typeof pbr?.roughnessFactor === "number" ? pbr.roughnessFactor : 1,
        ...properties.doubleSided === true ? { side: DoubleSide } : {}
      });
      const baseColorTexture = asRecord(pbr?.baseColorTexture);
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
        const [red2 = 0, green2 = 0, blue2 = 0] = emissive;
        material.emissive = new Color(red2, green2, blue2);
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
        const mesh = new Mesh(createPrimitiveGeometry(component.geometry.primitive), material ?? new MeshStandardMaterial({ color: 12568533 }));
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
          assetId: component.geometry.assetId
        });
        return null;
      }
      const instance = selectRuntimeSourceNode(clone(loaded.root), component.geometry.sourceNodeIndex);
      applyModelMaterials(instance, loaded, component, input.manifest, input.materials);
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
          ...input.animationClipsByEntity.get(input.entity.id) ?? [],
          ...loaded.animations
        ]);
      }
      if (loaded.interactionAnimationIndices.length > 0) {
        input.interactionAnimationIndicesByEntity.set(input.entity.id, loaded.interactionAnimationIndices);
      }
      instance.userData.xriftStudioComponentId = component.id;
      return instance;
    }
    if (component.type === "animation")
      return null;
    if (component.type === "light")
      return createLight(component);
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
    if (component.type === "spawn-point" || component.type === "collider" || component.type === "rigid-body") {
      const marker = new Group();
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
      return [name, { value: new Color(uniform.value) }];
    }
    if (uniform.kind === "vector") {
      const value = uniform.value;
      const vector = value.length === 2 ? new Vector2(value[0] ?? 0, value[1] ?? 0) : value.length === 3 ? new Vector3(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0) : new Vector4(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 0);
      return [name, { value: vector }];
    }
    return [name, { value: uniform.value }];
  }));
  const material = new ShaderMaterial({
    name: shader.sourceModulePath,
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    uniforms,
    defines: variant?.defines ?? {},
    side: variant?.side === "back" ? BackSide : variant?.side === "double" ? DoubleSide : FrontSide,
    transparent: variant?.transparent ?? false,
    depthWrite: variant?.depthWrite ?? true
  });
  if (shader.animatedTimeUniform) {
    material.userData.xriftAnimatedTimeUniform = shader.animatedTimeUniform;
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
  const transform = asRecord(textureInfo.transform);
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
  result.root.traverse((object) => {
    if (!(object instanceof Mesh))
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
  for (const geometry of geometries)
    geometry.dispose();
  for (const material of materials)
    material.dispose();
  for (const texture of textures)
    texture.dispose();
}
function createPrimitiveGeometry(primitive) {
  if (primitive === "box")
    return new BoxGeometry();
  if (primitive === "sphere")
    return new SphereGeometry(0.5, 32, 20);
  if (primitive === "cylinder")
    return new CylinderGeometry(0.5, 0.5, 1, 32);
  if (primitive === "cone")
    return new ConeGeometry(0.5, 1, 32);
  return new PlaneGeometry(1, 1);
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
    if (!(object instanceof Mesh))
      return;
    const original = Array.isArray(object.material) ? object.material : [object.material];
    const next = original.map((material, index) => {
      const taggedIndex = material.userData.xriftSourceMaterialIndex;
      const slot = asset.materialSlots.find((candidate) => candidate.sourceMaterialIndex === taggedIndex || candidate.sourceMaterialIndex === index || candidate.name === material.name);
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
    if (!(object instanceof Mesh))
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
function getKhrInteractivityOnStartAnimationIndices(value) {
  const extension = asRecord(value);
  const graphs = Array.isArray(extension?.graphs) ? extension.graphs : [];
  const graphIndex = typeof extension?.graph === "number" && Number.isInteger(extension.graph) && extension.graph >= 0 ? extension.graph : 0;
  const graph = asRecord(graphs[graphIndex]);
  const declarations = Array.isArray(graph?.declarations) ? graph.declarations : [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const operationFor = (node) => {
    const declarationIndex = node?.declaration;
    if (typeof declarationIndex !== "number" || !Number.isInteger(declarationIndex) || declarationIndex < 0) {
      return void 0;
    }
    return asRecord(declarations[declarationIndex])?.op;
  };
  const pending = nodes.flatMap((candidate, nodeIndex) => operationFor(asRecord(candidate)) === "event/onStart" ? [nodeIndex] : []);
  const visited = /* @__PURE__ */ new Set();
  const animationIndices = /* @__PURE__ */ new Set();
  while (pending.length > 0) {
    const nodeIndex = pending.shift();
    if (nodeIndex === void 0 || visited.has(nodeIndex))
      continue;
    visited.add(nodeIndex);
    const node = asRecord(nodes[nodeIndex]);
    if (!node)
      continue;
    if (operationFor(node) === "animation/start") {
      const animationValue = asRecord(asRecord(node.values)?.animation)?.value;
      const animationIndex = Array.isArray(animationValue) ? animationValue[0] : void 0;
      if (typeof animationIndex === "number" && Number.isInteger(animationIndex) && animationIndex >= 0) {
        animationIndices.add(animationIndex);
      }
    }
    const flows = asRecord(node.flows);
    for (const candidate of Object.values(flows ?? {})) {
      const targetIndex = asRecord(candidate)?.node;
      if (typeof targetIndex === "number" && Number.isInteger(targetIndex) && targetIndex >= 0 && !visited.has(targetIndex)) {
        pending.push(targetIndex);
      }
    }
  }
  return [...animationIndices].sort((left, right) => left - right);
}
function tagSourceMaterialIndices(gltf) {
  const parser = gltf.parser;
  gltf.scene.traverse((object) => {
    const sourceNodeIndex = parser.associations.get(object)?.nodes;
    if (typeof sourceNodeIndex === "number" && Number.isInteger(sourceNodeIndex)) {
      object.userData.xriftSourceNodeIndex = sourceNodeIndex;
    }
    if (!(object instanceof Mesh))
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
function createLight(component) {
  let light;
  if (component.lightType === "ambient") {
    light = new AmbientLight(component.color, component.intensity);
  } else if (component.lightType === "hemisphere") {
    light = new HemisphereLight(component.color, component.groundColor ?? "#20242d", component.intensity);
  } else if (component.lightType === "point") {
    light = new PointLight(component.color, component.intensity, component.distance ?? 0, component.decay ?? 2);
  } else if (component.lightType === "spot") {
    const spot = new SpotLight(component.color, component.intensity, component.distance ?? 0, component.angle ?? Math.PI / 3, component.penumbra ?? 0, component.decay ?? 2);
    spot.castShadow = component.castShadow;
    light = spot;
  } else if (component.lightType === "rectArea") {
    light = new RectAreaLight(component.color, component.intensity, component.width ?? 1, component.height ?? 1);
  } else {
    const directional = new DirectionalLight(component.color, component.intensity);
    directional.castShadow = component.castShadow;
    light = directional;
  }
  light.userData.xriftStudioComponentId = component.id;
  return light;
}
function asRecord(value) {
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

const {Fragment:_Fragment,jsx:_jsx,jsxs:_jsxs} = await importShared('react/jsx-runtime');

const {useEffect,useMemo,useState} = await importShared('react');

const {useFrame,useThree} = await importShared('@react-three/fiber');

const {AnimationMixer,LoopOnce,LoopRepeat} = await importShared('three');
function XriftWorld(props) {
    return _jsx(XriftRuntimeScene, { ...props, expectedKind: "world" });
}
function XriftRuntimeScene({ manifest, assetBaseUrl, fallback = null, onLoad, onError, expectedKind, }) {
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
    return result ? (_jsxs(_Fragment, { children: [_jsx("primitive", { object: result.root }), _jsx(XriftRuntimeAnimations, { result: result })] })) : fallback;
}
function XriftRuntimeAnimations({ result }) {
    const playbacks = useMemo(() => {
        const scene = result.manifest.scenes[result.manifest.entryScene];
        if (!scene)
            return [];
        return Object.values(scene.entities).flatMap((entity) => {
            const target = result.entities.get(entity.id);
            const clips = result.animationClipsByEntity.get(entity.id) ?? [];
            if (!target || clips.length === 0)
                return [];
            const component = entity.components.find((candidate) => candidate.type === "animation" &&
                candidate.enabled);
            const indices = new Set();
            if (component?.autoplay)
                indices.add(0);
            for (const index of result.interactionAnimationIndicesByEntity.get(entity.id) ?? []) {
                indices.add(index);
            }
            return [...indices].flatMap((index) => {
                const clip = clips[index];
                return clip
                    ? [
                        {
                            clip,
                            loop: component?.loop ?? false,
                            mixer: new AnimationMixer(target),
                        },
                    ]
                    : [];
            });
        });
    }, [result]);
    useEffect(() => {
        for (const playback of playbacks) {
            const action = playback.mixer.clipAction(playback.clip);
            action.reset();
            action.clampWhenFinished = !playback.loop;
            action.setLoop(playback.loop ? LoopRepeat : LoopOnce, playback.loop ? Infinity : 1);
            action.play();
        }
        return () => {
            for (const playback of playbacks) {
                playback.mixer.stopAllAction();
                playback.mixer.uncacheRoot(playback.mixer.getRoot());
            }
        };
    }, [playbacks]);
    useFrame((_, delta) => {
        for (const playback of playbacks) {
            playback.mixer.update(Math.min(delta, 0.1));
        }
    });
    return null;
}

const {jsx} = await importShared('react/jsx-runtime');
const MANIFEST_URL = new URL("./xrift/runtime.json", import.meta.url).href;
const World = ({ position = [0, 0, 0], scale = 1 }) => /* @__PURE__ */ jsx("group", { position, scale, children: /* @__PURE__ */ jsx(XriftWorld, { manifest: MANIFEST_URL }) });

export { World };
