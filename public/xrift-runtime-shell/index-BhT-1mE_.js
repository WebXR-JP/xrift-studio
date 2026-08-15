import { importShared } from './__federation_fn_import-CVj0xDfO.js';
import { _ as __vitePreload } from './preload-helper-CWZBUsdZ.js';

var i=Symbol.for("preact-signals");function t(){if(!(v>1)){var i,t=false;!function(){var i=c;c=void 0;while(void 0!==i){var t=i.S;if(t.v===i.v)for(var n=t.t;void 0!==n;n=n.x)if(n.i===i.i)n.i=t.i;i=i.o;}}();while(void 0!==h){var n=h;h=void 0;s++;while(void 0!==n){var r=n.u;n.u=void 0;n.f&=-3;if(!(8&n.f)&&w(n))try{n.c();}catch(n){if(!t){i=n;t=true;}}n=r;}}s=0;v--;if(t)throw i}else v--;}function n(i){if(v>0)return i();e=++u;v++;try{return i()}finally{t();}}var r,o=void 0;function f(i){var t=o,n=r;o=void 0;r=void 0;try{return i()}finally{o=t;r=n;}}var h=void 0,v=0,s=0,u=0,e=0,c=void 0,d=0;function a(i){if(void 0!==o){var t=i.n;if(void 0===t||t.t!==o){t={i:0,S:i,p:o.s,n:void 0,t:o,e:void 0,x:void 0,r:t};if(void 0!==o.s)o.s.n=t;o.s=t;i.n=t;if(32&o.f)i.S(t);return t}else if(-1===t.i){t.i=0;if(void 0!==t.n){t.n.p=t.p;if(void 0!==t.p)t.p.n=t.n;t.p=o.s;t.n=void 0;o.s.n=t;o.s=t;}return t}}}function l(i,t){this.v=i;this.i=0;this.n=void 0;this.t=void 0;this.l=0;this.W=null==t?void 0:t.watched;this.Z=null==t?void 0:t.unwatched;this.name=null==t?void 0:t.name;}l.prototype.brand=i;l.prototype.h=function(){return  true};l.prototype.S=function(i){var t=this,n=this.t;if(n!==i&&void 0===i.e){i.x=n;this.t=i;if(void 0!==n)n.e=i;else f(function(){var i;null==(i=t.W)||i.call(t);});}};l.prototype.U=function(i){var t=this;if(void 0!==this.t){var n=i.e,r=i.x;if(void 0!==n){n.x=r;i.e=void 0;}if(void 0!==r){r.e=n;i.x=void 0;}if(i===this.t){this.t=r;if(void 0===r)f(function(){var i;null==(i=t.Z)||i.call(t);});}}};l.prototype.subscribe=function(i){var t=this;return j(function(){var n=t.value;f(function(){return i(n)});},{name:"sub"})};l.prototype.valueOf=function(){return this.value};l.prototype.toString=function(){return this.value+""};l.prototype.toJSON=function(){return this.value};l.prototype.peek=function(){var i=this;return f(function(){return i.value})};Object.defineProperty(l.prototype,"value",{get:function(){var i=a(this);if(void 0!==i)i.i=this.i;return this.v},set:function(i){if(i!==this.v){if(s>100)throw new Error("Cycle detected");!function(i){if(0!==v&&0===s)if(i.l!==e){i.l=e;c={S:i,v:i.v,i:i.i,o:c};}}(this);this.v=i;this.i++;d++;v++;try{for(var n=this.t;void 0!==n;n=n.x)n.t.N();}finally{t();}}}});function y(i,t){return new l(i,t)}function w(i){for(var t=i.s;void 0!==t;t=t.n)if(t.S.i!==t.i||!t.S.h()||t.S.i!==t.i)return  true;return  false}function _(i){for(var t=i.s;void 0!==t;t=t.n){var n=t.S.n;if(void 0!==n)t.r=n;t.S.n=t;t.i=-1;if(void 0===t.n){i.s=t;break}}}function b(i){var t=i.s,n=void 0;while(void 0!==t){var r=t.p;if(-1===t.i){t.S.U(t);if(void 0!==r)r.n=t.n;if(void 0!==t.n)t.n.p=r;}else n=t;t.S.n=t.r;if(void 0!==t.r)t.r=void 0;t=r;}i.s=n;}function p(i,t){l.call(this,void 0,t);this.x=i;this.s=void 0;this.g=d-1;this.f=4;}p.prototype=new l;p.prototype.h=function(){this.f&=-3;if(1&this.f)return  false;if(32==(36&this.f))return  true;this.f&=-5;if(this.g===d)return  true;this.g=d;this.f|=1;if(this.i>0&&!w(this)){this.f&=-2;return  true}var i=o;try{_(this);o=this;var t=this.x();if(16&this.f||this.v!==t||0===this.i){this.v=t;this.f&=-17;this.i++;}}catch(i){this.v=i;this.f|=16;this.i++;}o=i;b(this);this.f&=-2;return  true};p.prototype.S=function(i){if(void 0===this.t){this.f|=36;for(var t=this.s;void 0!==t;t=t.n)t.S.S(t);}l.prototype.S.call(this,i);};p.prototype.U=function(i){if(void 0!==this.t){l.prototype.U.call(this,i);if(void 0===this.t){this.f&=-33;for(var t=this.s;void 0!==t;t=t.n)t.S.U(t);}}};p.prototype.N=function(){if(!(2&this.f)){this.f|=6;for(var i=this.t;void 0!==i;i=i.x)i.t.N();}};Object.defineProperty(p.prototype,"value",{get:function(){if(1&this.f)throw new Error("Cycle detected");var i=a(this);this.h();if(void 0!==i)i.i=this.i;if(16&this.f)throw this.v;return this.v}});function g(i,t){return new p(i,t)}function S(i){var n=i.m;i.m=void 0;if("function"==typeof n){v++;var r=o;o=void 0;try{n();}catch(t){i.f&=-2;i.f|=8;m(i);throw t}finally{o=r;t();}}}function m(i){for(var t=i.s;void 0!==t;t=t.n)t.S.U(t);i.x=void 0;i.s=void 0;S(i);}function x(i){if(o!==this)throw new Error("Out-of-order effect");b(this);o=i;this.f&=-2;if(8&this.f)m(this);t();}function E(i,t){this.x=i;this.m=void 0;this.s=void 0;this.u=void 0;this.f=32;this.name=null==t?void 0:t.name;if(r)r.push(this);}E.prototype.c=function(){var i=this.S();try{if(8&this.f)return;if(void 0===this.x)return;var t=this.x();if("function"==typeof t)this.m=t;}finally{i();}};E.prototype.S=function(){if(1&this.f)throw new Error("Cycle detected");this.f|=1;this.f&=-9;S(this);_(this);v++;var i=o;o=this;return x.bind(this,i)};E.prototype.N=function(){if(!(2&this.f)){this.f|=2;this.u=h;h=this;}};E.prototype.d=function(){this.f|=8;if(!(1&this.f))m(this);};E.prototype.dispose=function(){this.d();};function j(i,t){var n=new E(i,t);try{n.c();}catch(i){n.d();throw i}var r=n.d.bind(n);r[Symbol.dispose]=r;return r}

/**
 * must be executed inside effect/computed
 */
function addActiveHandlers(target, properties, activeSignal, hasActiveConditionalInProperties, hasActiveConditionalInStarProperties) {
    if (!hasActiveConditionalInStarProperties.value &&
        !hasActiveConditionalInProperties.value &&
        properties.value.onActiveChange == null) {
        return;
    }
    const onLeave = ({ pointerId }) => {
        activeSignal.value = activeSignal.value.filter((id) => id != pointerId);
        if (activeSignal.value.length > 0) {
            return;
        }
        properties.peek().onActiveChange?.(false);
    };
    addHandler('onPointerDown', target, ({ pointerId }) => {
        if (pointerId == null) {
            return;
        }
        activeSignal.value = [pointerId, ...activeSignal.value];
        if (activeSignal.value.length != 1) {
            return;
        }
        properties.peek().onActiveChange?.(true);
    });
    addHandler('onPointerUp', target, onLeave);
    addHandler('onPointerLeave', target, onLeave);
}

function setupCursorCleanup(hoveredSignal, abortSignal) {
    //cleanup cursor effect
    abortSignal.addEventListener('abort', () => unsetCursorType(hoveredSignal));
}
/**
 * must be executed inside effect/computed
 */
function addHoverHandlers(target, properties, hoveredSignal, hasHoverConditionalInProperties, hasHoverConditionalInStarProperties) {
    const cursor = properties.value.cursor;
    const onHoverChange = properties.value.onHoverChange;
    if (!hasHoverConditionalInStarProperties.value &&
        !hasHoverConditionalInProperties.value &&
        onHoverChange == null &&
        cursor == null) {
        //no need to trigger a "push" by writing to .value because nobody should listen to hoveredSignal anyways
        hoveredSignal.value.length = 0;
        return;
    }
    addHandler('onPointerEnter', target, ({ pointerId }) => {
        if (pointerId == null) {
            return;
        }
        hoveredSignal.value = [pointerId, ...hoveredSignal.value];
        if (hoveredSignal.value.length === 1) {
            onHoverChange?.(true);
        }
        if (cursor != null) {
            setCursorType(hoveredSignal, cursor);
        }
    });
    addHandler('onPointerLeave', target, ({ pointerId }) => {
        hoveredSignal.value = hoveredSignal.value.filter((id) => id != pointerId);
        if (hoveredSignal.value.length === 0) {
            onHoverChange?.(false);
        }
        unsetCursorType(hoveredSignal);
    });
}
const cursorRefStack = [];
const cursorTypeStack = [];
function setCursorType(ref, type) {
    cursorRefStack.push(ref);
    cursorTypeStack.push(type);
    //console.log('set; curent: ', ...cursorTypeStack)
    document.body.style.cursor = type;
}
function unsetCursorType(ref) {
    const index = cursorRefStack.indexOf(ref);
    if (index == -1) {
        return;
    }
    cursorRefStack.splice(index, 1);
    cursorTypeStack.splice(index, 1);
    //console.log('unset; curent: ', ...cursorTypeStack)
    document.body.style.cursor = cursorTypeStack[cursorTypeStack.length - 1] ?? 'default';
}

const {BufferAttribute,PlaneGeometry: PlaneGeometry$1} = await importShared('three');

function createPanelGeometry() {
    const geometry = new PlaneGeometry$1();
    const position = geometry.getAttribute('position');
    const array = new Float32Array(4 * position.count);
    const tangent = [1, 0, 0, 1];
    for (let i = 0; i < array.length; i++) {
        array[i] = tangent[i % 4];
    }
    geometry.setAttribute('tangent', new BufferAttribute(array, 4));
    return geometry;
}
const panelGeometry = createPanelGeometry();

function setupBoundingSphere(target, pixelSize, globalMatrixSignal, size, abortSignal) {
  abortableEffect(() => {
    const sizeValue = size.value;
    const globalMatrix = globalMatrixSignal.value;
    if (sizeValue == null || globalMatrix == null) {
      return;
    }
    target.center.set(0, 0, 0);
    const [w, h] = sizeValue;
    const maxDiameter = Math.sqrt(w * w + h * h);
    target.radius = maxDiameter * 0.5 * pixelSize.value;
    target.applyMatrix4(globalMatrix);
  }, abortSignal);
}

const {Matrix4: Matrix4$9,Plane: Plane$1} = await importShared('three');
const planeHelper = new Plane$1();
const worldToGlobalMatrixHelper$2 = new Matrix4$9();
function makeClippedCast(component, fn, root, parent, orderInfoSignal) {
    return (raycaster, intersects) => {
        const oldLength = intersects.length;
        const fnResult = fn.call(component, raycaster, intersects);
        if (oldLength === intersects.length) {
            return fnResult;
        }
        const orderInfo = orderInfoSignal.peek();
        if (orderInfo == null) {
            return fnResult;
        }
        const clippingPlanes = parent.peek()?.clippingRect?.peek()?.planes;
        root.peek().component.updateMatrix();
        computeWorldToGlobalMatrix(root.peek(), worldToGlobalMatrixHelper$2);
        outer: for (let i = intersects.length - 1; i >= oldLength; i--) {
            const intersection = intersects[i];
            intersection.distance -=
                orderInfo.majorIndex * 0.01 +
                    orderInfo.minorIndex * 0.0001 +
                    orderInfo.elementType * 0.00001 +
                    orderInfo.patchIndex * 0.0000001;
            if (clippingPlanes == null) {
                continue;
            }
            for (let ii = 0; ii < 4; ii++) {
                planeHelper.copy(clippingPlanes[ii]).applyMatrix4(worldToGlobalMatrixHelper$2);
                if (planeHelper.distanceToPoint(intersection.point) < 0) {
                    intersects.splice(i, 1);
                    continue outer;
                }
            }
        }
        return fnResult;
    };
}

/**
 * Clamps the given value between min and max.
 *
 * @param {number} value - The value to clamp.
 * @param {number} min - The min value.
 * @param {number} max - The max value.
 * @return {number} The clamped value.
 */
function clamp( value, min, max ) {

	return Math.max( min, Math.min( max, value ) );

}

const {Matrix4: Matrix4$8,Sphere: Sphere$3,Vector2: Vector2$4,Vector3: Vector3$7} = await importShared('three');
const sphereHelper$1 = new Sphere$3();
const vectorHelper$2 = new Vector3$7();
const matrixHelper$2 = new Matrix4$8();
const worldToGlobalMatrixHelper$1 = new Matrix4$8();
function makePanelSpherecast(root, globalSphereWithLocalScale, globalPanelMatrixSignal, object) {
  return (sphere, intersects) => {
    root.peek().component.updateMatrix();
    computeWorldToGlobalMatrix(root.peek(), worldToGlobalMatrixHelper$1);
    sphereHelper$1.copy(globalSphereWithLocalScale).applyMatrix4(worldToGlobalMatrixHelper$1);
    if (!sphereHelper$1.intersectsSphere(sphere)) {
      return;
    }
    object.updateMatrixWorld(true);
    vectorHelper$2.copy(sphere.center).applyMatrix4(matrixHelper$2.copy(object.matrixWorld).invert());
    vectorHelper$2.x = clamp(vectorHelper$2.x, -0.5, 0.5);
    vectorHelper$2.y = clamp(vectorHelper$2.y, -0.5, 0.5);
    vectorHelper$2.z = 0;
    const uv = new Vector2$4(vectorHelper$2.x, vectorHelper$2.y);
    vectorHelper$2.applyMatrix4(object.matrixWorld);
    const distance = sphere.center.distanceTo(vectorHelper$2);
    if (distance > sphere.radius) {
      return;
    }
    intersects.push({
      distance,
      object,
      point: vectorHelper$2.clone(),
      uv,
      normal: new Vector3$7(0, 0, 1)
    });
  };
}

const {MeshPhongMaterial,MeshPhysicalMaterial} = await importShared('three');

class PlasticMaterial extends MeshPhongMaterial {
    constructor() {
        super({
            specular: '#111',
            shininess: 100,
        });
    }
}
class GlassMaterial extends MeshPhysicalMaterial {
    constructor() {
        super({
            roughness: 0.1,
            reflectivity: 0.5,
            iridescence: 0.001,
            thickness: 0.05,
            metalness: 0.3,
            ior: 2,
        });
    }
}
class MetalMaterial extends MeshPhysicalMaterial {
    constructor() {
        super({
            iridescence: 0.001,
            metalness: 0.8,
            roughness: 0.1,
        });
    }
}
const materialClasses = {
    glass: GlassMaterial,
    metal: MetalMaterial,
    plastic: PlasticMaterial,
};
function resolvePanelMaterialClassProperty(input) {
    if (typeof input != 'string') {
        return input;
    }
    return materialClasses[input];
}

function assureBucketExists(buckets, bucketIndex) {
    while (bucketIndex >= buckets.length) {
        let offset = 0;
        let missingSpace = 0;
        if (buckets.length > 0) {
            const prevBucket = buckets[buckets.length - 1];
            offset += prevBucket.offset + prevBucket.elements.length;
            missingSpace = Math.min(0, prevBucket.missingSpace); //taking only the exceeding space
            prevBucket.missingSpace -= missingSpace;
        }
        buckets.push({
            add: [],
            missingSpace,
            offset,
            elements: [],
        });
    }
}
function resizeSortedBucketsSpace(buckets, oldSize, newSize) {
    assureBucketExists(buckets, 0);
    //add new space to last bucket
    const lastBucket = buckets[buckets.length - 1];
    lastBucket.missingSpace += oldSize - newSize;
}
/**
 * @returns true iff a call to @function updateSortedBucketsAllocation is necassary
 */
function addToSortedBuckets(buckets, bucketIndex, element, activateElement) {
    assureBucketExists(buckets, bucketIndex);
    const bucket = buckets[bucketIndex];
    bucket.missingSpace += 1;
    if (bucket.missingSpace <= 0) {
        //bucket has still room at the end => just place the element there
        activateElement(element, bucket, bucket.elements.length);
        bucket.elements.push(element);
        return false;
    }
    bucket.add.push(element);
    return true;
}
/**
 * assures that the free space of a bucket is always at the end
 * @returns true iff a call to @function updateSortedBucketsAllocation is necassary
 */
function removeFromSortedBuckets(buckets, bucketIndex, element, elementIndex, activateElement, clearBufferAt, setElementIndex, bufferCopyWithin) {
    if (bucketIndex >= buckets.length) {
        throw new Error(`no bucket at index ${bucketIndex}`);
    }
    const bucket = buckets[bucketIndex];
    bucket.missingSpace -= 1;
    const addIndex = bucket.add.indexOf(element);
    if (addIndex != -1) {
        bucket.add.splice(addIndex, 1);
        return false;
    }
    if (elementIndex == null || elementIndex >= bucket.elements.length) {
        throw new Error(`no element at index ${elementIndex}`);
    }
    if (bucket.add.length > 0) {
        //replace
        const newElement = bucket.add.shift();
        bucket.elements[elementIndex] = newElement;
        activateElement(newElement, bucket, elementIndex);
        return false;
    }
    const offset = bucket.offset;
    const lastIndexInBucket = bucket.elements.length - 1;
    if (lastIndexInBucket != elementIndex) {
        //element not the last element => need to be moved to the end
        const startIndex = offset + lastIndexInBucket;
        const targetIndex = offset + elementIndex;
        bufferCopyWithin(targetIndex, startIndex, startIndex + 1);
        const swapElement = bucket.elements[lastIndexInBucket];
        bucket.elements[elementIndex] = swapElement;
        setElementIndex(swapElement, elementIndex);
    }
    clearBufferAt(offset + lastIndexInBucket);
    bucket.elements.length -= 1;
    if (bucketIndex < buckets.length - 1) {
        return true;
    }
    //we are at the last bucket => merge missing space with the previous bucket(s)
    let currentBucket = bucket;
    while (currentBucket.elements.length === 0 && currentBucket.add.length == 0 && bucketIndex > 0) {
        const prevBucket = buckets[bucketIndex - 1];
        prevBucket.missingSpace += currentBucket.missingSpace;
        currentBucket = buckets[--bucketIndex];
    }
    buckets.length = bucketIndex + 1;
    return false;
}
/**
 * @requires that the buffer has room for elementCount number of elements
 */
function updateSortedBucketsAllocation(buckets, activateElement, bufferCopyWithin) {
    let bucketsLength = buckets.length;
    let lastBucketWithElements = -1;
    for (let i = 0; i < bucketsLength; i++) {
        const bucket = buckets[i];
        if (bucket.elements.length + bucket.add.length > 0) {
            //bucket will have more than 0 elements after this
            lastBucketWithElements = i;
        }
        const lastBucket = i === bucketsLength - 1;
        if (!lastBucket && bucket.missingSpace === 0) {
            continue;
        }
        //find shift partner - TODO: use skip list (negative buckets, positive buckets)
        const hasSpace = bucket.missingSpace < 0;
        for (let ii = i - 1; ii >= 0; ii--) {
            //2 cases:
            //    1. one has space and the other needs space
            //    2. both have space
            const otherBucket = buckets[ii];
            if (otherBucket.missingSpace === 0) {
                continue;
            }
            const otherHasSpace = otherBucket.missingSpace < 0;
            if (otherHasSpace && (lastBucket || hasSpace)) {
                //case 2 - both have space: merge space into bucket by shifting to other bucket (so that the hole is increased at the end of the bucket)
                shiftLeft(buckets, bufferCopyWithin, ii, i, Math.abs(otherBucket.missingSpace));
                continue;
            }
            if (!hasSpace && !otherHasSpace) {
                continue;
            }
            //case 1 - bucket has space the other needs space: shift to the one with space
            const shiftBy = Math.min(Math.abs(otherBucket.missingSpace), Math.abs(bucket.missingSpace));
            if (hasSpace) {
                //shift to bucket to increase the space at the other bucket (so that the hole is increased at the end of the other bucket)
                shiftRight(buckets, bufferCopyWithin, ii, i, shiftBy);
            }
            else {
                //shift to other bucket to increase the space at the bucket (so that the hole is increased at the end of the bucket)
                shiftLeft(buckets, bufferCopyWithin, ii, i, shiftBy);
            }
        }
    }
    const newLastBucket = buckets[lastBucketWithElements];
    for (let i = lastBucketWithElements + 1; i < bucketsLength; i++) {
        newLastBucket.missingSpace += buckets[i].missingSpace;
    }
    bucketsLength = buckets.length = lastBucketWithElements + 1;
    //add elements at the end of the elements of the buckets
    for (let i = 0; i < bucketsLength; i++) {
        const bucket = buckets[i];
        const { elements, add } = bucket;
        const addLength = add.length;
        for (let ii = 0; ii < addLength; ii++) {
            const element = add[ii];
            activateElement(element, bucket, elements.length);
            elements.push(element);
        }
        add.length = 0;
    }
}
function shiftLeft(buckets, bufferCopyWithin, startIndexIncl, endIndexIncl, shiftBy) {
    const endBucket = buckets[endIndexIncl];
    const startIndex = buckets[startIndexIncl + 1].offset;
    //array shifting
    bufferCopyWithin(startIndex - shiftBy, startIndex, endBucket.offset + endBucket.elements.length);
    //updating delta and panel array
    const startBucket = buckets[startIndexIncl];
    startBucket.missingSpace += shiftBy;
    endBucket.missingSpace -= shiftBy;
    //updating the offsets
    for (let i = startIndexIncl + 1; i <= endIndexIncl; i++) {
        buckets[i].offset -= shiftBy;
    }
}
function shiftRight(buckets, bufferCopyWithin, startIndexIncl, endIndexIncl, shiftBy) {
    const endBucket = buckets[endIndexIncl];
    const startIndex = buckets[startIndexIncl + 1].offset;
    //array shifting
    bufferCopyWithin(startIndex + shiftBy, startIndex, endBucket.offset + endBucket.elements.length);
    //updating delta and panel array
    const startBucket = buckets[startIndexIncl];
    startBucket.missingSpace -= shiftBy;
    endBucket.missingSpace += shiftBy;
    //updating the offsets
    for (let i = startIndexIncl + 1; i <= endIndexIncl; i++) {
        buckets[i].offset += shiftBy;
    }
}

function compilePanelDepthMaterial(parameters, instanced) {
    compilePanelClippingMaterial(parameters, instanced);
    parameters.fragmentShader = parameters.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
    ${getFragmentOpacityCode(instanced, undefined)}
    `);
}
function compilePanelClippingMaterial(parameters, instanced) {
    parameters.vertexShader = parameters.vertexShader.replace('#include <common>', ` #include <common>
      out vec4 borderRadius;
      ${instanced ? '' : 'uniform highp mat4 data;'}`);
    parameters.vertexShader = parameters.vertexShader.replace('#include <uv_vertex>', ` #include <uv_vertex>
      highp int packedBorderRadius = int(data[2].x);
      borderRadius = vec4(
        float(packedBorderRadius / 125000 % 50),
        float(packedBorderRadius / 2500 % 50),
        float(packedBorderRadius / 50 % 50),
        float(packedBorderRadius % 50)
      ) * 0.01;`);
    if (instanced) {
        parameters.vertexShader = parameters.vertexShader.replace('#include <common>', ` #include <common>
        attribute highp mat4 aData;
        attribute mat4 aClipping;
        out mat4 data;
        out mat4 clipping;
        out vec3 localPosition;`);
        parameters.vertexShader = parameters.vertexShader.replace('#include <uv_vertex>', ` #include <uv_vertex>
        data = aData;
        clipping = aClipping;
        localPosition = (instanceMatrix * vec4(position, 1.0)).xyz;`);
    }
    parameters.fragmentShader = getFragmentShaderPrefix(instanced) + parameters.fragmentShader;
    parameters.fragmentShader = parameters.fragmentShader.replace('#include <clipping_planes_fragment>', getClippingPlanesFragment(instanced));
}
function getFragmentShaderPrefix(instanced) {
    return `${instanced ? 'in' : 'uniform'} highp mat4 data;
    in vec4 borderRadius;
    ${instanced
        ? `
    in vec3 localPosition;
    in mat4 clipping;`
        : ''}

    float min4(vec4 v) {
        vec2 tmp = min(v.xy, v.zw);
        return min(tmp.x, tmp.y);
    }
    
    float max4(vec4 v) {
        vec2 tmp = max(v.xy, v.zw);
        return max(tmp.x, tmp.y);
    }
    
    vec2 radiusDistance(float radius, vec2 outside, vec2 border, vec2 borderSize) {
        vec2 outerRadius = vec2(radius);
        vec2 innerRadius = outerRadius - borderSize;
        
        vec2 radiusWeightUnnorm = abs(innerRadius - border);
        float sum = radiusWeightUnnorm.x + radiusWeightUnnorm.y;
        vec2 radiusWeight = sum > 0.0 ? radiusWeightUnnorm / sum : vec2(0.5);
        
        return vec2(
            radius - distance(outside, outerRadius),
            dot(radiusWeight, innerRadius) - distance(border, innerRadius)
        );
    }
    
    vec2 calculateCornerIntersection(float cornerRadius, vec2 borderSizes, float aspectRatio) {
        float tmp1 = cornerRadius - borderSizes.y;
        vec2 xIntersection = vec2(tmp1, tmp1 / aspectRatio);
        
        float tmp2 = cornerRadius - borderSizes.x;
        vec2 yIntersection = vec2(tmp2 * aspectRatio, tmp2);
        
        return min(xIntersection, yIntersection);
    }
    `;
}
function getClippingPlanesFragment(instanced) {
    const instancedClipping = instanced
        ? `
        vec4 plane;
        float distanceToPlane, planeDistanceGradient;
        float clipOpacity = 1.0;

        for(int i = 0; i < 4; i++) {
          plane = clipping[i];
          distanceToPlane = dot(localPosition, plane.xyz) + plane.w;
          planeDistanceGradient = max(fwidth(distanceToPlane) * 0.5, 0.00001);
          clipOpacity *= smoothstep(-planeDistanceGradient, planeDistanceGradient, distanceToPlane);
    
          if (clipOpacity < 0.01) discard;
        }`
        : '';
    return ` ${instancedClipping}
        
        vec4 absoluteBorderSize = data[0];
        vec3 backgroundColor = data[1].xyz;
        float backgroundOpacity = data[1].w;
        vec3 borderColor = data[2].yzw;
        float borderOpacity = data[3].x;
        float borderBend = data[3].y;
        vec2 dimensions = data[3].zw;
        
        float aspectRatio = dimensions.x / dimensions.y;
        vec4 borderSize = absoluteBorderSize / dimensions.yyyy;
        
        vec2 uvFlipped = vec2(vUv.x, 1.0 - vUv.y);
        vec4 v_outsideDistance = vec4(
            uvFlipped.y,
            (1.0 - uvFlipped.x) * aspectRatio,
            1.0 - uvFlipped.y,
            uvFlipped.x * aspectRatio
        );
        vec4 v_borderDistance = v_outsideDistance - borderSize;
  
        vec2 distance = vec2(min4(v_outsideDistance), min4(v_borderDistance));
        
        vec4 negateBorderDistance = vec4(1.0) - v_borderDistance;
        float maxWeight = max4(negateBorderDistance);
        vec4 borderWeight = step(maxWeight, negateBorderDistance);
  
        vec4 insideBorder = vec4(0.0);
        
        vec2 cornerPos;
        float cornerRadius;
        vec2 cornerBorderSizes;
        
        if (all(lessThan(v_outsideDistance.wx, borderRadius.xx))) {
            cornerPos = v_outsideDistance.wx;
            cornerRadius = borderRadius.x;
            cornerBorderSizes = borderSize.wx;
            distance = radiusDistance(cornerRadius, cornerPos, v_borderDistance.wx, cornerBorderSizes);
            
            vec2 lineIntersection = calculateCornerIntersection(cornerRadius, cornerBorderSizes, aspectRatio);
            insideBorder.wx = max(vec2(0.0), lineIntersection - v_borderDistance.wx);
        }
        else if (all(lessThan(v_outsideDistance.yx, borderRadius.yy))) {
            cornerPos = v_outsideDistance.yx;
            cornerRadius = borderRadius.y;
            cornerBorderSizes = borderSize.yx;
            distance = radiusDistance(cornerRadius, cornerPos, v_borderDistance.yx, cornerBorderSizes);
            
            vec2 lineIntersection = calculateCornerIntersection(cornerRadius, cornerBorderSizes, aspectRatio);
            insideBorder.yx = max(vec2(0.0), lineIntersection - v_borderDistance.yx);
        }
        else if (all(lessThan(v_outsideDistance.yz, borderRadius.zz))) {
            cornerPos = v_outsideDistance.yz;
            cornerRadius = borderRadius.z;
            cornerBorderSizes = borderSize.yz;
            distance = radiusDistance(cornerRadius, cornerPos, v_borderDistance.yz, cornerBorderSizes);
            
            vec2 lineIntersection = calculateCornerIntersection(cornerRadius, cornerBorderSizes, aspectRatio);
            insideBorder.yz = max(vec2(0.0), lineIntersection - v_borderDistance.yz);
        }
        else if (all(lessThan(v_outsideDistance.zw, borderRadius.ww))) {
            cornerPos = v_outsideDistance.zw;
            cornerRadius = borderRadius.w;
            cornerBorderSizes = borderSize.zw;
            distance = radiusDistance(cornerRadius, cornerPos, v_borderDistance.zw, cornerBorderSizes);
            
            vec2 lineIntersection = calculateCornerIntersection(cornerRadius, cornerBorderSizes, aspectRatio);
            insideBorder.zw = max(vec2(0.0), lineIntersection - v_borderDistance.zw);
        }
  
        float insideBorderSum = dot(insideBorder, vec4(1.0));
        if (insideBorderSum > 0.0) {
          borderWeight = insideBorder / insideBorderSum;
        }
  
        #include <clipping_planes_fragment>`;
}
function getFragmentOpacityCode(instanced, existingOpacity) {
    return `vec2 distanceGradient = fwidth(distance);
  float outer = smoothstep(-distanceGradient.x, distanceGradient.x, distance.x);
  float inner = smoothstep(-distanceGradient.y, distanceGradient.y, distance.y);

  float transition = 1.0 - step(0.1, outer - inner) * (1.0 - inner);

  float fullBackgroundOpacity = ${existingOpacity == null ? '' : `${existingOpacity} * `}backgroundOpacity;
  float fullBorderOpacity = min(1.0, borderOpacity + fullBackgroundOpacity);

  float outOpacity = ${instanced ? 'clipOpacity * ' : ''}outer * mix(fullBorderOpacity, fullBackgroundOpacity, transition);

  if (outOpacity < 0.01) {
    discard;
  }`;
}
function compilePanelMaterial(parameters, instanced) {
    compilePanelClippingMaterial(parameters, instanced);
    parameters.fragmentShader = parameters.fragmentShader.replace('#include <color_fragment>', ` #include <color_fragment>
      ${getFragmentOpacityCode(instanced, 'diffuseColor.a')}
      
      vec3 mainColor = diffuseColor.rgb * backgroundColor;
      float borderMix = borderOpacity / max(fullBorderOpacity, 0.001);
      diffuseColor.rgb = mix(mix(mainColor, borderColor, borderMix), mainColor, transition);
      diffuseColor.a = outOpacity;
      `);
    parameters.fragmentShader = parameters.fragmentShader.replace('#include <normal_fragment_maps>', ` #include <normal_fragment_maps>
      
      vec3 bitangent = normalize(vBitangent);
      vec3 tangent = normalize(vTangent);
      
      mat4 directions = mat4(
        vec4(bitangent, 1.0), 
        vec4(tangent, 1.0), 
        vec4(-bitangent, 1.0), 
        vec4(-tangent, 1.0)
      );
      
      float currentBorderSize = distance.x - distance.y;
      float outsideNormalWeight = currentBorderSize < 1e-5 ? 0.0 : 
        max(0.0, -distance.y / currentBorderSize) * -borderBend;
      
      vec3 outsideNormal = (borderWeight * transpose(directions)).xyz;
      normal = normalize(mix(normal, outsideNormal, outsideNormalWeight));
    `);
}

const {FrontSide} = await importShared('three');
function createPanelMaterial(MaterialClass, info) {
    const material = new MaterialClass();
    if (material.defines == null) {
        material.defines = {};
    }
    material.side = FrontSide;
    material.clipShadows = true;
    material.transparent = true;
    material.toneMapped = false;
    material.shadowSide = FrontSide;
    material.defines.USE_UV = '';
    material.defines.USE_TANGENT = '';
    const superOnBeforeCompile = material.onBeforeCompile;
    material.onBeforeCompile = (parameters, renderer) => {
        superOnBeforeCompile.call(material, parameters, renderer);
        if (info.type === 'normal') {
            parameters.uniforms.data = { value: info.data };
        }
        compilePanelMaterial(parameters, info.type === 'instanced');
    };
    return material;
}

const {MeshDepthMaterial: MeshDepthMaterial$1,MeshDistanceMaterial: MeshDistanceMaterial$1,RGBADepthPacking} = await importShared('three');
class PanelDistanceMaterial extends MeshDistanceMaterial$1 {
    info;
    constructor(info) {
        super();
        this.info = info;
        if (this.defines == null) {
            this.defines = {};
        }
        this.defines.USE_UV = '';
        this.clipShadows = true;
    }
    onBeforeCompile(parameters, renderer) {
        super.onBeforeCompile(parameters, renderer);
        if (this.info.type === 'normal') {
            parameters.uniforms.data = { value: this.info.data };
        }
        compilePanelDepthMaterial(parameters, this.info.type === 'instanced');
    }
}
class PanelDepthMaterial extends MeshDepthMaterial$1 {
    info;
    constructor(info) {
        super({ depthPacking: RGBADepthPacking });
        this.info = info;
        if (this.defines == null) {
            this.defines = {};
        }
        this.defines.USE_UV = '';
        this.clipShadows = true;
    }
    onBeforeCompile(parameters, renderer) {
        super.onBeforeCompile(parameters, renderer);
        if (this.info.type === 'normal') {
            parameters.uniforms.data = { value: this.info.data };
        }
        compilePanelDepthMaterial(parameters, this.info.type === 'instanced');
    }
}
const instancedPanelDepthMaterial = new PanelDepthMaterial({ type: 'instanced' });
const instancedPanelDistanceMaterial = new PanelDistanceMaterial({ type: 'instanced' });

const {Box3: Box3$2,Mesh: Mesh$4,Sphere: Sphere$2} = await importShared('three');
class InstancedPanelMesh extends Mesh$4 {
    root;
    instanceMatrix;
    count = 0;
    isInstancedMesh = true;
    instanceColor = null;
    morphTexture = null;
    boundingBox = new Box3$2();
    boundingSphere = new Sphere$2();
    customUpdateMatrixWorld = () => computeWorldToGlobalMatrix(this.root, this.matrixWorld);
    constructor(root, instanceMatrix, instanceData, instanceClipping) {
        const panelGeometry = createPanelGeometry();
        super(panelGeometry);
        this.root = root;
        this.instanceMatrix = instanceMatrix;
        this.pointerEvents = 'none';
        panelGeometry.attributes.aData = instanceData;
        panelGeometry.attributes.aClipping = instanceClipping;
        this.customDepthMaterial = instancedPanelDepthMaterial;
        this.customDistanceMaterial = instancedPanelDistanceMaterial;
        this.frustumCulled = false;
        root.onUpdateMatrixWorldSet.add(this.customUpdateMatrixWorld);
    }
    dispose() {
        this.root.onUpdateMatrixWorldSet.delete(this.customUpdateMatrixWorld);
        this.dispatchEvent({ type: 'dispose' });
        this.geometry.dispose();
    }
    clone() {
        const cloned = new InstancedPanelMesh(this.root, this.instanceMatrix, this.geometry.attributes.aData, this.geometry.attributes.aClipping);
        cloned.count = this.count;
        cloned.material = this.material;
        return cloned;
    }
    copy() {
        throw new Error('InstancedPanelMesh.copy() is not supported. Use clone() instead.');
    }
    // Functions not needed because intersection and morphing are intentionally disabled.
    computeBoundingBox() { }
    computeBoundingSphere() { }
    updateMorphTargets() { }
    raycast() { }
    spherecast() { }
}

const numberStringPattern = String.raw `[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][+-]?\d+)?`;
const numberStringRegex = new RegExp(`^${numberStringPattern}$`);
const percentageRegex = new RegExp(`^${numberStringPattern}%$`);
const pixelLengthRegex = new RegExp(`^${numberStringPattern}px$`);
const viewportLengthRegex = new RegExp(`^${numberStringPattern}(vh|dvh|svh|lvh|vw|dvw|svw|lvw)$`);
function isNumberString(value) {
    return typeof value === 'string' && numberStringRegex.test(value);
}
function isPercentageString(value) {
    return typeof value === 'string' && percentageRegex.test(value);
}
function isPixelLengthString(value) {
    return typeof value === 'string' && pixelLengthRegex.test(value);
}
function isViewportLengthString(value) {
    return typeof value === 'string' && viewportLengthRegex.test(value);
}
function isViewportHeightLength(value) {
    return isViewportLengthString(value) && value.endsWith('vh');
}
function isViewportWidthLength(value) {
    return isViewportLengthString(value) && value.endsWith('vw');
}
function parseAbsoluteNumber(value, getRelativeValue, viewportWidth, viewportHeight) {
    if (typeof value === 'number') {
        return value;
    }
    if (isPercentageString(value)) {
        const number = Number.parseFloat(value);
        return getRelativeValue == null ? number : (getRelativeValue() * number) / 100;
    }
    if (isViewportHeightLength(value)) {
        const number = Number.parseFloat(value);
        return viewportHeight == null ? number : (viewportHeight * number) / 100;
    }
    if (isViewportWidthLength(value)) {
        const number = Number.parseFloat(value);
        return viewportWidth == null ? number : (viewportWidth * number) / 100;
    }
    if (isNumberString(value)) {
        return Number(value);
    }
    if (isPixelLengthString(value)) {
        return Number(value.slice(0, -2));
    }
    throw new Error(`Invalid number: ${value}`);
}
function parseNumberValue(value) {
    return typeof value === 'number' ? value : Number(value);
}
function parseAbsoluteLengthValue(value) {
    return isPixelLengthString(value) ? Number(value.slice(0, -2)) : parseNumberValue(value);
}
function convertYogaPoint(input, viewportWidth, viewportHeight) {
    if (input == null || typeof input === 'number' || isPercentageString(input)) {
        return input;
    }
    if (isNumberString(input)) {
        return Number(input);
    }
    if (isPixelLengthString(input)) {
        return Number(input.slice(0, -2));
    }
    if (isViewportWidthLength(input)) {
        return (viewportWidth * Number.parseFloat(input)) / 100;
    }
    if (isViewportHeightLength(input)) {
        return (viewportHeight * Number.parseFloat(input)) / 100;
    }
    throw new Error(`Invalid Yoga point: ${input}`);
}

const {DynamicDrawUsage: DynamicDrawUsage$1,InstancedBufferAttribute: InstancedBufferAttribute$1} = await importShared('three');
const nextFrame = Symbol('nextFrame');
class InstancedPanelGroup {
    object;
    root;
    orderInfo;
    panelGroupProperties;
    mesh;
    instanceMatrix;
    instanceData;
    instanceClipping;
    instanceMaterial;
    buckets = [];
    elementCount = 0;
    bufferElementSize = 0;
    instanceDataOnUpdate;
    nextUpdateTime;
    nextUpdateTimeoutRef;
    activateElement = (element, bucket, indexInBucket) => {
        const index = bucket.offset + indexInBucket;
        this.instanceData.set(element.materialConfig.defaultData, 16 * index);
        this.instanceData.addUpdateRange(16 * index, 16);
        this.instanceData.needsUpdate = true;
        element.activate(bucket, indexInBucket);
    };
    setElementIndex = (element, index) => {
        element.setIndexInBucket(index);
    };
    bufferCopyWithin = (targetIndex, startIndex, endIndex) => {
        copyWithinAttribute(this.instanceMatrix, targetIndex, startIndex, endIndex);
        copyWithinAttribute(this.instanceData, targetIndex, startIndex, endIndex);
        copyWithinAttribute(this.instanceClipping, targetIndex, startIndex, endIndex);
    };
    clearBufferAt = (index) => {
        // Hiding the element by writing a 0 matrix.
        const bufferOffset = index * 16;
        this.instanceMatrix.array.fill(0, bufferOffset, bufferOffset + 16);
        this.instanceMatrix.addUpdateRange(bufferOffset, 16);
        this.instanceMatrix.needsUpdate = true;
    };
    constructor(object, root, orderInfo, panelGroupProperties) {
        this.object = object;
        this.root = root;
        this.orderInfo = orderInfo;
        this.panelGroupProperties = panelGroupProperties;
        const materialClass = resolvePanelMaterialClassProperty(panelGroupProperties.panelMaterialClass);
        this.instanceMaterial = createPanelMaterial(materialClass, { type: 'instanced' });
        this.instanceMaterial.depthTest = panelGroupProperties.depthTest;
        this.instanceMaterial.depthWrite = panelGroupProperties.depthWrite;
    }
    updateCount() {
        const lastBucket = this.buckets[this.buckets.length - 1];
        const count = lastBucket.offset + lastBucket.elements.length;
        if (this.mesh == null) {
            return;
        }
        this.mesh.count = count;
        this.mesh.visible = count > 0;
        this.root.requestRender?.();
    }
    requestUpdate(time) {
        if (this.nextUpdateTime == nextFrame) {
            return;
        }
        const forTime = performance.now() + time;
        if (this.nextUpdateTime != null && this.nextUpdateTime < forTime) {
            return;
        }
        this.nextUpdateTime = forTime;
        clearTimeout(this.nextUpdateTimeoutRef);
        this.nextUpdateTimeoutRef = setTimeout(this.requestUpdateNextFrame.bind(this), time);
    }
    requestUpdateNextFrame() {
        this.nextUpdateTime = nextFrame;
        clearTimeout(this.nextUpdateTimeoutRef);
        this.nextUpdateTimeoutRef = undefined;
        this.root.requestFrame?.();
    }
    insert(bucketIndex, panel) {
        this.elementCount += 1;
        if (!addToSortedBuckets(this.buckets, bucketIndex, panel, this.activateElement)) {
            this.updateCount();
            return;
        }
        this.requestUpdateNextFrame();
    }
    delete(bucketIndex, elementIndex, panel) {
        this.elementCount -= 1;
        if (!removeFromSortedBuckets(this.buckets, bucketIndex, panel, elementIndex, this.activateElement, this.clearBufferAt, this.setElementIndex, this.bufferCopyWithin)) {
            this.updateCount();
            return;
        }
        this.root.requestRender?.();
        this.requestUpdate(1000);
    }
    onFrame() {
        if (this.nextUpdateTime != nextFrame) {
            return;
        }
        this.nextUpdateTime = undefined;
        this.update();
    }
    update() {
        if (this.elementCount === 0) {
            if (this.mesh != null) {
                this.mesh.visible = false;
            }
            return;
        }
        if (this.elementCount > this.bufferElementSize) {
            this.resize();
            updateSortedBucketsAllocation(this.buckets, this.activateElement, this.bufferCopyWithin);
        }
        else if (this.elementCount <= this.bufferElementSize / 3) {
            updateSortedBucketsAllocation(this.buckets, this.activateElement, this.bufferCopyWithin);
            this.resize();
        }
        else {
            updateSortedBucketsAllocation(this.buckets, this.activateElement, this.bufferCopyWithin);
        }
        this.mesh.count = this.elementCount;
        this.mesh.visible = true;
    }
    resize() {
        const oldBufferSize = this.bufferElementSize;
        this.bufferElementSize = Math.ceil(this.elementCount * 1.5);
        if (this.mesh != null) {
            this.mesh.dispose();
            this.object.remove(this.mesh);
        }
        resizeSortedBucketsSpace(this.buckets, oldBufferSize, this.bufferElementSize);
        const matrixArray = new Float32Array(this.bufferElementSize * 16);
        if (this.instanceMatrix != null) {
            matrixArray.set(this.instanceMatrix.array.subarray(0, matrixArray.length));
        }
        this.instanceMatrix = new InstancedBufferAttribute$1(matrixArray, 16, false);
        this.instanceMatrix.setUsage(DynamicDrawUsage$1);
        const dataArray = new Float32Array(this.bufferElementSize * 16);
        if (this.instanceData != null) {
            dataArray.set(this.instanceData.array.subarray(0, dataArray.length));
        }
        this.instanceData = new InstancedBufferAttribute$1(dataArray, 16, false);
        this.instanceDataOnUpdate = (start, count) => {
            this.instanceData.addUpdateRange(start, count);
            this.instanceData.needsUpdate = true;
        };
        this.instanceData.setUsage(DynamicDrawUsage$1);
        const clippingArray = new Float32Array(this.bufferElementSize * 16);
        if (this.instanceClipping != null) {
            clippingArray.set(this.instanceClipping.array.subarray(0, clippingArray.length));
        }
        this.instanceClipping = new InstancedBufferAttribute$1(clippingArray, 16, false);
        this.instanceClipping.setUsage(DynamicDrawUsage$1);
        this.mesh = new InstancedPanelMesh(this.root, this.instanceMatrix, this.instanceData, this.instanceClipping);
        this.mesh.renderOrder = parseNumberValue(this.panelGroupProperties.renderOrder);
        setupRenderOrder(this.mesh, { peek: () => this.root }, { value: this.orderInfo });
        this.mesh.material = this.instanceMaterial;
        this.mesh.receiveShadow = this.panelGroupProperties.receiveShadow;
        this.mesh.castShadow = this.panelGroupProperties.castShadow;
        this.object.addUnsafe(this.mesh);
    }
    destroy() {
        clearTimeout(this.nextUpdateTimeoutRef);
        if (this.mesh == null) {
            return;
        }
        this.object.remove(this.mesh);
        this.mesh?.dispose();
        this.instanceMaterial.dispose();
    }
}
function copyWithinAttribute(attribute, targetIndex, startIndex, endIndex) {
    const itemSize = attribute.itemSize;
    const start = startIndex * itemSize;
    const end = endIndex * itemSize;
    const target = targetIndex * itemSize;
    attribute.array.copyWithin(target, start, end);
    const count = end - start;
    attribute.addUpdateRange(start, count);
    attribute.addUpdateRange(target, count);
    attribute.needsUpdate = true;
}

class PanelGroupManager {
    root;
    object;
    map = new Map();
    constructor(root, object) {
        this.root = root;
        this.object = object;
    }
    init(abortSignal) {
        const onFrame = () => this.traverse((group) => group.onFrame());
        this.root.onFrameSet.add(onFrame);
        abortSignal.addEventListener('abort', () => {
            this.root.onFrameSet.delete(onFrame);
            this.traverse((group) => group.destroy());
        });
    }
    traverse(fn) {
        for (const groups of this.map.values()) {
            for (const group of groups.values()) {
                fn(group);
            }
        }
    }
    getGroup({ majorIndex, minorIndex }, properties) {
        const materialClass = resolvePanelMaterialClassProperty(properties.panelMaterialClass);
        let groups = this.map.get(materialClass);
        if (groups == null) {
            this.map.set(materialClass, (groups = new Map()));
        }
        const key = [
            majorIndex,
            minorIndex,
            properties.renderOrder,
            properties.depthTest,
            properties.depthWrite,
            properties.receiveShadow,
            properties.castShadow,
        ].join(',');
        let panelGroup = groups.get(key);
        if (panelGroup == null) {
            groups.set(key, (panelGroup = new InstancedPanelGroup(this.object, this.root, {
                elementType: ElementType.Panel,
                minorIndex,
                majorIndex,
                patchIndex: 0,
            }, properties)));
        }
        return panelGroup;
    }
}

const {Matrix4: Matrix4$7} = await importShared('three');
const matrixHelper$1 = new Matrix4$7();
function computedPanelMatrix(properties, matrixSignal, sizeSignal, offsetSignal) {
    return g(() => {
        const size = sizeSignal.value;
        const matrix = matrixSignal.value;
        if (size == null || matrix == null) {
            return undefined;
        }
        const [width, height] = size;
        const pixelSize = parseNumberValue(properties.value.pixelSize);
        const result = new Matrix4$7();
        result.makeScale(width * pixelSize, height * pixelSize, 1);
        if (offsetSignal != null) {
            const [x, y] = offsetSignal.value;
            result.premultiply(matrixHelper$1.makeTranslation(x * pixelSize, y * pixelSize, 0));
        }
        return result.premultiply(matrix);
    });
}

var loadYoga$1 = (() => {
  var _scriptDir = import.meta.url;
  
  return (
function(loadYoga) {
  loadYoga = loadYoga || {};


var h;h||(h=typeof loadYoga !== 'undefined' ? loadYoga : {});var aa,ca;h.ready=new Promise(function(a,b){aa=a;ca=b;});var da=Object.assign({},h),q="";"undefined"!=typeof document&&document.currentScript&&(q=document.currentScript.src);_scriptDir&&(q=_scriptDir);0!==q.indexOf("blob:")?q=q.substr(0,q.replace(/[?#].*/,"").lastIndexOf("/")+1):q="";var ea=h.print||console.log.bind(console),v=h.printErr||console.warn.bind(console);Object.assign(h,da);da=null;var w;h.wasmBinary&&(w=h.wasmBinary);
h.noExitRuntime||true;"object"!=typeof WebAssembly&&x("no native wasm support detected");var fa,ha=false;function z(a,b,c){c=b+c;for(var d="";!(b>=c);){var e=a[b++];if(!e)break;if(e&128){var f=a[b++]&63;if(192==(e&224))d+=String.fromCharCode((e&31)<<6|f);else {var g=a[b++]&63;e=224==(e&240)?(e&15)<<12|f<<6|g:(e&7)<<18|f<<12|g<<6|a[b++]&63;65536>e?d+=String.fromCharCode(e):(e-=65536,d+=String.fromCharCode(55296|e>>10,56320|e&1023));}}else d+=String.fromCharCode(e);}return d}
var ia,ja,A,C,ka,D,E,la,ma;function na(){var a=fa.buffer;ia=a;h.HEAP8=ja=new Int8Array(a);h.HEAP16=C=new Int16Array(a);h.HEAP32=D=new Int32Array(a);h.HEAPU8=A=new Uint8Array(a);h.HEAPU16=ka=new Uint16Array(a);h.HEAPU32=E=new Uint32Array(a);h.HEAPF32=la=new Float32Array(a);h.HEAPF64=ma=new Float64Array(a);}var oa,pa=[],qa=[],ra=[];function sa(){var a=h.preRun.shift();pa.unshift(a);}var F=0,G=null;
function x(a){if(h.onAbort)h.onAbort(a);a="Aborted("+a+")";v(a);ha=true;a=new WebAssembly.RuntimeError(a+". Build with -sASSERTIONS for more info.");ca(a);throw a;}function ua(a){return a.startsWith("data:application/octet-stream;base64,")}var H;H="data:application/octet-stream;base64,AGFzbQEAAAABugM3YAF/AGACf38AYAF/AX9gA39/fwBgAn98AGACf38Bf2ADf39/AX9gBH9/f30BfWADf398AGAAAGAEf39/fwBgAX8BfGACf38BfGAFf39/f38Bf2AAAX9gA39/fwF9YAZ/f31/fX8AYAV/f39/fwBgAn9/AX1gBX9/f319AX1gAX8BfWADf35/AX5gB39/f39/f38AYAZ/f39/f38AYAR/f39/AX9gBn9/f319fQF9YAR/f31/AGADf399AX1gBn98f39/fwF/YAR/fHx/AGACf30AYAh/f39/f39/fwBgDX9/f39/f39/f39/f38AYAp/f39/f39/f39/AGAFf39/f38BfGAEfHx/fwF9YA1/fX1/f399fX9/f39/AX9gB39/f319f38AYAJ+fwF/YAN/fX0BfWABfAF8YAN/fHwAYAR/f319AGAHf39/fX19fQF9YA1/fX99f31/fX19fX1/AX9gC39/f39/f399fX19AX9gCH9/f39/f319AGAEf39+fgBgB39/f39/f38Bf2ACfH8BfGAFf398fH8AYAN/f38BfGAEf39/fABgA39/fQBgBn9/fX99fwF/ArUBHgFhAWEAHwFhAWIAAwFhAWMACQFhAWQAFgFhAWUAEQFhAWYAIAFhAWcAAAFhAWgAIQFhAWkAAwFhAWoAAAFhAWsAFwFhAWwACgFhAW0ABQFhAW4AAwFhAW8AAQFhAXAAFwFhAXEABgFhAXIAAAFhAXMAIgFhAXQACgFhAXUADQFhAXYAFgFhAXcAAgFhAXgAAwFhAXkAGAFhAXoAAgFhAUEAAQFhAUIAEQFhAUMAAQFhAUQAAAOiAqACAgMSBwcACRkDAAoRBgYKEwAPDxMBBiMTCgcHGgMUASQFJRQHAwMKCgMmAQYYDxobFAAKBw8KBwMDAgkCAAAFGwACBwIHBgIDAQMIDAABKAkHBQURACkZASoAAAIrLAIALQcHBy4HLwkFCgMCMA0xAgMJAgACAQYKAQIBBQEACQIFAQEABQAODQ0GFQIBHBUGAgkCEAAAAAUyDzMMBQYINAUCAwUODg41AgMCAgIDBgICNgIBDAwMAQsLCwsLCx0CAAIAAAABABABBQICAQMCEgMMCwEBAQEBAQsLAQICAwICAgICAgIDAgIICAEICAgEBAQEBAQEBAQABAQABAQEBAAE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GiABQQA2AvADIAFCADcC6AMgAigC7AMiAyACKALoAyIERwRAIAMgBGsiBEEASA0FIAEgBBAeIgM2AuwDIAEgAzYC6AMgASADIARqNgLwAyACKALoAyIEIAIoAuwDIghHBEADQCADIAQoAgA2AgAgA0EEaiEDIARBBGoiBCAIRw0ACwsgASADNgLsAwsgASACKQL0AzcC9AMgASACKAKEBDYChAQgASACKQL8AzcC/AMgAUEANgLkAwsgBSABNgIAIAEgADYC5AMLIAZBAWohBiAFQQRqIgUgB0cNAAsLDwsQAgALUAACQAJAAkACQAJAIAIOBAQAAQIDCyAAIAEgAUEwahBDDwsgACABIAFBMGogAxBEDwsgACABIAFBMGoQQg8LECQACyAAIAEgAUEwaiADEEULcAIBfwF9IwBBEGsiBCQAIARBCGogACABQQJ0QdwlaigCACACEDZDAADAfyEFAkACQAJAIAQtAAxBAWsOAgABAgsgBCoCCCEFDAELIAQqAgggA5RDCtcjPJQhBQsgBEEQaiQAIAVDAAAAACAFIAVbGwt5AgF/AX0jAEEQayIDJAAgA0EIaiAAIAFBAnRB7CVqKAIAIAIQU0MAAMB/IQQCQAJAAkAgAy0ADEEBaw4CAAECCyADKgIIIQQMAQsgAyoCCEMAAAAAlEMK1yM8lCEECyADQRBqJAAgBEMAAAAAl0MAAAAAIAQgBFsbC1QAAkACQAJAAkACQCACDgQEAAECAwsgACABIAFBwgBqEEMPCyAAIAEgAUHCAGogAxBEDwsgACABIAFBwgBqEEIPCxAkAAsgACABIAFBwgBqIAMQRQsvACAAIAJFQQF0IgIgASADEGAgACACIAEQS5IgACACIAEgAxB/IAAgAiABEFKSkgvOAQIDfwJ9IwBBEGsiAyQAQQEhBCADQQhqIABB/ABqIgUgACABQQF0akH2AGoiAS8BABAfAkACQCADKgIIIgcgAioCACIGXARAIAcgB1sEQCACLQAEIQIMAgsgBiAGXCEECyACLQAEIQIgBEUNACADLQAMIAJB/wFxRg0BCyAFIAEgBiACEDkDQCAALQAAIgFBBHENASAAIAFBBHI6AAAgACgCECIBBEAgACABEQAACyAAQYCAgP4HNgKcASAAKALkAyIADQALCyADQRBqJAALzgECA38CfSMAQRBrIgMkAEEBIQQgA0EIaiAAQfwAaiIFIAAgAUEBdGpB8gBqIgEvAQAQHwJAAkAgAyoCCCIHIAIqAgAiBlwEQCAHIAdbBEAgAi0ABCECDAILIAYgBlwhBAsgAi0ABCECIARFDQAgAy0ADCACQf8BcUYNAQsgBSABIAYgAhA5A0AgAC0AACIBQQRxDQEgACABQQRyOgAAIAAoAhAiAQRAIAAgAREAAAsgAEGAgID+BzYCnAEgACgC5AMiAA0ACwsgA0EQaiQACwoAIABBMGtBCkkLBQAQAgALBAAgAAsUACAABEAgACAAKAIAKAIEEQAACwsrAQF/IAAoAgwiAQRAIAEQIwsgACgCACIBBEAgACABNgIEIAEQIwsgABAjC4EEAQN/IwBBEGsiAyQAIABCADcCBCAAQcEgOwAVIABCADcCDCAAQoCAgICAgIACNwIYIAAgAC0AF0HgAXE6ABcgACAALQAAQeABcUEFcjoAACAAIAAtABRBgAFxOgAUIABBIGpBAEHOABAqGiAAQgA3AXIgAEGEgBA2AW4gAEEANgF6IABCADcCgAEgAEIANwKIASAAQgA3ApABIABCADcCoAEgAEKAgICAgICA4P8ANwKYASAAQQA6AKgBIABBrAFqQQBBxAEQKhogAEHwAmohBCAAQbABaiECA0AgAkKAgID8i4CAwL9/NwIQIAJCgYCAgBA3AgggAkKAgID8i4CAwL9/NwIAIAJBGGoiAiAERw0ACyAAQoCAgPyLgIDAv383AvACIABCgICA/IuAgMC/fzcCgAMgAEKBgICAEDcC+AIgAEKAgID+h4CA4P8ANwKUAyAAQoCAgP6HgIDg/wA3AowDIABBiANqIgIgAi0AAEH4AXE6AAAgAEGcA2pBAEHYABAqGiAAQQA6AIQEIABBgICA/gc2AoAEIABBADoA/AMgAEGAgID+BzYC+AMgACABNgL0AyABBEAgAS0ACEEBcQRAIAAgAC0AFEHzAXFBCHI6ABQgACAALwAVQfD/A3FBBHI7ABULIANBEGokACAADwsgA0GiGjYCACADEHIQJAALMwAgACABQQJ0QfwlaigCAEECdGoqApQDIABBFGoiACABQQEgAhAiIAAgAUEBIAIQIZKSC44DAQp/IwBB0AJrIgEkACAAKALoAyIDIAAoAuwDIgVHBEAgAUGMAmohBiABQeABaiEHIAFBIGohCCABQRxqIQkgAUEQaiEEA0AgAygCACICLQAXQRB0QYCAMHFBgIAgRgRAIAFBCGpBAEHEAhAqGiABQYCAgP4HNgIMIARBADoACCAEQgA3AgAgCUEAQcQBECoaIAghAANAIABCgICA/IuAgMC/fzcCECAAQoGAgIAQNwIIIABCgICA/IuAgMC/fzcCACAAQRhqIgAgB0cNAAsgAUKAgID8i4CAwL9/NwPwASABQoGAgIAQNwPoASABQoCAgPyLgIDAv383A+ABIAFCgICA/oeAgOD/ADcChAIgAUKAgID+h4CA4P8ANwL8ASABIAEtAPgBQfgBcToA+AEgBkEAQcAAECoaIAJBmAFqIAFBCGpBxAIQKxogAkIANwKMAyACIAItAAAiAEEBciIKQfsBcSAKIABBBHEbOgAAIAIQTyACEF4LIANBBGoiAyAFRw0ACwsgAUHQAmokAAtMAQF/QQEhAQJAIAAtAB5BB3ENACAALQAiQQdxDQAgAC0ALkEHcQ0AIAAtACpBB3ENACAALQAmQQdxDQAgAC0AKEEHcUEARyEBCyABC3YCAX8BfSMAQRBrIgQkACAEQQhqIAAgAUECdEHcJWooAgAgAhBQQwAAwH8hBQJAAkACQCAELQAMQQFrDgIAAQILIAQqAgghBQwBCyAEKgIIIAOUQwrXIzyUIQULIARBEGokACAFQwAAAACXQwAAAAAgBSAFWxsLogQCBn8CfgJ/QQghBAJAAkAgAEFHSw0AA0BBCCAEIARBCE0bIQRB6DopAwAiBwJ/QQggAEEDakF8cSAAQQhNGyIAQf8ATQRAIABBA3ZBAWsMAQsgAEEdIABnIgFrdkEEcyABQQJ0a0HuAGogAEH/H00NABpBPyAAQR4gAWt2QQJzIAFBAXRrQccAaiIBIAFBP08bCyIDrYgiCFBFBEADQCAIIAh6IgiIIQcCfiADIAinaiIDQQR0IgJB6DJqKAIAIgEgAkHgMmoiBkcEQCABIAQgABBjIgUNBSABKAIEIgUgASgCCDYCCCABKAIIIAU2AgQgASAGNgIIIAEgAkHkMmoiAigCADYCBCACIAE2AgAgASgCBCABNgIIIANBAWohAyAHQgGIDAELQeg6Qeg6KQMAQn4gA62JgzcDACAHQgGFCyIIQgBSDQALQeg6KQMAIQcLAkAgB1BFBEBBPyAHeadrIgZBBHQiAkHoMmooAgAhAQJAIAdCgICAgARUDQBB4wAhAyABIAJB4DJqIgJGDQADQCADRQ0BIAEgBCAAEGMiBQ0FIANBAWshAyABKAIIIgEgAkcNAAsgAiEBCyAAQTBqEGQNASABRQ0EIAEgBkEEdEHgMmoiAkYNBANAIAEgBCAAEGMiBQ0EIAEoAggiASACRw0ACwwECyAAQTBqEGRFDQMLQQAhBSAEIARBAWtxDQEgAEFHTQ0ACwsgBQwBC0EACwtwAgF/AX0jAEEQayIEJAAgBEEIaiAAIAFBAnRB7CVqKAIAIAIQKEMAAMB/IQUCQAJAAkAgBC0ADEEBaw4CAAECCyAEKgIIIQUMAQsgBCoCCCADlEMK1yM8lCEFCyAEQRBqJAAgBUMAAAAAIAUgBVsbC6ADAQN/IAEgAEEEaiIEakEBa0EAIAFrcSIFIAJqIAAgACgCACIBakEEa00EfyAAKAIEIgMgACgCCDYCCCAAKAIIIAM2AgQgBCAFRwRAIAAgAEEEaygCAEF+cWsiAyAFIARrIgQgAygCAGoiBTYCACAFQXxxIANqQQRrIAU2AgAgACAEaiIAIAEgBGsiATYCAAsCQCABIAJBGGpPBEAgACACakEIaiIDIAEgAmtBCGsiATYCACABQXxxIANqQQRrIAFBAXI2AgAgAwJ/IAMoAgBBCGsiAUH/AE0EQCABQQN2QQFrDAELIAFnIQQgAUEdIARrdkEEcyAEQQJ0a0HuAGogAUH/H00NABpBPyABQR4gBGt2QQJzIARBAXRrQccAaiIBIAFBP08bCyIBQQR0IgRB4DJqNgIEIAMgBEHoMmoiBCgCADYCCCAEIAM2AgAgAygCCCADNgIEQeg6Qeg6KQMAQgEgAa2GhDcDACAAIAJBCGoiATYCACABQXxxIABqQQRrIAE2AgAMAQsgACABakEEayABNgIACyAAQQRqBSADCwvmAwEFfwJ/QbAwKAIAIgEgAEEHakF4cSIDaiECAkAgA0EAIAEgAk8bDQAgAj8AQRB0SwRAIAIQFkUNAQtBsDAgAjYCACABDAELQfw7QTA2AgBBfwsiAkF/RwRAIAAgAmoiA0EQayIBQRA2AgwgAUEQNgIAAkACf0HgOigCACIABH8gACgCCAVBAAsgAkYEQCACIAJBBGsoAgBBfnFrIgRBBGsoAgAhBSAAIAM2AghBcCAEIAVBfnFrIgAgACgCAGpBBGstAABBAXFFDQEaIAAoAgQiAyAAKAIINgIIIAAoAgggAzYCBCAAIAEgAGsiATYCAAwCCyACQRA2AgwgAkEQNgIAIAIgAzYCCCACIAA2AgRB4DogAjYCAEEQCyACaiIAIAEgAGsiATYCAAsgAUF8cSAAakEEayABQQFyNgIAIAACfyAAKAIAQQhrIgFB/wBNBEAgAUEDdkEBawwBCyABQR0gAWciA2t2QQRzIANBAnRrQe4AaiABQf8fTQ0AGkE/IAFBHiADa3ZBAnMgA0EBdGtBxwBqIgEgAUE/TxsLIgFBBHQiA0HgMmo2AgQgACADQegyaiIDKAIANgIIIAMgADYCACAAKAIIIAA2AgRB6DpB6DopAwBCASABrYaENwMACyACQX9HC80BAgN/An0jAEEQayIDJABBASEEIANBCGogAEH8AGoiBSAAIAFBAXRqQSBqIgEvAQAQHwJAAkAgAyoCCCIHIAIqAgAiBlwEQCAHIAdbBEAgAi0ABCECDAILIAYgBlwhBAsgAi0ABCECIARFDQAgAy0ADCACQf8BcUYNAQsgBSABIAYgAhA5A0AgAC0AACIBQQRxDQEgACABQQRyOgAAIAAoAhAiAQRAIAAgAREAAAsgAEGAgID+BzYCnAEgACgC5AMiAA0ACwsgA0EQaiQAC0ABAX8CQEGsOy0AAEEBcQRAQag7KAIAIQIMAQtBAUGAJxAMIQJBrDtBAToAAEGoOyACNgIACyACIAAgAUEAEBMLzQECA38CfSMAQRBrIgMkAEEBIQQgA0EIaiAAQfwAaiIFIAAgAUEBdGpBMmoiAS8BABAfAkACQCADKgIIIgcgAioCACIGXARAIAcgB1sEQCACLQAEIQIMAgsgBiAGXCEECyACLQAEIQIgBEUNACADLQAMIAJB/wFxRg0BCyAFIAEgBiACEDkDQCAALQAAIgFBBHENASAAIAFBBHI6AAAgACgCECIBBEAgACABEQAACyAAQYCAgP4HNgKcASAAKALkAyIADQALCyADQRBqJAALDwAgASAAKAIAaiACOQMACw0AIAEgACgCAGorAwALCwAgAARAIAAQIwsLxwECBH8CfSMAQRBrIgIkACACQQhqIABB/ABqIgQgAEEeaiIFLwEAEB9BASEDAkACQCACKgIIIgcgASoCACIGXARAIAcgB1sEQCABLQAEIQEMAgsgBiAGXCEDCyABLQAEIQEgA0UNACACLQAMIAFB/wFxRg0BCyAEIAUgBiABEDkDQCAALQAAIgFBBHENASAAIAFBBHI6AAAgACgCECIBBEAgACABEQAACyAAQYCAgP4HNgKcASAAKALkAyIADQALCyACQRBqJAALlgMCA34CfyAAvSICQjSIp0H/D3EiBEH/D0YEQCAARAAAAAAAAPA/oiIAIACjDwsgAkIBhiIBQoCAgICAgIDw/wBYBEAgAEQAAAAAAAAAAKIgACABQoCAgICAgIDw/wBRGw8LAn4gBEUEQEEAIQQgAkIMhiIBQgBZBEADQCAEQQFrIQQgAUIBhiIBQgBZDQALCyACQQEgBGuthgwBCyACQv////////8Hg0KAgICAgICACIQLIQEgBEH/B0oEQANAAkAgAUKAgICAgICACH0iA0IAUw0AIAMiAUIAUg0AIABEAAAAAAAAAACiDwsgAUIBhiEBIARBAWsiBEH/B0oNAAtB/wchBAsCQCABQoCAgICAgIAIfSIDQgBTDQAgAyIBQgBSDQAgAEQAAAAAAAAAAKIPCyABQv////////8HWARAA0AgBEEBayEEIAFCgICAgICAgARUIQUgAUIBhiEBIAUNAAsLIAJCgICAgICAgICAf4MgAUKAgICAgICACH0gBK1CNIaEIAFBASAEa62IIARBAEobhL8LiwEBA38DQCAAQQR0IgFB5DJqIAFB4DJqIgI2AgAgAUHoMmogAjYCACAAQQFqIgBBwABHDQALQTAQZBpBmDtBBjYCAEGcO0EANgIAEJwBQZw7Qcg7KAIANgIAQcg7QZg7NgIAQcw7QcMBNgIAQdA7QQA2AgAQjwFB0DtByDsoAgA2AgBByDtBzDs2AgALjwEBAn8jAEEQayIEJAACfUMAAAAAIAAvABVBgOAAcUUNABogBEEIaiAAQRRqIgBBASACQQJGQQF0IAFB/gFxQQJHGyIFIAIQNgJAIAQtAAxFDQAgBEEIaiAAIAUgAhA2IAQtAAxBA0YNACAAIAEgAiADEIEBDAELIAAgASACIAMQgAGMCyEDIARBEGokACADC4QBAQJ/AkACQCAAKALoAyICIAAoAuwDIgNGDQADQCACKAIAIAFGDQEgAkEEaiICIANHDQALDAELIAIgA0YNACABLQAXQRB0QYCAMHFBgIAgRgRAIAAgACgC4ANBAWs2AuADCyACIAJBBGoiASADIAFrEDMaIAAgA0EEazYC7ANBAQ8LQQALCwBByDEgACABEEkLPAAgAEUEQCACQQVHQQAgAhtFBEBBuDAgAyAEEEkaDwsgAyAEEHAaDwsgACABIAIgAyAEIAAoAgQRDQAaCyYBAX8jAEEQayIBJAAgASAANgIMQbgwQdglIAAQSRogAUEQaiQAC4cDAwN/BXwCfSAAKgKgA7siBiACoCECIAAqApwDuyIHIAGgIQggACgC9AMqAhgiC0MAAAAAXARAIAAqApADuyEJIAAqAowDIQwgACAHIAu7IgFBACAALQAAQRBxIgNBBHYiBBA0OAKcAyAAIAYgAUEAIAQQNDgCoAMgASAMuyIHohBsIgYgBmIiBEUgBplELUMc6+I2Gj9jcUUEQCAEIAZEAAAAAAAA8L+gmUQtQxzr4jYaP2NFciEFCyACIAmgIQogCCAHoCEHAn8gASAJohBsIgYgBmIiBEUEQEEAIAaZRC1DHOviNho/Yw0BGgsgBCAGRAAAAAAAAPC/oJlELUMc6+I2Gj9jRXILIQQgACAHIAEgA0EARyIDIAVxIAMgBUEBc3EQNCAIIAFBACADEDSTOAKMAyAAIAogASADIARxIAMgBEEBc3EQNCACIAFBACADEDSTOAKQAwsgACgC6AMiAyAAKALsAyIARwRAA0AgAygCACAIIAIQcyADQQRqIgMgAEcNAAsLC1UBAX0gAEEUaiIAIAEgAkECSSICIAQgBRA1IQYgACABIAIgBCAFEC0iBUMAAAAAYCADIAVecQR9IAUFIAZDAAAAAGBFBEAgAw8LIAYgAyADIAZdGwsLeAEBfwJAIAAoAgAiAgRAA0AgAUUNAiACIAEoAgQ2AgQgAiABKAIINgIIIAEoAgAhASAAKAIAIQAgAigCACICDQALCyAAIAEQPA8LAkAgAEUNACAAKAIAIgFFDQAgAEEANgIAA0AgASgCACEAIAEQIyAAIgENAAsLC5kCAgZ/AX0gAEEUaiEHQQMhBCAALQAUQQJ2QQNxIQUCQAJ/AkAgAUEBIAAoAuQDGyIIQQJGBEACQCAFQQJrDgIEAAILQQIhBAwDC0ECIQRBACAFQQFLDQEaCyAECyEGIAUhBAsgACAEIAggAyACIARBAkkiBRsQbiEKIAAgBiAIIAIgAyAFGxBuIQMgAEGcA2oiAEEBIAFBAkZBAXQiCCAFG0ECdGogCiAHIAQgASACECKSOAIAIABBAyABQQJHQQF0IgkgBRtBAnRqIAogByAEIAEgAhAhkjgCACAAIAhBASAGQQF2IgQbQQJ0aiADIAcgBiABIAIQIpI4AgAgACAJQQMgBBtBAnRqIAMgByAGIAEgAhAhkjgCAAvUAgEDfyMAQdACayIBJAAgAUEIakEAQcQCECoaIAFBADoAGCABQgA3AxAgAUGAgID+BzYCDCABQRxqQQBBxAEQKhogAUHgAWohAyABQSBqIQIDQCACQoCAgPyLgIDAv383AhAgAkKBgICAEDcCCCACQoCAgPyLgIDAv383AgAgAkEYaiICIANHDQALIAFCgICA/IuAgMC/fzcD8AEgAUKBgICAEDcD6AEgAUKAgID8i4CAwL9/NwPgASABQoCAgP6HgIDg/wA3AoQCIAFCgICA/oeAgOD/ADcC/AEgASABLQD4AUH4AXE6APgBIAFBjAJqQQBBwAAQKhogAEGYAWogAUEIakHEAhArGiAAQgA3AowDIAAgAC0AAEEBcjoAACAAEE8gACgC6AMiAiAAKALsAyIARwRAA0AgAigCABB3IAJBBGoiAiAARw0ACwsgAUHQAmokAAuuAgIKfwJ9IwBBIGsiASQAIAFBgAI7AB4gAEHuAGohByAAQfgDaiEFIABB8gBqIQggAEH2AGohCSAAQfwAaiEDQQAhAANAIAFBEGogAyAJIAFBHmogBGotAAAiAkEBdCIEaiIGLwEAEB8CQAJAIAEtABRFDQAgAUEIaiADIAYvAQAQHyABIAMgBCAIai8BABAfIAEtAAwgAS0ABEcNAAJAIAEqAggiDCAMXCIKIAEqAgAiCyALXHJFBEAgDCALk4tDF7fROF0NAQwCCyAKRSALIAtbcg0BCyABQRBqIAMgBi8BABAfDAELIAFBEGogAyAEIAdqLwEAEB8LIAUgAkEDdGoiAiABLQAUOgAEIAIgASgCEDYCAEEBIQQgACECQQEhACACRQ0ACyABQSBqJAALMgACf0EAIAAvABVBgOAAcUGAwABGDQAaQQEgABA7QwAAAABcDQAaIAAQQEMAAAAAXAsLewEBfSADIASTIgMgA1sEfUMAAAAAIABBFGoiACABIAIgBSAGEDUiByAEkyAHIAdcGyIHQ///f38gACABIAIgBSAGEC0iBSAEkyAFIAVcGyIEIAMgAyAEXhsiAyADIAddGyAHIAMgAyADXBsgAyADWyAHIAdbcRsFIAMLC98FAwR/BX0BfCAJQwAAAABdIAhDAAAAAF1yBH8gDQUgBSESIAEhEyADIRQgByERIAwqAhgiFUMAAAAAXARAIAG7IBW7IhZBAEEAEDQhEyADuyAWQQBBABA0IRQgBbsgFkEAQQAQNCESIAe7IBZBAEEAEDQhEQsCf0EAIAAgBEcNABogEiATk4tDF7fROF0gEyATXCINIBIgElxyRQ0AGkEAIBIgElsNABogDQshDAJAIAIgBkcNACAUIBRcIg0gESARXHJFBEAgESAUk4tDF7fROF0hDwwBCyARIBFbDQAgDSEPC0EBIQ5BASENAkAgDA0AIAEgCpMhAQJAIABFBEAgASABXCIAIAggCFxyRQRAQQAhDCABIAiTi0MXt9E4XUUNAgwDC0EAIQwgCCAIWw0BIAANAgwBCyAAQQJGIQwgAEECRw0AIARBAUcNACABIAhgDQECQCAIIAhcIgAgASABXHJFBEAgASAIk4tDF7fROF1FDQEMAwtBACENIAEgAVsNAkEBIQ0gAA0CC0EAIQ0MAQtBACENIAggCFwiACABIAVdRXINACAMRSABIAFcIhAgBSAFXHIgBEECR3JyDQBBASENIAEgCGANAEEAIQ0gACAQcg0AIAEgCJOLQxe30ThdIQ0LAkAgDw0AIAMgC5MhAQJAAkAgAkUEQCABIAFcIgIgCSAJXHJFBEBBACEAIAEgCZOLQxe30ThdRQ0CDAQLQQAhACAJIAlbDQEgAg0DDAELIAJBAkYhACACQQJHIAZBAUdyDQAgASAJYARADAMLIAkgCVwiACABIAFcckUEQCABIAmTi0MXt9E4XUUNAgwDC0EAIQ4gASABWw0CQQEhDiAADQIMAQsgCSAJXCICIAEgB11Fcg0AIABFIAEgAVwiBCAHIAdcciAGQQJHcnINACABIAlgDQFBACEOIAIgBHINASABIAmTi0MXt9E4XSEODAELQQAhDgsgDSAOcQsL4wEBA38jAEEQayIBJAACQAJAIAAtABRBCHFFDQBBASEDIAAvABVB8AFxQdAARg0AIAEgABAyIAEoAgQhAAJAIAEoAgAiAkUEQEEAIQMgAEUNAQsDQCACKALsAyACKALoAyICa0ECdSAATQ0DIAIgAEECdGooAgAiAC8AFSAALQAXQRB0ciIAQYDgAHFBgMAARyAAQYAecUGACkZxIgMNASABEC4gASgCBCIAIAEoAgAiAnINAAsLIAEoAggiAEUNAANAIAAoAgAhAiAAECMgAiIADQALCyABQRBqJAAgAw8LEAIAC7IBAQR/AkACQCAAKAIEIgMgACgCACIEKALsAyAEKALoAyIBa0ECdUkEQCABIANBAnRqIQIDQCACKAIAIgEtABdBEHRBgIAwcUGAgCBHDQMgASgC7AMgASgC6ANGDQJBDBAeIgIgBDYCBCACIAM2AgggAiAAKAIINgIAQQAhAyAAQQA2AgQgACABNgIAIAAgAjYCCCABIQQgASgC6AMiAiABKALsA0cNAAsLEAIACyAAEC4LC4wQAgx/B30jAEEgayINJAAgDUEIaiABEDIgDSgCCCIOIA0oAgwiDHIEQCADQQEgAxshFSAAQRRqIRQgBUEBaiEWA0ACQAJAAn8CQAJAAkACQAJAIAwgDigC7AMgDigC6AMiDmtBAnVJBEAgDiAMQQJ0aigCACILLwAVIAstABdBEHRyIgxBgIAwcUGAgBBGDQgCQAJAIAxBDHZBA3EOAwEKAAoLIAkhFyAKIRogASgC9AMtABRBBHFFBEAgACoClAMgFEECQQEQMCAUQQJBARAvkpMhFyAAKgKYAyAUQQBBARAwIBRBAEEBEC+SkyEaCyALQRRqIQ8gAS0AFEECdkEDcSEQAkACfwJAIANBAkciE0UEQEEAIQ5BAyEMAkAgEEECaw4CBAACC0ECIQwMAwtBAiEMQQAgEEEBSw0BGgsgDAshDiAQIQwLIA9BAkEBIBcQIiAPQQJBASAXECGSIR0gD0EAQQEgFxAiIRwgD0EAQQEgFxAhIRsgCyoC+AMhGAJAAkACQAJAIAstAPwDQQFrDgIBAAILIBggF5RDCtcjPJQhGAsgGEMAAAAAYEUNACAdIAsgA0EAIBcgFxAxkiEYDAELIA1BGGogDyALQTJqIhAgAxBFQwAAwH8hGCANLQAcRQ0AIA1BGGogDyAQIAMQRCANLQAcRQ0AIA1BGGogDyAQIAMQRSANLQAcQQNGDQAgDUEYaiAPIBAgAxBEIA0tABxBA0YNACALQQIgAyAAKgKUAyAUQQIgAxBLIBRBAiADEFKSkyAPQQIgAyAXEFEgD0ECIAMgFxCDAZKTIBcgFxAlIRgLIBwgG5IhHCALKgKABCEZAkACQAJAIAstAIQEQQFrDgIBAAILIBkgGpRDCtcjPJQhGQsgGUMAAAAAYEUNACAcIAsgA0EBIBogFxAxkiEZDAMLIA1BGGogDyALQTJqIhAQQwJAIA0tABxFDQAgDUEYaiAPIBAQQiANLQAcRQ0AIA1BGGogDyAQEEMgDS0AHEEDRg0AIA1BGGogDyAQEEIgDS0AHEEDRg0AIAtBACADIAAqApgDIBRBACADEEsgFEEAIAMQUpKTIA9BACADIBoQUSAPQQAgAyAaEIMBkpMgGiAXECUhGQwDC0MAAMB/IRkgGCAYXA0GIAtB/ABqIhAgC0H6AGoiEi8BABAgIhsgG1sNAwwFCyALLQAAQQhxDQggCxBPIAAgCyACIAstABRBA3EiDCAVIAwbIAQgFiAGIAsqApwDIAeSIAsqAqADIAiSIAkgChB+IBFyIQxBACERIAxBAXFFDQhBASERIAsgCy0AAEEBcjoAAAwICxACAAsgGCAYXCAZIBlcRg0BIAtB/ABqIhAgC0H6AGoiEi8BABAgIhsgG1wNASAYIBhcBEAgGSAckyAQIAsvAXoQIJQgHZIhGAwCCyAZIBlbDQELIBwgGCAdkyAQIBIvAQAQIJWSIRkLIBggGFwNASAZIBlbDQMLQQAMAQtBAQshEiALIBcgGCACQQFHIAxBAklxIBdDAAAAAF5xIBJxIhAbIBkgA0ECIBIgEBsgGSAZXCAXIBpBAEEGIAQgBSAGED0aIAsqApQDIA9BAkEBIBcQIiAPQQJBASAXECGSkiEYIAsqApgDIA9BAEEBIBcQIiAPQQBBASAXECGSkiEZC0EBIRAgCyAYIBkgA0EAQQAgFyAaQQFBASAEIAUgBhA9GiAAIAEgCyADIAxBASAXIBoQggEgACABIAsgAyAOQQAgFyAaEIIBIBFBAXFFBEAgCy0AAEEBcSEQCyABLQAUIhJBAnZBA3EhDAJAAn8CQAJAAkACQAJAAkACQAJAAkACfwJAIBNFBEBBACERQQMhDiAMQQJrDgIDDQELQQIhDkEAIAxBAUsNARoLIA4LIREgEkEEcUUNBCASQQhxRQ0BIAwhDgsgASEMIA8QXw0BDAILAkAgCy0ANEEHcQ0AIAstADhBB3ENACALLQBCQQdxDQAgDCEOIAEhDCALQUBrLwEAQQdxRQ0CDAELIAwhDgsgACEMCwJ/AkACQAJAIA5BAWsOAwABAgULIAtBmANqIQ4gC0GoA2ohE0EBIRIgDEGYA2oMAgsgC0GUA2ohDiALQZwDaiETQQIhEiAMQZQDagwBCyALQZQDaiEOIAtBpANqIRNBACESIAxBlANqCyEMIAsgEkECdGogDCoCACAOKgIAkyATKgIAkzgCnAMLIBFBAXFFDQUCQAJAIBFBAnEEQCABIQwgDxBfDQEMAgsgCy0ANEEHcQ0AIAstADhBB3ENACALLQBCQQdxDQAgASEMIAtBQGsvAQBBB3FFDQELIAAhDAsgEUEBaw4DAQIDAAsQJAALIAtBmANqIREgC0GoA2ohDkEBIRMgDEGYA2oMAgsgC0GUA2ohESALQZwDaiEOQQIhEyAMQZQDagwBCyALQZQDaiERIAtBpANqIQ5BACETIAxBlANqCyEMIAsgE0ECdGogDCoCACARKgIAkyAOKgIAkzgCnAMLIAsqAqADIRsgCyoCnAMgB0MAAAAAIA8QXxuTIRcCfQJAIAstADRBB3ENACALLQA4QQdxDQAgCy0AQkEHcQ0AIAtBQGsvAQBBB3ENAEMAAAAADAELIAgLIRogCyAXOAKcAyALIBsgGpM4AqADIBAhEQsgDUEIahAuIA0oAgwiDCANKAIIIg5yDQALCyANKAIQIgwEQANAIAwoAgAhACAMECMgACIMDQALCyANQSBqJAAgEUEBcQt2AgF/AX0jAEEQayIEJAAgBEEIaiAAIAFBAnRB7CVqKAIAIAIQUEMAAMB/IQUCQAJAAkAgBC0ADEEBaw4CAAECCyAEKgIIIQUMAQsgBCoCCCADlEMK1yM8lCEFCyAEQRBqJAAgBUMAAAAAl0MAAAAAIAUgBVsbC3gCAX8BfSMAQRBrIgQkACAEQQhqIABBAyACQQJHQQF0IAFB/gFxQQJHGyACEDZDAADAfyEFAkACQAJAIAQtAAxBAWsOAgABAgsgBCoCCCEFDAELIAQqAgggA5RDCtcjPJQhBQsgBEEQaiQAIAVDAAAAACAFIAVbGwt4AgF/AX0jAEEQayIEJAAgBEEIaiAAQQEgAkECRkEBdCABQf4BcUECRxsgAhA2QwAAwH8hBQJAAkACQCAELQAMQQFrDgIAAQILIAQqAgghBQwBCyAEKgIIIAOUQwrXIzyUIQULIARBEGokACAFQwAAAAAgBSAFWxsLoA0BBH8jAEEQayIJJAAgCUEIaiACQRRqIgggA0ECRkEBdEEBIARB/gFxQQJGIgobIgsgAxA2IAYgByAKGyEHAkACQAJAAkACQAJAIAktAAxFDQAgCUEIaiAIIAsgAxA2IAktAAxBA0YNACAIIAQgAyAHEIEBIABBFGogBCADEDCSIAggBCADIAcQIpIhBkEBIQMCQAJ/AkACQAJAAkAgBA4EAgMBAAcLQQIhAwwBC0EAIQMLIAMgC0YNAgJAAkAgBA4EAgIAAQYLIABBlANqIQNBAAwCCyAAQZQDaiEDQQAMAQsgAEGYA2ohA0EBCyEAIAMqAgAgAiAAQQJ0aioClAOTIAaTIQYLIAIgBEECdEHcJWooAgBBAnRqIAY4ApwDDAULIAlBCGogCCADQQJHQQF0QQMgChsiCiADEDYCQCAJLQAMRQ0AIAlBCGogCCAKIAMQNiAJLQAMQQNGDQACfwJAAkACQCAEDgQCAgABBQsgAEGUA2ohBUEADAILIABBlANqIQVBAAwBCyAAQZgDaiEFQQELIQEgBSoCACACQZQDaiIFIAFBAnRqKgIAkyAAQRRqIAQgAxAvkyAIIAQgAyAHECGTIAggBCADIAcQgAGTIQZBASEDAkACfwJAAkACQAJAIAQOBAIDAQAHC0ECIQMMAQtBACEDCyADIAtGDQICQAJAIAQOBAICAAEGCyAAQZQDaiEDQQAMAgsgAEGUA2ohA0EADAELIABBmANqIQNBAQshACADKgIAIAUgAEECdGoqAgCTIAaTIQYLIAIgBEECdEHcJWooAgBBAnRqIAY4ApwDDAULAkACQAJAIAUEQCABLQAUQQR2QQdxIgBBBUsNCEEBIAB0IgBBMnENASAAQQlxBEAgBEECdEHcJWooAgAhACAIIAQgAyAGEEEgASAAQQJ0IgBqIgEqArwDkiEGIAAgAmogAigC9AMtABRBAnEEfSAGBSAGIAEqAswDkgs4ApwDDAkLIAEgBEECdEHsJWooAgBBAnRqIgAqArwDIAggBCADIAYQYpIhBiACKAL0Ay0AFEECcUUEQCAGIAAqAswDkiEGCwJAAkACQAJAIAQOBAEBAgAICyABKgKUAyACKgKUA5MhB0ECIQMMAgsgASoCmAMgAioCmAOTIQdBASEDAkAgBA4CAgAHC0EDIQMMAQsgASoClAMgAioClAOTIQdBACEDCyACIANBAnRqIAcgBpM4ApwDDAgLIAIvABZBD3EiBUUEQCABLQAVQQR2IQULIAVBBUYEQCABLQAUQQhxRQ0CCyABLwAVQYCAA3FBgIACRgRAIAVBAmsOAgEHAwsgBUEISw0HQQEgBXRB8wNxDQYgBUECRw0CC0EAIQACfQJ/AkACQAJAAkACfwJAAkACQCAEDgQCAgABBAsgASoClAMhB0ECIQAgAUG8A2oMAgsgASoClAMhByABQcQDagwBCyABKgKYAyEHAkACQCAEDgIAAQMLQQMhACABQcADagwBC0EBIQAgAUHIA2oLIQUgByAFKgIAkyABQbwDaiIIIABBAnRqKgIAkyIHIAIoAvQDLQAUQQJxDQUaAkAgBA4EAAIDBAELQQMhACABQdADagwECxAkAAtBASEAIAFB2ANqDAILQQIhACABQcwDagwBC0EAIQAgAUHUA2oLIQUgByAFKgIAkyABIABBAnRqKgLMA5MLIAIgBEECdCIFQfwlaigCAEECdGoqApQDIAJBFGoiACAEQQEgBhAiIAAgBEEBIAYQIZKSk0MAAAA/lCAIIAVB3CVqKAIAIgVBAnRqKgIAkiAAIAQgAyAGEEGSIQYgAiAFQQJ0aiACKAL0Ay0AFEECcQR9IAYFIAYgASAFQQJ0aioCzAOSCzgCnAMMBgsgAS8AFUGAgANxQYCAAkcNBAsgASAEQQJ0QewlaigCAEECdGoiACoCvAMgCCAEIAMgBhBikiEGIAIoAvQDLQAUQQJxRQRAIAYgACoCzAOSIQYLAkACQCAEDgQBAQMAAgsgASoClAMgAioClAOTIQdBAiEDDAMLIAEqApgDIAIqApgDkyEHQQEhAwJAIAQOAgMAAQtBAyEDDAILECQACyABKgKUAyACKgKUA5MhB0EAIQMLIAIgA0ECdGogByAGkzgCnAMMAQsgBEECdEHcJWooAgAhACAIIAQgAyAGEEEgASAAQQJ0IgBqIgEqArwDkiEGIAAgAmogAigC9AMtABRBAnEEfSAGBSAGIAEqAswDkgs4ApwDCyAJQRBqJAALcAIBfwF9IwBBEGsiBCQAIARBCGogACABQQJ0QewlaigCACACEDZDAADAfyEFAkACQAJAIAQtAAxBAWsOAgABAgsgBCoCCCEFDAELIAQqAgggA5RDCtcjPJQhBQsgBEEQaiQAIAVDAAAAACAFIAVbGwscACAAIAFBCCACpyACQiCIpyADpyADQiCIpxAVCwUAEFgACzkAIABFBEBBAA8LAn8gAUGAf3FBgL8DRiABQf8ATXJFBEBB/DtBGTYCAEF/DAELIAAgAToAAEEBCwvEAgACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCABQQlrDhIACgsMCgsCAwQFDAsMDAoLBwgJCyACIAIoAgAiAUEEajYCACAAIAEoAgA2AgAPCwALIAIgAigCACIBQQRqNgIAIAAgATIBADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATMBADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATAAADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATEAADcDAA8LAAsgAiACKAIAQQdqQXhxIgFBCGo2AgAgACABKwMAOQMADwsgACACIAMRAQALDwsgAiACKAIAIgFBBGo2AgAgACABNAIANwMADwsgAiACKAIAIgFBBGo2AgAgACABNQIANwMADwsgAiACKAIAQQdqQXhxIgFBCGo2AgAgACABKQMANwMAC84BAgN/An0jAEEQayIDJABBASEEIANBCGogAEH8AGoiBSAAIAFBAXRqQegAaiIBLwEAEB8CQAJAIAMqAggiByACKgIAIgZcBEAgByAHWwRAIAItAAQhAgwCCyAGIAZcIQQLIAItAAQhAiAERQ0AIAMtAAwgAkH/AXFGDQELIAUgASAGIAIQOQNAIAAtAAAiAUEEcQ0BIAAgAUEEcjoAACAAKAIQIgEEQCAAIAERAAALIABBgICA/gc2ApwBIAAoAuQDIgANAAsLIANBEGokAAtdAQR/IAAoAgAhAgNAIAIsAAAiAxBXBEBBfyEEIAAgAkEBaiICNgIAIAFBzJmz5gBNBH9BfyADQTBrIgMgAUEKbCIEaiADIARB/////wdzShsFIAQLIQEMAQsLIAELrhQCEn8BfiMAQdAAayIIJAAgCCABNgJMIAhBN2ohFyAIQThqIRQCQAJAAkACQANAIAEhDSAHIA5B/////wdzSg0BIAcgDmohDgJAAkACQCANIgctAAAiCQRAA0ACQAJAIAlB/wFxIgFFBEAgByEBDAELIAFBJUcNASAH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IQEgAEIANwIEIAAgATYCACABIAA2AgQgAkEQaiQAIAALGwEBfyAABEAgACgCACIBBEAgARAjCyAAECMLC0kBAn9BBBAeIQFBIBAeIgBBADYCHCAAQoCAgICAgIDAPzcCFCAAQgA3AgwgAEEAOgAIIABBAzYCBCAAQQA2AgAgASAANgIAIAELIAAgAkEFR0EAIAIbRQRAQbgwIAMgBBBJDwsgAyAEEHALIgEBfiABIAKtIAOtQiCGhCAEIAARFQAiBUIgiKckASAFpwuoAQEFfyAAKAJUIgMoAgAhBSADKAIEIgQgACgCFCAAKAIcIgdrIgYgBCAGSRsiBgRAIAUgByAGECsaIAMgAygCACAGaiIFNgIAIAMgAygCBCAGayIENgIECyAEIAIgAiAESxsiBARAIAUgASAEECsaIAMgAygCACAEaiIFNgIAIAMgAygCBCAEazYCBAsgBUEAOgAAIAAgACgCLCIBNgIcIAAgATYCFCACCwQAQgALBABBAAuKBQIGfgJ/IAEgASgCAEEHakF4cSIBQRBqNgIAIAAhCSABKQMAIQMgASkDCCEGIwBBIGsiCCQAAkAgBkL///////////8AgyIEQoCAgICAgMCAPH0gBEKAgICAgIDA/8MAfVQEQCAGQgSGIANCPIiEIQQgA0L//////////w+DIgNCgYCAgICAgIAIWgRAIARCgYCAgICAgIDAAHwhAgwCCyAEQoCAgICAgICAQH0hAiADQoCAgICAgICACFINASACIARCAYN8IQIMAQsgA1AgBEKAgICAgIDA//8AVCAEQoCAgICAgMD//wBRG0UEQCAGQgSGIANCPIiEQv////////8Dg0KAgICAgICA/P8AhCECDAELQoCAgICAgID4/wAhAiAEQv///////7//wwBWDQBCACECIARCMIinIgBBkfcASQ0AIAMhAiAGQv///////z+DQoCAgICAgMAAhCIFIQcCQCAAQYH3AGsiAUHAAHEEQCACIAFBQGqthiEHQgAhAgwBCyABRQ0AIAcgAa0iBIYgAkHAACABa62IhCEHIAIgBIYhAgsgCCACNwMQIAggBzcDGAJAQYH4ACAAayIAQcAAcQRAIAUgAEFAaq2IIQNCACEFDAELIABFDQAgBUHAACAAa62GIAMgAK0iAoiEIQMgBSACiCEFCyAIIAM3AwAgCCAFNwMIIAgpAwhCBIYgCCkDACIDQjyIhCECIAgpAxAgCCkDGIRCAFKtIANC//////////8Pg4QiA0KBgICAgICAgAhaBEAgAkIBfCECDAELIANCgICAgICAgIAIUg0AIAJCAYMgAnwhAgsgCEEgaiQAIAkgAiAGQoCAgICAgICAgH+DhL85AwALmRgDEn8BfAN+IwBBsARrIgwkACAMQQA2AiwCQCABvSIZQgBTBEBBASERQZkJIRMgAZoiAb0hGQwBCyAEQYAQcQRAQQEhEUGcCSETDAELQZ8JQZoJIARBAXEiERshEyARRSEVCwJAIBlCgICAgICAgPj/AINCgICAgICAgPj/AFEEQCAAQSAgAiARQQNqIgMgBEH//3txECkgACATIBEQJiAAQe0VQdweIAVBIHEiBRtB4RpB4B4gBRsgASABYhtBAxAmIABBICACIAMgBEGAwABzECkgAyACIAIgA0gbIQoMAQsgDEEQaiESAkACfwJAIAEgDEEsahCMASIBIAGgIgFEAAAAAAAAAABiBEAgDCAMKAIsIgZBAWs2AiwgBUEgciIOQeEARw0BDAMLIAVBIHIiDkHhAEYNAiAMKAIsIQlBBiADIANBAEgbDAELIAwgBkEdayIJNgIsIAFEAAAAAAAAsEGiIQFBBiADIANBAEgbCyELIAxBMGpBoAJBACAJQQBOG2oiDSEHA0AgBwJ/IAFEAAAAAAAA8EFjIAFEAAAAAAAAAABmcQRAIAGrDAELQQALIgM2AgAgB0EEaiEHIAEgA7ihRAAAAABlzc1BoiIBRAAAAAAAAAAAYg0ACwJAIAlBAEwEQCAJIQMgByEGIA0hCAwBCyANIQggCSEDA0BBHSADIANBHU4bIQMCQCAHQQRrIgYgCEkNACADrSEaQgAhGQNAIAYgGUL/////D4MgBjUCACAahnwiG0KAlOvcA4AiGUKA7JSjDH4gG3w+AgAgBkEEayIGIAhPDQALIBmnIgZFDQAgCEEEayIIIAY2AgALA0AgCCAHIgZJBEAgBkEEayIHKAIARQ0BCwsgDCAMKAIsIANrIgM2AiwgBiEHIANBAEoNAAsLIANBAEgEQCALQRlqQQluQQFqIQ8gDkHmAEYhEANAQQlBACADayIDIANBCU4bIQoCQCAGIAhNBEAgCCgCACEHDAELQYCU69wDIAp2IRRBfyAKdEF/cyEWQQAhAyAIIQcDQCAHIAMgBygCACIXIAp2ajYCACAWIBdxIBRsIQMgB0EEaiIHIAZJDQALIAgoAgAhByADRQ0AIAYgAzYCACAGQQRqIQYLIAwgDCgCLCAKaiIDNgIsIA0gCCAHRUECdGoiCCAQGyIHIA9BAnRqIAYgBiAHa0ECdSAPShshBiADQQBIDQALC0EAIQMCQCAGIAhNDQAgDSAIa0ECdUEJbCEDQQohByAIKAIAIgpBCkkNAANAIANBAWohAyAKIAdBCmwiB08NAAsLIAsgA0EAIA5B5gBHG2sgDkHnAEYgC0EAR3FrIgcgBiANa0ECdUEJbEEJa0gEQEEEQaQCIAlBAEgbIAxqIAdBgMgAaiIKQQltIg9BAnRqQdAfayEJQQohByAPQXdsIApqIgpBB0wEQANAIAdBCmwhByAKQQFqIgpBCEcNAAsLAkAgCSgCACIQIBAgB24iDyAHbCIKRiAJQQRqIhQgBkZxDQAgECAKayEQAkAgD0EBcUUEQEQAAAAAAABAQyEBIAdBgJTr3ANHIAggCU9yDQEgCUEEay0AAEEBcUUNAQtEAQAAAAAAQEMhAQtEAAAAAAAA4D9EAAAAAAAA8D9EAAAAAAAA+D8gBiAURhtEAAAAAAAA+D8gECAHQQF2IhRGGyAQIBRJGyEYAkAgFQ0AIBMtAABBLUcNACAYmiEYIAGaIQELIAkgCjYCACABIBigIAFhDQAgCSAHIApqIgM2AgAgA0GAlOvcA08EQANAIAlBADYCACAIIAlBBGsiCUsEQCAIQQRrIghBADYCAAsgCSAJKAIAQQFqIgM2AgAgA0H/k+vcA0sNAAsLIA0gCGtBAnVBCWwhA0EKIQcgCCgCACIKQQpJDQADQCADQQFqIQMgCiAHQQpsIgdPDQALCyAJQQRqIgcgBiAGIAdLGyEGCwNAIAYiByAITSIKRQRAIAdBBGsiBigCAEUNAQsLAkAgDkHnAEcEQCAEQQhxIQkMAQsgA0F/c0F/IAtBASALGyIGIANKIANBe0pxIgkbIAZqIQtBf0F+IAkbIAVqIQUgBEEIcSIJDQBBdyEGAkAgCg0AIAdBBGsoAgAiDkUNAEEKIQpBACEGIA5BCnANAANAIAYiCUEBaiEGIA4gCkEKbCIKcEUNAAsgCUF/cyEGCyAHIA1rQQJ1QQlsIQogBUFfcUHGAEYEQEEAIQkgCyAGIApqQQlrIgZBACAGQQBKGyIGIAYgC0obIQsMAQtBACEJIAsgAyAKaiAGakEJayIGQQAgBkEAShsiBiAGIAtKGyELC0F/IQogC0H9////B0H+////ByAJIAtyIhAbSg0BIAsgEEEAR2pBAWohDgJAIAVBX3EiFUHGAEYEQCADIA5B/////wdzSg0DIANBACADQQBKGyEGDAELIBIgAyADQR91IgZzIAZrrSASEEciBmtBAUwEQANAIAZBAWsiBkEwOgAAIBIgBmtBAkgNAAsLIAZBAmsiDyAFOgAAIAZBAWtBLUErIANBAEgbOgAAIBIgD2siBiAOQf////8Hc0oNAgsgBiAOaiIDIBFB/////wdzSg0BIABBICACIAMgEWoiBSAEECkgACATIBEQJiAAQTAgAiAFIARBgIAEcxApAkACQAJAIBVBxgBGBEAgDEEQaiIGQQhyIQMgBkEJciEJIA0gCCAIIA1LGyIKIQgDQCAINQIAIAkQRyEGAkAgCCAKRwRAIAYgDEEQak0NAQNAIAZBAWsiBkEwOgAAIAYgDEEQaksNAAsMAQsgBiAJRw0AIAxBMDoAGCADIQYLIAAgBiAJIAZrECYgCEEEaiIIIA1NDQALIBAEQCAAQYwlQQEQJgsgC0EATCAHIAhNcg0BA0AgCDUCACAJEEciBiAMQRBqSwRAA0AgBkEBayIGQTA6AAAgBiAMQRBqSw0ACwsgACAGQQkgCyALQQlOGxAmIAtBCWshBiAIQQRqIgggB08NAyALQQlKIQMgBiELIAMNAAsMAgsCQCALQQBIDQAgByAIQQRqIAcgCEsbIQogDEEQaiIGQQhyIQMgBkEJciENIAghBwNAIA0gBzUCACANEEciBkYEQCAMQTA6ABggAyEGCwJAIAcgCEcEQCAGIAxBEGpNDQEDQCAGQQFrIgZBMDoAACAGIAxBEGpLDQALDAELIAAgBkEBECYgBkEBaiEGIAkgC3JFDQAgAEGMJUEBECYLIAAgBiALIA0gBmsiBiAGIAtKGxAmIAsgBmshCyAHQQRqIgcgCk8NASALQQBODQALCyAAQTAgC0ESakESQQAQKSAAIA8gEiAPaxAmDAILIAshBgsgAEEwIAZBCWpBCUEAECkLIABBICACIAUgBEGAwABzECkgBSACIAIgBUgbIQoMAQsgEyAFQRp0QR91QQlxaiELAkAgA0ELSw0AQQwgA2shBkQAAAAAAAAwQCEYA0AgGEQAAAAAAAAwQKIhGCAGQQFrIgYNAAsgCy0AAEEtRgRAIBggAZogGKGgmiEBDAELIAEgGKAgGKEhAQsgEUECciEJIAVBIHEhCCASIAwoAiwiByAHQR91IgZzIAZrrSASEEciBkYEQCAMQTA6AA8gDEEPaiEGCyAGQQJrIg0gBUEPajoAACAGQQFrQS1BKyAHQQBIGzoAACAEQQhxIQYgDEEQaiEHA0AgByIFAn8gAZlEAAAAAAAA4EFjBEAgAaoMAQtBgICAgHgLIgdBkC9qLQAAIAhyOgAAIAYgA0EASnJFIAEgB7ehRAAAAAAAADBAoiIBRAAAAAAAAAAAYXEgBUEBaiIHIAxBEGprQQFHckUEQCAFQS46AAEgBUECaiEHCyABRAAAAAAAAAAAYg0AC0F/IQpB/f///wcgCSASIA1rIgVqIgZrIANIDQAgAEEgIAIgBgJ/AkAgA0UNACAHIAxBEGprIghBAmsgA04NACADQQJqDAELIAcgDEEQamsiCAsiB2oiAyAEECkgACALIAkQJiAAQTAgAiADIARBgIAEcxApIAAgDEEQaiAIECYgAEEwIAcgCGtBAEEAECkgACANIAUQJiAAQSAgAiADIARBgMAAcxApIAMgAiACIANIGyEKCyAMQbAEaiQAIAoLRgEBfyAAKAI8IQMjAEEQayIAJAAgAyABpyABQiCIpyACQf8BcSAAQQhqEBQQjQEhAiAAKQMIIQEgAEEQaiQAQn8gASACGwu+AgEHfyMAQSBrIgMkACADIAAoAhwiBDYCECAAKAIUIQUgAyACNgIcIAMgATYCGCADIAUgBGsiATYCFCABIAJqIQVBAiEGIANBEGohAQJ/A0ACQAJAAkAgACgCPCABIAYgA0EMahAYEI0BRQRAIAUgAygCDCIHRg0BIAdBAE4NAgwDCyAFQX9HDQILIAAgACgCLCIBNgIcIAAgATYCFCAAIAEgACgCMGo2AhAgAgwDCyABIAcgASgCBCIISyIJQQN0aiIEIAcgCEEAIAkbayIIIAQoAgBqNgIAIAFBDEEEIAkbaiIBIAEoAgAgCGs2AgAgBSAHayEFIAYgCWshBiAEIQEMAQsLIABBADYCHCAAQgA3AxAgACAAKAIAQSByNgIAQQAgBkECRg0AGiACIAEoAgRrCyEEIANBIGokACAECwkAIAAoAjwQGQsjAQF/Qcg7KAIAIgAEQANAIAAoAgARCQAgACgCBCIADQALCwu/AgEFfyMAQeAAayICJAAgAiAANgIAIwBBEGsiAyQAIAMgAjYCDCMAQZABayIAJAAgAEGgL0GQARArIgAgAkEQaiIFIgE2AiwgACABNgIUIABB/////wdBfiABayIEIARB/////wdPGyIENgIwIAAgASAEaiIBNgIcIAAgATYCECAAQbsTIAJBAEEAEIsBGiAEBEAgACgCFCIBIAEgACgCEEZrQQA6AAALIABBkAFqJAAgA0EQaiQAAkAgBSIAQQNxBEADQCAALQAARQ0CIABBAWoiAEEDcQ0ACwsDQCAAIgFBBGohACABKAIAIgNBf3MgA0GBgoQIa3FBgIGChHhxRQ0ACwNAIAEiAEEBaiEBIAAtAAANAAsLIAAgBWtBAWoiABBhIgEEfyABIAUgABArBUEACyEAIAJB4ABqJAAgAAvFAQICfwF8IwBBMGsiBiQAIAEoAgghBwJAQbQ7LQAAQQFxBEBBsDsoAgAhAQwBC0EFQZAnEAwhAUG0O0EBOgAAQbA7IAE2AgALIAYgBTYCKCAGIAQ4AiAgBiADNgIYIAYgAjgCEAJ/IAEgB0GXGyAGQQxqIAZBEGoQEiIIRAAAAAAAAPBBYyAIRAAAAAAAAAAAZnEEQCAIqwwBC0EACyEBIAYoAgwhAyAAIAEpAwA3AwAgACABKQMINwMIIAMQESAGQTBqJAALCQAgABCQARAjCwwAIAAoAghB6BwQZgsJACAAEJIBECMLVQECfyMAQTBrIgIkACABIAAoAgQiA0EBdWohASAAKAIAIQAgAiABIANBAXEEfyABKAIAIABqKAIABSAACxEBAEEwEB4gAkEwECshACACQTBqJAAgAAs7AQF/IAEgACgCBCIFQQF1aiEBIAAoAgAhACABIAIgAyAEIAVBAXEEfyABKAIAIABqKAIABSAACxEdAAs3AQF/IAEgACgCBCIDQQF1aiEBIAAoAgAhACABIAIgA0EBcQR/IAEoAgAgAGooAgAFIAALERIACzcBAX8gASAAKAIEIgNBAXVqIQEgACgCACEAIAEgAiADQQFxBH8gASgCACAAaigCAAUgAAsRDAALNQEBfyABIAAoAgQiAkEBdWohASAAKAIAIQAgASACQQFxBH8gASgCACAAaigCAAUgAAsRCwALYQECfyMAQRBrIgIkACABIAAoAgQiA0EBdWohASAAKAIAIQAgAiABIANBAXEEfyABKAIAIABqKAIABSAACxEBAEEQEB4iACACKQMINwMIIAAgAikDADcDACACQRBqJAAgAAtjAQJ/IwBBEGsiAyQAIAEgACgCBCIEQQF1aiEBIAAoAgAhACADIAEgAiAEQQFxBH8gASgCACAAaigCAAUgAAsRAwBBEBAeIgAgAykDCDcDCCAAIAMpAwA3AwAgA0EQaiQAIAALNwEBfyABIAAoAgQiA0EBdWohASAAKAIAIQAgASACIANBAXEEfyABKAIAIABqKAIABSAACxEEAAs5AQF/IAEgACgCBCIEQQF1aiEBIAAoAgAhACABIAIgAyAEQQFxBH8gASgCACAAaigCAAUgAAsRCAALCQAgASAAEQIACwUAQcM7Cw8AIAEgACgCAGogAjYCAAsNACABIAAoAgBqKAIACxgBAX9BEBAeIgBCADcDCCAAQQA2AgAgAAsYAQF/QRAQHiIAQgA3AwAgAEIANwMIIAALDABBMBAeQQBBMBAqCzcBAX8gASAAKAIEIgNBAXVqIQEgACgCACEAIAEgAiADQQFxBH8gASgCACAAaigCAAUgAAsRHgALBQBBvjsLIQAgACABKAIAIAEgASwAC0EASBtBuzsgAigCABAQNgIACyoBAX9BDBAeIgFBADoABCABIAAoAgA2AgggAEEANgIAIAFB2Cc2AgAgAQsFAEG7OwsFAEG4OwshACAAIAEoAgAgASABLAALQQBIG0GkOyACKAIAEBA2AgAL2AEBBH8jAEEgayIDJAAgASgCACIEQfD///8HSQRAAkACQCAEQQtPBEAgBEEPckEBaiIFEB4hBiADIAVBgICAgHhyNgIQIAMgBjYCCCADIAQ2AgwgBCAGaiEFDAELIAMgBDoAEyADQQhqIgYgBGohBSAERQ0BCyAGIAFBBGogBBArGgsgBUEAOgAAIAMgAjYCACADQRhqIANBCGogAyAAEQMAIAMoAhgQHSADKAIYIgAQBiADKAIAEAYgAywAE0EASARAIAMoAggQIwsgA0EgaiQAIAAPCxACAAsqAQF/QQwQHiIBQQA6AAQgASAAKAIANgIIIABBADYCACABQeAmNgIA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AkEIaiAIIAYQHyACIAcgAC8AABAfQQEhAyACKgIIIgogAioCACILXAR/IAogClsNAyALIAtcBSADC0UNAiACLQAMIAItAARHDQILIABBAmohAEEBIQMgBCEGQQEhBCAGRQ0ACyABLwB6IgBBB3FFBEAgBS0AekEHcUUNAgsgCCAAECAiCiAHIAUvAHoQICILWw0BIAogClsNACALIAtcDQELIAFBFGogBUEUakHoABArGiABQfwAaiAFQfwAahCgAQNAIAEtAAAiAEEEcQ0BIAEgAEEEcjoAACABKAIQIgAEQCABIAARAAALIAFBgICA/gc2ApwBIAEoAuQDIgENAAsLIAJBEGokAAvGAwEEfyMAQaAEayICJAAgACgCBCEBIABBADYCBCABBEAgASABKAIAKAIEEQAACyAAKAIIIQEgAEEANgIIIAEEQCABIAEoAgAoAgQRAAALAkAgACgCACIAKALoAyAAKALsA0YEQCAAKALkAw0BIAAgAkEYaiAAKAL0AxBcIgEpAgA3AgAgACABKAIQNgIQIAAgASkCCDcCCCAAQRRqIAFBFGpB6AAQKxogACABKQKMATcCjAEgACABKQKEATcChAEgACABKQJ8NwJ8IAEoApQBIQQgAUEANgKUASAAKAKUASEDIAAgBDYClAEgAwRAIAMQWwsgAEGYAWogAUGYAWpB0AIQKxogACgC6AMiAwRAIAAgAzYC7AMgAxAjCyAAIAEoAugDNgLoAyAAIAEoAuwDNgLsAyAAIAEoAvADNgLwAyABQQA2AvADIAFCADcC6AMgACABKQL8AzcC/AMgACABKQL0AzcC9AMgACABKAKEBDYChAQgASgClAEhACABQQA2ApQBIAAEQCAAEFsLIAJBoARqJAAPCyACQfAcNgIQIABBBUHYJSACQRBqECwQJAALIAJB5hE2AgAgAEEFQdglIAIQLBAkAAsLAEEMEB4gABCiAQsLAEEMEB5BABCiAQsNACAAKAIALQAIQQFxCwoAIAAoAgAoAhQLGQAgAUH/AXEEQBACAAsgACgCACgCEEEBcQsYACAAKAIAIgAgAC0ACEH+AXEgAXI6AAgLJgAgASAAKAIAIgAoAhRHBEAgACABNgIUIAAgACgCDEEBajYCDAsLkgEBAn8jAEEQayICJAAgACgCACEAIAFDAAAAAGAEQCABIAAqAhhcBEAgACABOAIYIAAgACgCDEEBajYCDAsgAkEQaiQADwsgAkGIFDYCACMAQRBrIgMkACADIAI2AgwCQCAARQRAQbgwQdglIAIQSRoMAQsgAEEAQQVB2CUgAiAAKAIEEQ0AGgsgA0EQaiQAECQACz8AIAFB/wFxRQRAIAIgACgCACIAKAIQIgFBAXFHBEAgACABQX5xIAJyNgIQIAAgACgCDEEBajYCDAsPCxACAAsL4CYjAEGACAuBHk9ubHkgbGVhZiBub2RlcyB3aXRoIGN1c3RvbSBtZWFzdXJlIGZ1bmN0aW9ucyBzaG91bGQgbWFudWFsbHkgbWFyayB0aGVtc2VsdmVzIGFzIGRpcnR5AGlzRGlydHkAbWFya0RpcnR5AGRlc3Ryb3kAc2V0RGlzcGxheQBnZXREaXNwbGF5AHNldEZsZXgALSsgICAwWDB4AC0wWCswWCAwWC0weCsweCAweABzZXRGbGV4R3JvdwBnZXRGbGV4R3JvdwBzZXRPdmVyZmxvdwBnZXRPdmVyZmxvdwBoYXNOZXdMYXlvdXQAY2FsY3VsYXRlTGF5b3V0AGdldENvbXB1dGVkTGF5b3V0AHVuc2lnbmVkIHNob3J0AGdldENoaWxkQ291bnQAdW5zaWduZWQgaW50AHNldEp1c3RpZnlDb250ZW50AGdldEp1c3RpZnlDb250ZW50AGF2YWlsYWJsZUhlaWdodCBpcyBpbmRlZmluaXRlIHNvIGhlaWdodFNpemluZ01vZGUgbXVzdCBiZSBTaXppbmdNb2RlOjpNYXhDb250ZW50AGF2YWlsYWJsZVdpZHRoIGlzIGluZGVmaW5pdGUgc28gd2lkdGhTaXppbmdNb2RlIG11c3QgYmUgU2l6aW5nTW9kZTo6TWF4Q29udGVudABzZXRBbGlnbkNvbnRlbnQAZ2V0QWxpZ25Db250ZW50AGdldFBhcmVudABpbXBsZW1lbnQAc2V0TWF4SGVpZ2h0UGVyY2VudABzZXRIZWlnaHRQZXJjZW50AHNldE1pbkhlaWdodFBlcmNlbnQAc2V0RmxleEJhc2lzUGVyY2VudABzZXRHYXBQZXJjZW50AHNldFBvc2l0aW9uUGVyY2VudABzZXRNYXJnaW5QZXJjZW50AHNldE1heFdpZHRoUGVyY2VudABzZXRXaWR0aFBlcmNlbnQAc2V0TWluV2lkdGhQZXJjZW50AHNldFBhZGRpbmdQZXJjZW50AGhhbmRsZS50eXBlKCkgPT0gU3R5bGVWYWx1ZUhhbmRsZTo6VHlwZTo6UG9pbnQgfHwgaGFuZGxlLnR5cGUoKSA9PSBTdHlsZVZhbHVlSGFuZGxlOjpUeXBlOjpQZXJjZW50AGNyZWF0ZURlZmF1bHQAdW5pdAByaWdodABoZWlnaHQAc2V0TWF4SGVpZ2h0AGdldE1heEhlaWdodABzZXRIZWlnaHQAZ2V0SGVpZ2h0AHNldE1pbkhlaWdodABnZXRNaW5IZWlnaHQAZ2V0Q29tcHV0ZWRIZWlnaHQAZ2V0Q29tcHV0ZWRSaWdodABsZWZ0AGdldENvbXB1dGVkTGVmdAByZXNldABfX2Rlc3RydWN0AGZsb2F0AHVpbnQ2NF90AHVzZVdlYkRlZmF1bHRzAHNldFVzZVdlYkRlZmF1bHRzAHNldEFsaWduSXRlbXMAZ2V0QWxpZ25JdGVtcwBzZXRGbGV4QmFzaXMAZ2V0RmxleEJhc2lzAENhbm5vdCBnZXQgbGF5b3V0IHByb3BlcnRpZXMgb2YgbXVsdGktZWRnZSBzaG9ydGhhbmRzAHNldFBvaW50U2NhbGVGYWN0b3IATWVhc3VyZUNhbGxiYWNrV3JhcHBlcgBEaXJ0aWVkQ2FsbGJhY2tXcmFwcGVyAENhbm5vdCByZXNldCBhIG5vZGUgc3RpbGwgYXR0YWNoZWQgdG8gYSBvd25lcgBzZXRCb3JkZXIAZ2V0Qm9yZGVyAGdldENvbXB1dGVkQm9yZGVyAGdldE51bWJlcgBoYW5kbGUudHlwZSgpID09IFN0eWxlVmFsdWVIYW5kbGU6OlR5cGU6Ok51bWJlcgB1bnNpZ25lZCBjaGFyAHRvcABnZXRDb21wdXRlZFRvcABzZXRGbGV4V3JhcABnZXRGbGV4V3JhcABzZXRHYXAAZ2V0R2FwACVwAHNldEhlaWdodEF1dG8Ac2V0RmxleEJhc2lzQXV0bwBzZXRQb3NpdGlvbkF1dG8Ac2V0TWFyZ2luQXV0bwBzZXRXaWR0aEF1dG8AU2NhbGUgZmFjdG9yIHNob3VsZCBub3QgYmUgbGVzcyB0aGFuIHplcm8Ac2V0QXNwZWN0UmF0aW8AZ2V0QXNwZWN0UmF0aW8Ac2V0UG9zaXRpb24AZ2V0UG9zaXRpb24Abm90aWZ5T25EZXN0cnVjdGlvbgBzZXRGbGV4RGlyZWN0aW9uAGdldEZsZXhEaXJlY3Rpb24Ac2V0RGlyZWN0aW9uAGdldERpcmVjdGlvbgBzZXRNYXJnaW4AZ2V0TWFyZ2luAGdldENvbXB1dGVkTWFyZ2luAG1hcmtMYXlvdXRTZWVuAG5hbgBib3R0b20AZ2V0Q29tcHV0ZWRCb3R0b20AYm9vbABlbXNjcmlwdGVuOjp2YWwAc2V0RmxleFNocmluawBnZXRGbGV4U2hyaW5rAHNldEFsd2F5c0Zvcm1zQ29udGFpbmluZ0Jsb2NrAE1lYXN1cmVDYWxsYmFjawBEaXJ0aWVkQ2FsbGJhY2sAZ2V0TGVuZ3RoAHdpZHRoAHNldE1heFdpZHRoAGdldE1heFdpZHRoAHNldFdpZHRoAGdldFdpZHRoAHNldE1pbldpZHRoAGdldE1pbldpZHRoAGdldENvbXB1dGVkV2lkdGgAcHVzaAAvaG9tZS9ydW5uZXIvd29yay95b2dhL3lvZ2EvamF2YXNjcmlwdC8uLi95b2dhL3N0eWxlL1NtYWxsVmFsdWVCdWZmZXIuaAAvaG9tZS9ydW5uZXIvd29yay95b2dhL3lvZ2EvamF2YXNjcmlwdC8uLi95b2dhL3N0eWxlL1N0eWxlVmFsdWVQb29sLmgAdW5zaWduZWQgbG9uZwBzZXRCb3hTaXppbmcAZ2V0Qm94U2l6aW5nAHN0ZDo6d3N0cmluZwBzdGQ6OnN0cmluZwBzdGQ6OnUxNnN0cmluZwBzdGQ6OnUzMnN0cmluZwBzZXRQYWRkaW5nAGdldFBhZGRpbmcAZ2V0Q29tcHV0ZWRQYWRkaW5nAFRyaWVkIHRvIGNvbnN0cnVjdCBZR05vZGUgd2l0aCBudWxsIGNvbmZpZwBBdHRlbXB0aW5nIHRvIGNvbnN0cnVjdCBOb2RlIHdpdGggbnVsbCBjb25maWcAY3JlYXRlV2l0aENvbmZpZwBpbmYAc2V0QWxpZ25TZWxmAGdldEFsaWduU2VsZgBTaXplAHZhbHVlAFZhbHVlAGNyZWF0ZQBtZWFzdXJlAHNldFBvc2l0aW9uVHlwZQBnZXRQb3NpdGlvblR5cGUAaXNSZWZlcmVuY2VCYXNlbGluZQBzZXRJc1JlZmVyZW5jZUJhc2VsaW5lAGNvcHlTdHlsZQBkb3VibGUATm9kZQBleHRlbmQAaW5zZXJ0Q2hpbGQAZ2V0Q2hpbGQAcmVtb3ZlQ2hpbGQAdm9pZABzZXRFeHBlcmltZW50YWxGZWF0dXJlRW5hYmxlZABpc0V4cGVyaW1lbnRhbEZlYXR1cmVFbmFibGVkAGRpcnRpZWQAQ2Fubm90IHJlc2V0IGEgbm9kZSB3aGljaCBzdGlsbCBoYXMgY2hpbGRyZW4gYXR0YWNoZWQAdW5zZXRNZWFzdXJlRnVuYwB1bnNldERpcnRpZWRGdW5jAHNldEVycmF0YQBnZXRFcnJhdGEATWVhc3VyZSBmdW5jdGlvbiByZXR1cm5lZCBhbiBpbnZhbGlkIGRpbWVuc2lvbiB0byBZb2dhOiBbd2lkdGg9JWYsIGhlaWdodD0lZl0ARXhwZWN0IGN1c3RvbSBiYXNlbGluZSBmdW5jdGlvbiB0byBub3QgcmV0dXJuIE5hTgBOQU4ASU5GAGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHNob3J0PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBzaG9ydD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBpbnQ+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGZsb2F0PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50OF90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQ4X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVpbnQxNl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQxNl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50MzJfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50MzJfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8Y2hhcj4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgY2hhcj4Ac3RkOjpiYXNpY19zdHJpbmc8dW5zaWduZWQgY2hhcj4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8c2lnbmVk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";if(!ua(H)){var va=H;H=h.locateFile?h.locateFile(va,q):q+va;}
function wa(){var a=H;try{if(a==H&&w)return new Uint8Array(w);if(ua(a))try{var b=xa(a.slice(37)),c=new Uint8Array(b.length);for(a=0;a<b.length;++a)c[a]=b.charCodeAt(a);var d=c;}catch(f){throw Error("Converting base64 string to bytes failed.");}else d=void 0;var e=d;if(e)return e;throw "both async and sync fetching of the wasm failed";}catch(f){x(f);}}
function ya(){return w||"function"!=typeof fetch?Promise.resolve().then(function(){return wa()}):fetch(H,{credentials:"same-origin"}).then(function(a){if(!a.ok)throw "failed to load wasm binary file at '"+H+"'";return a.arrayBuffer()}).catch(function(){return wa()})}function za(a){for(;0<a.length;)a.shift()(h);}function Aa(a){if(void 0===a)return "_unknown";a=a.replace(/[^a-zA-Z0-9_]/g,"$");var b=a.charCodeAt(0);return 48<=b&&57>=b?"_"+a:a}
function Ba(a,b){a=Aa(a);return function(){return b.apply(this,arguments)}}var J=[{},{value:void 0},{value:null},{value:true},{value:false}],Ca=[];function Da(a){var b=Error,c=Ba(a,function(d){this.name=a;this.message=d;d=Error(d).stack;void 0!==d&&(this.stack=this.toString()+"\n"+d.replace(/^Error(:[^\n]*)?\n/,""));});c.prototype=Object.create(b.prototype);c.prototype.constructor=c;c.prototype.toString=function(){return void 0===this.message?this.name:this.name+": "+this.message};return c}var K=void 0;
function L(a){throw new K(a);}var M=a=>{a||L("Cannot use deleted val. handle = "+a);return J[a].value},Ea=a=>{switch(a){case void 0:return 1;case null:return 2;case true:return 3;case false:return 4;default:var b=Ca.length?Ca.pop():J.length;J[b]={ga:1,value:a};return b}},Fa=void 0,Ga=void 0;function N(a){for(var b="";A[a];)b+=Ga[A[a++]];return b}var O=[];function Ha(){for(;O.length;){var a=O.pop();a.M.$=false;a["delete"]();}}var P=void 0,Q={};
function Ia(a,b){for(void 0===b&&L("ptr should not be undefined");a.R;)b=a.ba(b),a=a.R;return b}var R={};function Ja(a){a=Ka(a);var b=N(a);S(a);return b}function La(a,b){var c=R[a];void 0===c&&L(b+" has unknown type "+Ja(a));return c}function Ma(){}var Na=false;function Oa(a){--a.count.value;0===a.count.value&&(a.T?a.U.W(a.T):a.P.N.W(a.O));}function Pa(a,b,c){if(b===c)return a;if(void 0===c.R)return null;a=Pa(a,b,c.R);return null===a?null:c.na(a)}var Qa={};function Ra(a,b){b=Ia(a,b);return Q[b]}
var Sa=void 0;function Ta(a){throw new Sa(a);}function Ua(a,b){b.P&&b.O||Ta("makeClassHandle requires ptr and ptrType");!!b.U!==!!b.T&&Ta("Both smartPtrType and smartPtr must be specified");b.count={value:1};return T(Object.create(a,{M:{value:b}}))}function T(a){if("undefined"===typeof FinalizationRegistry)return T=b=>b,a;Na=new FinalizationRegistry(b=>{Oa(b.M);});T=b=>{var c=b.M;c.T&&Na.register(b,{M:c},b);return b};Ma=b=>{Na.unregister(b);};return T(a)}var Va={};
function Wa(a){for(;a.length;){var b=a.pop();a.pop()(b);}}function Xa(a){return this.fromWireType(D[a>>2])}var U={},Ya={};function V(a,b,c){function d(k){k=c(k);k.length!==a.length&&Ta("Mismatched type converter count");for(var m=0;m<a.length;++m)W(a[m],k[m]);}a.forEach(function(k){Ya[k]=b;});var e=Array(b.length),f=[],g=0;b.forEach((k,m)=>{R.hasOwnProperty(k)?e[m]=R[k]:(f.push(k),U.hasOwnProperty(k)||(U[k]=[]),U[k].push(()=>{e[m]=R[k];++g;g===f.length&&d(e);}));});0===f.length&&d(e);}
function Za(a){switch(a){case 1:return 0;case 2:return 1;case 4:return 2;case 8:return 3;default:throw new TypeError("Unknown type size: "+a);}}
function W(a,b,c={}){if(!("argPackAdvance"in b))throw new TypeError("registerType registeredInstance requires argPackAdvance");var d=b.name;a||L('type "'+d+'" must have a positive integer typeid pointer');if(R.hasOwnProperty(a)){if(c.ua)return;L("Cannot register type '"+d+"' twice");}R[a]=b;delete Ya[a];U.hasOwnProperty(a)&&(b=U[a],delete U[a],b.forEach(e=>e()));}function $a(a){L(a.M.P.N.name+" instance already deleted");}function X(){}
function ab(a,b,c){if(void 0===a[b].S){var d=a[b];a[b]=function(){a[b].S.hasOwnProperty(arguments.length)||L("Function '"+c+"' called with an invalid number of arguments ("+arguments.length+") - expects one of ("+a[b].S+")!");return a[b].S[arguments.length].apply(this,arguments)};a[b].S=[];a[b].S[d.Z]=d;}}
function bb(a,b){h.hasOwnProperty(a)?(L("Cannot register public name '"+a+"' twice"),ab(h,a,a),h.hasOwnProperty(void 0)&&L("Cannot register multiple overloads of a function with the same number of arguments (undefined)!"),h[a].S[void 0]=b):h[a]=b;}function cb(a,b,c,d,e,f,g,k){this.name=a;this.constructor=b;this.X=c;this.W=d;this.R=e;this.pa=f;this.ba=g;this.na=k;this.ja=[];}
function db(a,b,c){for(;b!==c;)b.ba||L("Expected null or instance of "+c.name+", got an instance of "+b.name),a=b.ba(a),b=b.R;return a}function eb(a,b){if(null===b)return this.ea&&L("null is not a valid "+this.name),0;b.M||L('Cannot pass "'+fb(b)+'" as a '+this.name);b.M.O||L("Cannot pass deleted object as a pointer of type "+this.name);return db(b.M.O,b.M.P.N,this.N)}
function gb(a,b){if(null===b){this.ea&&L("null is not a valid "+this.name);if(this.da){var c=this.fa();null!==a&&a.push(this.W,c);return c}return 0}b.M||L('Cannot pass "'+fb(b)+'" as a '+this.name);b.M.O||L("Cannot pass deleted object as a pointer of type "+this.name);!this.ca&&b.M.P.ca&&L("Cannot convert argument of type "+(b.M.U?b.M.U.name:b.M.P.name)+" to parameter type "+this.name);c=db(b.M.O,b.M.P.N,this.N);if(this.da)switch(void 0===b.M.T&&L("Passing raw pointer to smart pointer is illegal"),
this.Ba){case 0:b.M.U===this?c=b.M.T:L("Cannot convert argument of type "+(b.M.U?b.M.U.name:b.M.P.name)+" to parameter type "+this.name);break;case 1:c=b.M.T;break;case 2:if(b.M.U===this)c=b.M.T;else {var d=b.clone();c=this.xa(c,Ea(function(){d["delete"]();}));null!==a&&a.push(this.W,c);}break;default:L("Unsupporting sharing policy");}return c}
function hb(a,b){if(null===b)return this.ea&&L("null is not a valid "+this.name),0;b.M||L('Cannot pass "'+fb(b)+'" as a '+this.name);b.M.O||L("Cannot pass deleted object as a pointer of type "+this.name);b.M.P.ca&&L("Cannot convert argument of type "+b.M.P.name+" to parameter type "+this.name);return db(b.M.O,b.M.P.N,this.N)}
function Y(a,b,c,d){this.name=a;this.N=b;this.ea=c;this.ca=d;this.da=false;this.W=this.xa=this.fa=this.ka=this.Ba=this.wa=void 0;void 0!==b.R?this.toWireType=gb:(this.toWireType=d?eb:hb,this.V=null);}function ib(a,b){h.hasOwnProperty(a)||Ta("Replacing nonexistant public symbol");h[a]=b;h[a].Z=void 0;}
function jb(a,b){var c=[];return function(){c.length=0;Object.assign(c,arguments);if(a.includes("j")){var d=h["dynCall_"+a];d=c&&c.length?d.apply(null,[b].concat(c)):d.call(null,b);}else d=oa.get(b).apply(null,c);return d}}function Z(a,b){a=N(a);var c=a.includes("j")?jb(a,b):oa.get(b);"function"!=typeof c&&L("unknown function pointer with signature "+a+": "+b);return c}var mb=void 0;
function nb(a,b){function c(f){e[f]||R[f]||(Ya[f]?Ya[f].forEach(c):(d.push(f),e[f]=true));}var d=[],e={};b.forEach(c);throw new mb(a+": "+d.map(Ja).join([", "]));}
function ob(a,b,c,d,e){var f=b.length;2>f&&L("argTypes array size mismatch! Must at least get return value and 'this' types!");var g=null!==b[1]&&null!==c,k=false;for(c=1;c<b.length;++c)if(null!==b[c]&&void 0===b[c].V){k=true;break}var m="void"!==b[0].name,l=f-2,n=Array(l),p=[],r=[];return function(){arguments.length!==l&&L("function "+a+" called with "+arguments.length+" arguments, expected "+l+" args!");r.length=0;p.length=g?2:1;p[0]=e;if(g){var u=b[1].toWireType(r,this);p[1]=u;}for(var t=0;t<l;++t)n[t]=
b[t+2].toWireType(r,arguments[t]),p.push(n[t]);t=d.apply(null,p);if(k)Wa(r);else for(var y=g?1:2;y<b.length;y++){var B=1===y?u:n[y-2];null!==b[y].V&&b[y].V(B);}u=m?b[0].fromWireType(t):void 0;return u}}function pb(a,b){for(var c=[],d=0;d<a;d++)c.push(E[b+4*d>>2]);return c}function qb(a){4<a&&0===--J[a].ga&&(J[a]=void 0,Ca.push(a));}function fb(a){if(null===a)return "null";var b=typeof a;return "object"===b||"array"===b||"function"===b?a.toString():""+a}
function rb(a,b){switch(b){case 2:return function(c){return this.fromWireType(la[c>>2])};case 3:return function(c){return this.fromWireType(ma[c>>3])};default:throw new TypeError("Unknown float type: "+a);}}
function sb(a,b,c){switch(b){case 0:return c?function(d){return ja[d]}:function(d){return A[d]};case 1:return c?function(d){return C[d>>1]}:function(d){return ka[d>>1]};case 2:return c?function(d){return D[d>>2]}:function(d){return E[d>>2]};default:throw new TypeError("Unknown integer type: "+a);}}function tb(a,b){for(var c="",d=0;!(d>=b/2);++d){var e=C[a+2*d>>1];if(0==e)break;c+=String.fromCharCode(e);}return c}
function ub(a,b,c){ void 0===c&&(c=2147483647);if(2>c)return 0;c-=2;var d=b;c=c<2*a.length?c/2:a.length;for(var e=0;e<c;++e)C[b>>1]=a.charCodeAt(e),b+=2;C[b>>1]=0;return b-d}function vb(a){return 2*a.length}function wb(a,b){for(var c=0,d="";!(c>=b/4);){var e=D[a+4*c>>2];if(0==e)break;++c;65536<=e?(e-=65536,d+=String.fromCharCode(55296|e>>10,56320|e&1023)):d+=String.fromCharCode(e);}return d}
function xb(a,b,c){ void 0===c&&(c=2147483647);if(4>c)return 0;var d=b;c=d+c-4;for(var e=0;e<a.length;++e){var f=a.charCodeAt(e);if(55296<=f&&57343>=f){var g=a.charCodeAt(++e);f=65536+((f&1023)<<10)|g&1023;}D[b>>2]=f;b+=4;if(b+4>c)break}D[b>>2]=0;return b-d}function yb(a){for(var b=0,c=0;c<a.length;++c){var d=a.charCodeAt(c);55296<=d&&57343>=d&&++c;b+=4;}return b}var zb={};function Ab(a){var b=zb[a];return void 0===b?N(a):b}var Bb=[];function Cb(a){var b=Bb.length;Bb.push(a);return b}
function Db(a,b){for(var c=Array(a),d=0;d<a;++d)c[d]=La(E[b+4*d>>2],"parameter "+d);return c}var Eb=[],Fb=[null,[],[]];K=h.BindingError=Da("BindingError");h.count_emval_handles=function(){for(var a=0,b=5;b<J.length;++b) void 0!==J[b]&&++a;return a};h.get_first_emval=function(){for(var a=5;a<J.length;++a)if(void 0!==J[a])return J[a];return null};Fa=h.PureVirtualError=Da("PureVirtualError");for(var Gb=Array(256),Hb=0;256>Hb;++Hb)Gb[Hb]=String.fromCharCode(Hb);Ga=Gb;h.getInheritedInstanceCount=function(){return Object.keys(Q).length};
h.getLiveInheritedInstances=function(){var a=[],b;for(b in Q)Q.hasOwnProperty(b)&&a.push(Q[b]);return a};h.flushPendingDeletes=Ha;h.setDelayFunction=function(a){P=a;O.length&&P&&P(Ha);};Sa=h.InternalError=Da("InternalError");X.prototype.isAliasOf=function(a){if(!(this instanceof X&&a instanceof X))return  false;var b=this.M.P.N,c=this.M.O,d=a.M.P.N;for(a=a.M.O;b.R;)c=b.ba(c),b=b.R;for(;d.R;)a=d.ba(a),d=d.R;return b===d&&c===a};
X.prototype.clone=function(){this.M.O||$a(this);if(this.M.aa)return this.M.count.value+=1,this;var a=T,b=Object,c=b.create,d=Object.getPrototypeOf(this),e=this.M;a=a(c.call(b,d,{M:{value:{count:e.count,$:e.$,aa:e.aa,O:e.O,P:e.P,T:e.T,U:e.U}}}));a.M.count.value+=1;a.M.$=false;return a};X.prototype["delete"]=function(){this.M.O||$a(this);this.M.$&&!this.M.aa&&L("Object already scheduled for deletion");Ma(this);Oa(this.M);this.M.aa||(this.M.T=void 0,this.M.O=void 0);};X.prototype.isDeleted=function(){return !this.M.O};
X.prototype.deleteLater=function(){this.M.O||$a(this);this.M.$&&!this.M.aa&&L("Object already scheduled for deletion");O.push(this);1===O.length&&P&&P(Ha);this.M.$=true;return this};Y.prototype.qa=function(a){this.ka&&(a=this.ka(a));return a};Y.prototype.ha=function(a){this.W&&this.W(a);};Y.prototype.argPackAdvance=8;Y.prototype.readValueFromPointer=Xa;Y.prototype.deleteObject=function(a){if(null!==a)a["delete"]();};
Y.prototype.fromWireType=function(a){function b(){return this.da?Ua(this.N.X,{P:this.wa,O:c,U:this,T:a}):Ua(this.N.X,{P:this,O:a})}var c=this.qa(a);if(!c)return this.ha(a),null;var d=Ra(this.N,c);if(void 0!==d){if(0===d.M.count.value)return d.M.O=c,d.M.T=a,d.clone();d=d.clone();this.ha(a);return d}d=this.N.pa(c);d=Qa[d];if(!d)return b.call(this);d=this.ca?d.la:d.pointerType;var e=Pa(c,this.N,d.N);return null===e?b.call(this):this.da?Ua(d.N.X,{P:d,O:e,U:this,T:a}):Ua(d.N.X,{P:d,O:e})};
mb=h.UnboundTypeError=Da("UnboundTypeError");
var xa="function"==typeof atob?atob:function(a){var b="",c=0;a=a.replace(/[^A-Za-z0-9\+\/=]/g,"");do{var d="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(a.charAt(c++));var e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(a.charAt(c++));var f="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(a.charAt(c++));var g="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(a.charAt(c++));d=d<<2|e>>4;
e=(e&15)<<4|f>>2;var k=(f&3)<<6|g;b+=String.fromCharCode(d);64!==f&&(b+=String.fromCharCode(e));64!==g&&(b+=String.fromCharCode(k));}while(c<a.length);return b},Jb={l:function(a,b,c,d){x("Assertion failed: "+(a?z(A,a):"")+", at: "+[b?b?z(A,b):"":"unknown filename",c,d?d?z(A,d):"":"unknown function"]);},q:function(a,b,c){a=N(a);b=La(b,"wrapper");c=M(c);var d=[].slice,e=b.N,f=e.X,g=e.R.X,k=e.R.constructor;a=Ba(a,function(){e.R.ja.forEach(function(l){if(this[l]===g[l])throw new Fa("Pure virtual function "+
l+" must be implemented in JavaScript");}.bind(this));Object.defineProperty(this,"__parent",{value:f});this.__construct.apply(this,d.call(arguments));});f.__construct=function(){this===f&&L("Pass correct 'this' to __construct");var l=k.implement.apply(void 0,[this].concat(d.call(arguments)));Ma(l);var n=l.M;l.notifyOnDestruction();n.aa=true;Object.defineProperties(this,{M:{value:n}});T(this);l=n.O;l=Ia(e,l);Q.hasOwnProperty(l)?L("Tried to register registered instance: "+l):Q[l]=this;};f.__destruct=function(){this===
f&&L("Pass correct 'this' to __destruct");Ma(this);var l=this.M.O;l=Ia(e,l);Q.hasOwnProperty(l)?delete Q[l]:L("Tried to unregister unregistered instance: "+l);};a.prototype=Object.create(f);for(var m in c)a.prototype[m]=c[m];return Ea(a)},j:function(a){var b=Va[a];delete Va[a];var c=b.fa,d=b.W,e=b.ia,f=e.map(g=>g.ta).concat(e.map(g=>g.za));V([a],f,g=>{var k={};e.forEach((m,l)=>{var n=g[l],p=m.ra,r=m.sa,u=g[l+e.length],t=m.ya,y=m.Aa;k[m.oa]={read:B=>n.fromWireType(p(r,B)),write:(B,ba)=>{var I=[];t(y,
B,u.toWireType(I,ba));Wa(I);}};});return [{name:b.name,fromWireType:function(m){var l={},n;for(n in k)l[n]=k[n].read(m);d(m);return l},toWireType:function(m,l){for(var n in k)if(!(n in l))throw new TypeError('Missing field:  "'+n+'"');var p=c();for(n in k)k[n].write(p,l[n]);null!==m&&m.push(d,p);return p},argPackAdvance:8,readValueFromPointer:Xa,V:d}]});},v:function(){},B:function(a,b,c,d,e){var f=Za(c);b=N(b);W(a,{name:b,fromWireType:function(g){return !!g},toWireType:function(g,k){return k?d:e},argPackAdvance:8,
readValueFromPointer:function(g){if(1===c)var k=ja;else if(2===c)k=C;else if(4===c)k=D;else throw new TypeError("Unknown boolean type size: "+b);return this.fromWireType(k[g>>f])},V:null});},f:function(a,b,c,d,e,f,g,k,m,l,n,p,r){n=N(n);f=Z(e,f);k&&(k=Z(g,k));l&&(l=Z(m,l));r=Z(p,r);var u=Aa(n);bb(u,function(){nb("Cannot construct "+n+" due to unbound types",[d]);});V([a,b,c],d?[d]:[],function(t){t=t[0];if(d){var y=t.N;var B=y.X;}else B=X.prototype;t=Ba(u,function(){if(Object.getPrototypeOf(this)!==ba)throw new K("Use 'new' to construct "+
n);if(void 0===I.Y)throw new K(n+" has no accessible constructor");var kb=I.Y[arguments.length];if(void 0===kb)throw new K("Tried to invoke ctor of "+n+" with invalid number of parameters ("+arguments.length+") - expected ("+Object.keys(I.Y).toString()+") parameters instead!");return kb.apply(this,arguments)});var ba=Object.create(B,{constructor:{value:t}});t.prototype=ba;var I=new cb(n,t,ba,r,y,f,k,l);y=new Y(n,I,true,false);B=new Y(n+"*",I,false,false);var lb=new Y(n+" const*",I,false,true);Qa[a]={pointerType:B,
la:lb};ib(u,t);return [y,B,lb]});},d:function(a,b,c,d,e,f,g){var k=pb(c,d);b=N(b);f=Z(e,f);V([],[a],function(m){function l(){nb("Cannot call "+n+" due to unbound types",k);}m=m[0];var n=m.name+"."+b;b.startsWith("@@")&&(b=Symbol[b.substring(2)]);var p=m.N.constructor;void 0===p[b]?(l.Z=c-1,p[b]=l):(ab(p,b,n),p[b].S[c-1]=l);V([],k,function(r){r=ob(n,[r[0],null].concat(r.slice(1)),null,f,g);void 0===p[b].S?(r.Z=c-1,p[b]=r):p[b].S[c-1]=r;return []});return []});},p:function(a,b,c,d,e,f){0<b||x();var g=pb(b,
c);e=Z(d,e);V([],[a],function(k){k=k[0];var m="constructor "+k.name;void 0===k.N.Y&&(k.N.Y=[]);if(void 0!==k.N.Y[b-1])throw new K("Cannot register multiple constructors with identical number of parameters ("+(b-1)+") for class '"+k.name+"'! Overload resolution is currently only performed using the parameter count, not actual type info!");k.N.Y[b-1]=()=>{nb("Cannot construct "+k.name+" due to unbound types",g);};V([],g,function(l){l.splice(1,0,null);k.N.Y[b-1]=ob(m,l,null,e,f);return []});return []});},
a:function(a,b,c,d,e,f,g,k){var m=pb(c,d);b=N(b);f=Z(e,f);V([],[a],function(l){function n(){nb("Cannot call "+p+" due to unbound types",m);}l=l[0];var p=l.name+"."+b;b.startsWith("@@")&&(b=Symbol[b.substring(2)]);k&&l.N.ja.push(b);var r=l.N.X,u=r[b];void 0===u||void 0===u.S&&u.className!==l.name&&u.Z===c-2?(n.Z=c-2,n.className=l.name,r[b]=n):(ab(r,b,p),r[b].S[c-2]=n);V([],m,function(t){t=ob(p,t,l,f,g);void 0===r[b].S?(t.Z=c-2,r[b]=t):r[b].S[c-2]=t;return []});return []});},A:function(a,b){b=N(b);W(a,
{name:b,fromWireType:function(c){var d=M(c);qb(c);return d},toWireType:function(c,d){return Ea(d)},argPackAdvance:8,readValueFromPointer:Xa,V:null});},n:function(a,b,c){c=Za(c);b=N(b);W(a,{name:b,fromWireType:function(d){return d},toWireType:function(d,e){return e},argPackAdvance:8,readValueFromPointer:rb(b,c),V:null});},e:function(a,b,c,d,e){b=N(b);-1===e&&(e=4294967295);e=Za(c);var f=k=>k;if(0===d){var g=32-8*c;f=k=>k<<g>>>g;}c=b.includes("unsigned")?function(k,m){return m>>>0}:function(k,m){return m};
W(a,{name:b,fromWireType:f,toWireType:c,argPackAdvance:8,readValueFromPointer:sb(b,e,0!==d),V:null});},b:function(a,b,c){function d(f){f>>=2;var g=E;return new e(ia,g[f+1],g[f])}var e=[Int8Array,Uint8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array][b];c=N(c);W(a,{name:c,fromWireType:d,argPackAdvance:8,readValueFromPointer:d},{ua:true});},o:function(a,b){b=N(b);var c="std::string"===b;W(a,{name:b,fromWireType:function(d){var e=E[d>>2],f=d+4;if(c)for(var g=f,k=0;k<=e;++k){var m=
f+k;if(k==e||0==A[m]){g=g?z(A,g,m-g):"";if(void 0===l)var l=g;else l+=String.fromCharCode(0),l+=g;g=m+1;}}else {l=Array(e);for(k=0;k<e;++k)l[k]=String.fromCharCode(A[f+k]);l=l.join("");}S(d);return l},toWireType:function(d,e){e instanceof ArrayBuffer&&(e=new Uint8Array(e));var f,g="string"==typeof e;g||e instanceof Uint8Array||e instanceof Uint8ClampedArray||e instanceof Int8Array||L("Cannot pass non-string to std::string");if(c&&g){var k=0;for(f=0;f<e.length;++f){var m=e.charCodeAt(f);127>=m?k++:2047>=
m?k+=2:55296<=m&&57343>=m?(k+=4,++f):k+=3;}f=k;}else f=e.length;k=Ib(4+f+1);m=k+4;E[k>>2]=f;if(c&&g){if(g=m,m=f+1,f=A,0<m){m=g+m-1;for(var l=0;l<e.length;++l){var n=e.charCodeAt(l);if(55296<=n&&57343>=n){var p=e.charCodeAt(++l);n=65536+((n&1023)<<10)|p&1023;}if(127>=n){if(g>=m)break;f[g++]=n;}else {if(2047>=n){if(g+1>=m)break;f[g++]=192|n>>6;}else {if(65535>=n){if(g+2>=m)break;f[g++]=224|n>>12;}else {if(g+3>=m)break;f[g++]=240|n>>18;f[g++]=128|n>>12&63;}f[g++]=128|n>>6&63;}f[g++]=128|n&63;}}f[g]=0;}}else if(g)for(g=
0;g<f;++g)l=e.charCodeAt(g),255<l&&(S(m),L("String has UTF-16 code units that do not fit in 8 bits")),A[m+g]=l;else for(g=0;g<f;++g)A[m+g]=e[g];null!==d&&d.push(S,k);return k},argPackAdvance:8,readValueFromPointer:Xa,V:function(d){S(d);}});},i:function(a,b,c){c=N(c);if(2===b){var d=tb;var e=ub;var f=vb;var g=()=>ka;var k=1;}else 4===b&&(d=wb,e=xb,f=yb,g=()=>E,k=2);W(a,{name:c,fromWireType:function(m){for(var l=E[m>>2],n=g(),p,r=m+4,u=0;u<=l;++u){var t=m+4+u*b;if(u==l||0==n[t>>k])r=d(r,t-r),void 0===
p?p=r:(p+=String.fromCharCode(0),p+=r),r=t+b;}S(m);return p},toWireType:function(m,l){"string"!=typeof l&&L("Cannot pass non-string to C++ string type "+c);var n=f(l),p=Ib(4+n+b);E[p>>2]=n>>k;e(l,p+4,n+b);null!==m&&m.push(S,p);return p},argPackAdvance:8,readValueFromPointer:Xa,V:function(m){S(m);}});},k:function(a,b,c,d,e,f){Va[a]={name:N(b),fa:Z(c,d),W:Z(e,f),ia:[]};},h:function(a,b,c,d,e,f,g,k,m,l){Va[a].ia.push({oa:N(b),ta:c,ra:Z(d,e),sa:f,za:g,ya:Z(k,m),Aa:l});},C:function(a,b){b=N(b);W(a,{va:true,name:b,
argPackAdvance:0,fromWireType:function(){},toWireType:function(){}});},s:function(a,b,c,d,e){a=Bb[a];b=M(b);c=Ab(c);var f=[];E[d>>2]=Ea(f);return a(b,c,f,e)},t:function(a,b,c,d){a=Bb[a];b=M(b);c=Ab(c);a(b,c,null,d);},g:qb,m:function(a,b){var c=Db(a,b),d=c[0];b=d.name+"_$"+c.slice(1).map(function(g){return g.name}).join("_")+"$";var e=Eb[b];if(void 0!==e)return e;var f=Array(a-1);e=Cb((g,k,m,l)=>{for(var n=0,p=0;p<a-1;++p)f[p]=c[p+1].readValueFromPointer(l+n),n+=c[p+1].argPackAdvance;g=g[k].apply(g,
f);for(p=0;p<a-1;++p)c[p+1].ma&&c[p+1].ma(f[p]);if(!d.va)return d.toWireType(m,g)});return Eb[b]=e},D:function(a){4<a&&(J[a].ga+=1);},r:function(a){var b=M(a);Wa(b);qb(a);},c:function(){x("");},x:function(a,b,c){A.copyWithin(a,b,b+c);},w:function(a){var b=A.length;a>>>=0;if(2147483648<a)return  false;for(var c=1;4>=c;c*=2){var d=b*(1+.2/c);d=Math.min(d,a+100663296);var e=Math;d=Math.max(a,d);e=e.min.call(e,2147483648,d+(65536-d%65536)%65536);a:{try{fa.grow(e-ia.byteLength+65535>>>16);na();var f=1;break a}catch(g){}f=
void 0;}if(f)return  true}return  false},z:function(){return 52},u:function(){return 70},y:function(a,b,c,d){for(var e=0,f=0;f<c;f++){var g=E[b>>2],k=E[b+4>>2];b+=8;for(var m=0;m<k;m++){var l=A[g+m],n=Fb[a];0===l||10===l?((1===a?ea:v)(z(n,0)),n.length=0):n.push(l);}e+=k;}E[d>>2]=e;return 0}};
(function(){function a(e){h.asm=e.exports;fa=h.asm.E;na();oa=h.asm.J;qa.unshift(h.asm.F);F--;h.monitorRunDependencies&&h.monitorRunDependencies(F);0==F&&(G&&(e=G,G=null,e()));}function b(e){a(e.instance);}function c(e){return ya().then(function(f){return WebAssembly.instantiate(f,d)}).then(function(f){return f}).then(e,function(f){v("failed to asynchronously prepare wasm: "+f);x(f);})}var d={a:Jb};F++;h.monitorRunDependencies&&h.monitorRunDependencies(F);if(h.instantiateWasm)try{return h.instantiateWasm(d,
a)}catch(e){v("Module.instantiateWasm callback failed with error: "+e),ca(e);}(function(){return w||"function"!=typeof WebAssembly.instantiateStreaming||ua(H)||"function"!=typeof fetch?c(b):fetch(H,{credentials:"same-origin"}).then(function(e){return WebAssembly.instantiateStreaming(e,d).then(b,function(f){v("wasm streaming compile failed: "+f);v("falling back to ArrayBuffer instantiation");return c(b)})})})().catch(ca);return {}})();
h.___wasm_call_ctors=function(){return (h.___wasm_call_ctors=h.asm.F).apply(null,arguments)};var Ka=h.___getTypeName=function(){return (Ka=h.___getTypeName=h.asm.G).apply(null,arguments)};h.__embind_initialize_bindings=function(){return (h.__embind_initialize_bindings=h.asm.H).apply(null,arguments)};var Ib=h._malloc=function(){return (Ib=h._malloc=h.asm.I).apply(null,arguments)},S=h._free=function(){return (S=h._free=h.asm.K).apply(null,arguments)};
h.dynCall_jiji=function(){return (h.dynCall_jiji=h.asm.L).apply(null,arguments)};var Kb;G=function Lb(){Kb||Mb();Kb||(G=Lb);};
function Mb(){function a(){if(!Kb&&(Kb=true,h.calledRun=true,!ha)){za(qa);aa(h);if(h.onRuntimeInitialized)h.onRuntimeInitialized();if(h.postRun)for("function"==typeof h.postRun&&(h.postRun=[h.postRun]);h.postRun.length;){var b=h.postRun.shift();ra.unshift(b);}za(ra);}}if(!(0<F)){if(h.preRun)for("function"==typeof h.preRun&&(h.preRun=[h.preRun]);h.preRun.length;)sa();za(pa);0<F||(h.setStatus?(h.setStatus("Running..."),setTimeout(function(){setTimeout(function(){h.setStatus("");},1);a();},1)):a());}}
if(h.preInit)for("function"==typeof h.preInit&&(h.preInit=[h.preInit]);0<h.preInit.length;)h.preInit.pop()();Mb();


  return loadYoga.ready
}
);
})();

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// @generated by enums.py

let Align = /*#__PURE__*/function (Align) {
  Align[Align["Auto"] = 0] = "Auto";
  Align[Align["FlexStart"] = 1] = "FlexStart";
  Align[Align["Center"] = 2] = "Center";
  Align[Align["FlexEnd"] = 3] = "FlexEnd";
  Align[Align["Stretch"] = 4] = "Stretch";
  Align[Align["Baseline"] = 5] = "Baseline";
  Align[Align["SpaceBetween"] = 6] = "SpaceBetween";
  Align[Align["SpaceAround"] = 7] = "SpaceAround";
  Align[Align["SpaceEvenly"] = 8] = "SpaceEvenly";
  return Align;
}({});
let BoxSizing = /*#__PURE__*/function (BoxSizing) {
  BoxSizing[BoxSizing["BorderBox"] = 0] = "BorderBox";
  BoxSizing[BoxSizing["ContentBox"] = 1] = "ContentBox";
  return BoxSizing;
}({});
let Dimension = /*#__PURE__*/function (Dimension) {
  Dimension[Dimension["Width"] = 0] = "Width";
  Dimension[Dimension["Height"] = 1] = "Height";
  return Dimension;
}({});
let Direction = /*#__PURE__*/function (Direction) {
  Direction[Direction["Inherit"] = 0] = "Inherit";
  Direction[Direction["LTR"] = 1] = "LTR";
  Direction[Direction["RTL"] = 2] = "RTL";
  return Direction;
}({});
let Display = /*#__PURE__*/function (Display) {
  Display[Display["Flex"] = 0] = "Flex";
  Display[Display["None"] = 1] = "None";
  Display[Display["Contents"] = 2] = "Contents";
  return Display;
}({});
let Edge = /*#__PURE__*/function (Edge) {
  Edge[Edge["Left"] = 0] = "Left";
  Edge[Edge["Top"] = 1] = "Top";
  Edge[Edge["Right"] = 2] = "Right";
  Edge[Edge["Bottom"] = 3] = "Bottom";
  Edge[Edge["Start"] = 4] = "Start";
  Edge[Edge["End"] = 5] = "End";
  Edge[Edge["Horizontal"] = 6] = "Horizontal";
  Edge[Edge["Vertical"] = 7] = "Vertical";
  Edge[Edge["All"] = 8] = "All";
  return Edge;
}({});
let Errata = /*#__PURE__*/function (Errata) {
  Errata[Errata["None"] = 0] = "None";
  Errata[Errata["StretchFlexBasis"] = 1] = "StretchFlexBasis";
  Errata[Errata["AbsolutePositionWithoutInsetsExcludesPadding"] = 2] = "AbsolutePositionWithoutInsetsExcludesPadding";
  Errata[Errata["AbsolutePercentAgainstInnerSize"] = 4] = "AbsolutePercentAgainstInnerSize";
  Errata[Errata["All"] = 2147483647] = "All";
  Errata[Errata["Classic"] = 2147483646] = "Classic";
  return Errata;
}({});
let ExperimentalFeature = /*#__PURE__*/function (ExperimentalFeature) {
  ExperimentalFeature[ExperimentalFeature["WebFlexBasis"] = 0] = "WebFlexBasis";
  return ExperimentalFeature;
}({});
let FlexDirection = /*#__PURE__*/function (FlexDirection) {
  FlexDirection[FlexDirection["Column"] = 0] = "Column";
  FlexDirection[FlexDirection["ColumnReverse"] = 1] = "ColumnReverse";
  FlexDirection[FlexDirection["Row"] = 2] = "Row";
  FlexDirection[FlexDirection["RowReverse"] = 3] = "RowReverse";
  return FlexDirection;
}({});
let Gutter = /*#__PURE__*/function (Gutter) {
  Gutter[Gutter["Column"] = 0] = "Column";
  Gutter[Gutter["Row"] = 1] = "Row";
  Gutter[Gutter["All"] = 2] = "All";
  return Gutter;
}({});
let Justify = /*#__PURE__*/function (Justify) {
  Justify[Justify["FlexStart"] = 0] = "FlexStart";
  Justify[Justify["Center"] = 1] = "Center";
  Justify[Justify["FlexEnd"] = 2] = "FlexEnd";
  Justify[Justify["SpaceBetween"] = 3] = "SpaceBetween";
  Justify[Justify["SpaceAround"] = 4] = "SpaceAround";
  Justify[Justify["SpaceEvenly"] = 5] = "SpaceEvenly";
  return Justify;
}({});
let LogLevel = /*#__PURE__*/function (LogLevel) {
  LogLevel[LogLevel["Error"] = 0] = "Error";
  LogLevel[LogLevel["Warn"] = 1] = "Warn";
  LogLevel[LogLevel["Info"] = 2] = "Info";
  LogLevel[LogLevel["Debug"] = 3] = "Debug";
  LogLevel[LogLevel["Verbose"] = 4] = "Verbose";
  LogLevel[LogLevel["Fatal"] = 5] = "Fatal";
  return LogLevel;
}({});
let MeasureMode = /*#__PURE__*/function (MeasureMode) {
  MeasureMode[MeasureMode["Undefined"] = 0] = "Undefined";
  MeasureMode[MeasureMode["Exactly"] = 1] = "Exactly";
  MeasureMode[MeasureMode["AtMost"] = 2] = "AtMost";
  return MeasureMode;
}({});
let NodeType = /*#__PURE__*/function (NodeType) {
  NodeType[NodeType["Default"] = 0] = "Default";
  NodeType[NodeType["Text"] = 1] = "Text";
  return NodeType;
}({});
let Overflow = /*#__PURE__*/function (Overflow) {
  Overflow[Overflow["Visible"] = 0] = "Visible";
  Overflow[Overflow["Hidden"] = 1] = "Hidden";
  Overflow[Overflow["Scroll"] = 2] = "Scroll";
  return Overflow;
}({});
let PositionType = /*#__PURE__*/function (PositionType) {
  PositionType[PositionType["Static"] = 0] = "Static";
  PositionType[PositionType["Relative"] = 1] = "Relative";
  PositionType[PositionType["Absolute"] = 2] = "Absolute";
  return PositionType;
}({});
let Unit = /*#__PURE__*/function (Unit) {
  Unit[Unit["Undefined"] = 0] = "Undefined";
  Unit[Unit["Point"] = 1] = "Point";
  Unit[Unit["Percent"] = 2] = "Percent";
  Unit[Unit["Auto"] = 3] = "Auto";
  return Unit;
}({});
let Wrap = /*#__PURE__*/function (Wrap) {
  Wrap[Wrap["NoWrap"] = 0] = "NoWrap";
  Wrap[Wrap["Wrap"] = 1] = "Wrap";
  Wrap[Wrap["WrapReverse"] = 2] = "WrapReverse";
  return Wrap;
}({});
const constants = {
  ALIGN_AUTO: Align.Auto,
  ALIGN_FLEX_START: Align.FlexStart,
  ALIGN_CENTER: Align.Center,
  ALIGN_FLEX_END: Align.FlexEnd,
  ALIGN_STRETCH: Align.Stretch,
  ALIGN_BASELINE: Align.Baseline,
  ALIGN_SPACE_BETWEEN: Align.SpaceBetween,
  ALIGN_SPACE_AROUND: Align.SpaceAround,
  ALIGN_SPACE_EVENLY: Align.SpaceEvenly,
  BOX_SIZING_BORDER_BOX: BoxSizing.BorderBox,
  BOX_SIZING_CONTENT_BOX: BoxSizing.ContentBox,
  DIMENSION_WIDTH: Dimension.Width,
  DIMENSION_HEIGHT: Dimension.Height,
  DIRECTION_INHERIT: Direction.Inherit,
  DIRECTION_LTR: Direction.LTR,
  DIRECTION_RTL: Direction.RTL,
  DISPLAY_FLEX: Display.Flex,
  DISPLAY_NONE: Display.None,
  DISPLAY_CONTENTS: Display.Contents,
  EDGE_LEFT: Edge.Left,
  EDGE_TOP: Edge.Top,
  EDGE_RIGHT: Edge.Right,
  EDGE_BOTTOM: Edge.Bottom,
  EDGE_START: Edge.Start,
  EDGE_END: Edge.End,
  EDGE_HORIZONTAL: Edge.Horizontal,
  EDGE_VERTICAL: Edge.Vertical,
  EDGE_ALL: Edge.All,
  ERRATA_NONE: Errata.None,
  ERRATA_STRETCH_FLEX_BASIS: Errata.StretchFlexBasis,
  ERRATA_ABSOLUTE_POSITION_WITHOUT_INSETS_EXCLUDES_PADDING: Errata.AbsolutePositionWithoutInsetsExcludesPadding,
  ERRATA_ABSOLUTE_PERCENT_AGAINST_INNER_SIZE: Errata.AbsolutePercentAgainstInnerSize,
  ERRATA_ALL: Errata.All,
  ERRATA_CLASSIC: Errata.Classic,
  EXPERIMENTAL_FEATURE_WEB_FLEX_BASIS: ExperimentalFeature.WebFlexBasis,
  FLEX_DIRECTION_COLUMN: FlexDirection.Column,
  FLEX_DIRECTION_COLUMN_REVERSE: FlexDirection.ColumnReverse,
  FLEX_DIRECTION_ROW: FlexDirection.Row,
  FLEX_DIRECTION_ROW_REVERSE: FlexDirection.RowReverse,
  GUTTER_COLUMN: Gutter.Column,
  GUTTER_ROW: Gutter.Row,
  GUTTER_ALL: Gutter.All,
  JUSTIFY_FLEX_START: Justify.FlexStart,
  JUSTIFY_CENTER: Justify.Center,
  JUSTIFY_FLEX_END: Justify.FlexEnd,
  JUSTIFY_SPACE_BETWEEN: Justify.SpaceBetween,
  JUSTIFY_SPACE_AROUND: Justify.SpaceAround,
  JUSTIFY_SPACE_EVENLY: Justify.SpaceEvenly,
  LOG_LEVEL_ERROR: LogLevel.Error,
  LOG_LEVEL_WARN: LogLevel.Warn,
  LOG_LEVEL_INFO: LogLevel.Info,
  LOG_LEVEL_DEBUG: LogLevel.Debug,
  LOG_LEVEL_VERBOSE: LogLevel.Verbose,
  LOG_LEVEL_FATAL: LogLevel.Fatal,
  MEASURE_MODE_UNDEFINED: MeasureMode.Undefined,
  MEASURE_MODE_EXACTLY: MeasureMode.Exactly,
  MEASURE_MODE_AT_MOST: MeasureMode.AtMost,
  NODE_TYPE_DEFAULT: NodeType.Default,
  NODE_TYPE_TEXT: NodeType.Text,
  OVERFLOW_VISIBLE: Overflow.Visible,
  OVERFLOW_HIDDEN: Overflow.Hidden,
  OVERFLOW_SCROLL: Overflow.Scroll,
  POSITION_TYPE_STATIC: PositionType.Static,
  POSITION_TYPE_RELATIVE: PositionType.Relative,
  POSITION_TYPE_ABSOLUTE: PositionType.Absolute,
  UNIT_UNDEFINED: Unit.Undefined,
  UNIT_POINT: Unit.Point,
  UNIT_PERCENT: Unit.Percent,
  UNIT_AUTO: Unit.Auto,
  WRAP_NO_WRAP: Wrap.NoWrap,
  WRAP_WRAP: Wrap.Wrap,
  WRAP_WRAP_REVERSE: Wrap.WrapReverse
};

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapAssembly(lib) {
  function patch(prototype, name, fn) {
    const original = prototype[name];
    prototype[name] = function () {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      return fn.call(this, original, ...args);
    };
  }
  for (const fnName of ['setPosition', 'setMargin', 'setFlexBasis', 'setWidth', 'setHeight', 'setMinWidth', 'setMinHeight', 'setMaxWidth', 'setMaxHeight', 'setPadding', 'setGap']) {
    const methods = {
      [Unit.Point]: lib.Node.prototype[fnName],
      [Unit.Percent]: lib.Node.prototype[`${fnName}Percent`],
      [Unit.Auto]: lib.Node.prototype[`${fnName}Auto`]
    };
    patch(lib.Node.prototype, fnName, function (original) {
      for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
        args[_key2 - 1] = arguments[_key2];
      }
      // We patch all these functions to add support for the following calls:
      // .setWidth(100) / .setWidth("100%") / .setWidth(.getWidth()) / .setWidth("auto")

      const value = args.pop();
      let unit, asNumber;
      if (value === 'auto') {
        unit = Unit.Auto;
        asNumber = undefined;
      } else if (typeof value === 'object') {
        unit = value.unit;
        asNumber = value.valueOf();
      } else {
        unit = typeof value === 'string' && value.endsWith('%') ? Unit.Percent : Unit.Point;
        asNumber = parseFloat(value);
        if (value !== undefined && !Number.isNaN(value) && Number.isNaN(asNumber)) {
          throw new Error(`Invalid value ${value} for ${fnName}`);
        }
      }
      if (!methods[unit]) throw new Error(`Failed to execute "${fnName}": Unsupported unit '${value}'`);
      if (asNumber !== undefined) {
        return methods[unit].call(this, ...args, asNumber);
      } else {
        return methods[unit].call(this, ...args);
      }
    });
  }
  function wrapMeasureFunction(measureFunction) {
    return lib.MeasureCallback.implement({
      measure: function () {
        const {
          width,
          height
        } = measureFunction(...arguments);
        return {
          width: width ?? NaN,
          height: height ?? NaN
        };
      }
    });
  }
  patch(lib.Node.prototype, 'setMeasureFunc', function (original, measureFunc) {
    // This patch is just a convenience patch, since it helps write more
    // idiomatic source code (such as .setMeasureFunc(null))
    if (measureFunc) {
      return original.call(this, wrapMeasureFunction(measureFunc));
    } else {
      return this.unsetMeasureFunc();
    }
  });
  function wrapDirtiedFunc(dirtiedFunction) {
    return lib.DirtiedCallback.implement({
      dirtied: dirtiedFunction
    });
  }
  patch(lib.Node.prototype, 'setDirtiedFunc', function (original, dirtiedFunc) {
    original.call(this, wrapDirtiedFunc(dirtiedFunc));
  });
  patch(lib.Config.prototype, 'free', function () {
    // Since we handle the memory allocation ourselves (via lib.Config.create),
    // we also need to handle the deallocation
    lib.Config.destroy(this);
  });
  patch(lib.Node, 'create', (_, config) => {
    // We decide the constructor we want to call depending on the parameters
    return config ? lib.Node.createWithConfig(config) : lib.Node.createDefault();
  });
  patch(lib.Node.prototype, 'free', function () {
    // Since we handle the memory allocation ourselves (via lib.Node.create),
    // we also need to handle the deallocation
    lib.Node.destroy(this);
  });
  patch(lib.Node.prototype, 'freeRecursive', function () {
    for (let t = 0, T = this.getChildCount(); t < T; ++t) {
      this.getChild(0).freeRecursive();
    }
    this.free();
  });
  patch(lib.Node.prototype, 'calculateLayout', function (original) {
    let width = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : NaN;
    let height = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : NaN;
    let direction = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : Direction.LTR;
    // Just a small patch to add support for the function default parameters
    return original.call(this, width, height, direction);
  });
  return {
    Config: lib.Config,
    Node: lib.Node,
    ...constants
  };
}

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

async function loadYoga() {
  return wrapAssembly(await loadYoga$1());
}

const {Plane,Vector3: Vector3$6} = await importShared('three');
const dotLt45deg = Math.cos(45 / 180 * Math.PI);
const helperPlanes = [new Plane(), new Plane(), new Plane(), new Plane()];
const positionHelper$1 = new Vector3$6();
class ClippingRect {
  planes;
  facePlane;
  originalCenter;
  constructor(globalMatrix, centerX, centerY, width, height) {
    this.originalCenter = new Vector3$6(centerX, centerY, 0).applyMatrix4(globalMatrix);
    this.facePlane = new Plane(new Vector3$6(0, 0, 1), 0).applyMatrix4(globalMatrix);
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const top = centerY + halfHeight;
    const right = centerX + halfWidth;
    const bottom = -centerY + halfHeight;
    const left = -centerX + halfWidth;
    this.planes = [
      new Plane(new Vector3$6(0, -1, 0), bottom).applyMatrix4(globalMatrix),
      new Plane(new Vector3$6(-1, 0, 0), left).applyMatrix4(globalMatrix),
      new Plane(new Vector3$6(0, 1, 0), top).applyMatrix4(globalMatrix),
      new Plane(new Vector3$6(1, 0, 0), right).applyMatrix4(globalMatrix)
    ];
  }
  min({ planes }) {
    for (let i = 0; i < 4; i++) {
      const p1 = this.facePlane;
      const p2 = planes[i];
      const n1n2DotProduct = p1.normal.dot(p2.normal);
      if (Math.abs(n1n2DotProduct) > 0.99) {
        return this;
      }
      const helperPlane2 = helperPlanes[i];
      if (Math.abs(n1n2DotProduct) < 0.01) {
        helperPlane2.copy(p2);
        continue;
      }
      helperPlane2.normal.crossVectors(p1.normal, p2.normal).normalize().cross(p1.normal).negate();
      const divisor = 1 - n1n2DotProduct * n1n2DotProduct;
      const c1 = (p1.constant - p2.constant * n1n2DotProduct) / divisor;
      const c2 = (p2.constant - p1.constant * n1n2DotProduct) / divisor;
      positionHelper$1.copy(p1.normal).multiplyScalar(c1).addScaledVector(p2.normal, c2);
      helperPlane2.constant = -positionHelper$1.dot(helperPlane2.normal);
    }
    let indexOffset = 0;
    const firstPlaneNormal = this.planes[0].normal;
    while (helperPlanes[indexOffset].normal.dot(firstPlaneNormal) > dotLt45deg) {
      break;
    }
    for (let i = 0; i < 4; i++) {
      const plane = this.planes[i];
      const otherPlaneIndex = (i + indexOffset) % 4;
      if (helperPlanes[otherPlaneIndex].distanceToPoint(this.originalCenter) < plane.distanceToPoint(this.originalCenter)) {
        plane.copy(planes[otherPlaneIndex]);
      }
    }
    return this;
  }
  toArray(array, offset) {
    for (let i = 0; i < 4; i++) {
      const { normal, constant } = this.planes[i];
      normal.toArray(array, offset);
      array[offset + 3] = constant;
      offset += 4;
    }
  }
}
const helperPoints = [new Vector3$6(), new Vector3$6(), new Vector3$6(), new Vector3$6()];
const multiplier = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5]
];
function computedIsClipped(parent, globalMatrix, size, pixelSizeSignal) {
  return g(() => {
    const parentValue = parent.value;
    if (parentValue == null) {
      return false;
    }
    const sizeValue = size.value;
    if (sizeValue == null) {
      return true;
    }
    const global = globalMatrix.value;
    const rect = parentValue.clippingRect.value;
    if (rect == null || global == null) {
      return false;
    }
    const [width, height] = sizeValue;
    const pixelSize = pixelSizeSignal.value;
    for (let i = 0; i < 4; i++) {
      const [mx, my] = multiplier[i];
      helperPoints[i].set(mx * pixelSize * width, my * pixelSize * height, 0).applyMatrix4(global);
    }
    const { planes } = rect;
    let allOutside;
    for (let planeIndex = 0; planeIndex < 4; planeIndex++) {
      const clippingPlane = planes[planeIndex];
      allOutside = true;
      for (let pointIndex = 0; pointIndex < 4; pointIndex++) {
        const point = helperPoints[pointIndex];
        if (clippingPlane.distanceToPoint(point) >= 0) {
          allOutside = false;
        }
      }
      if (allOutside) {
        return true;
      }
    }
    return false;
  });
}
function computedClippingRect(globalMatrix, { overflow, borderInset, size }, pixelSizeSignal, parentClippingRect) {
  return g(() => {
    const global = globalMatrix.value;
    const parentClippingRectValue = parentClippingRect?.value;
    if (global == null || overflow.value === Overflow.Visible) {
      return parentClippingRectValue;
    }
    const sizeValue = size.value;
    const borderInsetValue = borderInset.value;
    if (sizeValue == null || borderInsetValue == null) {
      return void 0;
    }
    const [width, height] = sizeValue;
    const [top, right, bottom, left] = borderInsetValue;
    const pixelSize = pixelSizeSignal.value;
    const rect = new ClippingRect(global, (right - left) * pixelSize / 2, (top - bottom) * pixelSize / 2, (width - left - right) * pixelSize, (height - top - bottom) * pixelSize);
    if (parentClippingRectValue != null) {
      rect.min(parentClippingRectValue);
    }
    return rect;
  });
}
const NoClippingPlane = new Plane(new Vector3$6(-1, 0, 0), Number.MAX_SAFE_INTEGER);
const defaultClippingData = new Float32Array(16);
for (let i = 0; i < 4; i++) {
  NoClippingPlane.normal.toArray(defaultClippingData, i * 4);
  defaultClippingData[i * 4 + 3] = NoClippingPlane.constant;
}
function createGlobalClippingPlanes(component) {
  const getGlobalMatrix = () => component.root.peek().component.parent?.matrixWorld;
  const planes = new Array(4).fill(void 0).map((_, i) => new RelativePlane(() => component.parentContainer.peek()?.clippingRect.value?.planes[i], getGlobalMatrix));
  return planes;
}
const helperPlane = new Plane();
class RelativePlane {
  getLocalPlane;
  getGlobalMatrix;
  get normal() {
    this.computeInto(helperPlane);
    return helperPlane.normal;
  }
  get constant() {
    this.computeInto(helperPlane);
    return helperPlane.constant;
  }
  isPlane = true;
  constructor(getLocalPlane, getGlobalMatrix) {
    this.getLocalPlane = getLocalPlane;
    this.getGlobalMatrix = getGlobalMatrix;
  }
  computeInto(target) {
    const localPlane = this.getLocalPlane();
    const globalMatrix = this.getGlobalMatrix();
    if (localPlane == null || globalMatrix == null) {
      return target.copy(NoClippingPlane);
    }
    return target.copy(localPlane).applyMatrix4(globalMatrix);
  }
  set(normal, constant) {
    return this;
  }
  setComponents(x, y, z, w) {
    return this;
  }
  setFromNormalAndCoplanarPoint(normal, point) {
    return this;
  }
  setFromCoplanarPoints(a, b, c) {
    return this;
  }
  clone() {
    return this.computeInto(new Plane());
  }
  copy(plane) {
    this.computeInto(plane);
    return this;
  }
  normalize() {
    return this;
  }
  negate() {
    return this;
  }
  distanceToPoint(point) {
    return this.computeInto(helperPlane).distanceToPoint(point);
  }
  distanceToSphere(sphere) {
    return this.computeInto(helperPlane).distanceToSphere(sphere);
  }
  projectPoint(point, target) {
    return this.computeInto(helperPlane).projectPoint(point, target);
  }
  intersectLine(line, target) {
    return this.computeInto(helperPlane).intersectLine(line, target);
  }
  intersectsLine(line) {
    return this.computeInto(helperPlane).intersectsLine(line);
  }
  intersectsBox(box) {
    return this.computeInto(helperPlane).intersectsBox(box);
  }
  intersectsSphere(sphere) {
    return this.computeInto(helperPlane).intersectsSphere(sphere);
  }
  coplanarPoint(target) {
    return this.computeInto(helperPlane).coplanarPoint(target);
  }
  applyMatrix4(matrix, optionalNormalMatrix) {
    return this;
  }
  translate(offset) {
    return this;
  }
  equals(plane) {
    return this.computeInto(helperPlane).equals(plane);
  }
  isIntersectionLine(l) {
    return this.computeInto(helperPlane).isIntersectionLine(l);
  }
}

class InstancedPanel {
    group;
    minorIndex;
    matrix;
    size;
    borderInset;
    clippingRect;
    materialConfig;
    indexInBucket;
    bucket;
    insertedIntoGroup = false;
    active = y(false);
    abortController;
    constructor(properties, group, minorIndex, matrix, size, borderInset, clippingRect, isVisible, materialConfig, abortSignal) {
        this.group = group;
        this.minorIndex = minorIndex;
        this.matrix = matrix;
        this.size = size;
        this.borderInset = borderInset;
        this.clippingRect = clippingRect;
        this.materialConfig = materialConfig;
        const setters = materialConfig.setters;
        abortableEffect(() => {
            if (!isVisible.value || !this.active.value) {
                return;
            }
            return properties.subscribePropertyKeys((key) => {
                if (!materialConfig.hasProperty(key)) {
                    return;
                }
                abortableEffect(() => {
                    const index = this.getIndexInBuffer();
                    if (index == null) {
                        return;
                    }
                    const { instanceData, instanceDataOnUpdate: instanceDataAddUpdateRange, root } = this.group;
                    setters[key](instanceData.array, instanceData.itemSize * index, properties.value[key], size, properties.signal.opacity, instanceDataAddUpdateRange);
                    root.requestRender?.();
                }, abortSignal);
            });
        }, abortSignal);
        const isPanelVisible = materialConfig.computedIsVisibile(properties, borderInset, size, isVisible);
        abortableEffect(() => {
            if (isPanelVisible.value) {
                this.requestShow();
                return;
            }
            this.hide();
        }, abortSignal);
        abortSignal.addEventListener('abort', () => this.hide());
    }
    setIndexInBucket(index) {
        this.indexInBucket = index;
    }
    getIndexInBuffer() {
        if (this.bucket == null || this.indexInBucket == null) {
            return undefined;
        }
        return this.bucket.offset + this.indexInBucket;
    }
    activate(bucket, index) {
        this.bucket = bucket;
        this.indexInBucket = index;
        this.active.value = true;
        this.abortController = new AbortController();
        abortableEffect(() => {
            const matrix = this.matrix.value;
            if (matrix == null) {
                return;
            }
            const index = this.getIndexInBuffer();
            if (index == null) {
                return;
            }
            const arrayIndex = index * 16;
            const { instanceMatrix, root } = this.group;
            matrix.toArray(instanceMatrix.array, arrayIndex);
            instanceMatrix.addUpdateRange(arrayIndex, 16);
            instanceMatrix.needsUpdate = true;
            root.requestRender?.();
        }, this.abortController.signal);
        abortableEffect(() => {
            const index = this.getIndexInBuffer();
            const size = this.size.value;
            if (index == null || size == null) {
                return;
            }
            const [width, height] = size;
            const { instanceData, root } = this.group;
            const { array } = instanceData;
            const bufferIndex = index * 16 + 14;
            array[bufferIndex] = width;
            array[bufferIndex + 1] = height;
            instanceData.addUpdateRange(bufferIndex, 2);
            instanceData.needsUpdate = true;
            root.requestRender?.();
        }, this.abortController.signal);
        abortableEffect(() => {
            const index = this.getIndexInBuffer();
            const borderInset = this.borderInset.value;
            if (index == null || borderInset == null) {
                return;
            }
            const { instanceData, root } = this.group;
            const offset = index * 16 + 0;
            instanceData.array.set(borderInset, offset);
            instanceData.addUpdateRange(offset, 4);
            instanceData.needsUpdate = true;
            root.requestRender?.();
        }, this.abortController.signal);
        abortableEffect(() => {
            const index = this.getIndexInBuffer();
            if (index == null) {
                return;
            }
            const { instanceClipping, root } = this.group;
            const offset = index * 16;
            const clipping = this.clippingRect?.value;
            if (clipping != null) {
                clipping.toArray(instanceClipping.array, offset);
            }
            else {
                instanceClipping.array.set(defaultClippingData, offset);
            }
            instanceClipping.addUpdateRange(offset, 16);
            instanceClipping.needsUpdate = true;
            root.requestRender?.();
        }, this.abortController.signal);
    }
    requestShow() {
        if (this.insertedIntoGroup) {
            return;
        }
        this.insertedIntoGroup = true;
        this.group.insert(this.minorIndex, this);
    }
    hide() {
        if (!this.insertedIntoGroup) {
            return;
        }
        this.active.value = false;
        this.group.delete(this.minorIndex, this.indexInBucket, this);
        this.insertedIntoGroup = false;
        this.bucket = undefined;
        this.indexInBucket = undefined;
        this.abortController?.abort();
        this.abortController = undefined;
    }
}

function computedPanelGroupDependencies(properties) {
    return g(() => {
        return {
            panelMaterialClass: resolvePanelMaterialClassProperty(properties.value.panelMaterialClass),
            castShadow: properties.value.castShadow,
            receiveShadow: properties.value.receiveShadow,
            depthWrite: properties.value.depthWrite ?? false,
            depthTest: properties.value.depthTest,
            renderOrder: parseNumberValue(properties.value.renderOrder ?? 0),
        };
    });
}

function setupInstancedPanel(properties, root, orderInfo, panelGroupDependencies, panelMatrix, size, borderInset, clippingRect, isVisible, materialConfig, abortSignal) {
    abortableEffect(() => {
        const isEnabled = properties.enabled.value;
        const currentOrderInfo = orderInfo.value;
        if (!isEnabled || currentOrderInfo == null) {
            return;
        }
        const innerAbortController = new AbortController();
        const group = root.value.panelGroupManager.getGroup(currentOrderInfo, panelGroupDependencies.value);
        new InstancedPanel(properties, group, currentOrderInfo.patchIndex, panelMatrix, size, borderInset, clippingRect, isVisible, materialConfig, innerAbortController.signal);
        return () => innerAbortController.abort();
    }, abortSignal);
}

const {Color: Color$2} = await importShared('three');

const colorHelper$1 = new Color$2();
const rgbaRegex = /^rgba\((\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\)$/;
const hexAlphaRegex = /^#(?:([0-9a-f]{3})([0-9a-f])|([0-9a-f]{6})([0-9a-f]{2}))$/i;
function writeColor(target, offset, color, opacity, onUpdate) {
    let match;
    if (Array.isArray(color)) {
        for (let i = 0; i < color.length; i++) {
            target[i + offset] = color[i];
        }
        target[offset + 3] = (color.length === 3 ? 1 : target[offset + 3]) * opacity;
    }
    else if (color === 'transparent') {
        target.fill(0, offset, offset + 4);
    }
    else if (typeof color === 'string' && (match = color.match(rgbaRegex)) != null) {
        for (let i = 0; i < 3; i++) {
            target[i + offset] = parseFloat(match[i + 1]) / 255;
        }
        target[3 + offset] = parseFloat(match[4]) * opacity;
    }
    else if (typeof color === 'string' && (match = color.match(hexAlphaRegex)) != null) {
        const rgb = match[1] ?? match[3];
        const alpha = match[2] == null ? match[4] : `${match[2]}${match[2]}`;
        colorHelper$1.set(`#${rgb}`).toArray(target, offset);
        target[offset + 3] = (Number.parseInt(alpha, 16) / 255) * opacity;
    }
    else {
        colorHelper$1.set(color).toArray(target, offset);
        target[offset + 3] = opacity;
    }
    onUpdate?.(offset, 4);
}

function getGlyphOffsetX(glyphInfo, fontSize) {
    return glyphInfo.xoffset * fontSize;
}
function getKerningOffset(font, fontSize, prevGlyphId, glyphInfo) {
    if (prevGlyphId == null)
        return 0;
    return font.getKerning(prevGlyphId, glyphInfo.id) * fontSize;
}
function toAbsoluteNumber(value, getRelativeValue, root) {
    const [width, height] = root?.component.size.value ?? [];
    return parseAbsoluteNumber(value, getRelativeValue, width, height);
}
function getGlyphOffsetY(fontSize, lineHeight, glyphInfo) {
    //glyphInfo undefined for the caret, which has no yoffset
    return (glyphInfo?.yoffset ?? 0) * fontSize + (lineHeight - fontSize) / 2;
}
function getOffsetToNextGlyph(fontSize, glyphInfo, letterSpacing) {
    return glyphInfo.xadvance * fontSize + letterSpacing;
}
function getOffsetToNextLine(lineHeight) {
    return lineHeight;
}
function getGlyphLayoutHeight(linesAmount, lineHeight) {
    return Math.max(linesAmount, 1) * lineHeight;
}

const materialSetters = {
    // 0-3 = border sizes
    // 4-7 = background color
    backgroundColor: (d, o, p, _, op, u) => writeColor(d, o + 4, p, toAbsoluteNumber(op.value, () => 1), u),
    // 8 = border radiuses
    borderBottomLeftRadius: (d, o, p, { value: s }, _, u) => {
        s != null && writeBorderRadius(d, o + 8, 0, p, s[1], u);
    },
    borderBottomRightRadius: (d, o, p, { value: s }, _, u) => s != null && writeBorderRadius(d, o + 8, 1, p, s[1], u),
    borderTopRightRadius: (d, o, p, { value: s }, _, u) => s != null && writeBorderRadius(d, o + 8, 2, p, s[1], u),
    borderTopLeftRadius: (d, o, p, { value: s }, _, u) => s != null && writeBorderRadius(d, o + 8, 3, p, s[1], u),
    // 9-12 = border color
    borderColor: (d, o, p, _, op, u) => writeColor(d, o + 9, p, toAbsoluteNumber(op.value, () => 1), u),
    // 13 = border bend
    borderBend: (d, o, p, _, op, u) => writeComponent(d, o + 13, toAbsoluteNumber(p, () => 1), u),
    // 14 = width
    // 15 = height
};
function writeBorderRadius(data, offset, indexInFloat, value, height, onUpdate) {
    setBorderRadius(data, offset, indexInFloat, toAbsoluteNumber(value, () => height), height);
    onUpdate?.(offset, 1);
}
function writeComponent(data, offset, value, onUpdate) {
    data[offset] = value;
    onUpdate?.(offset, 1);
}
function setComponentInFloat(from, index, value) {
    const x = Math.pow(50, index);
    const currentValue = Math.floor(from / x) % 50;
    return from + (value - currentValue) * x;
}
function setBorderRadius(data, indexInData, indexInFloat, value, height) {
    data[indexInData] = setComponentInFloat(data[indexInData], indexInFloat, height === 0 ? 0 : clamp(Math.ceil(((value ?? 0) / height) * 100), 0, 49));
}

const defaultDefaults = {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderBottomLeftRadius: 0,
    borderTopLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopRightRadius: 0,
    borderBend: 0,
};
const defaultOpacity = 1;
let defaultPanelMaterialConfig;
function getDefaultPanelMaterialConfig() {
    if (defaultPanelMaterialConfig == null) {
        const defaultPanelMaterialKeys = {};
        for (const key in defaultDefaults) {
            defaultPanelMaterialKeys[key] = key;
        }
        defaultPanelMaterialConfig = createPanelMaterialConfig(defaultPanelMaterialKeys);
    }
    return defaultPanelMaterialConfig;
}
const colorArrayHelper$1 = [0, 0, 0, 0];
function createPanelMaterialConfig(keys, providedDefaults) {
    const defaults = { ...defaultDefaults, ...providedDefaults };
    const setters = {};
    for (const key in keys) {
        const fn = materialSetters[key];
        const defaultValue = defaults[key];
        setters[keys[key]] = (data, offset, value, size, opacity, onUpdate) => fn(data, offset, (value ?? defaultValue), size, opacity, onUpdate);
    }
    const defaultData = new Float32Array(16);
    writeColor(defaultData, 4, defaults.backgroundColor, defaultOpacity, undefined);
    writeColor(defaultData, 9, defaults.borderColor, defaultOpacity, undefined);
    defaultData[13] = defaults.borderBend;
    return {
        hasProperty: (key) => key in setters,
        defaultData,
        setters,
        computedIsVisibile: (properties, borderInset, size, isVisible) => {
            return g(() => {
                const borderInsetValue = borderInset.value;
                const sizeValue = size.value;
                if (borderInsetValue == null || sizeValue == null) {
                    return false;
                }
                const backgroundColor = keys.backgroundColor == null
                    ? defaults.backgroundColor
                    : (properties.value[keys.backgroundColor] ?? defaults.backgroundColor);
                const borderColor = keys.borderColor == null
                    ? defaults.borderColor
                    : (properties.value[keys.borderColor] ?? defaults.borderColor);
                const opacity = toAbsoluteNumber(properties.value.opacity ?? defaultOpacity, () => 1);
                writeColor(colorArrayHelper$1, 0, backgroundColor ?? defaults.backgroundColor, opacity);
                const [width, height] = sizeValue;
                const backgroundVisible = width > 0 && height > 0 && colorArrayHelper$1[3] > 0;
                writeColor(colorArrayHelper$1, 0, borderColor ?? defaults.borderColor, opacity);
                const borderVisible = borderInsetValue.some((s) => s > 0) && colorArrayHelper$1[3] > 0;
                if (!backgroundVisible && !borderVisible) {
                    return false;
                }
                return isVisible.value;
            });
        },
    };
}

function convertEnum(lut, input, defaultValue) {
    if (input == null) {
        return defaultValue;
    }
    const resolvedValue = lut[input];
    if (resolvedValue == null) {
        throw new Error(`unexpected value ${input}, expected ${Object.keys(lut).join(', ')}`);
    }
    return resolvedValue;
}
function convertPoint(input, root) {
    const [width, height] = root.component.size.value ?? [0, 0];
    return convertYogaPoint(input, width, height);
}
function convertNumber(input) {
    return input == null ? undefined : parseAbsoluteLengthValue(input);
}
const POSITION_TYPE_LUT = {
    static: 0,
    relative: 1,
    absolute: 2,
};
const ALIGN_LUT = {
    auto: 0,
    'flex-start': 1,
    center: 2,
    'flex-end': 3,
    stretch: 4,
    baseline: 5,
    'space-between': 6,
    'space-around': 7,
    'space-evenly': 8,
};
const FLEX_DIRECTION_LUT = {
    column: 0,
    'column-reverse': 1,
    row: 2,
    'row-reverse': 3,
};
const WRAP_LUT = {
    'no-wrap': 0,
    wrap: 1,
    'wrap-reverse': 2,
};
const JUSTIFY_LUT = {
    'flex-start': 0,
    center: 1,
    'flex-end': 2,
    'space-between': 3,
    'space-around': 4,
    'space-evenly': 5,
};
const OVERFLOW_LUT = {
    visible: 0,
    hidden: 1,
    scroll: 2,
};
const DISPLAY_LUT = {
    flex: 0,
    none: 1,
    contents: 2,
};
const setter = {
    positionType: (root, node, input) => {
        node.setPositionType(convertEnum(POSITION_TYPE_LUT, input, 1));
    },
    positionTop: (root, node, input) => {
        if (input === 'auto') {
            node.setPositionAuto(1);
            return;
        }
        node.setPosition(1, convertPoint(input, root));
    },
    positionLeft: (root, node, input) => {
        if (input === 'auto') {
            node.setPositionAuto(0);
            return;
        }
        node.setPosition(0, convertPoint(input, root));
    },
    positionRight: (root, node, input) => {
        if (input === 'auto') {
            node.setPositionAuto(2);
            return;
        }
        node.setPosition(2, convertPoint(input, root));
    },
    positionBottom: (root, node, input) => {
        if (input === 'auto') {
            node.setPositionAuto(3);
            return;
        }
        node.setPosition(3, convertPoint(input, root));
    },
    alignContent: (root, node, input) => {
        node.setAlignContent(convertEnum(ALIGN_LUT, input, 4));
    },
    alignItems: (root, node, input) => {
        node.setAlignItems(convertEnum(ALIGN_LUT, input, 4));
    },
    alignSelf: (root, node, input) => {
        node.setAlignSelf(convertEnum(ALIGN_LUT, input, 0));
    },
    flexDirection: (root, node, input) => {
        node.setFlexDirection(convertEnum(FLEX_DIRECTION_LUT, input, 2));
    },
    flexWrap: (root, node, input) => {
        node.setFlexWrap(convertEnum(WRAP_LUT, input, 0));
    },
    justifyContent: (root, node, input) => {
        node.setJustifyContent(convertEnum(JUSTIFY_LUT, input, 0));
    },
    marginTop: (root, node, input) => {
        if (input === 'auto') {
            node.setMarginAuto(1);
            return;
        }
        node.setMargin(1, convertPoint(input, root));
    },
    marginLeft: (root, node, input) => {
        if (input === 'auto') {
            node.setMarginAuto(0);
            return;
        }
        node.setMargin(0, convertPoint(input, root));
    },
    marginRight: (root, node, input) => {
        if (input === 'auto') {
            node.setMarginAuto(2);
            return;
        }
        node.setMargin(2, convertPoint(input, root));
    },
    marginBottom: (root, node, input) => {
        if (input === 'auto') {
            node.setMarginAuto(3);
            return;
        }
        node.setMargin(3, convertPoint(input, root));
    },
    flexBasis: (root, node, input) => {
        if (input === 'auto') {
            node.setFlexBasisAuto();
            return;
        }
        node.setFlexBasis(convertPoint(input, root) ?? NaN);
    },
    flexGrow: (root, node, input) => {
        node.setFlexGrow(convertNumber(input) ?? 0);
    },
    flexShrink: (root, node, input) => {
        node.setFlexShrink(convertNumber(input) ?? 1);
    },
    width: (root, node, input) => {
        if (input === 'auto') {
            node.setWidthAuto();
            return;
        }
        node.setWidth(convertPoint(input, root) ?? NaN);
    },
    height: (root, node, input) => {
        if (input === 'auto') {
            node.setHeightAuto();
            return;
        }
        node.setHeight(convertPoint(input, root) ?? NaN);
    },
    minWidth: (root, node, input) => {
        node.setMinWidth(convertPoint(input, root));
    },
    minHeight: (root, node, input) => {
        node.setMinHeight(convertPoint(input, root));
    },
    maxWidth: (root, node, input) => {
        node.setMaxWidth(convertPoint(input, root));
    },
    maxHeight: (root, node, input) => {
        node.setMaxHeight(convertPoint(input, root));
    },
    boxSizing: (root, node, input) => {
        node.setBoxSizing(convertNumber(input) ?? 0);
    },
    aspectRatio: (root, node, input) => {
        node.setAspectRatio(convertNumber(input));
    },
    borderTopWidth: (root, node, input) => {
        node.setBorder(1, convertNumber(input));
    },
    borderLeftWidth: (root, node, input) => {
        node.setBorder(0, convertNumber(input));
    },
    borderRightWidth: (root, node, input) => {
        node.setBorder(2, convertNumber(input));
    },
    borderBottomWidth: (root, node, input) => {
        node.setBorder(3, convertNumber(input));
    },
    overflow: (root, node, input) => {
        node.setOverflow(convertEnum(OVERFLOW_LUT, input, 0));
    },
    display: (root, node, input) => {
        node.setDisplay(convertEnum(DISPLAY_LUT, input, 0));
    },
    paddingTop: (root, node, input) => {
        node.setPadding(1, convertPoint(input, root));
    },
    paddingLeft: (root, node, input) => {
        node.setPadding(0, convertPoint(input, root));
    },
    paddingRight: (root, node, input) => {
        node.setPadding(2, convertPoint(input, root));
    },
    paddingBottom: (root, node, input) => {
        node.setPadding(3, convertPoint(input, root));
    },
    gapRow: (root, node, input) => {
        node.setGap(1, convertPoint(input, root));
    },
    gapColumn: (root, node, input) => {
        node.setGap(0, convertPoint(input, root));
    },
    direction: (root, node, input) => {
        node.setDirection(convertNumber(input) ?? 0);
    },
};

const PointScaleFactor = 100;
function createDefaultConfig(Config) {
    const config = Config.create();
    config.setUseWebDefaults(true);
    config.setPointScaleFactor(PointScaleFactor);
    config.setExperimentalFeatureEnabled(ExperimentalFeature.WebFlexBasis, true);
    return config;
}
const create = y(undefined);
loadYoga()
    .then(({ Node, Config }) => {
    const config = createDefaultConfig(Config);
    create.value = () => Node.create(config);
})
    .catch(console.error);
const createYogaNode = () => create.value?.();

function hasImmediateProperty(key) {
    if (key === 'measureFunc') {
        return true;
    }
    return key in setter;
}
class FlexNode {
    component;
    children = [];
    yogaNode;
    layoutChangeListeners = new Set();
    customLayouting;
    active = y(false);
    constructor(component) {
        this.component = component;
        abortableEffect(() => {
            const yogaNode = createYogaNode();
            if (yogaNode == null) {
                return;
            }
            this.yogaNode = yogaNode;
            this.active.value = true;
            this.updateMeasureFunction();
            return () => {
                this.yogaNode?.getParent()?.removeChild(this.yogaNode);
                this.yogaNode?.free();
            };
        }, component.abortSignal);
        abortableEffect(() => {
            if (!component.properties.enabled.value || !this.active.value) {
                return;
            }
            const internalAbort = new AbortController();
            const unsubscribe = component.properties.subscribePropertyKeys((key) => {
                if (!hasImmediateProperty(key)) {
                    return;
                }
                abortableEffect(() => {
                    setter[key](component.root.value, this.yogaNode, component.properties.value[key]);
                    this.component.root.peek().requestCalculateLayout();
                }, internalAbort.signal);
            });
            return () => {
                unsubscribe();
                internalAbort.abort();
            };
        }, component.abortSignal);
        abortableEffect(() => {
            const parentContainer = component.parentContainer.value;
            if (parentContainer == null) {
                return;
            }
            parentContainer.node.addChild(this);
            return () => parentContainer.node.removeChild(this);
        }, component.abortSignal);
    }
    setCustomLayouting(layouting) {
        this.customLayouting = layouting;
        this.updateMeasureFunction();
    }
    updateMeasureFunction() {
        if (this.customLayouting == null || !this.active.value) {
            return;
        }
        setMeasureFunc(this.yogaNode, this.customLayouting.measure);
        this.component.root.peek().requestCalculateLayout();
    }
    /**
     * use requestCalculateLayout instead
     */
    calculateLayout() {
        if (this.yogaNode == null) {
            return;
        }
        this.commit(this.yogaNode.getFlexDirection());
        this.yogaNode.calculateLayout(undefined, undefined);
        n(() => this.updateMeasurements(true, undefined, undefined));
    }
    addChild(node) {
        this.children.push(node);
        this.component.root.peek().requestCalculateLayout();
    }
    removeChild(node) {
        const i = this.children.indexOf(node);
        if (i === -1) {
            return;
        }
        this.children.splice(i, 1);
        this.component.root.peek().requestCalculateLayout();
    }
    commit(parentDirection) {
        if (this.yogaNode == null) {
            throw new Error(`commit cannot be called without a yoga node`);
        }
        /** ---- START : adaptation of yoga's behavior to align more to the web behavior ---- */
        const parentDirectionVertical = parentDirection === FlexDirection.Column || parentDirection === FlexDirection.ColumnReverse;
        if (this.customLayouting != null &&
            this.component.properties.peek()[parentDirectionVertical ? 'minHeight' : 'minWidth'] === undefined) {
            this.yogaNode[parentDirectionVertical ? 'setMinHeight' : 'setMinWidth'](parentDirectionVertical ? this.customLayouting.minHeight : this.customLayouting.minWidth);
        }
        //see: https://codepen.io/Gettinqdown-Dev/pen/wvZLKBm
        //-> on the web if the parent has flexdireciton column, elements dont shrink below flexBasis
        if (this.component.properties.peek().flexShrink == null) {
            const hasHeight = this.component.properties.peek().height != null;
            this.yogaNode.setFlexShrink(hasHeight && parentDirectionVertical ? 0 : undefined);
        }
        /** ---- END ---- */
        //commiting the children
        let groupChildren;
        this.children.sort((child1, child2) => {
            groupChildren ??= child1.component.parent?.children;
            if (groupChildren == null) {
                return 0;
            }
            const group1 = child1.component;
            const group2 = child2.component;
            const i1 = groupChildren.indexOf(group1);
            if (i1 === -1) {
                throw new Error(`parent mismatch`);
            }
            const i2 = groupChildren.indexOf(group2);
            if (i2 === -1) {
                throw new Error(`parent mismatch`);
            }
            return i1 - i2;
        });
        let i = 0;
        let oldChildNode = this.yogaNode.getChild(i);
        let correctChild = this.children[i];
        while (correctChild != null || oldChildNode != null) {
            if (correctChild != null &&
                oldChildNode != null &&
                yogaNodeEqual(oldChildNode, assertNodeNotNull(correctChild.yogaNode))) {
                correctChild = this.children[++i];
                oldChildNode = this.yogaNode.getChild(i);
                continue;
            }
            //either remove, insert, or replace
            if (oldChildNode != null) {
                //either remove or replace
                this.yogaNode.removeChild(oldChildNode);
            }
            if (correctChild != null) {
                //either insert or replace
                const node = assertNodeNotNull(correctChild.yogaNode);
                node.getParent()?.removeChild(node);
                this.yogaNode.insertChild(node, i);
                correctChild = this.children[++i];
            }
            //the yoga node MUST be updated via getChild even for insert since the returned value is somehow bound to the index
            oldChildNode = this.yogaNode.getChild(i);
        }
        //recursively executing commit in children
        const childrenLength = this.children.length;
        for (let i = 0; i < childrenLength; i++) {
            this.children[i].commit(this.yogaNode.getFlexDirection());
        }
    }
    updateMeasurements(displayed, parentWidth, parentHeight) {
        if (this.yogaNode == null) {
            throw new Error(`update measurements cannot be called without a yoga node`);
        }
        this.component.overflow.value = this.yogaNode.getOverflow();
        displayed &&= this.yogaNode.getDisplay() != Display.None;
        this.component.displayed.value = displayed;
        const width = this.yogaNode.getComputedWidth();
        const height = this.yogaNode.getComputedHeight();
        updateVector2Signal(this.component.size, width, height);
        parentWidth ??= width;
        parentHeight ??= height;
        const x = this.yogaNode.getComputedLeft();
        const y = this.yogaNode.getComputedTop();
        const relativeCenterX = x + width * 0.5 - parentWidth * 0.5;
        const relativeCenterY = -(y + height * 0.5 - parentHeight * 0.5);
        updateVector2Signal(this.component.relativeCenter, relativeCenterX, relativeCenterY);
        const paddingTop = this.yogaNode.getComputedPadding(Edge.Top);
        const paddingLeft = this.yogaNode.getComputedPadding(Edge.Left);
        const paddingRight = this.yogaNode.getComputedPadding(Edge.Right);
        const paddingBottom = this.yogaNode.getComputedPadding(Edge.Bottom);
        updateInsetSignal(this.component.paddingInset, paddingTop, paddingRight, paddingBottom, paddingLeft);
        const borderTop = this.yogaNode.getComputedBorder(Edge.Top);
        const borderRight = this.yogaNode.getComputedBorder(Edge.Right);
        const borderBottom = this.yogaNode.getComputedBorder(Edge.Bottom);
        const borderLeft = this.yogaNode.getComputedBorder(Edge.Left);
        updateInsetSignal(this.component.borderInset, borderTop, borderRight, borderBottom, borderLeft);
        for (const layoutChangeListener of this.layoutChangeListeners) {
            layoutChangeListener();
        }
        const childrenLength = this.children.length;
        let maxContentWidth = 0;
        let maxContentHeight = 0;
        for (let i = 0; i < childrenLength; i++) {
            const [contentWidth, contentHeight] = this.children[i].updateMeasurements(displayed, width, height);
            maxContentWidth = Math.max(maxContentWidth, contentWidth);
            maxContentHeight = Math.max(maxContentHeight, contentHeight);
        }
        maxContentWidth -= borderLeft;
        maxContentHeight -= borderTop;
        if (this.component.overflow.value === Overflow.Scroll) {
            maxContentWidth += paddingRight;
            maxContentHeight += paddingLeft;
            const widthWithoutBorder = width - borderLeft - borderRight;
            const heightWithoutBorder = height - borderTop - borderBottom;
            const maxScrollX = maxContentWidth - widthWithoutBorder;
            const maxScrollY = maxContentHeight - heightWithoutBorder;
            const xScrollable = maxScrollX > 0.5;
            const yScrollable = maxScrollY > 0.5;
            updateVector2Signal(this.component.maxScrollPosition, xScrollable ? maxScrollX : undefined, yScrollable ? maxScrollY : undefined);
            updateVector2Signal(this.component.scrollable, xScrollable, yScrollable);
        }
        else {
            updateVector2Signal(this.component.maxScrollPosition, undefined, undefined);
            updateVector2Signal(this.component.scrollable, false, false);
        }
        const overflowVisible = this.component.overflow.value === Overflow.Visible;
        return [
            x + Math.max(width, overflowVisible ? maxContentWidth : 0),
            y + Math.max(height, overflowVisible ? maxContentHeight : 0),
        ];
    }
    addLayoutChangeListener(listener) {
        this.layoutChangeListeners.add(listener);
        return () => void this.layoutChangeListeners.delete(listener);
    }
}
function setMeasureFunc(node, func) {
    if (func == null) {
        node.setMeasureFunc(null);
        return;
    }
    node.setMeasureFunc((width, widthMode, height, heightMode) => {
        const result = func(width, widthMode, height, heightMode);
        //this is necassary because rounding values down will lead to unnecassary text line breaks
        result.width = Math.ceil(result.width * PointScaleFactor) / PointScaleFactor;
        result.height = Math.ceil(result.height * PointScaleFactor) / PointScaleFactor;
        return result;
    });
    node.markDirty();
}
function updateVector2Signal(signal, x, y) {
    const current = signal.value;
    if (current != null) {
        const [oldX, oldY] = current;
        if (oldX === x && oldY === y) {
            return;
        }
    }
    signal.value = [x, y];
}
function updateInsetSignal(signal, top, right, bottom, left) {
    const current = signal.value;
    if (current != null) {
        const [oldTop, oldRight, oldBottom, oldLeft] = current;
        if (oldTop == top && oldRight == right && oldBottom == bottom && oldLeft == left) {
            return;
        }
    }
    signal.value = [top, right, bottom, left];
}
function assertNodeNotNull(val) {
    if (val == null) {
        throw new Error(`commit cannot be called with a children that miss a yoga node`);
    }
    return val;
}
function yogaNodeEqual(n1, n2) {
    return n1['M']['O'] === n2['M']['O'];
}

const flexAliases = {
    borderWidth: ['borderBottomWidth', 'borderTopWidth', 'borderLeftWidth', 'borderRightWidth'],
    borderXWidth: ['borderLeftWidth', 'borderRightWidth'],
    borderYWidth: ['borderTopWidth', 'borderBottomWidth'],
    inset: ['positionTop', 'positionLeft', 'positionRight', 'positionBottom'],
    padding: ['paddingBottom', 'paddingTop', 'paddingLeft', 'paddingRight'],
    paddingX: ['paddingLeft', 'paddingRight'],
    paddingInline: ['paddingLeft', 'paddingRight'],
    paddingInlineStart: ['paddingLeft'],
    paddingInlineEnd: ['paddingRight'],
    paddingY: ['paddingTop', 'paddingBottom'],
    paddingBlock: ['paddingTop', 'paddingBottom'],
    paddingBlockStart: ['paddingTop'],
    paddingBlockEnd: ['paddingBottom'],
    margin: ['marginBottom', 'marginTop', 'marginLeft', 'marginRight'],
    marginX: ['marginLeft', 'marginRight'],
    marginInline: ['marginLeft', 'marginRight'],
    marginInlineStart: ['marginLeft'],
    marginInlineEnd: ['marginRight'],
    marginY: ['marginTop', 'marginBottom'],
    marginBlock: ['marginTop', 'marginBottom'],
    marginBlockStart: ['marginTop'],
    marginBlockEnd: ['marginBottom'],
    gap: ['gapRow', 'gapColumn'],
};
const panelAliases = {
    borderRadius: ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'],
    borderTopRadius: ['borderTopLeftRadius', 'borderTopRightRadius'],
    borderLeftRadius: ['borderTopLeftRadius', 'borderBottomLeftRadius'],
    borderRightRadius: ['borderTopRightRadius', 'borderBottomRightRadius'],
    borderBottomRadius: ['borderBottomLeftRadius', 'borderBottomRightRadius'],
};
const scrollbarAliases = {
    scrollbarBorderRadius: [
        'scrollbarBorderTopLeftRadius',
        'scrollbarBorderTopRightRadius',
        'scrollbarBorderBottomLeftRadius',
        'scrollbarBorderBottomRightRadius',
    ],
    scrollbarBorderTopRadius: ['scrollbarBorderTopLeftRadius', 'scrollbarBorderTopRightRadius'],
    scrollbarBorderLeftRadius: ['scrollbarBorderTopLeftRadius', 'scrollbarBorderBottomLeftRadius'],
    scrollbarBorderRightRadius: ['scrollbarBorderTopRightRadius', 'scrollbarBorderBottomRightRadius'],
    scrollbarBorderBottomRadius: ['scrollbarBorderBottomLeftRadius', 'scrollbarBorderBottomRightRadius'],
    scrollbarBorderWidth: [
        'scrollbarBorderBottomWidth',
        'scrollbarBorderTopWidth',
        'scrollbarBorderLeftWidth',
        'scrollbarBorderRightWidth',
    ],
    scrollbarBorderXWidth: ['scrollbarBorderLeftWidth', 'scrollbarBorderRightWidth'],
    scrollbarBorderYWidth: ['scrollbarBorderTopWidth', 'scrollbarBorderBottomWidth'],
};
const caretAliases = {
    caretBorderRadius: [
        'caretBorderTopLeftRadius',
        'caretBorderTopRightRadius',
        'caretBorderBottomLeftRadius',
        'caretBorderBottomRightRadius',
    ],
    caretBorderTopRadius: ['caretBorderTopLeftRadius', 'caretBorderTopRightRadius'],
    caretBorderLeftRadius: ['caretBorderTopLeftRadius', 'caretBorderBottomLeftRadius'],
    caretBorderRightRadius: ['caretBorderTopRightRadius', 'caretBorderBottomRightRadius'],
    caretBorderBottomRadius: ['caretBorderBottomLeftRadius', 'caretBorderBottomRightRadius'],
    caretBorderWidth: ['caretBorderBottomWidth', 'caretBorderTopWidth', 'caretBorderLeftWidth', 'caretBorderRightWidth'],
    caretBorderXWidth: ['caretBorderLeftWidth', 'caretBorderRightWidth'],
    caretBorderYWidth: ['caretBorderTopWidth', 'caretBorderBottomWidth'],
};
const selectionAliases = {
    selectionBorderRadius: [
        'selectionBorderTopLeftRadius',
        'selectionBorderTopRightRadius',
        'selectionBorderBottomLeftRadius',
        'selectionBorderBottomRightRadius',
    ],
    selectionBorderTopRadius: ['selectionBorderTopLeftRadius', 'selectionBorderTopRightRadius'],
    selectionBorderLeftRadius: ['selectionBorderTopLeftRadius', 'selectionBorderBottomLeftRadius'],
    selectionBorderRightRadius: ['selectionBorderTopRightRadius', 'selectionBorderBottomRightRadius'],
    selectionBorderBottomRadius: ['selectionBorderBottomLeftRadius', 'selectionBorderBottomRightRadius'],
    selectionBorderWidth: [
        'selectionBorderBottomWidth',
        'selectionBorderTopWidth',
        'selectionBorderLeftWidth',
        'selectionBorderRightWidth',
    ],
    selectionBorderXWidth: ['selectionBorderLeftWidth', 'selectionBorderRightWidth'],
    selectionBorderYWidth: ['selectionBorderTopWidth', 'selectionBorderBottomWidth'],
};
const transformAliases = {
    transformScale: ['transformScaleX', 'transformScaleY', 'transformScaleZ'],
};
const allAliases = Object.assign({}, flexAliases, panelAliases, scrollbarAliases, transformAliases, caretAliases, selectionAliases);

const queryList = typeof matchMedia === 'undefined' ? undefined : matchMedia?.('(prefers-color-scheme: dark)');
const symstemIsDarkMode = y(queryList?.matches ?? false);
queryList?.addEventListener('change', (event) => (symstemIsDarkMode.value = event.matches));
const preferredColorScheme = y('system');
const isDarkMode = g(() => {
    switch (preferredColorScheme.value) {
        case 'system':
            return symstemIsDarkMode.value;
        case 'dark':
            return true;
        case 'light':
            return false;
    }
});
function setPreferredColorScheme(scheme) {
    preferredColorScheme.value = scheme;
}
function getPreferredColorScheme() {
    return preferredColorScheme.peek();
}
function basedOnPreferredColorScheme({ dark, light, }) {
    const result = {};
    for (const key in dark) {
        result[key] = g(() => (isDarkMode.value ? dark[key] : light[key]));
    }
    return result;
}

const breakPoints = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
};
const breakPointKeys = Object.keys(breakPoints);
const breakPointKeysLength = breakPointKeys.length;
function createResponsiveConditionals(root) {
    const conditionals = {};
    for (let i = 0; i < breakPointKeysLength; i++) {
        const key = breakPointKeys[i];
        conditionals[key] = () => {
            const rootWidth = root.value.component.size.value?.[0] ?? 0;
            return rootWidth > breakPoints[key];
        };
    }
    return conditionals;
}
function createHoverConditionals(hoveredSignal) {
    return {
        hover: () => hoveredSignal.value.length > 0,
    };
}
function createActivePropertyTransfomers(activeSignal) {
    return {
        active: () => activeSignal.value.length > 0,
    };
}
const preferredColorSchemeConditionals = {
    dark: () => isDarkMode.value,
};
function createFocusPropertyTransformers(hasFocusSignal) {
    if (hasFocusSignal == null) {
        return {
            focus: () => false,
        };
    }
    return {
        focus: () => hasFocusSignal.value,
    };
}
function createPlaceholderPropertyTransformers(isPlaceholder) {
    if (isPlaceholder == null) {
        return {
            placeholderStyle: () => false,
        };
    }
    return {
        placeholderStyle: () => isPlaceholder.value,
    };
}
const conditionalKeys = ['dark', 'hover', 'active', 'focus', ...breakPointKeys];
function createConditionals(root, hoveredSignal, activeSignal, hasFocusSignal, isPlaceholderSignal) {
    return {
        ...preferredColorSchemeConditionals,
        ...createResponsiveConditionals(root),
        ...createHoverConditionals(hoveredSignal),
        ...createActivePropertyTransfomers(activeSignal),
        ...createFocusPropertyTransformers(hasFocusSignal),
        ...createPlaceholderPropertyTransformers(isPlaceholderSignal),
    };
}

let PropertiesImplementation$1 = class PropertiesImplementation {
    apply;
    defaults;
    onLayerIndicesChanged;
    enabled = y(false);
    value = new Proxy({}, { get: (_target, key) => this.getSignal(key).value });
    signal = new Proxy({}, {
        get: (_target, key) => this.getSignal(key),
    });
    peekProxy = new Proxy({}, { get: (_target, key) => this.peekValue(key) });
    propertyStateMap = {};
    propertiesLayers = new Map();
    propertyKeys;
    propertyKeySubscriptions = new Set();
    constructor(apply, defaults, onLayerIndicesChanged) {
        this.apply = apply;
        this.defaults = defaults;
        this.onLayerIndicesChanged = onLayerIndicesChanged;
        this.propertyKeys = defaults == null ? [] : Array.from(Object.keys(defaults));
    }
    peek() {
        return this.peekProxy;
    }
    subscribePropertyKeys(callback) {
        for (const key of this.propertyKeys) {
            callback(key);
        }
        this.propertyKeySubscriptions.add(callback);
        return () => this.propertyKeySubscriptions.delete(callback);
    }
    clearProvidedLayer(layer, index) {
        this.propertiesLayers.delete(index);
        for (const key in layer) {
            const value = layer[key];
            if (value === undefined) {
                continue;
            }
            const propertyState = this.propertyStateMap[key];
            if (propertyState == null) {
                //no one is reading
                continue;
            }
            propertyState.cleanup?.();
            propertyState.cleanup = undefined;
            if (propertyState.layerIndex != index) {
                //we have not published the value from this layer
                continue;
            }
            //no need to check if we are enabled, because if we are not enabled, the layerIndex is Number.MAX_SAFE_INTEGER, which makes the previous "if" already continue
            this.update(key, propertyState);
        }
    }
    setLayer(index, value) {
        let layer = this.propertiesLayers.get(index);
        const isNewLayer = layer == null;
        n(() => {
            if (layer != null) {
                this.clearProvidedLayer(layer, index);
            }
            if (value === undefined) {
                return;
            }
            this.propertiesLayers.set(index, (layer = {}));
            const entries = Object.entries(value);
            for (const [key, value] of entries) {
                this.apply(key, value, this.setProperty.bind(this, layer, index), index);
            }
        });
        if (isNewLayer) {
            this.onLayerIndicesChanged?.();
        }
    }
    getSignal(key) {
        let propertyState = this.propertyStateMap[key];
        if (propertyState == null) {
            this.propertyStateMap[key] = propertyState = {
                signal: new l(),
                layerIndex: null, //will be set by update immediately
            };
            this.update(key, propertyState);
        }
        return propertyState.signal;
    }
    peekValue(key) {
        let propertyState = this.propertyStateMap[key];
        if (propertyState != null) {
            return propertyState.signal.peek();
        }
        const defaultValue = this.defaults?.[key];
        const layerIndices = Array.from(this.propertiesLayers.keys()).sort((a, b) => a - b);
        const [result] = f(() => selectLayerValue(0, layerIndices, this.propertiesLayers, key, defaultValue));
        return result;
    }
    set(layerIndex, key, value) {
        let propertiesLayer = this.propertiesLayers.get(layerIndex);
        if (propertiesLayer == null) {
            this.propertiesLayers.set(layerIndex, (propertiesLayer = {}));
        }
        this.apply(key, value, this.setProperty.bind(this, propertiesLayer, layerIndex), layerIndex);
    }
    setProperty(propertiesLayer, layerIndex, key, value) {
        if (!this.propertyKeys.includes(key)) {
            this.propertyKeys.push(key);
            for (const callback of this.propertyKeySubscriptions) {
                callback(key);
            }
        }
        if (propertiesLayer[key] === value) {
            //unchanged
            return;
        }
        propertiesLayer[key] = value;
        const propertyState = this.propertyStateMap[key];
        if (propertyState == null) {
            //no one listens
            return;
        }
        if (propertyState.layerIndex != null && layerIndex > propertyState.layerIndex) {
            //current value has higher prescedence
            return;
        }
        if (!this.enabled.peek()) {
            //no need to run update, since the value change has no effect while enabled is `false`
            return;
        }
        this.update(key, propertyState);
    }
    update(key, target) {
        target.cleanup?.();
        target.cleanup = undefined;
        const defaultValue = this.defaults?.[key];
        let result;
        if (this.enabled.peek()) {
            result = selectLayerValue(0, Array.from(this.propertiesLayers.keys()).sort((a, b) => a - b), this.propertiesLayers, key, defaultValue, (layerIndex) => (target.cleanup = j(() => {
                const [value, index] = selectLayerValue(layerIndex, Array.from(this.propertiesLayers.keys()).sort((a, b) => a - b), this.propertiesLayers, key, defaultValue);
                target.signal.value = value;
                target.layerIndex = index;
            })));
        }
        else if (defaultValue instanceof l) {
            result = [defaultValue.peek(), Infinity];
        }
        else {
            result = [defaultValue, Number.MAX_SAFE_INTEGER];
        }
        if (result == null) {
            return;
        }
        const [value, index] = result;
        target.signal.value = value;
        target.layerIndex = index;
    }
    setEnabled(enabled) {
        if (this.enabled.peek() === enabled) {
            return;
        }
        this.enabled.value = enabled;
        this.updateAll();
    }
    updateAll() {
        for (const key in this.propertyStateMap) {
            this.update(key, this.propertyStateMap[key]);
        }
    }
    destroy() {
        for (const key in this.propertyStateMap) {
            this.propertyStateMap[key].cleanup?.();
        }
        this.propertyStateMap = {};
        this.propertyKeySubscriptions.clear();
    }
};
function selectLayerValue(startLayerIndex, sortedLayerIndexArray, propertiesLayers, key, defaultValue, onSignal) {
    let value;
    let layerIndex;
    const layerIndicies = sortedLayerIndexArray[Symbol.iterator]();
    do {
        layerIndex = layerIndicies.next().value ?? Number.MAX_SAFE_INTEGER;
        if (layerIndex < startLayerIndex) {
            continue;
        }
        value = layerIndex === Number.MAX_SAFE_INTEGER ? defaultValue : propertiesLayers.get(layerIndex)[key];
        if (typeof value === 'object' && value instanceof l) {
            if (onSignal != null) {
                onSignal(layerIndex);
                return undefined;
            }
            value = value.value;
        }
        if (value !== undefined) {
            break;
        }
    } while (layerIndex != Number.MAX_SAFE_INTEGER);
    if (value === 'initial') {
        value = defaultValue;
    }
    return [value, layerIndex];
}

//layer structure description
//one layer section consists of (1004 layers)
//0. component base properties
//...1-MaxClassAmount component classes
//MaxClassAmount + 1 component default overrides
const MaxClassAmount = 1000;
const LayersSectionSize = MaxClassAmount + 2;
//layer sections
//0. important
//1. placeholderStyle
//2. focus
//3. active
//4. hover
//5. dark
//6. 2xl
//7. xl
//8. lg
//9. md
//10. sm
//11. base
//- star inheritance
//- inheritance
const SectionStartIndexMap = {
    important: LayersSectionSize * 0,
    placeholderStyle: LayersSectionSize * 1,
    focus: LayersSectionSize * 2,
    active: LayersSectionSize * 3,
    hover: LayersSectionSize * 4,
    dark: LayersSectionSize * 5,
    '2xl': LayersSectionSize * 6,
    xl: LayersSectionSize * 7,
    lg: LayersSectionSize * 8,
    md: LayersSectionSize * 9,
    sm: LayersSectionSize * 10,
    base: LayersSectionSize * 11,
};
const SpecialLayerSections = Object.keys(SectionStartIndexMap).filter((layer) => layer != 'base');
function getLayerIndex(identifier) {
    if (identifier.type != 'class' && identifier.type != 'default-overrides' && identifier.type != 'base') {
        if (identifier.type === 'star-inheritance') {
            return LayersSectionSize * 12;
        }
        //inheritance
        return LayersSectionSize * 12 + 1;
    }
    const sectionStartIndex = SectionStartIndexMap[identifier.section];
    if (identifier.type != 'class') {
        if (identifier.type === 'default-overrides') {
            return sectionStartIndex + MaxClassAmount + 1;
        }
        return sectionStartIndex;
    }
    const classIndex = identifier.classIndex;
    if (classIndex >= MaxClassAmount) {
        throw new Error(`class index "${classIndex}" exceeds the maximum number of classes (${MaxClassAmount})`);
    }
    const maxClassIndex = MaxClassAmount - 1;
    //we are inverting the class index, since class priority goes from high to low index (which is inverted to the layer indices, which is low to high)
    return sectionStartIndex + maxClassIndex - classIndex + 1;
}

const {MeshBasicMaterial: MeshBasicMaterial$2} = await importShared('three');

const componentDefaults = {
    scrollbarWidth: 10,
    visibility: 'visible',
    opacity: 1,
    depthTest: true,
    renderOrder: 0,
    fontSize: 16,
    letterSpacing: 0,
    lineHeight: '120%',
    wordBreak: 'break-word',
    verticalAlign: 'middle',
    textAlign: 'left',
    fontWeight: 'normal',
    caretWidth: 1.5,
    receiveShadow: false,
    castShadow: false,
    panelMaterialClass: MeshBasicMaterial$2,
    pixelSize: 0.01,
    anchorX: 'center',
    anchorY: 'center',
    tabSize: 8,
    whiteSpace: 'normal',
};

var _a$1;
// @__NO_SIDE_EFFECTS__
function $constructor(name, initializer, params) {
  function init(inst, def) {
    if (!inst._zod) {
      Object.defineProperty(inst, "_zod", {
        value: {
          def,
          constr: _,
          traits: /* @__PURE__ */ new Set()
        },
        enumerable: false
      });
    }
    if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer(inst, def);
    const proto = _.prototype;
    const keys = Object.keys(proto);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!(k in inst)) {
        inst[k] = proto[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;
  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    var _a2;
    const inst = params?.Parent ? new Definition() : this;
    init(inst, def);
    (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
    for (const fn of inst._zod.deferred) {
      fn();
    }
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
class $ZodAsyncError extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
}
class $ZodEncodeError extends Error {
  constructor(name) {
    super(`Encountered unidirectional transform during encode: ${name}`);
    this.name = "ZodEncodeError";
  }
}
(_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
const globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  return globalConfig;
}

function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
function cached(getter) {
  return {
    get value() {
      {
        const value = getter();
        Object.defineProperty(this, "value", { value });
        return value;
      }
    }
  };
}
function nullish(input) {
  return input === null || input === void 0;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const ratio = val / step;
  const roundedRatio = Math.round(ratio);
  const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
  if (Math.abs(ratio - roundedRatio) < tolerance)
    return 0;
  return ratio - roundedRatio;
}
const EVALUATING = /* @__PURE__ */ Symbol("evaluating");
function defineLazy(object, key, getter) {
  let value = void 0;
  Object.defineProperty(object, key, {
    get() {
      if (value === EVALUATING) {
        return void 0;
      }
      if (value === void 0) {
        value = EVALUATING;
        value = getter();
      }
      return value;
    },
    set(v) {
      Object.defineProperty(object, key, {
        value: v
        // configurable: true,
      });
    },
    configurable: true
  });
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function esc(str) {
  return JSON.stringify(str);
}
function slugify(input) {
  return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
const captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {
};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
const allowsEval = /* @__PURE__ */ cached(() => {
  if (globalConfig.jitless) {
    return false;
  }
  if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
    return false;
  }
  try {
    const F = Function;
    new F("");
    return true;
  } catch (_) {
    return false;
  }
});
function isPlainObject(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === void 0)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o) {
  if (isPlainObject(o))
    return { ...o };
  if (Array.isArray(o))
    return [...o];
  if (o instanceof Map)
    return new Map(o);
  if (o instanceof Set)
    return new Set(o);
  return o;
}
const propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== void 0) {
    if (params?.error !== void 0)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
  });
}
const NUMBER_FORMAT_RANGES = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-34028234663852886e22, 34028234663852886e22],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".pick() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = {};
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        newShape[key] = currDef.shape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".omit() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = { ...schema._zod.def.shape };
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        delete newShape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = schema._zod.def.shape;
    for (const key in shape) {
      if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) {
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
      }
    }
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function safeExtend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function merge(a, b) {
  if (a._zod.def.checks?.length) {
    throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
  }
  const def = mergeDefs(a._zod.def, {
    get shape() {
      const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    get catchall() {
      return b._zod.def.catchall;
    },
    checks: b._zod.def.checks ?? []
  });
  return clone(a, def);
}
function partial(Class2, schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".partial() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in oldShape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = Class2 ? new Class2({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      } else {
        for (const key in oldShape) {
          shape[key] = Class2 ? new Class2({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    },
    checks: []
  });
  return clone(schema, def);
}
function required(Class2, schema, mask) {
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in shape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = new Class2({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      } else {
        for (const key in oldShape) {
          shape[key] = new Class2({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    }
  });
  return clone(schema, def);
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a;
    (_a = iss).path ?? (_a.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config) {
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
  const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
  rest.path ?? (rest.path = []);
  rest.message = message;
  if (ctx?.reportInput) {
    rest.input = _input;
  }
  return rest;
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}

const initializer$1 = (inst, def) => {
    inst.name = "$ZodError";
    Object.defineProperty(inst, "_zod", {
        value: inst._zod,
        enumerable: false,
    });
    Object.defineProperty(inst, "issues", {
        value: def,
        enumerable: false,
    });
    inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
    Object.defineProperty(inst, "toString", {
        value: () => inst.message,
        enumerable: false,
    });
};
const $ZodError = $constructor("$ZodError", initializer$1);
const $ZodRealError = $constructor("$ZodError", initializer$1, { Parent: Error });
function flattenError(error, mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of error.issues) {
        if (sub.path.length > 0) {
            fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
            fieldErrors[sub.path[0]].push(mapper(sub));
        }
        else {
            formErrors.push(mapper(sub));
        }
    }
    return { formErrors, fieldErrors };
}
function formatError(error, mapper = (issue) => issue.message) {
    const fieldErrors = { _errors: [] };
    const processError = (error, path = []) => {
        for (const issue of error.issues) {
            if (issue.code === "invalid_union" && issue.errors.length) {
                issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
            }
            else if (issue.code === "invalid_key") {
                processError({ issues: issue.issues }, [...path, ...issue.path]);
            }
            else if (issue.code === "invalid_element") {
                processError({ issues: issue.issues }, [...path, ...issue.path]);
            }
            else {
                const fullpath = [...path, ...issue.path];
                if (fullpath.length === 0) {
                    fieldErrors._errors.push(mapper(issue));
                }
                else {
                    let curr = fieldErrors;
                    let i = 0;
                    while (i < fullpath.length) {
                        const el = fullpath[i];
                        const terminal = i === fullpath.length - 1;
                        if (!terminal) {
                            curr[el] = curr[el] || { _errors: [] };
                        }
                        else {
                            curr[el] = curr[el] || { _errors: [] };
                            curr[el]._errors.push(mapper(issue));
                        }
                        curr = curr[el];
                        i++;
                    }
                }
            }
        }
    };
    processError(error);
    return fieldErrors;
}

const _parse = (_Err) => (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
        throw new $ZodAsyncError();
    }
    if (result.issues.length) {
        const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e, _params?.callee);
        throw e;
    }
    return result.value;
};
const _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
        result = await result;
    if (result.issues.length) {
        const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e, params?.callee);
        throw e;
    }
    return result.value;
};
const _safeParse = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
        throw new $ZodAsyncError();
    }
    return result.issues.length
        ? {
            success: false,
            error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
        }
        : { success: true, data: result.value };
};
const safeParse$1 = /* @__PURE__*/ _safeParse($ZodRealError);
const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
        result = await result;
    return result.issues.length
        ? {
            success: false,
            error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
        }
        : { success: true, data: result.value };
};
const safeParseAsync$1 = /* @__PURE__*/ _safeParseAsync($ZodRealError);
const _encode = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _parse(_Err)(schema, value, ctx);
};
const _decode = (_Err) => (schema, value, _ctx) => {
    return _parse(_Err)(schema, value, _ctx);
};
const _encodeAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _parseAsync(_Err)(schema, value, ctx);
};
const _decodeAsync = (_Err) => async (schema, value, _ctx) => {
    return _parseAsync(_Err)(schema, value, _ctx);
};
const _safeEncode = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _safeParse(_Err)(schema, value, ctx);
};
const _safeDecode = (_Err) => (schema, value, _ctx) => {
    return _safeParse(_Err)(schema, value, _ctx);
};
const _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _safeParseAsync(_Err)(schema, value, ctx);
};
const _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
    return _safeParseAsync(_Err)(schema, value, _ctx);
};

/**
 * @deprecated CUID v1 is deprecated by its authors due to information leakage
 * (timestamps embedded in the id). Use {@link cuid2} instead.
 * See https://github.com/paralleldrive/cuid.
 */
const cuid = /^[cC][0-9a-z]{6,}$/;
const cuid2 = /^[0-9a-z]+$/;
const ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
const xid = /^[0-9a-vA-V]{20}$/;
const ksuid = /^[A-Za-z0-9]{27}$/;
const nanoid = /^[a-zA-Z0-9_-]{21}$/;
/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
const duration$1 = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
const guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
/** Returns a regex for validating an RFC 9562/4122 UUID.
 *
 * @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
const uuid = (version) => {
    if (!version)
        return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
    return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
/** Practical email validation */
const email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
// from https://thekevinscott.com/emojis-in-javascript/#writing-a-regular-expression
const _emoji$1 = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
    return new RegExp(_emoji$1, "u");
}
const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
// https://stackoverflow.com/questions/7860392/determine-if-string-is-in-base64-using-javascript
const base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
const base64url = /^[A-Za-z0-9_-]*$/;
const httpProtocol = /^https?$/;
// https://blog.stevenlevithan.com/archives/validate-phone-number#r4-3 (regex sans spaces)
// E.164: leading digit must be 1-9; total digits (excluding '+') between 7-15
const e164 = /^\+[1-9]\d{6,14}$/;
// const dateSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
const date$1 = /*@__PURE__*/ new RegExp(`^${dateSource}$`);
function timeSource(args) {
    const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
    const regex = typeof args.precision === "number"
        ? args.precision === -1
            ? `${hhmm}`
            : args.precision === 0
                ? `${hhmm}:[0-5]\\d`
                : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}`
        : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
    return regex;
}
function time$1(args) {
    return new RegExp(`^${timeSource(args)}$`);
}
// Adapted from https://stackoverflow.com/a/3143231
function datetime$1(args) {
    const time = timeSource({ precision: args.precision });
    const opts = ["Z"];
    if (args.local)
        opts.push("");
    // if (args.offset) opts.push(`([+-]\\d{2}:\\d{2})`);
    if (args.offset)
        opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
    const timeRegex = `${time}(?:${opts.join("|")})`;
    return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
const string$1 = (params) => {
    const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
    return new RegExp(`^${regex}$`);
};
const integer = /^-?\d+$/;
const number$1 = /^-?\d+(?:\.\d+)?$/;
const boolean$1 = /^(?:true|false)$/i;
// regex for string with no uppercase letters
const lowercase = /^[^A-Z]*$/;
// regex for string with no lowercase letters
const uppercase = /^[^a-z]*$/;

// import { $ZodType } from "./schemas.js";
const $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
    var _a;
    inst._zod ?? (inst._zod = {});
    inst._zod.def = def;
    (_a = inst._zod).onattach ?? (_a.onattach = []);
});
const numericOriginMap = {
    number: "number",
    bigint: "bigint",
    object: "date",
};
const $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
    $ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
        if (def.value < curr) {
            if (def.inclusive)
                bag.maximum = def.value;
            else
                bag.exclusiveMaximum = def.value;
        }
    });
    inst._zod.check = (payload) => {
        if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
            return;
        }
        payload.issues.push({
            origin,
            code: "too_big",
            maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
            input: payload.value,
            inclusive: def.inclusive,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
    $ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
        if (def.value > curr) {
            if (def.inclusive)
                bag.minimum = def.value;
            else
                bag.exclusiveMinimum = def.value;
        }
    });
    inst._zod.check = (payload) => {
        if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
            return;
        }
        payload.issues.push({
            origin,
            code: "too_small",
            minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
            input: payload.value,
            inclusive: def.inclusive,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckMultipleOf = 
/*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.onattach.push((inst) => {
        var _a;
        (_a = inst._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
    });
    inst._zod.check = (payload) => {
        if (typeof payload.value !== typeof def.value)
            throw new Error("Cannot mix number and bigint in multiple_of check.");
        const isMultiple = typeof payload.value === "bigint"
            ? payload.value % def.value === BigInt(0)
            : floatSafeRemainder(payload.value, def.value) === 0;
        if (isMultiple)
            return;
        payload.issues.push({
            origin: typeof payload.value,
            code: "not_multiple_of",
            divisor: def.value,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
    $ZodCheck.init(inst, def); // no format checks
    def.format = def.format || "float64";
    const isInt = def.format?.includes("int");
    const origin = isInt ? "int" : "number";
    const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.format = def.format;
        bag.minimum = minimum;
        bag.maximum = maximum;
        if (isInt)
            bag.pattern = integer;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        if (isInt) {
            if (!Number.isInteger(input)) {
                // invalid_format issue
                // payload.issues.push({
                //   expected: def.format,
                //   format: def.format,
                //   code: "invalid_format",
                //   input,
                //   inst,
                // });
                // invalid_type issue
                payload.issues.push({
                    expected: origin,
                    format: def.format,
                    code: "invalid_type",
                    continue: false,
                    input,
                    inst,
                });
                return;
                // not_multiple_of issue
                // payload.issues.push({
                //   code: "not_multiple_of",
                //   origin: "number",
                //   input,
                //   inst,
                //   divisor: 1,
                // });
            }
            if (!Number.isSafeInteger(input)) {
                if (input > 0) {
                    // too_big
                    payload.issues.push({
                        input,
                        code: "too_big",
                        maximum: Number.MAX_SAFE_INTEGER,
                        note: "Integers must be within the safe integer range.",
                        inst,
                        origin,
                        inclusive: true,
                        continue: !def.abort,
                    });
                }
                else {
                    // too_small
                    payload.issues.push({
                        input,
                        code: "too_small",
                        minimum: Number.MIN_SAFE_INTEGER,
                        note: "Integers must be within the safe integer range.",
                        inst,
                        origin,
                        inclusive: true,
                        continue: !def.abort,
                    });
                }
                return;
            }
        }
        if (input < minimum) {
            payload.issues.push({
                origin: "number",
                input,
                code: "too_small",
                minimum,
                inclusive: true,
                inst,
                continue: !def.abort,
            });
        }
        if (input > maximum) {
            payload.issues.push({
                origin: "number",
                input,
                code: "too_big",
                maximum,
                inclusive: true,
                inst,
                continue: !def.abort,
            });
        }
    };
});
const $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const curr = (inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY);
        if (def.maximum < curr)
            inst._zod.bag.maximum = def.maximum;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const length = input.length;
        if (length <= def.maximum)
            return;
        const origin = getLengthableOrigin(input);
        payload.issues.push({
            origin,
            code: "too_big",
            maximum: def.maximum,
            inclusive: true,
            input,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const curr = (inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY);
        if (def.minimum > curr)
            inst._zod.bag.minimum = def.minimum;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const length = input.length;
        if (length >= def.minimum)
            return;
        const origin = getLengthableOrigin(input);
        payload.issues.push({
            origin,
            code: "too_small",
            minimum: def.minimum,
            inclusive: true,
            input,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.minimum = def.length;
        bag.maximum = def.length;
        bag.length = def.length;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const length = input.length;
        if (length === def.length)
            return;
        const origin = getLengthableOrigin(input);
        const tooBig = length > def.length;
        payload.issues.push({
            origin,
            ...(tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length }),
            inclusive: true,
            exact: true,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
    var _a, _b;
    $ZodCheck.init(inst, def);
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.format = def.format;
        if (def.pattern) {
            bag.patterns ?? (bag.patterns = new Set());
            bag.patterns.add(def.pattern);
        }
    });
    if (def.pattern)
        (_a = inst._zod).check ?? (_a.check = (payload) => {
            def.pattern.lastIndex = 0;
            if (def.pattern.test(payload.value))
                return;
            payload.issues.push({
                origin: "string",
                code: "invalid_format",
                format: def.format,
                input: payload.value,
                ...(def.pattern ? { pattern: def.pattern.toString() } : {}),
                inst,
                continue: !def.abort,
            });
        });
    else
        (_b = inst._zod).check ?? (_b.check = () => { });
});
const $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
    $ZodCheckStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        def.pattern.lastIndex = 0;
        if (def.pattern.test(payload.value))
            return;
        payload.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "regex",
            input: payload.value,
            pattern: def.pattern.toString(),
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
    def.pattern ?? (def.pattern = lowercase);
    $ZodCheckStringFormat.init(inst, def);
});
const $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
    def.pattern ?? (def.pattern = uppercase);
    $ZodCheckStringFormat.init(inst, def);
});
const $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
    $ZodCheck.init(inst, def);
    const escapedRegex = escapeRegex(def.includes);
    const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
    def.pattern = pattern;
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.patterns ?? (bag.patterns = new Set());
        bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
        if (payload.value.includes(def.includes, def.position))
            return;
        payload.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "includes",
            includes: def.includes,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
    $ZodCheck.init(inst, def);
    const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.patterns ?? (bag.patterns = new Set());
        bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
        if (payload.value.startsWith(def.prefix))
            return;
        payload.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "starts_with",
            prefix: def.prefix,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
    $ZodCheck.init(inst, def);
    const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.patterns ?? (bag.patterns = new Set());
        bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
        if (payload.value.endsWith(def.suffix))
            return;
        payload.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "ends_with",
            suffix: def.suffix,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.check = (payload) => {
        payload.value = def.tx(payload.value);
    };
});

class Doc {
    constructor(args = []) {
        this.content = [];
        this.indent = 0;
        if (this)
            this.args = args;
    }
    indented(fn) {
        this.indent += 1;
        fn(this);
        this.indent -= 1;
    }
    write(arg) {
        if (typeof arg === "function") {
            arg(this, { execution: "sync" });
            arg(this, { execution: "async" });
            return;
        }
        const content = arg;
        const lines = content.split("\n").filter((x) => x);
        const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
        const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
        for (const line of dedented) {
            this.content.push(line);
        }
    }
    compile() {
        const F = Function;
        const args = this?.args;
        const content = this?.content ?? [``];
        const lines = [...content.map((x) => `  ${x}`)];
        // console.log(lines.join("\n"));
        return new F(...args, lines.join("\n"));
    }
}

const version = {
    major: 4,
    minor: 4,
    patch: 3,
};

const $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const checks2 = [...inst._zod.def.checks ?? []];
  if (inst._zod.traits.has("$ZodCheck")) {
    checks2.unshift(inst);
  }
  for (const ch of checks2) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks2.length === 0) {
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks3, ctx) => {
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks3) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError();
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks2, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary2) => {
            return handleCanaryResult(canary2, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return result.then((result2) => runChecks(result2, checks2, ctx));
      }
      return runChecks(result, checks2, ctx);
    };
  }
  defineLazy(inst, "~standard", () => ({
    validate: (value) => {
      try {
        const r = safeParse$1(inst, value);
        return r.success ? { value: r.data } : { issues: r.error?.issues };
      } catch (_) {
        return safeParseAsync$1(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
      }
    },
    vendor: "zod",
    version: 1
  }));
});
const $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string$1(inst._zod.bag);
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_2) {
      }
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
const $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  $ZodString.init(inst, def);
});
const $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
  def.pattern ?? (def.pattern = guid);
  $ZodStringFormat.init(inst, def);
});
const $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
  if (def.version) {
    const versionMap = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8
    };
    const v = versionMap[def.version];
    if (v === void 0)
      throw new Error(`Invalid UUID version: "${def.version}"`);
    def.pattern ?? (def.pattern = uuid(v));
  } else
    def.pattern ?? (def.pattern = uuid());
  $ZodStringFormat.init(inst, def);
});
const $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
  def.pattern ?? (def.pattern = email);
  $ZodStringFormat.init(inst, def);
});
const $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    try {
      const trimmed = payload.value.trim();
      if (!def.normalize && def.protocol?.source === httpProtocol.source) {
        if (!/^https?:\/\//i.test(trimmed)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid URL format",
            input: payload.value,
            inst,
            continue: !def.abort
          });
          return;
        }
      }
      const url = new URL(trimmed);
      if (def.hostname) {
        def.hostname.lastIndex = 0;
        if (!def.hostname.test(url.hostname)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid hostname",
            pattern: def.hostname.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.protocol) {
        def.protocol.lastIndex = 0;
        if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid protocol",
            pattern: def.protocol.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.normalize) {
        payload.value = url.href;
      } else {
        payload.value = trimmed;
      }
      return;
    } catch (_) {
      payload.issues.push({
        code: "invalid_format",
        format: "url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
const $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
  def.pattern ?? (def.pattern = emoji());
  $ZodStringFormat.init(inst, def);
});
const $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
  def.pattern ?? (def.pattern = nanoid);
  $ZodStringFormat.init(inst, def);
});
const $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
  def.pattern ?? (def.pattern = cuid);
  $ZodStringFormat.init(inst, def);
});
const $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
  def.pattern ?? (def.pattern = cuid2);
  $ZodStringFormat.init(inst, def);
});
const $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
  def.pattern ?? (def.pattern = ulid);
  $ZodStringFormat.init(inst, def);
});
const $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
  def.pattern ?? (def.pattern = xid);
  $ZodStringFormat.init(inst, def);
});
const $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
  def.pattern ?? (def.pattern = ksuid);
  $ZodStringFormat.init(inst, def);
});
const $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
  def.pattern ?? (def.pattern = datetime$1(def));
  $ZodStringFormat.init(inst, def);
});
const $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
  def.pattern ?? (def.pattern = date$1);
  $ZodStringFormat.init(inst, def);
});
const $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
  def.pattern ?? (def.pattern = time$1(def));
  $ZodStringFormat.init(inst, def);
});
const $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
  def.pattern ?? (def.pattern = duration$1);
  $ZodStringFormat.init(inst, def);
});
const $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
  def.pattern ?? (def.pattern = ipv4);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv4`;
});
const $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
  def.pattern ?? (def.pattern = ipv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv6`;
  inst._zod.check = (payload) => {
    try {
      new URL(`http://[${payload.value}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "ipv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
const $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv4);
  $ZodStringFormat.init(inst, def);
});
const $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    const parts = payload.value.split("/");
    try {
      if (parts.length !== 2)
        throw new Error();
      const [address, prefix] = parts;
      if (!prefix)
        throw new Error();
      const prefixNum = Number(prefix);
      if (`${prefixNum}` !== prefix)
        throw new Error();
      if (prefixNum < 0 || prefixNum > 128)
        throw new Error();
      new URL(`http://[${address}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "cidrv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
function isValidBase64(data) {
  if (data === "")
    return true;
  if (/\s/.test(data))
    return false;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
const $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
  def.pattern ?? (def.pattern = base64);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64";
  inst._zod.check = (payload) => {
    if (isValidBase64(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function isValidBase64URL(data) {
  if (!base64url.test(data))
    return false;
  const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return isValidBase64(padded);
}
const $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
  def.pattern ?? (def.pattern = base64url);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64url";
  inst._zod.check = (payload) => {
    if (isValidBase64URL(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64url",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
const $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
  def.pattern ?? (def.pattern = e164);
  $ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
const $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidJWT(payload.value, def.alg))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
const $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = inst._zod.bag.pattern ?? number$1;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : void 0 : void 0;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
const $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
const $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean$1;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
const $ZodAny = /* @__PURE__ */ $constructor("$ZodAny", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
const $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
const $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
const $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = Array(input.length);
    const proms = [];
    for (let i = 0; i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
  const isPresent = key in input;
  if (result.issues.length) {
    if (isOptionalIn && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (!isPresent && !isOptionalIn) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: void 0,
        path: [key]
      });
    }
    return;
  }
  if (result.value === void 0) {
    if (isPresent) {
      final.value[key] = void 0;
    }
  } else {
    final.value[key] = result.value;
  }
}
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  for (const k of keys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    keys,
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const isOptionalIn = _catchall.optin === "optional";
  const isOptionalOut = _catchall.optout === "optional";
  for (const key in input) {
    if (key === "__proto__")
      continue;
    if (keySet.has(key))
      continue;
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, isOptionalIn, isOptionalOut)));
    } else {
      handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
const $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  if (!desc?.get) {
    const sh = def.shape;
    Object.defineProperty(def, "shape", {
      get: () => {
        const newSh = { ...sh };
        Object.defineProperty(def, "shape", {
          value: newSh
        });
        return newSh;
      }
    });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazy(inst._zod, "propValues", () => {
    const shape = def.shape;
    const propValues = {};
    for (const key in shape) {
      const field = shape[key]._zod;
      if (field.values) {
        propValues[key] ?? (propValues[key] = /* @__PURE__ */ new Set());
        for (const v of field.values)
          propValues[key].add(v);
      }
    }
    return propValues;
  });
  const isObject$1 = isObject;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject$1(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = {};
    const proms = [];
    const shape = value.shape;
    for (const key of value.keys) {
      const el = shape[key];
      const isOptionalIn = el._zod.optin === "optional";
      const isOptionalOut = el._zod.optout === "optional";
      const r = el._zod.run({ value: input[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, isOptionalIn, isOptionalOut)));
      } else {
        handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
  };
});
const $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
  $ZodObject.init(inst, def);
  const superParse = inst._zod.parse;
  const _normalized = cached(() => normalizeDef(def));
  const generateFastpass = (shape) => {
    const doc = new Doc(["shape", "payload", "ctx"]);
    const normalized = _normalized.value;
    const parseStr = (key) => {
      const k = esc(key);
      return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
    };
    doc.write(`const input = payload.value;`);
    const ids = /* @__PURE__ */ Object.create(null);
    let counter = 0;
    for (const key of normalized.keys) {
      ids[key] = `key_${counter++}`;
    }
    doc.write(`const newResult = {};`);
    for (const key of normalized.keys) {
      const id = ids[key];
      const k = esc(key);
      const schema = shape[key];
      const isOptionalIn = schema?._zod?.optin === "optional";
      const isOptionalOut = schema?._zod?.optout === "optional";
      doc.write(`const ${id} = ${parseStr(key)};`);
      if (isOptionalIn && isOptionalOut) {
        doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
      } else if (!isOptionalIn) {
        doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
      } else {
        doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
      }
    }
    doc.write(`payload.value = newResult;`);
    doc.write(`return payload;`);
    const fn = doc.compile();
    return (payload, ctx) => fn(shape, payload, ctx);
  };
  let fastpass;
  const isObject$1 = isObject;
  const jit = !globalConfig.jitless;
  const allowsEval$1 = allowsEval;
  const fastEnabled = jit && allowsEval$1.value;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject$1(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
      if (!fastpass)
        fastpass = generateFastpass(def.shape);
      payload = fastpass(payload, ctx);
      if (!catchall)
        return payload;
      return handleCatchall([], input, payload, ctx, value, inst);
    }
    return superParse(payload, ctx);
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
const $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0);
  defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
  defineLazy(inst._zod, "values", () => {
    if (def.options.every((o) => o._zod.values)) {
      return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return void 0;
  });
  defineLazy(inst._zod, "pattern", () => {
    if (def.options.every((o) => o._zod.pattern)) {
      const patterns = def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return void 0;
  });
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleUnionResults(results2, payload, inst, ctx);
    });
  };
});
const $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    const left = def.left._zod.run({ value: input, issues: [] }, ctx);
    const right = def.right._zod.run({ value: input, issues: [] }, ctx);
    const async = left instanceof Promise || right instanceof Promise;
    if (async) {
      return Promise.all([left, right]).then(([left2, right2]) => {
        return handleIntersectionResults(payload, left2, right2);
      });
    }
    return handleIntersectionResults(payload, left, right);
  };
});
function mergeValues(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  const unrecKeys = /* @__PURE__ */ new Map();
  let unrecIssue;
  for (const iss of left.issues) {
    if (iss.code === "unrecognized_keys") {
      unrecIssue ?? (unrecIssue = iss);
      for (const k of iss.keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k).l = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  for (const iss of right.issues) {
    if (iss.code === "unrecognized_keys") {
      for (const k of iss.keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k).r = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
  if (bothKeys.length && unrecIssue) {
    result.issues.push({ ...unrecIssue, keys: bothKeys });
  }
  if (aborted(result))
    return result;
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
const $ZodTuple = /* @__PURE__ */ $constructor("$ZodTuple", (inst, def) => {
  $ZodType.init(inst, def);
  const items = def.items;
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        input,
        inst,
        expected: "tuple",
        code: "invalid_type"
      });
      return payload;
    }
    payload.value = [];
    const proms = [];
    const optinStart = getTupleOptStart(items, "optin");
    const optoutStart = getTupleOptStart(items, "optout");
    if (!def.rest) {
      if (input.length < optinStart) {
        payload.issues.push({
          code: "too_small",
          minimum: optinStart,
          inclusive: true,
          input,
          inst,
          origin: "array"
        });
        return payload;
      }
      if (input.length > items.length) {
        payload.issues.push({
          code: "too_big",
          maximum: items.length,
          inclusive: true,
          input,
          inst,
          origin: "array"
        });
      }
    }
    const itemResults = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
      const r = items[i]._zod.run({ value: input[i], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((rr) => {
          itemResults[i] = rr;
        }));
      } else {
        itemResults[i] = r;
      }
    }
    if (def.rest) {
      let i = items.length - 1;
      const rest = input.slice(items.length);
      for (const el of rest) {
        i++;
        const result = def.rest._zod.run({ value: el, issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((r) => handleTupleResult(r, payload, i)));
        } else {
          handleTupleResult(result, payload, i);
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => handleTupleResults(itemResults, payload, items, input, optoutStart));
    }
    return handleTupleResults(itemResults, payload, items, input, optoutStart);
  };
});
function getTupleOptStart(items, key) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]._zod[key] !== "optional")
      return i + 1;
  }
  return 0;
}
function handleTupleResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
function handleTupleResults(itemResults, final, items, input, optoutStart) {
  for (let i = 0; i < items.length; i++) {
    const r = itemResults[i];
    const isPresent = i < input.length;
    if (r.issues.length) {
      if (!isPresent && i >= optoutStart) {
        final.value.length = i;
        break;
      }
      final.issues.push(...prefixIssues(i, r.issues));
    }
    final.value[i] = r.value;
  }
  for (let i = final.value.length - 1; i >= input.length; i--) {
    if (items[i]._zod.optout === "optional" && final.value[i] === void 0) {
      final.value.length = i;
    } else {
      break;
    }
  }
  return final;
}
const $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isPlainObject(input)) {
      payload.issues.push({
        expected: "record",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    const values = def.keyType._zod.values;
    if (values) {
      payload.value = {};
      const recordKeys = /* @__PURE__ */ new Set();
      for (const key of values) {
        if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
          recordKeys.add(typeof key === "number" ? key.toString() : key);
          const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
          if (keyResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (keyResult.issues.length) {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
            continue;
          }
          const outKey = keyResult.value;
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => {
              if (result2.issues.length) {
                payload.issues.push(...prefixIssues(key, result2.issues));
              }
              payload.value[outKey] = result2.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[outKey] = result.value;
          }
        }
      }
      let unrecognized;
      for (const key in input) {
        if (!recordKeys.has(key)) {
          unrecognized = unrecognized ?? [];
          unrecognized.push(key);
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized
        });
      }
    } else {
      payload.value = {};
      for (const key of Reflect.ownKeys(input)) {
        if (key === "__proto__")
          continue;
        if (!Object.prototype.propertyIsEnumerable.call(input, key))
          continue;
        let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
        if (keyResult instanceof Promise) {
          throw new Error("Async schemas not supported in object keys currently");
        }
        const checkNumericKey = typeof key === "string" && number$1.test(key) && keyResult.issues.length;
        if (checkNumericKey) {
          const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
          if (retryResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (retryResult.issues.length === 0) {
            keyResult = retryResult;
          }
        }
        if (keyResult.issues.length) {
          if (def.mode === "loose") {
            payload.value[key] = input[key];
          } else {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
          }
          continue;
        }
        const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => {
            if (result2.issues.length) {
              payload.issues.push(...prefixIssues(key, result2.issues));
            }
            payload.value[keyResult.value] = result2.value;
          }));
        } else {
          if (result.issues.length) {
            payload.issues.push(...prefixIssues(key, result.issues));
          }
          payload.value[keyResult.value] = result.value;
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
const $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
const $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  if (def.values.length === 0) {
    throw new Error("Cannot create literal schema with no valid values");
  }
  const values = new Set(def.values);
  inst._zod.values = values;
  inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
const $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    const _out = def.transform(payload.value, payload);
    if (ctx.async) {
      const output = _out instanceof Promise ? _out : Promise.resolve(_out);
      return output.then((output2) => {
        payload.value = output2;
        payload.fallback = true;
        return payload;
      });
    }
    if (_out instanceof Promise) {
      throw new $ZodAsyncError();
    }
    payload.value = _out;
    payload.fallback = true;
    return payload;
  };
});
function handleOptionalResult(result, input) {
  if (input === void 0 && (result.issues.length || result.fallback)) {
    return { issues: [], value: void 0 };
  }
  return result;
}
const $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.optout = "optional";
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, void 0]) : void 0;
  });
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (def.innerType._zod.optin === "optional") {
      const input = payload.value;
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise)
        return result.then((r) => handleOptionalResult(r, input));
      return handleOptionalResult(result, input);
    }
    if (payload.value === void 0) {
      return payload;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
const $ZodExactOptional = /* @__PURE__ */ $constructor("$ZodExactOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
  inst._zod.parse = (payload, ctx) => {
    return def.innerType._zod.run(payload, ctx);
  };
});
const $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
  });
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, null]) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
const $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
      return payload;
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleDefaultResult(result2, def));
    }
    return handleDefaultResult(result, def);
  };
});
function handleDefaultResult(payload, def) {
  if (payload.value === void 0) {
    payload.value = def.defaultValue;
  }
  return payload;
}
const $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
const $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => {
    const v = def.innerType._zod.values;
    return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleNonOptionalResult(result2, inst));
    }
    return handleNonOptionalResult(result, inst);
  };
});
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === void 0) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
const $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => {
        payload.value = result2.value;
        if (result2.issues.length) {
          payload.value = def.catchValue({
            ...payload,
            error: {
              issues: result2.issues.map((iss) => finalizeIssue(iss, ctx, config()))
            },
            input: payload.value
          });
          payload.issues = [];
          payload.fallback = true;
        }
        return payload;
      });
    }
    payload.value = result.value;
    if (result.issues.length) {
      payload.value = def.catchValue({
        ...payload,
        error: {
          issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
        },
        input: payload.value
      });
      payload.issues = [];
      payload.fallback = true;
    }
    return payload;
  };
});
const $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => def.in._zod.values);
  defineLazy(inst._zod, "optin", () => def.in._zod.optin);
  defineLazy(inst._zod, "optout", () => def.out._zod.optout);
  defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right2) => handlePipeResult(right2, def.in, ctx));
      }
      return handlePipeResult(right, def.in, ctx);
    }
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left2) => handlePipeResult(left2, def.out, ctx));
    }
    return handlePipeResult(left, def.out, ctx);
  };
});
function handlePipeResult(left, next, ctx) {
  if (left.issues.length) {
    left.aborted = true;
    return left;
  }
  return next._zod.run({ value: left.value, issues: left.issues, fallback: left.fallback }, ctx);
}
const $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
  defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  payload.value = Object.freeze(payload.value);
  return payload;
}
const $ZodLazy = /* @__PURE__ */ $constructor("$ZodLazy", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "innerType", () => {
    const d = def;
    if (!d._cachedInner)
      d._cachedInner = def.getter();
    return d._cachedInner;
  });
  defineLazy(inst._zod, "pattern", () => inst._zod.innerType?._zod?.pattern);
  defineLazy(inst._zod, "propValues", () => inst._zod.innerType?._zod?.propValues);
  defineLazy(inst._zod, "optin", () => inst._zod.innerType?._zod?.optin ?? void 0);
  defineLazy(inst._zod, "optout", () => inst._zod.innerType?._zod?.optout ?? void 0);
  inst._zod.parse = (payload, ctx) => {
    const inner = inst._zod.innerType;
    return inner._zod.run(payload, ctx);
  };
});
const $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r = def.fn(input);
    if (r instanceof Promise) {
      return r.then((r2) => handleRefineResult(r2, payload, input, inst));
    }
    handleRefineResult(r, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      // incorporates params.error into issue reporting
      path: [...inst._zod.def.path ?? []],
      // incorporates params.error into issue reporting
      continue: !inst._zod.def.abort
      // params: inst._zod.def.params,
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}

var _a;
class $ZodRegistry {
  constructor() {
    this._map = /* @__PURE__ */ new WeakMap();
    this._idmap = /* @__PURE__ */ new Map();
  }
  add(schema, ..._meta) {
    const meta = _meta[0];
    this._map.set(schema, meta);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.set(meta.id, schema);
    }
    return this;
  }
  clear() {
    this._map = /* @__PURE__ */ new WeakMap();
    this._idmap = /* @__PURE__ */ new Map();
    return this;
  }
  remove(schema) {
    const meta = this._map.get(schema);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.delete(meta.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p = schema._zod.parent;
    if (p) {
      const pm = { ...this.get(p) ?? {} };
      delete pm.id;
      const f = { ...pm, ...this._map.get(schema) };
      return Object.keys(f).length ? f : void 0;
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
}
function registry() {
  return new $ZodRegistry();
}
(_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
const globalRegistry = globalThis.__zod_globalRegistry;

// @__NO_SIDE_EFFECTS__
function _string(Class, params) {
  return new Class({
    type: "string",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _email(Class, params) {
  return new Class({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _guid(Class, params) {
  return new Class({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuid(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv4(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv6(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv7(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _url(Class, params) {
  return new Class({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _emoji(Class, params) {
  return new Class({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _nanoid(Class, params) {
  return new Class({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cuid(Class, params) {
  return new Class({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cuid2(Class, params) {
  return new Class({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ulid(Class, params) {
  return new Class({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _xid(Class, params) {
  return new Class({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ksuid(Class, params) {
  return new Class({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ipv4(Class, params) {
  return new Class({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ipv6(Class, params) {
  return new Class({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cidrv4(Class, params) {
  return new Class({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cidrv6(Class, params) {
  return new Class({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _base64(Class, params) {
  return new Class({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _base64url(Class, params) {
  return new Class({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _e164(Class, params) {
  return new Class({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _jwt(Class, params) {
  return new Class({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDateTime(Class, params) {
  return new Class({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDate(Class, params) {
  return new Class({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoTime(Class, params) {
  return new Class({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDuration(Class, params) {
  return new Class({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _number(Class, params) {
  return new Class({
    type: "number",
    checks: [],
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _int(Class, params) {
  return new Class({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class, params) {
  return new Class({
    type: "boolean",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _any(Class) {
  return new Class({
    type: "any"
  });
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class) {
  return new Class({
    type: "unknown"
  });
}
// @__NO_SIDE_EFFECTS__
function _never(Class, params) {
  return new Class({
    type: "never",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
// @__NO_SIDE_EFFECTS__
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
// @__NO_SIDE_EFFECTS__
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
// @__NO_SIDE_EFFECTS__
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
// @__NO_SIDE_EFFECTS__
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
// @__NO_SIDE_EFFECTS__
function _normalize(form) {
  return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
}
// @__NO_SIDE_EFFECTS__
function _trim() {
  return /* @__PURE__ */ _overwrite((input) => input.trim());
}
// @__NO_SIDE_EFFECTS__
function _toLowerCase() {
  return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function _toUpperCase() {
  return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function _slugify() {
  return /* @__PURE__ */ _overwrite((input) => slugify(input));
}
// @__NO_SIDE_EFFECTS__
function _array(Class, element, params) {
  return new Class({
    type: "array",
    element,
    // get element() {
    //   return element;
    // },
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _custom(Class, fn, _params) {
  const norm = normalizeParams(_params);
  norm.abort ?? (norm.abort = true);
  const schema = new Class({
    type: "custom",
    check: "custom",
    fn,
    ...norm
  });
  return schema;
}
// @__NO_SIDE_EFFECTS__
function _refine(Class, fn, _params) {
  const schema = new Class({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}
// @__NO_SIDE_EFFECTS__
function _superRefine(fn, params) {
  const ch = /* @__PURE__ */ _check((payload) => {
    payload.addIssue = (issue$1) => {
      if (typeof issue$1 === "string") {
        payload.issues.push(issue(issue$1, payload.value, ch._zod.def));
      } else {
        const _issue = issue$1;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(issue(_issue));
      }
    };
    return fn(payload.value, payload);
  }, params);
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _check(fn, params) {
  const ch = new $ZodCheck({
    check: "custom",
    ...normalizeParams(params)
  });
  ch._zod.check = fn;
  return ch;
}

function initializeContext(params) {
  let target = params?.target ?? "draft-2020-12";
  if (target === "draft-4")
    target = "draft-04";
  if (target === "draft-7")
    target = "draft-07";
  return {
    processors: params.processors ?? {},
    metadataRegistry: params?.metadata ?? globalRegistry,
    target,
    unrepresentable: params?.unrepresentable ?? "throw",
    override: params?.override ?? (() => {
    }),
    io: params?.io ?? "output",
    counter: 0,
    seen: /* @__PURE__ */ new Map(),
    cycles: params?.cycles ?? "ref",
    reused: params?.reused ?? "inline",
    external: params?.external ?? void 0
  };
}
function process(schema, ctx, _params = { path: [], schemaPath: [] }) {
  var _a;
  const def = schema._zod.def;
  const seen = ctx.seen.get(schema);
  if (seen) {
    seen.count++;
    const isCycle = _params.schemaPath.includes(schema);
    if (isCycle) {
      seen.cycle = _params.path;
    }
    return seen.schema;
  }
  const result = { schema: {}, count: 1, cycle: void 0, path: _params.path };
  ctx.seen.set(schema, result);
  const overrideSchema = schema._zod.toJSONSchema?.();
  if (overrideSchema) {
    result.schema = overrideSchema;
  } else {
    const params = {
      ..._params,
      schemaPath: [..._params.schemaPath, schema],
      path: _params.path
    };
    if (schema._zod.processJSONSchema) {
      schema._zod.processJSONSchema(ctx, result.schema, params);
    } else {
      const _json = result.schema;
      const processor = ctx.processors[def.type];
      if (!processor) {
        throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
      }
      processor(schema, ctx, _json, params);
    }
    const parent = schema._zod.parent;
    if (parent) {
      if (!result.ref)
        result.ref = parent;
      process(parent, ctx, params);
      ctx.seen.get(parent).isParent = true;
    }
  }
  const meta = ctx.metadataRegistry.get(schema);
  if (meta)
    Object.assign(result.schema, meta);
  if (ctx.io === "input" && isTransforming(schema)) {
    delete result.schema.examples;
    delete result.schema.default;
  }
  if (ctx.io === "input" && "_prefault" in result.schema)
    (_a = result.schema).default ?? (_a.default = result.schema._prefault);
  delete result.schema._prefault;
  const _result = ctx.seen.get(schema);
  return _result.schema;
}
function extractDefs(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const idToSchema = /* @__PURE__ */ new Map();
  for (const entry of ctx.seen.entries()) {
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      const existing = idToSchema.get(id);
      if (existing && existing !== entry[0]) {
        throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
      }
      idToSchema.set(id, entry[0]);
    }
  }
  const makeURI = (entry) => {
    const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
    if (ctx.external) {
      const externalId = ctx.external.registry.get(entry[0])?.id;
      const uriGenerator = ctx.external.uri ?? ((id2) => id2);
      if (externalId) {
        return { ref: uriGenerator(externalId) };
      }
      const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
      entry[1].defId = id;
      return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}` };
    }
    if (entry[1] === root) {
      return { ref: "#" };
    }
    const uriPrefix = `#`;
    const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
    const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
    return { defId, ref: defUriPrefix + defId };
  };
  const extractToDef = (entry) => {
    if (entry[1].schema.$ref) {
      return;
    }
    const seen = entry[1];
    const { ref, defId } = makeURI(entry);
    seen.def = { ...seen.schema };
    if (defId)
      seen.defId = defId;
    const schema2 = seen.schema;
    for (const key in schema2) {
      delete schema2[key];
    }
    schema2.$ref = ref;
  };
  if (ctx.cycles === "throw") {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.cycle) {
        throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
      }
    }
  }
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (schema === entry[0]) {
      extractToDef(entry);
      continue;
    }
    if (ctx.external) {
      const ext = ctx.external.registry.get(entry[0])?.id;
      if (schema !== entry[0] && ext) {
        extractToDef(entry);
        continue;
      }
    }
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      extractToDef(entry);
      continue;
    }
    if (seen.cycle) {
      extractToDef(entry);
      continue;
    }
    if (seen.count > 1) {
      if (ctx.reused === "ref") {
        extractToDef(entry);
        continue;
      }
    }
  }
}
function finalize(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const flattenRef = (zodSchema) => {
    const seen = ctx.seen.get(zodSchema);
    if (seen.ref === null)
      return;
    const schema2 = seen.def ?? seen.schema;
    const _cached = { ...schema2 };
    const ref = seen.ref;
    seen.ref = null;
    if (ref) {
      flattenRef(ref);
      const refSeen = ctx.seen.get(ref);
      const refSchema = refSeen.schema;
      if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
        schema2.allOf = schema2.allOf ?? [];
        schema2.allOf.push(refSchema);
      } else {
        Object.assign(schema2, refSchema);
      }
      Object.assign(schema2, _cached);
      const isParentRef = zodSchema._zod.parent === ref;
      if (isParentRef) {
        for (const key in schema2) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (!(key in _cached)) {
            delete schema2[key];
          }
        }
      }
      if (refSchema.$ref && refSeen.def) {
        for (const key in schema2) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (key in refSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(refSeen.def[key])) {
            delete schema2[key];
          }
        }
      }
    }
    const parent = zodSchema._zod.parent;
    if (parent && parent !== ref) {
      flattenRef(parent);
      const parentSeen = ctx.seen.get(parent);
      if (parentSeen?.schema.$ref) {
        schema2.$ref = parentSeen.schema.$ref;
        if (parentSeen.def) {
          for (const key in schema2) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (key in parentSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(parentSeen.def[key])) {
              delete schema2[key];
            }
          }
        }
      }
    }
    ctx.override({
      zodSchema,
      jsonSchema: schema2,
      path: seen.path ?? []
    });
  };
  for (const entry of [...ctx.seen.entries()].reverse()) {
    flattenRef(entry[0]);
  }
  const result = {};
  if (ctx.target === "draft-2020-12") {
    result.$schema = "https://json-schema.org/draft/2020-12/schema";
  } else if (ctx.target === "draft-07") {
    result.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (ctx.target === "draft-04") {
    result.$schema = "http://json-schema.org/draft-04/schema#";
  } else if (ctx.target === "openapi-3.0") ; else ;
  if (ctx.external?.uri) {
    const id = ctx.external.registry.get(schema)?.id;
    if (!id)
      throw new Error("Schema is missing an `id` property");
    result.$id = ctx.external.uri(id);
  }
  Object.assign(result, root.def ?? root.schema);
  const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
  if (rootMetaId !== void 0 && result.id === rootMetaId)
    delete result.id;
  const defs = ctx.external?.defs ?? {};
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (seen.def && seen.defId) {
      if (seen.def.id === seen.defId)
        delete seen.def.id;
      defs[seen.defId] = seen.def;
    }
  }
  if (ctx.external) ; else {
    if (Object.keys(defs).length > 0) {
      if (ctx.target === "draft-2020-12") {
        result.$defs = defs;
      } else {
        result.definitions = defs;
      }
    }
  }
  try {
    const finalized = JSON.parse(JSON.stringify(result));
    Object.defineProperty(finalized, "~standard", {
      value: {
        ...schema["~standard"],
        jsonSchema: {
          input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
          output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
        }
      },
      enumerable: false,
      writable: false
    });
    return finalized;
  } catch (_err) {
    throw new Error("Error converting schema to JSON.");
  }
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
  if (ctx.seen.has(_schema))
    return false;
  ctx.seen.add(_schema);
  const def = _schema._zod.def;
  if (def.type === "transform")
    return true;
  if (def.type === "array")
    return isTransforming(def.element, ctx);
  if (def.type === "set")
    return isTransforming(def.valueType, ctx);
  if (def.type === "lazy")
    return isTransforming(def.getter(), ctx);
  if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") {
    return isTransforming(def.innerType, ctx);
  }
  if (def.type === "intersection") {
    return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
  }
  if (def.type === "record" || def.type === "map") {
    return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
  }
  if (def.type === "pipe") {
    if (_schema._zod.traits.has("$ZodCodec"))
      return true;
    return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
  }
  if (def.type === "object") {
    for (const key in def.shape) {
      if (isTransforming(def.shape[key], ctx))
        return true;
    }
    return false;
  }
  if (def.type === "union") {
    for (const option of def.options) {
      if (isTransforming(option, ctx))
        return true;
    }
    return false;
  }
  if (def.type === "tuple") {
    for (const item of def.items) {
      if (isTransforming(item, ctx))
        return true;
    }
    if (def.rest && isTransforming(def.rest, ctx))
      return true;
    return false;
  }
  return false;
}
const createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
  const ctx = initializeContext({ ...params, processors });
  process(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
  const { libraryOptions, target } = params ?? {};
  const ctx = initializeContext({ ...libraryOptions ?? {}, target, io, processors });
  process(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};

const formatMap = {
    guid: "uuid",
    url: "uri",
    datetime: "date-time",
    json_string: "json-string",
    regex: "", // do not set
};
// ==================== SIMPLE TYPE PROCESSORS ====================
const stringProcessor = (schema, ctx, _json, _params) => {
    const json = _json;
    json.type = "string";
    const { minimum, maximum, format, patterns, contentEncoding } = schema._zod
        .bag;
    if (typeof minimum === "number")
        json.minLength = minimum;
    if (typeof maximum === "number")
        json.maxLength = maximum;
    // custom pattern overrides format
    if (format) {
        json.format = formatMap[format] ?? format;
        if (json.format === "")
            delete json.format; // empty format is not valid
        // JSON Schema format: "time" requires a full time with offset or Z
        // z.iso.time() does not include timezone information, so format: "time" should never be used
        if (format === "time") {
            delete json.format;
        }
    }
    if (contentEncoding)
        json.contentEncoding = contentEncoding;
    if (patterns && patterns.size > 0) {
        const regexes = [...patterns];
        if (regexes.length === 1)
            json.pattern = regexes[0].source;
        else if (regexes.length > 1) {
            json.allOf = [
                ...regexes.map((regex) => ({
                    ...(ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0"
                        ? { type: "string" }
                        : {}),
                    pattern: regex.source,
                })),
            ];
        }
    }
};
const numberProcessor = (schema, ctx, _json, _params) => {
    const json = _json;
    const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
    if (typeof format === "string" && format.includes("int"))
        json.type = "integer";
    else
        json.type = "number";
    // when both minimum and exclusiveMinimum exist, pick the more restrictive one
    const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
    const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
    const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
    if (exMin) {
        if (legacy) {
            json.minimum = exclusiveMinimum;
            json.exclusiveMinimum = true;
        }
        else {
            json.exclusiveMinimum = exclusiveMinimum;
        }
    }
    else if (typeof minimum === "number") {
        json.minimum = minimum;
    }
    if (exMax) {
        if (legacy) {
            json.maximum = exclusiveMaximum;
            json.exclusiveMaximum = true;
        }
        else {
            json.exclusiveMaximum = exclusiveMaximum;
        }
    }
    else if (typeof maximum === "number") {
        json.maximum = maximum;
    }
    if (typeof multipleOf === "number")
        json.multipleOf = multipleOf;
};
const booleanProcessor = (_schema, _ctx, json, _params) => {
    json.type = "boolean";
};
const neverProcessor = (_schema, _ctx, json, _params) => {
    json.not = {};
};
const anyProcessor = (_schema, _ctx, _json, _params) => {
    // empty schema accepts anything
};
const unknownProcessor = (_schema, _ctx, _json, _params) => {
    // empty schema accepts anything
};
const enumProcessor = (schema, _ctx, json, _params) => {
    const def = schema._zod.def;
    const values = getEnumValues(def.entries);
    // Number enums can have both string and number values
    if (values.every((v) => typeof v === "number"))
        json.type = "number";
    if (values.every((v) => typeof v === "string"))
        json.type = "string";
    json.enum = values;
};
const literalProcessor = (schema, ctx, json, _params) => {
    const def = schema._zod.def;
    const vals = [];
    for (const val of def.values) {
        if (val === undefined) {
            if (ctx.unrepresentable === "throw") {
                throw new Error("Literal `undefined` cannot be represented in JSON Schema");
            }
        }
        else if (typeof val === "bigint") {
            if (ctx.unrepresentable === "throw") {
                throw new Error("BigInt literals cannot be represented in JSON Schema");
            }
            else {
                vals.push(Number(val));
            }
        }
        else {
            vals.push(val);
        }
    }
    if (vals.length === 0) ;
    else if (vals.length === 1) {
        const val = vals[0];
        json.type = val === null ? "null" : typeof val;
        if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
            json.enum = [val];
        }
        else {
            json.const = val;
        }
    }
    else {
        if (vals.every((v) => typeof v === "number"))
            json.type = "number";
        if (vals.every((v) => typeof v === "string"))
            json.type = "string";
        if (vals.every((v) => typeof v === "boolean"))
            json.type = "boolean";
        if (vals.every((v) => v === null))
            json.type = "null";
        json.enum = vals;
    }
};
const customProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Custom types cannot be represented in JSON Schema");
    }
};
const transformProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Transforms cannot be represented in JSON Schema");
    }
};
// ==================== COMPOSITE TYPE PROCESSORS ====================
const arrayProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    const { minimum, maximum } = schema._zod.bag;
    if (typeof minimum === "number")
        json.minItems = minimum;
    if (typeof maximum === "number")
        json.maxItems = maximum;
    json.type = "array";
    json.items = process(def.element, ctx, {
        ...params,
        path: [...params.path, "items"],
    });
};
const objectProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    json.type = "object";
    json.properties = {};
    const shape = def.shape;
    for (const key in shape) {
        json.properties[key] = process(shape[key], ctx, {
            ...params,
            path: [...params.path, "properties", key],
        });
    }
    // required keys
    const allKeys = new Set(Object.keys(shape));
    const requiredKeys = new Set([...allKeys].filter((key) => {
        const v = def.shape[key]._zod;
        if (ctx.io === "input") {
            return v.optin === undefined;
        }
        else {
            return v.optout === undefined;
        }
    }));
    if (requiredKeys.size > 0) {
        json.required = Array.from(requiredKeys);
    }
    // catchall
    if (def.catchall?._zod.def.type === "never") {
        // strict
        json.additionalProperties = false;
    }
    else if (!def.catchall) {
        // regular
        if (ctx.io === "output")
            json.additionalProperties = false;
    }
    else if (def.catchall) {
        json.additionalProperties = process(def.catchall, ctx, {
            ...params,
            path: [...params.path, "additionalProperties"],
        });
    }
};
const unionProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    // Exclusive unions (inclusive === false) use oneOf (exactly one match) instead of anyOf (one or more matches)
    // This includes both z.xor() and discriminated unions
    const isExclusive = def.inclusive === false;
    const options = def.options.map((x, i) => process(x, ctx, {
        ...params,
        path: [...params.path, isExclusive ? "oneOf" : "anyOf", i],
    }));
    if (isExclusive) {
        json.oneOf = options;
    }
    else {
        json.anyOf = options;
    }
};
const intersectionProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    const a = process(def.left, ctx, {
        ...params,
        path: [...params.path, "allOf", 0],
    });
    const b = process(def.right, ctx, {
        ...params,
        path: [...params.path, "allOf", 1],
    });
    const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
    const allOf = [
        ...(isSimpleIntersection(a) ? a.allOf : [a]),
        ...(isSimpleIntersection(b) ? b.allOf : [b]),
    ];
    json.allOf = allOf;
};
const tupleProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    json.type = "array";
    const prefixPath = ctx.target === "draft-2020-12" ? "prefixItems" : "items";
    const restPath = ctx.target === "draft-2020-12" ? "items" : ctx.target === "openapi-3.0" ? "items" : "additionalItems";
    const prefixItems = def.items.map((x, i) => process(x, ctx, {
        ...params,
        path: [...params.path, prefixPath, i],
    }));
    const rest = def.rest
        ? process(def.rest, ctx, {
            ...params,
            path: [...params.path, restPath, ...(ctx.target === "openapi-3.0" ? [def.items.length] : [])],
        })
        : null;
    if (ctx.target === "draft-2020-12") {
        json.prefixItems = prefixItems;
        if (rest) {
            json.items = rest;
        }
    }
    else if (ctx.target === "openapi-3.0") {
        json.items = {
            anyOf: prefixItems,
        };
        if (rest) {
            json.items.anyOf.push(rest);
        }
        json.minItems = prefixItems.length;
        if (!rest) {
            json.maxItems = prefixItems.length;
        }
    }
    else {
        json.items = prefixItems;
        if (rest) {
            json.additionalItems = rest;
        }
    }
    // length
    const { minimum, maximum } = schema._zod.bag;
    if (typeof minimum === "number")
        json.minItems = minimum;
    if (typeof maximum === "number")
        json.maxItems = maximum;
};
const recordProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    json.type = "object";
    // For looseRecord with regex patterns, use patternProperties
    // This correctly represents "only validate keys matching the pattern" semantics
    // and composes well with allOf (intersections)
    const keyType = def.keyType;
    const keyBag = keyType._zod.bag;
    const patterns = keyBag?.patterns;
    if (def.mode === "loose" && patterns && patterns.size > 0) {
        // Use patternProperties for looseRecord with regex patterns
        const valueSchema = process(def.valueType, ctx, {
            ...params,
            path: [...params.path, "patternProperties", "*"],
        });
        json.patternProperties = {};
        for (const pattern of patterns) {
            json.patternProperties[pattern.source] = valueSchema;
        }
    }
    else {
        // Default behavior: use propertyNames + additionalProperties
        if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
            json.propertyNames = process(def.keyType, ctx, {
                ...params,
                path: [...params.path, "propertyNames"],
            });
        }
        json.additionalProperties = process(def.valueType, ctx, {
            ...params,
            path: [...params.path, "additionalProperties"],
        });
    }
    // Add required for keys with discrete values (enum, literal, etc.)
    const keyValues = keyType._zod.values;
    if (keyValues) {
        const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
        if (validKeyValues.length > 0) {
            json.required = validKeyValues;
        }
    }
};
const nullableProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    const inner = process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    if (ctx.target === "openapi-3.0") {
        seen.ref = def.innerType;
        json.nullable = true;
    }
    else {
        json.anyOf = [inner, { type: "null" }];
    }
};
const nonoptionalProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
};
const defaultProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    json.default = JSON.parse(JSON.stringify(def.defaultValue));
};
const prefaultProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    if (ctx.io === "input")
        json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
};
const catchProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    let catchValue;
    try {
        catchValue = def.catchValue(undefined);
    }
    catch {
        throw new Error("Dynamic catch values are not supported in JSON Schema");
    }
    json.default = catchValue;
};
const pipeProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    const inIsTransform = def.in._zod.traits.has("$ZodTransform");
    const innerType = ctx.io === "input" ? (inIsTransform ? def.out : def.in) : def.out;
    process(innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = innerType;
};
const readonlyProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    json.readOnly = true;
};
const optionalProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
};
const lazyProcessor = (schema, ctx, _json, params) => {
    const innerType = schema._zod.innerType;
    process(innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = innerType;
};

const ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
    $ZodISODateTime.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function datetime(params) {
    return _isoDateTime(ZodISODateTime, params);
}
const ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
    $ZodISODate.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function date(params) {
    return _isoDate(ZodISODate, params);
}
const ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
    $ZodISOTime.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function time(params) {
    return _isoTime(ZodISOTime, params);
}
const ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
    $ZodISODuration.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function duration(params) {
    return _isoDuration(ZodISODuration, params);
}

const initializer = (inst, issues) => {
    $ZodError.init(inst, issues);
    inst.name = "ZodError";
    Object.defineProperties(inst, {
        format: {
            value: (mapper) => formatError(inst, mapper),
            // enumerable: false,
        },
        flatten: {
            value: (mapper) => flattenError(inst, mapper),
            // enumerable: false,
        },
        addIssue: {
            value: (issue) => {
                inst.issues.push(issue);
                inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
            },
            // enumerable: false,
        },
        addIssues: {
            value: (issues) => {
                inst.issues.push(...issues);
                inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
            },
            // enumerable: false,
        },
        isEmpty: {
            get() {
                return inst.issues.length === 0;
            },
            // enumerable: false,
        },
    });
    // Object.defineProperty(inst, "isEmpty", {
    //   get() {
    //     return inst.issues.length === 0;
    //   },
    // });
};
const ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, {
    Parent: Error,
});
// /** @deprecated Use `z.core.$ZodErrorMapCtx` instead. */
// export type ErrorMapCtx = core.$ZodErrorMapCtx;

const parse = /* @__PURE__ */ _parse(ZodRealError);
const parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
const safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
const safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
// Codec functions
const encode = /* @__PURE__ */ _encode(ZodRealError);
const decode = /* @__PURE__ */ _decode(ZodRealError);
const encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
const decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
const safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
const safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
const safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
const safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);

const _installedGroups = /* @__PURE__ */ new WeakMap();
function _installLazyMethods(inst, group, methods) {
  const proto = Object.getPrototypeOf(inst);
  let installed = _installedGroups.get(proto);
  if (!installed) {
    installed = /* @__PURE__ */ new Set();
    _installedGroups.set(proto, installed);
  }
  if (installed.has(group))
    return;
  installed.add(group);
  for (const key in methods) {
    const fn = methods[key];
    Object.defineProperty(proto, key, {
      configurable: true,
      enumerable: false,
      get() {
        const bound = fn.bind(this);
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: bound
        });
        return bound;
      },
      set(v) {
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: v
        });
      }
    });
  }
}
const ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
  $ZodType.init(inst, def);
  Object.assign(inst["~standard"], {
    jsonSchema: {
      input: createStandardJSONSchemaMethod(inst, "input"),
      output: createStandardJSONSchemaMethod(inst, "output")
    }
  });
  inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
  inst.def = def;
  inst.type = def.type;
  Object.defineProperty(inst, "_def", { value: def });
  inst.parse = (data, params) => parse(inst, data, params, { callee: inst.parse });
  inst.safeParse = (data, params) => safeParse(inst, data, params);
  inst.parseAsync = async (data, params) => parseAsync(inst, data, params, { callee: inst.parseAsync });
  inst.safeParseAsync = async (data, params) => safeParseAsync(inst, data, params);
  inst.spa = inst.safeParseAsync;
  inst.encode = (data, params) => encode(inst, data, params);
  inst.decode = (data, params) => decode(inst, data, params);
  inst.encodeAsync = async (data, params) => encodeAsync(inst, data, params);
  inst.decodeAsync = async (data, params) => decodeAsync(inst, data, params);
  inst.safeEncode = (data, params) => safeEncode(inst, data, params);
  inst.safeDecode = (data, params) => safeDecode(inst, data, params);
  inst.safeEncodeAsync = async (data, params) => safeEncodeAsync(inst, data, params);
  inst.safeDecodeAsync = async (data, params) => safeDecodeAsync(inst, data, params);
  _installLazyMethods(inst, "ZodType", {
    check(...chks) {
      const def2 = this.def;
      return this.clone(mergeDefs(def2, {
        checks: [
          ...def2.checks ?? [],
          ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
        ]
      }), { parent: true });
    },
    with(...chks) {
      return this.check(...chks);
    },
    clone(def2, params) {
      return clone(this, def2, params);
    },
    brand() {
      return this;
    },
    register(reg, meta2) {
      reg.add(this, meta2);
      return this;
    },
    refine(check2, params) {
      return this.check(refine(check2, params));
    },
    superRefine(refinement, params) {
      return this.check(superRefine(refinement, params));
    },
    overwrite(fn) {
      return this.check(_overwrite(fn));
    },
    optional() {
      return optional(this);
    },
    exactOptional() {
      return exactOptional(this);
    },
    nullable() {
      return nullable(this);
    },
    nullish() {
      return optional(nullable(this));
    },
    nonoptional(params) {
      return nonoptional(this, params);
    },
    array() {
      return array(this);
    },
    or(arg) {
      return union([this, arg]);
    },
    and(arg) {
      return intersection(this, arg);
    },
    transform(tx) {
      return pipe(this, transform(tx));
    },
    default(d) {
      return _default(this, d);
    },
    prefault(d) {
      return prefault(this, d);
    },
    catch(params) {
      return _catch(this, params);
    },
    pipe(target) {
      return pipe(this, target);
    },
    readonly() {
      return readonly(this);
    },
    describe(description) {
      const cl = this.clone();
      globalRegistry.add(cl, { description });
      return cl;
    },
    meta(...args) {
      if (args.length === 0)
        return globalRegistry.get(this);
      const cl = this.clone();
      globalRegistry.add(cl, args[0]);
      return cl;
    },
    isOptional() {
      return this.safeParse(void 0).success;
    },
    isNullable() {
      return this.safeParse(null).success;
    },
    apply(fn) {
      return fn(this);
    }
  });
  Object.defineProperty(inst, "description", {
    get() {
      return globalRegistry.get(inst)?.description;
    },
    configurable: true
  });
  return inst;
});
const _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => stringProcessor(inst, ctx, json2);
  const bag = inst._zod.bag;
  inst.format = bag.format ?? null;
  inst.minLength = bag.minimum ?? null;
  inst.maxLength = bag.maximum ?? null;
  _installLazyMethods(inst, "_ZodString", {
    regex(...args) {
      return this.check(_regex(...args));
    },
    includes(...args) {
      return this.check(_includes(...args));
    },
    startsWith(...args) {
      return this.check(_startsWith(...args));
    },
    endsWith(...args) {
      return this.check(_endsWith(...args));
    },
    min(...args) {
      return this.check(_minLength(...args));
    },
    max(...args) {
      return this.check(_maxLength(...args));
    },
    length(...args) {
      return this.check(_length(...args));
    },
    nonempty(...args) {
      return this.check(_minLength(1, ...args));
    },
    lowercase(params) {
      return this.check(_lowercase(params));
    },
    uppercase(params) {
      return this.check(_uppercase(params));
    },
    trim() {
      return this.check(_trim());
    },
    normalize(...args) {
      return this.check(_normalize(...args));
    },
    toLowerCase() {
      return this.check(_toLowerCase());
    },
    toUpperCase() {
      return this.check(_toUpperCase());
    },
    slugify() {
      return this.check(_slugify());
    }
  });
});
const ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  _ZodString.init(inst, def);
  inst.email = (params) => inst.check(_email(ZodEmail, params));
  inst.url = (params) => inst.check(_url(ZodURL, params));
  inst.jwt = (params) => inst.check(_jwt(ZodJWT, params));
  inst.emoji = (params) => inst.check(_emoji(ZodEmoji, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.uuid = (params) => inst.check(_uuid(ZodUUID, params));
  inst.uuidv4 = (params) => inst.check(_uuidv4(ZodUUID, params));
  inst.uuidv6 = (params) => inst.check(_uuidv6(ZodUUID, params));
  inst.uuidv7 = (params) => inst.check(_uuidv7(ZodUUID, params));
  inst.nanoid = (params) => inst.check(_nanoid(ZodNanoID, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.cuid = (params) => inst.check(_cuid(ZodCUID, params));
  inst.cuid2 = (params) => inst.check(_cuid2(ZodCUID2, params));
  inst.ulid = (params) => inst.check(_ulid(ZodULID, params));
  inst.base64 = (params) => inst.check(_base64(ZodBase64, params));
  inst.base64url = (params) => inst.check(_base64url(ZodBase64URL, params));
  inst.xid = (params) => inst.check(_xid(ZodXID, params));
  inst.ksuid = (params) => inst.check(_ksuid(ZodKSUID, params));
  inst.ipv4 = (params) => inst.check(_ipv4(ZodIPv4, params));
  inst.ipv6 = (params) => inst.check(_ipv6(ZodIPv6, params));
  inst.cidrv4 = (params) => inst.check(_cidrv4(ZodCIDRv4, params));
  inst.cidrv6 = (params) => inst.check(_cidrv6(ZodCIDRv6, params));
  inst.e164 = (params) => inst.check(_e164(ZodE164, params));
  inst.datetime = (params) => inst.check(datetime(params));
  inst.date = (params) => inst.check(date(params));
  inst.time = (params) => inst.check(time(params));
  inst.duration = (params) => inst.check(duration(params));
});
function string(params) {
  return _string(ZodString, params);
}
const ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  _ZodString.init(inst, def);
});
const ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
  $ZodEmail.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
  $ZodGUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
  $ZodUUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
  $ZodURL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
  $ZodEmoji.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
  $ZodNanoID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
  $ZodCUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
  $ZodCUID2.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
  $ZodULID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
  $ZodXID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
  $ZodKSUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
  $ZodIPv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
  $ZodIPv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
  $ZodCIDRv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
  $ZodCIDRv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
  $ZodBase64.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
  $ZodBase64URL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
  $ZodE164.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
  $ZodJWT.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodNumber = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => numberProcessor(inst, ctx, json2);
  _installLazyMethods(inst, "ZodNumber", {
    gt(value, params) {
      return this.check(_gt(value, params));
    },
    gte(value, params) {
      return this.check(_gte(value, params));
    },
    min(value, params) {
      return this.check(_gte(value, params));
    },
    lt(value, params) {
      return this.check(_lt(value, params));
    },
    lte(value, params) {
      return this.check(_lte(value, params));
    },
    max(value, params) {
      return this.check(_lte(value, params));
    },
    int(params) {
      return this.check(int(params));
    },
    safe(params) {
      return this.check(int(params));
    },
    positive(params) {
      return this.check(_gt(0, params));
    },
    nonnegative(params) {
      return this.check(_gte(0, params));
    },
    negative(params) {
      return this.check(_lt(0, params));
    },
    nonpositive(params) {
      return this.check(_lte(0, params));
    },
    multipleOf(value, params) {
      return this.check(_multipleOf(value, params));
    },
    step(value, params) {
      return this.check(_multipleOf(value, params));
    },
    finite() {
      return this;
    }
  });
  const bag = inst._zod.bag;
  inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
  inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
  inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
  inst.isFinite = true;
  inst.format = bag.format ?? null;
});
function number(params) {
  return _number(ZodNumber, params);
}
const ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodNumber.init(inst, def);
});
function int(params) {
  return _int(ZodNumberFormat, params);
}
const ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => booleanProcessor(inst, ctx, json2);
});
function boolean(params) {
  return _boolean(ZodBoolean, params);
}
const ZodAny = /* @__PURE__ */ $constructor("ZodAny", (inst, def) => {
  $ZodAny.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => anyProcessor();
});
function any() {
  return _any(ZodAny);
}
const ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => unknownProcessor();
});
function unknown() {
  return _unknown(ZodUnknown);
}
const ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => neverProcessor(inst, ctx, json2);
});
function never(params) {
  return _never(ZodNever, params);
}
const ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => arrayProcessor(inst, ctx, json2, params);
  inst.element = def.element;
  _installLazyMethods(inst, "ZodArray", {
    min(n, params) {
      return this.check(_minLength(n, params));
    },
    nonempty(params) {
      return this.check(_minLength(1, params));
    },
    max(n, params) {
      return this.check(_maxLength(n, params));
    },
    length(n, params) {
      return this.check(_length(n, params));
    },
    unwrap() {
      return this.element;
    }
  });
});
function array(element, params) {
  return _array(ZodArray, element, params);
}
const ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
  $ZodObjectJIT.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => objectProcessor(inst, ctx, json2, params);
  defineLazy(inst, "shape", () => {
    return def.shape;
  });
  _installLazyMethods(inst, "ZodObject", {
    keyof() {
      return _enum(Object.keys(this._zod.def.shape));
    },
    catchall(catchall) {
      return this.clone({ ...this._zod.def, catchall });
    },
    passthrough() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    loose() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    strict() {
      return this.clone({ ...this._zod.def, catchall: never() });
    },
    strip() {
      return this.clone({ ...this._zod.def, catchall: void 0 });
    },
    extend(incoming) {
      return extend(this, incoming);
    },
    safeExtend(incoming) {
      return safeExtend(this, incoming);
    },
    merge(other) {
      return merge(this, other);
    },
    pick(mask) {
      return pick(this, mask);
    },
    omit(mask) {
      return omit(this, mask);
    },
    partial(...args) {
      return partial(ZodOptional, this, args[0]);
    },
    required(...args) {
      return required(ZodNonOptional, this, args[0]);
    }
  });
});
function object(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...normalizeParams(params)
  };
  return new ZodObject(def);
}
const ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => unionProcessor(inst, ctx, json2, params);
  inst.options = def.options;
});
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...normalizeParams(params)
  });
}
const ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
  $ZodIntersection.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => intersectionProcessor(inst, ctx, json2, params);
});
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right
  });
}
const ZodTuple = /* @__PURE__ */ $constructor("ZodTuple", (inst, def) => {
  $ZodTuple.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => tupleProcessor(inst, ctx, json2, params);
  inst.rest = (rest) => inst.clone({
    ...inst._zod.def,
    rest
  });
});
function tuple(items, _paramsOrRest, _params) {
  const hasRest = _paramsOrRest instanceof $ZodType;
  const params = hasRest ? _params : _paramsOrRest;
  const rest = hasRest ? _paramsOrRest : null;
  return new ZodTuple({
    type: "tuple",
    items,
    rest,
    ...normalizeParams(params)
  });
}
const ZodRecord = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
  $ZodRecord.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => recordProcessor(inst, ctx, json2, params);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
  if (!valueType || !valueType._zod) {
    return new ZodRecord({
      type: "record",
      keyType: string(),
      valueType: keyType,
      ...normalizeParams(valueType)
    });
  }
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
function partialRecord(keyType, valueType, params) {
  const k = clone(keyType);
  k._zod.values = void 0;
  return new ZodRecord({
    type: "record",
    keyType: k,
    valueType,
    ...normalizeParams(params)
  });
}
const ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => enumProcessor(inst, ctx, json2);
  inst.enum = def.entries;
  inst.options = Object.values(def.entries);
  const keys = new Set(Object.keys(def.entries));
  inst.extract = (values, params) => {
    const newEntries = {};
    for (const value of values) {
      if (keys.has(value)) {
        newEntries[value] = def.entries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...normalizeParams(params),
      entries: newEntries
    });
  };
  inst.exclude = (values, params) => {
    const newEntries = { ...def.entries };
    for (const value of values) {
      if (keys.has(value)) {
        delete newEntries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...normalizeParams(params),
      entries: newEntries
    });
  };
});
function _enum(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodEnum({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
const ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => literalProcessor(inst, ctx, json2);
  inst.values = new Set(def.values);
  Object.defineProperty(inst, "value", {
    get() {
      if (def.values.length > 1) {
        throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
      }
      return def.values[0];
    }
  });
});
function literal(value, params) {
  return new ZodLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...normalizeParams(params)
  });
}
const ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
  $ZodTransform.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => transformProcessor(inst, ctx);
  inst._zod.parse = (payload, _ctx) => {
    if (_ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    payload.addIssue = (issue$1) => {
      if (typeof issue$1 === "string") {
        payload.issues.push(issue(issue$1, payload.value, def));
      } else {
        const _issue = issue$1;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = inst);
        payload.issues.push(issue(_issue));
      }
    };
    const output = def.transform(payload.value, payload);
    if (output instanceof Promise) {
      return output.then((output2) => {
        payload.value = output2;
        payload.fallback = true;
        return payload;
      });
    }
    payload.value = output;
    payload.fallback = true;
    return payload;
  };
});
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
const ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => optionalProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType
  });
}
const ZodExactOptional = /* @__PURE__ */ $constructor("ZodExactOptional", (inst, def) => {
  $ZodExactOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => optionalProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
  return new ZodExactOptional({
    type: "optional",
    innerType
  });
}
const ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => nullableProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType
  });
}
const ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
  $ZodDefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => defaultProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
const ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
  $ZodPrefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => prefaultProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
const ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
  $ZodNonOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => nonoptionalProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...normalizeParams(params)
  });
}
const ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => catchProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
const ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
  $ZodPipe.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => pipeProcessor(inst, ctx, json2, params);
  inst.in = def.in;
  inst.out = def.out;
});
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
    // ...util.normalizeParams(params),
  });
}
const ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => readonlyProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType
  });
}
const ZodLazy = /* @__PURE__ */ $constructor("ZodLazy", (inst, def) => {
  $ZodLazy.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => lazyProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.getter();
});
function lazy(getter) {
  return new ZodLazy({
    type: "lazy",
    getter
  });
}
const ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => customProcessor(inst, ctx);
});
function custom(fn, _params) {
  return _custom(ZodCustom, fn ?? (() => true), _params);
}
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
  return _superRefine(fn, params);
}

function defineSchema$1(create) {
    return create();
}
const numberStringSchema$2 = /* @__PURE__ */ defineSchema$1(() => custom(isNumberString, 'Expected a number string'));
const percentageStringSchema$1 = /* @__PURE__ */ defineSchema$1(() => custom(isPercentageString, 'Expected a percentage string'));
const pixelLengthStringSchema$1 = /* @__PURE__ */ defineSchema$1(() => custom(isPixelLengthString, 'Expected a pixel length string'));
const viewportLengthStringSchema$1 = /* @__PURE__ */ defineSchema$1(() => custom(isViewportLengthString, 'Expected a viewport length string'));
const numberValueSchema$1 = /* @__PURE__ */ defineSchema$1(() => union([number(), numberStringSchema$2]));
const absoluteLengthValueSchema$1 = /* @__PURE__ */ defineSchema$1(() => union([numberValueSchema$1, pixelLengthStringSchema$1]));
const yogaLengthValueSchema = /* @__PURE__ */ defineSchema$1(() => union([numberValueSchema$1, pixelLengthStringSchema$1, percentageStringSchema$1, viewportLengthStringSchema$1]));
const yogaLengthValueOrAutoSchema = /* @__PURE__ */ defineSchema$1(() => union([yogaLengthValueSchema, literal('auto')]));
const yogaPropertyShape = /* @__PURE__ */ defineSchema$1(() => ({
    positionType: _enum(['static', 'relative', 'absolute']).optional(),
    positionTop: yogaLengthValueOrAutoSchema.optional(),
    positionLeft: yogaLengthValueOrAutoSchema.optional(),
    positionRight: yogaLengthValueOrAutoSchema.optional(),
    positionBottom: yogaLengthValueOrAutoSchema.optional(),
    alignContent: _enum([
        'auto',
        'flex-start',
        'center',
        'flex-end',
        'stretch',
        'baseline',
        'space-between',
        'space-around',
        'space-evenly',
    ]).optional(),
    alignItems: _enum([
        'auto',
        'flex-start',
        'center',
        'flex-end',
        'stretch',
        'baseline',
        'space-between',
        'space-around',
        'space-evenly',
    ]).optional(),
    alignSelf: _enum([
        'auto',
        'flex-start',
        'center',
        'flex-end',
        'stretch',
        'baseline',
        'space-between',
        'space-around',
        'space-evenly',
    ]).optional(),
    flexDirection: _enum(['column', 'column-reverse', 'row', 'row-reverse']).optional(),
    flexWrap: _enum(['no-wrap', 'wrap', 'wrap-reverse']).optional(),
    justifyContent: _enum([
        'flex-start',
        'center',
        'flex-end',
        'space-between',
        'space-around',
        'space-evenly',
    ]).optional(),
    marginTop: yogaLengthValueOrAutoSchema.optional(),
    marginLeft: yogaLengthValueOrAutoSchema.optional(),
    marginRight: yogaLengthValueOrAutoSchema.optional(),
    marginBottom: yogaLengthValueOrAutoSchema.optional(),
    flexBasis: yogaLengthValueOrAutoSchema.optional(),
    flexGrow: numberValueSchema$1.optional(),
    flexShrink: numberValueSchema$1.optional(),
    width: yogaLengthValueOrAutoSchema.optional(),
    height: yogaLengthValueOrAutoSchema.optional(),
    minWidth: yogaLengthValueSchema.optional(),
    minHeight: yogaLengthValueSchema.optional(),
    maxWidth: yogaLengthValueSchema.optional(),
    maxHeight: yogaLengthValueSchema.optional(),
    boxSizing: numberValueSchema$1.optional(),
    aspectRatio: numberValueSchema$1.optional(),
    borderTopWidth: absoluteLengthValueSchema$1.optional(),
    borderLeftWidth: absoluteLengthValueSchema$1.optional(),
    borderRightWidth: absoluteLengthValueSchema$1.optional(),
    borderBottomWidth: absoluteLengthValueSchema$1.optional(),
    overflow: _enum(['visible', 'hidden', 'scroll']).optional(),
    display: _enum(['flex', 'none', 'contents']).optional(),
    paddingTop: yogaLengthValueSchema.optional(),
    paddingLeft: yogaLengthValueSchema.optional(),
    paddingRight: yogaLengthValueSchema.optional(),
    paddingBottom: yogaLengthValueSchema.optional(),
    gapRow: yogaLengthValueSchema.optional(),
    gapColumn: yogaLengthValueSchema.optional(),
    direction: numberValueSchema$1.optional(),
}));

const {TextureLoader: TextureLoader$1} = await importShared('three');
const fontCache = new Map();
const textureLoader$1 = new TextureLoader$1();
function loadCachedFont(fontInfoOrUrl, onLoad) {
    let entry = fontCache.get(fontInfoOrUrl);
    if (entry instanceof Set) {
        entry.add(onLoad);
        return;
    }
    if (entry != null) {
        onLoad(entry);
        return;
    }
    const set = new Set();
    set.add(onLoad);
    fontCache.set(fontInfoOrUrl, set);
    loadFont(fontInfoOrUrl)
        .then((font) => {
        for (const fn of set) {
            fn(font);
        }
        fontCache.set(fontInfoOrUrl, font);
    })
        .catch(console.error);
}
async function loadFont(fontInfoOrUrl) {
    const resolvedFontInfoOrUrl = await resolveFontInfoSource(fontInfoOrUrl);
    const info = typeof resolvedFontInfoOrUrl === 'object'
        ? resolvedFontInfoOrUrl
        : await (await fetch(resolvedFontInfoOrUrl)).json();
    if (info.pages.length !== 1) {
        throw new Error('only supporting exactly 1 page');
    }
    const page = await textureLoader$1.loadAsync(new URL(info.pages[0], typeof resolvedFontInfoOrUrl === 'string' ? new URL(resolvedFontInfoOrUrl, window.location.href) : undefined).href);
    page.flipY = false;
    return new Font(info, page);
}
function resolveFontInfoSource(fontInfoOrUrl) {
    return typeof fontInfoOrUrl === 'function' ? fontInfoOrUrl() : fontInfoOrUrl;
}

const fontWeightNames = {
    thin: 100,
    'extra-light': 200,
    light: 300,
    normal: 400,
    medium: 500,
    'semi-bold': 600,
    bold: 700,
    'extra-bold': 800,
    black: 900,
    'extra-black': 950,
};
const numberStringSchema$1 = /* @__PURE__ */ defineSchema(() => custom(isNumberString, 'Expected a number string'));
const namedFontWeightSchema = /* @__PURE__ */ defineSchema(() => _enum(Object.keys(fontWeightNames)));
const fontWeightKeySchema = /* @__PURE__ */ defineSchema(() => union([namedFontWeightSchema, numberStringSchema$1]));
const FontWeightSchema = /* @__PURE__ */ defineSchema(() => union([number(), namedFontWeightSchema, numberStringSchema$1]));
const fontFamilyWeightMapEntrySchema = /* @__PURE__ */ defineSchema(() => any());
const FontFamilyWeightMapSchema = /* @__PURE__ */ defineSchema(() => partialRecord(fontWeightKeySchema, fontFamilyWeightMapEntrySchema));
const FontFamiliesSchema = /* @__PURE__ */ defineSchema(() => record(string(), FontFamilyWeightMapSchema));
const defaultFontFamiles = {
    inter: {
        light: () => __vitePreload(async () => { const {inter} = await import('./inter-CWDahd6k.js');return { inter }},true              ?[]:void 0).then(({ inter }) => inter.light),
        medium: () => __vitePreload(async () => { const {inter} = await import('./inter-CWDahd6k.js');return { inter }},true              ?[]:void 0).then(({ inter }) => inter.medium),
        'semi-bold': () => __vitePreload(async () => { const {inter} = await import('./inter-CWDahd6k.js');return { inter }},true              ?[]:void 0).then(({ inter }) => inter['semi-bold']),
        bold: () => __vitePreload(async () => { const {inter} = await import('./inter-CWDahd6k.js');return { inter }},true              ?[]:void 0).then(({ inter }) => inter.bold),
    },
};
function computedFontFamilies(properties, parent) {
    return g(() => {
        const currentFontFamilies = properties.value.fontFamilies;
        const inheritedFontFamilies = parent.value?.fontFamilies.value;
        if (inheritedFontFamilies == null) {
            return currentFontFamilies;
        }
        if (currentFontFamilies == null) {
            return inheritedFontFamilies;
        }
        return {
            ...inheritedFontFamilies,
            ...currentFontFamilies,
        };
    });
}
function computedFont(properties, fontFamiliesSignal) {
    const result = y(undefined);
    j(() => {
        if (!properties.enabled.value) {
            return;
        }
        let fontWeight = properties.value.fontWeight;
        if (typeof fontWeight === 'string') {
            fontWeight = parseFloat(fontWeight);
            if (isNaN(fontWeight)) {
                fontWeight = properties.value.fontWeight;
                if (!(fontWeight in fontWeightNames)) {
                    throw new Error(`unknown font weight "${fontWeight}"`);
                }
                fontWeight = fontWeightNames[fontWeight];
            }
        }
        let fontFamily = properties.value.fontFamily;
        const fontFamilies = fontFamiliesSignal.value ?? defaultFontFamiles;
        fontFamily ??= Object.keys(fontFamilies)[0];
        let fontFamilyWeightMap = fontFamilies[fontFamily];
        if (fontFamilyWeightMap == null) {
            const availableFontFamilyList = Object.keys(fontFamilies);
            fontFamilyWeightMap = fontFamilies[availableFontFamilyList[0]];
            console.error(`unknown font family "${fontFamily}". Available font families are ${availableFontFamilyList.map((name) => `"${name}"`).join(', ')}. Falling back to "${availableFontFamilyList[0]}".`);
        }
        const url = getMatchingFontUrl(fontFamilyWeightMap, fontWeight);
        let aborted = false;
        loadCachedFont(url, (font) => !aborted && (result.value = font));
        return () => (aborted = true);
    });
    return result;
}
function getMatchingFontUrl(fontFamily, weight) {
    let distance = Infinity;
    let result;
    for (const fontWeight of Object.keys(fontFamily)) {
        const d = Math.abs(weight - getWeightNumber(fontWeight));
        if (d === 0) {
            return fontFamily[fontWeight];
        }
        if (d < distance) {
            distance = d;
            result = fontFamily[fontWeight];
        }
    }
    if (result == null) {
        throw new Error(`font family has no entries ${fontFamily}`);
    }
    return result;
}
function getWeightNumber(value) {
    if (value in fontWeightNames) {
        return fontWeightNames[value];
    }
    const number = parseFloat(value);
    if (isNaN(number)) {
        throw new Error(`invalid font weight "${value}"`);
    }
    return number;
}
const MISSING_GLYPH = {
    id: -1,
    index: 0,
    char: '',
    chnl: 0,
    page: 0,
    x: 0,
    y: 0,
    width: 0.5,
    height: 0.5,
    xadvance: 0.6,
    xoffset: 0,
    yoffset: 0.3,
    uvX: 0,
    uvY: 0,
    uvWidth: 0,
    uvHeight: 0,
    renderSolid: true,
};
class Font {
    page;
    glyphInfoMap = new Map();
    kerningMap = new Map();
    //needed in the shader:
    pageWidth;
    pageHeight;
    distanceRange;
    constructor(info, page) {
        this.page = page;
        const { scaleW, scaleH, lineHeight } = info.common;
        const { size } = info.info;
        this.pageWidth = scaleW;
        this.pageHeight = scaleH;
        this.distanceRange = info.distanceField.distanceRange;
        for (const glyph of info.chars) {
            const normalizedGlyph = {
                ...glyph,
                uvX: glyph.x / scaleW,
                uvY: glyph.y / scaleH,
                uvWidth: glyph.width / scaleW,
                uvHeight: glyph.height / scaleH,
                width: glyph.width / size,
                height: glyph.height / size,
                xadvance: glyph.xadvance / size,
                xoffset: glyph.xoffset / size,
                yoffset: (glyph.yoffset - (lineHeight - size)) / size,
            };
            this.glyphInfoMap.set(normalizedGlyph.char, normalizedGlyph);
        }
        for (const { first, second, amount } of info.kernings) {
            this.kerningMap.set(`${first}/${second}`, amount / size);
        }
    }
    getGlyphInfo(char) {
        const glyph = this.glyphInfoMap.get(char);
        if (glyph)
            return glyph;
        if (char === '\n') {
            const space = this.glyphInfoMap.get(' ');
            if (space)
                return space;
        }
        console.warn(`Missing glyph info for character "${char}"`);
        return MISSING_GLYPH;
    }
    getKerning(firstId, secondId) {
        return this.kerningMap.get(`${firstId}/${secondId}`) ?? 0;
    }
}
function glyphIntoToUV(info, target, offset) {
    target[offset + 0] = info.uvX;
    target[offset + 1] = info.uvY + info.uvHeight;
    target[offset + 2] = info.uvWidth;
    target[offset + 3] = -info.uvHeight;
}

const {Color: Color$1} = await importShared('three');
function defineSchema(create) {
    return create();
}
const conditionals = [
    'dark',
    'hover',
    'active',
    'focus',
    'placeholderStyle',
    'important',
    'sm',
    'md',
    'lg',
    'xl',
    '2xl',
];
const isReadonlySignal = (value) => value instanceof l ||
    (value != null &&
        typeof value === 'object' &&
        'value' in value &&
        ('peek' in value || 'subscribe' in value || 'notify' in value));
const signalSchema = /* @__PURE__ */ defineSchema(() => custom(isReadonlySignal, 'Expected a signal-like object'));
const functionSchema = /* @__PURE__ */ defineSchema(() => custom((value) => typeof value === 'function', 'Expected a function'));
const constructorSchema = /* @__PURE__ */ defineSchema(() => custom((value) => typeof value === 'function', 'Expected a constructor'));
const instanceSchema = (name, ctor) => custom((value) => value instanceof ctor, `Expected ${name}`);
const numberStringSchema = /* @__PURE__ */ defineSchema(() => custom(isNumberString, 'Expected a number string'));
const percentageStringSchema = /* @__PURE__ */ defineSchema(() => custom(isPercentageString, 'Expected a percentage string'));
const pixelLengthStringSchema = /* @__PURE__ */ defineSchema(() => custom(isPixelLengthString, 'Expected a pixel length string'));
const viewportLengthStringSchema = /* @__PURE__ */ defineSchema(() => custom(isViewportLengthString, 'Expected a viewport length string'));
const numberValueSchema = /* @__PURE__ */ defineSchema(() => union([number(), numberStringSchema]));
const absoluteLengthValueSchema = /* @__PURE__ */ defineSchema(() => union([numberValueSchema, pixelLengthStringSchema]));
const lengthValueSchema = /* @__PURE__ */ defineSchema(() => union([absoluteLengthValueSchema, percentageStringSchema, viewportLengthStringSchema]));
const numberOrPercentageValueSchema = /* @__PURE__ */ defineSchema(() => union([numberValueSchema, percentageStringSchema]));
const colorTupleSchema = /* @__PURE__ */ defineSchema(() => union([tuple([number(), number(), number()]), tuple([number(), number(), number(), number()])]));
const colorValueSchema = /* @__PURE__ */ defineSchema(() => union([string(), number(), colorTupleSchema, instanceSchema('Color', Color$1)]));
const materialClassSchema = /* @__PURE__ */ defineSchema(() => union([_enum(['glass', 'metal', 'plastic']), constructorSchema]));
function propertyValueSchema(schema) {
    return union([schema, signalSchema, literal('initial')]);
}
function createInPropertiesSchema(outSchema) {
    const outShape = outSchema.shape;
    const shape = {};
    const valueSchemas = new Map();
    for (const [key, schema] of Object.entries(outShape)) {
        const valueSchema = propertyValueSchema(schema);
        valueSchemas.set(key, valueSchema);
        shape[key] = valueSchema.optional();
    }
    for (const [alias, targets] of Object.entries(allAliases)) {
        const targetSchema = targets
            .map((target) => valueSchemas.get(target))
            .find((schema) => schema != null);
        if (targetSchema != null) {
            shape[alias] = targetSchema.optional();
        }
    }
    let result;
    result = lazy(() => {
        const recursiveShape = { ...shape, '*': result.optional() };
        for (const key of conditionals) {
            recursiveShape[key] = result.optional();
        }
        return object(recursiveShape).strict();
    });
    return result;
}
const eventHandlerShape = /* @__PURE__ */ defineSchema(() => ({
    onClick: functionSchema.optional(),
    onContextMenu: functionSchema.optional(),
    onDblClick: functionSchema.optional(),
    onWheel: functionSchema.optional(),
    onPointerUp: functionSchema.optional(),
    onPointerDown: functionSchema.optional(),
    onPointerOver: functionSchema.optional(),
    onPointerOut: functionSchema.optional(),
    onPointerEnter: functionSchema.optional(),
    onPointerLeave: functionSchema.optional(),
    onPointerMove: functionSchema.optional(),
    onPointerCancel: functionSchema.optional(),
}));
const panelShape = /* @__PURE__ */ defineSchema(() => ({
    borderTopLeftRadius: lengthValueSchema.optional(),
    borderTopRightRadius: lengthValueSchema.optional(),
    borderBottomLeftRadius: lengthValueSchema.optional(),
    borderBottomRightRadius: lengthValueSchema.optional(),
    backgroundColor: colorValueSchema.optional(),
    borderColor: colorValueSchema.optional(),
    borderBend: numberOrPercentageValueSchema.optional(),
}));
const scrollbarPanelShape = /* @__PURE__ */ defineSchema(() => ({
    scrollbarColor: colorValueSchema.optional(),
    scrollbarBorderRightWidth: absoluteLengthValueSchema.optional(),
    scrollbarBorderTopWidth: absoluteLengthValueSchema.optional(),
    scrollbarBorderLeftWidth: absoluteLengthValueSchema.optional(),
    scrollbarBorderBottomWidth: absoluteLengthValueSchema.optional(),
    scrollbarBorderTopLeftRadius: lengthValueSchema.optional(),
    scrollbarBorderTopRightRadius: lengthValueSchema.optional(),
    scrollbarBorderBottomLeftRadius: lengthValueSchema.optional(),
    scrollbarBorderBottomRightRadius: lengthValueSchema.optional(),
    scrollbarBorderColor: colorValueSchema.optional(),
    scrollbarBorderBend: numberOrPercentageValueSchema.optional(),
}));
const caretPanelShape = /* @__PURE__ */ defineSchema(() => ({
    caretColor: colorValueSchema.optional(),
    caretBorderRightWidth: absoluteLengthValueSchema.optional(),
    caretBorderTopWidth: absoluteLengthValueSchema.optional(),
    caretBorderLeftWidth: absoluteLengthValueSchema.optional(),
    caretBorderBottomWidth: absoluteLengthValueSchema.optional(),
    caretBorderTopLeftRadius: lengthValueSchema.optional(),
    caretBorderTopRightRadius: lengthValueSchema.optional(),
    caretBorderBottomLeftRadius: lengthValueSchema.optional(),
    caretBorderBottomRightRadius: lengthValueSchema.optional(),
    caretBorderColor: colorValueSchema.optional(),
    caretBorderBend: numberOrPercentageValueSchema.optional(),
}));
const selectionPanelShape = /* @__PURE__ */ defineSchema(() => ({
    selectionColor: colorValueSchema.optional(),
    selectionBorderRightWidth: absoluteLengthValueSchema.optional(),
    selectionBorderTopWidth: absoluteLengthValueSchema.optional(),
    selectionBorderLeftWidth: absoluteLengthValueSchema.optional(),
    selectionBorderBottomWidth: absoluteLengthValueSchema.optional(),
    selectionBorderTopLeftRadius: lengthValueSchema.optional(),
    selectionBorderTopRightRadius: lengthValueSchema.optional(),
    selectionBorderBottomLeftRadius: lengthValueSchema.optional(),
    selectionBorderBottomRightRadius: lengthValueSchema.optional(),
    selectionBorderColor: colorValueSchema.optional(),
    selectionBorderBend: numberOrPercentageValueSchema.optional(),
}));
const pointerEventsTypeFunctionSchema = /* @__PURE__ */ defineSchema(() => custom((value) => typeof value === 'function', 'Expected a pointer-events filter function'));
const baseOutPropertyShape = /* @__PURE__ */ defineSchema(() => ({
    ...yogaPropertyShape,
    ...panelShape,
    zIndex: numberValueSchema.optional(),
    zIndexOffset: numberValueSchema.optional(),
    transformTranslateX: lengthValueSchema.optional(),
    transformTranslateY: lengthValueSchema.optional(),
    transformTranslateZ: absoluteLengthValueSchema.optional(),
    transformRotateX: numberValueSchema.optional(),
    transformRotateY: numberValueSchema.optional(),
    transformRotateZ: numberValueSchema.optional(),
    transformScaleX: numberOrPercentageValueSchema.optional(),
    transformScaleY: numberOrPercentageValueSchema.optional(),
    transformScaleZ: numberOrPercentageValueSchema.optional(),
    transformOriginX: _enum(['left', 'center', 'middle', 'right']).optional(),
    transformOriginY: _enum(['top', 'center', 'middle', 'bottom']).optional(),
    scrollbarWidth: absoluteLengthValueSchema.optional(),
    scrollbarZIndex: numberValueSchema.optional(),
    ...scrollbarPanelShape,
    panelMaterialClass: materialClassSchema.optional(),
    receiveShadow: boolean().optional(),
    castShadow: boolean().optional(),
    depthWrite: boolean().optional(),
    depthTest: boolean().optional(),
    renderOrder: numberValueSchema.optional(),
    visibility: _enum(['visible', 'hidden']).optional(),
    pointerEvents: _enum(['none', 'auto', 'listener']).optional(),
    pointerEventsType: union([
        literal('all'),
        pointerEventsTypeFunctionSchema,
        object({ allow: union([string(), array(string())]) }).strict(),
        object({ deny: union([string(), array(string())]) }).strict(),
    ]).optional(),
    pointerEventsOrder: numberValueSchema.optional(),
    ...eventHandlerShape,
    onScroll: functionSchema.optional(),
    onHoverChange: functionSchema.optional(),
    onActiveChange: functionSchema.optional(),
    textAlign: _enum(['left', 'center', 'middle', 'right', 'justify']).optional(),
    fill: colorValueSchema.optional(),
    color: colorValueSchema.optional(),
    opacity: numberOrPercentageValueSchema.optional(),
    fontFamily: string().optional(),
    fontWeight: FontWeightSchema.optional(),
    fontFamilies: FontFamiliesSchema.optional(),
    letterSpacing: lengthValueSchema.optional(),
    lineHeight: lengthValueSchema.optional(),
    fontSize: lengthValueSchema.optional(),
    wordBreak: _enum(['keep-all', 'break-all', 'break-word']).optional(),
    whiteSpace: _enum(['normal', 'collapse', 'pre', 'pre-line']).optional(),
    tabSize: numberValueSchema.optional(),
    verticalAlign: _enum(['top', 'center', 'middle', 'bottom']).optional(),
    caretWidth: absoluteLengthValueSchema.optional(),
    ...caretPanelShape,
    ...selectionPanelShape,
    pixelSize: numberValueSchema.optional(),
    sizeX: absoluteLengthValueSchema.optional(),
    sizeY: absoluteLengthValueSchema.optional(),
    anchorX: _enum(['left', 'center', 'middle', 'right']).optional(),
    anchorY: _enum(['top', 'center', 'middle', 'bottom']).optional(),
    cursor: string().optional(),
    id: string().optional(),
}));
const baseOutPropertiesSchema = /* @__PURE__ */ defineSchema(() => object(baseOutPropertyShape).strict());

class PropertiesImplementation extends PropertiesImplementation$1 {
    conditionals;
    usedConditionals = {
        hover: y(false),
        active: y(false),
    };
    constructor(aliases, conditionals, defaults) {
        super((key, value, set) => {
            if (key in aliases) {
                const aliasList = aliases[key];
                for (const alias of aliasList) {
                    set(alias, value);
                }
                return;
            }
            set(key, value);
        }, defaults, () => {
            this.usedConditionals.active.value = hasConditional(this.propertiesLayers, 'active');
            this.usedConditionals.hover.value = hasConditional(this.propertiesLayers, 'hover');
        });
        this.conditionals = conditionals;
    }
    setLayersWithConditionals(layerInSectionIdentifier, properties) {
        n(() => {
            this.setLayer(getLayerIndex({ ...layerInSectionIdentifier, section: 'base' }), properties);
            for (const layerSection of SpecialLayerSections) {
                const layerIndex = getLayerIndex({ ...layerInSectionIdentifier, section: layerSection });
                if (properties == null || !(layerSection in properties)) {
                    this.setLayer(layerIndex, undefined);
                    continue;
                }
                const getConditional = layerSection != 'important' ? this.conditionals[layerSection] : undefined;
                let conditionalProperties = properties[layerSection];
                if (getConditional != null) {
                    conditionalProperties = Object.fromEntries(Object.entries(conditionalProperties).map(([key, value]) => [
                        key,
                        g(() => (getConditional() ? (value instanceof l ? value.value : value) : undefined)),
                    ]));
                }
                this.setLayer(layerIndex, conditionalProperties);
            }
        });
    }
}
function hasConditional(propertiesLayers, layerSection) {
    const layerSectionStart = getLayerIndex({ type: 'base', section: layerSection });
    for (const propertyLayerIndex of propertiesLayers.keys()) {
        if (layerSectionStart <= propertyLayerIndex && propertyLayerIndex < layerSectionStart + LayersSectionSize) {
            return true;
        }
    }
    return false;
}

const {Euler,Matrix4: Matrix4$6,Quaternion: Quaternion$2,Vector3: Vector3$5} = await importShared('three');
const tHelper = new Vector3$5();
const sHelper = new Vector3$5();
const originVector = new Vector3$5();
const matrixHelper = new Matrix4$6();
const eulerHelper = new Euler();
const quaternionHelper = new Quaternion$2();
const toRad = Math.PI / 180;
function toQuaternion([x, y, z]) {
    return quaternionHelper.setFromEuler(eulerHelper.set(x * toRad, y * toRad, z * toRad));
}
const defaultTransformOriginX = 'center';
const defaultTransformOriginY = 'center';
function computedTransformMatrix({ relativeCenter, size, properties, root, }) {
    //B * O^-1 * T * O
    //B = bound transformation matrix
    //O = matrix to transform the origin for matrix T
    //T = transform matrix (translate, rotate, scale)
    return g(() => {
        const relativeCenterValue = relativeCenter.value;
        if (relativeCenterValue == null) {
            return undefined;
        }
        const [x, y] = relativeCenterValue;
        const pixelSize = parseNumberValue(properties.value.pixelSize);
        const result = new Matrix4$6().makeTranslation(x * pixelSize, y * pixelSize, 0);
        let originCenter = true;
        const tOX = properties.value.transformOriginX ?? defaultTransformOriginX;
        const tOY = properties.value.transformOriginY ?? defaultTransformOriginY;
        if (tOX != 'center' || tOY != 'center') {
            const sizeValue = size.value;
            if (sizeValue == null) {
                return undefined;
            }
            const [width, height] = sizeValue;
            originCenter = false;
            originVector.set(-alignmentXMap[tOX] * width * pixelSize, -alignmentYMap[tOY] * height * pixelSize, 0);
            result.multiply(matrixHelper.makeTranslation(originVector));
            originVector.negate();
        }
        const tTX = properties.value.transformTranslateX ?? 0;
        const tTY = properties.value.transformTranslateY ?? 0;
        const tTZ = properties.value.transformTranslateZ ?? 0;
        const tRX = properties.value.transformRotateX ?? 0;
        const tRY = properties.value.transformRotateY ?? 0;
        const tRZ = properties.value.transformRotateZ ?? 0;
        const tSX = properties.value.transformScaleX ?? 1;
        const tSY = properties.value.transformScaleY ?? 1;
        const tSZ = properties.value.transformScaleZ ?? 1;
        const r = [parseNumberValue(tRX), parseNumberValue(tRY), parseNumberValue(tRZ)];
        const t = [
            toAbsoluteNumber(tTX, () => size.value?.[0] ?? 0, root.value),
            -toAbsoluteNumber(tTY, () => size.value?.[1] ?? 0, root.value),
            toAbsoluteNumber(tTZ),
        ];
        const s = [
            toAbsoluteNumber(tSX, () => 1, root.value),
            toAbsoluteNumber(tSY, () => 1, root.value),
            toAbsoluteNumber(tSZ, () => 1, root.value),
        ];
        if (t.some((v) => v != 0) || r.some((v) => v != 0) || s.some((v) => v != 1)) {
            result.multiply(matrixHelper.compose(tHelper.fromArray(t).multiplyScalar(pixelSize), toQuaternion(r), sHelper.fromArray(s)));
        }
        if (!originCenter) {
            result.multiply(matrixHelper.makeTranslation(originVector));
        }
        return result;
    });
}

const StyleSheet = {};
class ClassList {
  properties;
  starProperties;
  list = [];
  constructor(properties, starProperties) {
    this.properties = properties;
    this.starProperties = starProperties;
  }
  *[Symbol.iterator]() {
    for (const entry in this.list) {
      if (entry != null) {
        yield entry;
      }
    }
  }
  set(...classes) {
    const length = Math.max(classes.length, this.list.length);
    this.list.length = classes.length;
    for (let classIndex = 0; classIndex < length; classIndex++) {
      const identifier = { type: "class", classIndex };
      const classRef = classes[classIndex];
      let resolvedClass = classRef == null ? void 0 : this.resolveClassRef(classRef);
      this.properties.setLayersWithConditionals(identifier, resolvedClass);
      this.starProperties.setLayersWithConditionals(identifier, getStarProperties(resolvedClass));
    }
  }
  add(...classes) {
    n(() => {
      for (const classRef of classes) {
        let classIndex = 0;
        while (this.list[classIndex] != null) {
          classIndex++;
        }
        this.list[classIndex] = classRef;
        const identifier = { type: "class", classIndex };
        const resolvedClass = this.resolveClassRef(classRef);
        this.properties.setLayersWithConditionals(identifier, resolvedClass);
        this.starProperties.setLayersWithConditionals(identifier, getStarProperties(resolvedClass));
      }
    });
  }
  remove(...classes) {
    n(() => {
      for (const classRef of classes) {
        const classIndex = this.list.indexOf(classRef);
        if (classIndex === -1) {
          console.warn(`Class '${classRef}' not found in the classList`);
          return;
        }
        if (classIndex + 1 === this.list.length) {
          this.list.splice(classIndex, 1);
        } else {
          this.list[classIndex] = void 0;
        }
        const identifier = { type: "class", classIndex };
        this.properties.setLayersWithConditionals(identifier, void 0);
        this.starProperties.setLayersWithConditionals(identifier, void 0);
      }
    });
  }
  toggle(classRef) {
    if (this.contains(classRef)) {
      this.remove(classRef);
    } else {
      this.add(classRef);
    }
  }
  contains(classRef) {
    return this.list.includes(classRef);
  }
  replace(oldToken, newToken) {
    if (!this.contains(oldToken)) {
      return false;
    }
    this.remove(oldToken);
    this.add(newToken);
    return true;
  }
  resolveClassRef(classRef) {
    if (classRef == null) {
      return void 0;
    }
    if (typeof classRef != "string") {
      return classRef;
    }
    if (!(classRef in StyleSheet)) {
      console.warn(`class "${classRef}" not present in the global stylesheet`);
      return void 0;
    }
    return StyleSheet[classRef];
  }
}
function getStarProperties(properties) {
  if (properties == null) {
    return void 0;
  }
  let result;
  if ("*" in properties) {
    result = { ...properties["*"] };
  }
  for (const conditionalKey in conditionalKeys) {
    const conditionalEntry = properties[conditionalKey]?.["*"];
    if (conditionalEntry == null) {
      continue;
    }
    result ??= {};
    result[conditionalKey] = conditionalEntry;
  }
  return result;
}

const BreakallWrapper = ({ text, fontSize, font, letterSpacing }, availableWidth, charIndex, target) => {
    const firstIndex = charIndex;
    target.charIndexOffset = firstIndex;
    target.nonWhitespaceCharLength = 0;
    target.charLength = 0;
    target.nonWhitespaceWidth = 0;
    target.whitespacesBetween = 0;
    let position = 0;
    let whitespaces = 0;
    for (; charIndex < text.length; charIndex++) {
        const char = text[charIndex];
        if (char === '\n') {
            target.charLength = charIndex - firstIndex + 1;
            return;
        }
        position += getOffsetToNextGlyph(fontSize, font.getGlyphInfo(char), letterSpacing);
        if (char === ' ') {
            whitespaces += 1;
            continue;
        }
        //non whitespace
        if (target.nonWhitespaceWidth > 0 && availableWidth != null && position > availableWidth) {
            break;
        }
        target.nonWhitespaceCharLength = charIndex - firstIndex + 1;
        target.nonWhitespaceWidth = position;
        target.whitespacesBetween = whitespaces;
    }
    //not "+1" because we break when we want to remove the last one
    target.charLength = charIndex - firstIndex;
};

const NowrapWrapper = ({ text, fontSize, font, letterSpacing }, _, charIndex, target) => {
    const firstIndex = charIndex;
    target.charIndexOffset = firstIndex;
    target.nonWhitespaceCharLength = 0;
    target.charLength = 0;
    target.nonWhitespaceWidth = 0;
    target.whitespacesBetween = 0;
    let position = 0;
    let whitespaces = 0;
    for (; charIndex < text.length; charIndex++) {
        const char = text[charIndex];
        if (char === '\n') {
            target.charLength = charIndex - firstIndex + 1;
            return;
        }
        position += getOffsetToNextGlyph(fontSize, font.getGlyphInfo(char), letterSpacing);
        if (char === ' ') {
            whitespaces += 1;
            continue;
        }
        target.nonWhitespaceWidth = position;
        target.whitespacesBetween = whitespaces;
        target.nonWhitespaceCharLength = charIndex - firstIndex + 1;
    }
    //not "+1" because we break when we want to remove the last one
    target.charLength = charIndex - firstIndex;
};

const WordWrapper = ({ text, fontSize, font, letterSpacing }, availableWidth, charIndex, target) => {
    const firstIndex = charIndex;
    target.charIndexOffset = firstIndex;
    target.nonWhitespaceCharLength = 0;
    target.charLength = 0;
    target.nonWhitespaceWidth = 0;
    target.whitespacesBetween = 0;
    let position = 0;
    let whitespaces = 0;
    for (; charIndex < text.length; charIndex++) {
        const char = text[charIndex];
        if (char === '\n') {
            target.charLength = charIndex - firstIndex + 1;
            break;
        }
        position += getOffsetToNextGlyph(fontSize, font.getGlyphInfo(char), letterSpacing);
        if (char === ' ') {
            whitespaces += 1;
            target.charLength = charIndex - firstIndex + 1;
            continue;
        }
        //non whitespace
        if (target.nonWhitespaceWidth > 0 && availableWidth != null && position > availableWidth) {
            break;
        }
        const nextChar = text[charIndex + 1];
        if (nextChar === ' ' || nextChar === '\n' || nextChar == null) {
            //next char is a whitespace/end of text => save point
            target.charLength = charIndex - firstIndex + 1;
            target.nonWhitespaceCharLength = target.charLength;
            target.nonWhitespaceWidth = position;
            target.whitespacesBetween = whitespaces;
        }
    }
};

const wrappers = {
    'keep-all': NowrapWrapper,
    'break-all': BreakallWrapper,
    'break-word': WordWrapper,
};
const lineHelper = {};
function computedCustomLayouting(layoutPropertiesSignal) {
    return g(() => {
        const layoutProperties = layoutPropertiesSignal.value;
        if (layoutProperties == null) {
            return undefined;
        }
        const { width: minWidth } = measureGlyphLayout(layoutProperties, 0);
        const { height: minHeight } = measureGlyphLayout(layoutProperties, undefined);
        return {
            minHeight,
            minWidth,
            measure: (width, widthMode) => measureGlyphLayout(layoutProperties, widthMode === MeasureMode.Undefined ? undefined : width),
        };
    });
}
function measureGlyphLayout(properties, availableWidth) {
    const wrapper = wrappers[properties.wordBreak];
    const text = properties.text;
    let width = 0;
    let lines = 0;
    let charIndex = 0;
    while (charIndex < text.length) {
        wrapper(properties, availableWidth, charIndex, lineHelper);
        width = Math.max(width, lineHelper.nonWhitespaceWidth);
        lines += 1;
        charIndex = lineHelper.charLength + lineHelper.charIndexOffset;
    }
    if (text[text.length - 1] === '\n') {
        lines += 1;
    }
    return { width, height: getGlyphLayoutHeight(lines, properties.lineHeight) };
}
function buildGlyphLayout(properties, availableWidth, availableHeight) {
    const lines = [];
    const wrapper = wrappers[properties.wordBreak];
    const text = properties.text;
    let charIndex = 0;
    while (charIndex < text.length) {
        const line = {};
        wrapper(properties, availableWidth, charIndex, line);
        lines.push(line);
        charIndex = line.charLength + line.charIndexOffset;
    }
    if (lines.length === 0 || text[text.length - 1] === '\n') {
        lines.push({
            charLength: 0,
            nonWhitespaceWidth: 0,
            whitespacesBetween: 0,
            charIndexOffset: text.length,
            nonWhitespaceCharLength: 0,
        });
    }
    return {
        lines,
        availableHeight,
        availableWidth,
        ...properties,
    };
}

function buildPositionedGlyphLayout(properties, availableWidth, availableHeight, textAlign, verticalAlign) {
    const layout = buildGlyphLayout(properties, availableWidth, availableHeight);
    const positionedLines = [];
    const { font, fontSize, letterSpacing = 0, lineHeight = 1.2, text } = layout;
    const whitespaceWidth = getWhitespaceWidth(layout);
    let y = getTextYOffset(layout, verticalAlign) - availableHeight / 2;
    for (let lineIndex = 0; lineIndex < layout.lines.length; lineIndex++) {
        const line = layout.lines[lineIndex];
        const entries = [];
        let offsetPerWhitespace = textAlign === 'justify' && line.whitespacesBetween > 0
            ? (availableWidth - line.nonWhitespaceWidth) / line.whitespacesBetween
            : 0;
        let x = getTextXOffset(availableWidth, line.nonWhitespaceWidth, textAlign) - availableWidth / 2;
        let prevGlyphId;
        for (let charIndex = line.charIndexOffset; charIndex < line.charIndexOffset + line.charLength; charIndex++) {
            const char = text[charIndex];
            const glyphInfo = font.getGlyphInfo(char);
            x += getKerningOffset(font, fontSize, prevGlyphId, glyphInfo);
            prevGlyphId = glyphInfo.id;
            if (char === ' ' || charIndex > line.nonWhitespaceCharLength + line.charIndexOffset) {
                entries.push({
                    type: 'whitespace',
                    charIndex,
                    x: x + getGlyphOffsetX(glyphInfo, fontSize),
                    width: whitespaceWidth,
                });
                x += offsetPerWhitespace + getOffsetToNextGlyph(fontSize, glyphInfo, letterSpacing);
                continue;
            }
            entries.push({
                type: 'glyph',
                charIndex,
                char,
                glyphInfo,
                x: x + getGlyphOffsetX(glyphInfo, fontSize),
                y: -(y + getGlyphOffsetY(fontSize, lineHeight, glyphInfo)),
                width: glyphInfo.width * fontSize,
            });
            x += getOffsetToNextGlyph(fontSize, glyphInfo, letterSpacing);
        }
        positionedLines.push({ ...line, entries });
        y += getOffsetToNextLine(lineHeight);
    }
    return {
        ...layout,
        lines: positionedLines,
        textAlign,
        verticalAlign,
    };
}
function getTextXOffset(availableWidth, nonWhitespaceWidth, textAlign) {
    switch (textAlign) {
        case 'right':
            return availableWidth - nonWhitespaceWidth;
        case 'center':
            return (availableWidth - nonWhitespaceWidth) / 2;
        default:
            return 0;
    }
}
function getTextYOffset(layout, verticalAlign) {
    switch (verticalAlign) {
        case 'center':
        case 'middle':
            return (layout.availableHeight - getGlyphLayoutHeight(layout.lines.length, layout.lineHeight)) / 2;
        case 'bottom':
            return layout.availableHeight - getGlyphLayoutHeight(layout.lines.length, layout.lineHeight);
        default:
            return 0;
    }
}
function getWhitespaceWidth({ font, fontSize }) {
    return font.getGlyphInfo(' ').xadvance * fontSize;
}

function buildGlyphOutProperties(font, text, { fontSize: fontSizeString, letterSpacing, lineHeight: lineHeightString, wordBreak }) {
    const fontSize = toAbsoluteNumber(fontSizeString);
    let lineHeight;
    if (typeof lineHeightString === 'string' && lineHeightString.endsWith('px')) {
        lineHeight = parseFloat(lineHeightString);
    }
    else {
        lineHeight = fontSize * toAbsoluteNumber(lineHeightString, () => 1);
    }
    return { font, text, fontSize, letterSpacing: toAbsoluteNumber(letterSpacing), lineHeight, wordBreak };
}
const collapseRegex = /[\t\n ]+/gm;
const preLineCollapseNonLinefeedWhitespaceRegex = /[\t ]+/g;
const preLineCollapseLinefeedRegex = /[\t ]*\n[\t ]*/gm;
const preLineTrimNonLinefeedWhitespaceRegex = /^[ \t]+|[ \t]+$/g;
function computedGlyphOutProperties(properties, fontSignal) {
    return g(() => {
        const font = fontSignal.value;
        if (font == null) {
            return undefined;
        }
        const textProperty = properties.value.text;
        let text = Array.isArray(textProperty) ? textProperty.map(toString).join('') : toString(textProperty);
        const tabSize = parseNumberValue(properties.value.tabSize);
        const whiteSpace = properties.value.whiteSpace;
        switch (whiteSpace) {
            case 'pre':
                text = text.replaceAll('\t', ' '.repeat(tabSize));
                break;
            case 'pre-line':
                text = text
                    .replaceAll(preLineCollapseNonLinefeedWhitespaceRegex, ' ')
                    .replaceAll(preLineCollapseLinefeedRegex, '\n')
                    .replaceAll(preLineTrimNonLinefeedWhitespaceRegex, '');
                break;
            default:
                text = text.replaceAll(collapseRegex, ' ').trim();
                break;
        }
        return buildGlyphOutProperties(font, text, properties.value);
    });
}
function toString(value) {
    if (value instanceof l) {
        value = value.value;
    }
    if (value == null) {
        return '';
    }
    return String(value);
}

const {Matrix4: Matrix4$5,Quaternion: Quaternion$1,Vector3: Vector3$4} = await importShared('three');
const IdentityMatrix$2 = new Matrix4$5();
const IdentityQuaternion$1 = new Quaternion$1();
const IdentityScale = new Vector3$4(1, 1, 1);
const textMatrixPosition = new Vector3$4();
function computedGlobalTextMatrix(target) {
  return g(() => {
    const paddingInset = target.paddingInset.value;
    const borderInset = target.borderInset.value;
    if (paddingInset == null || borderInset == null) {
      return IdentityMatrix$2;
    }
    return getGlobalTextMatrix(paddingInset, borderInset, parseNumberValue(target.properties.value.pixelSize), target.globalMatrix.value ?? IdentityMatrix$2);
  });
}
function getGlobalTextMatrix(paddingInset, borderInset, pixelSize, globalMatrix = IdentityMatrix$2) {
  const [pTop, pRight, pBottom, pLeft] = paddingInset;
  const [bTop, bRight, bBottom, bLeft] = borderInset;
  const topInset = pTop + bTop;
  const rightInset = pRight + bRight;
  const bottomInset = pBottom + bBottom;
  const leftInset = pLeft + bLeft;
  textMatrixPosition.set((leftInset - rightInset) * 0.5 * pixelSize, (bottomInset - topInset) * 0.5 * pixelSize, 0);
  return new Matrix4$5().compose(textMatrixPosition, IdentityQuaternion$1, IdentityScale).premultiply(globalMatrix);
}

const noSelectionTransformations = [];
function getCharIndex(layout, x, y, position) {
    if (layout == null) {
        return 0;
    }
    y -= -getTextYOffset(layout, layout.verticalAlign);
    const lineIndex = Math.floor(y / -getOffsetToNextLine(layout.lineHeight));
    const lines = layout.lines;
    if (lineIndex < 0 || lines.length === 0) {
        return 0;
    }
    if (lineIndex >= lines.length) {
        const lastLine = lines[lines.length - 1];
        return lastLine.charIndexOffset + lastLine.charLength + 1;
    }
    const line = lines[lineIndex];
    for (let i = 0; i < line.entries.length; i++) {
        const entry = line.entries[i];
        if (x < getEntryX(entry, position === 'between' ? 0.5 : 1) + layout.availableWidth / 2) {
            return i + line.charIndexOffset;
        }
    }
    return line.charIndexOffset + line.charLength + 1;
}
function getCaretTransformation(layout, charIndex) {
    if (layout == null || layout.lines.length === 0) {
        return undefined;
    }
    const whitespaceWidth = getWhitespaceWidth(layout);
    const { lineIndex, x } = getGlyphLineAndX(layout, charIndex, true, whitespaceWidth);
    const y = -(getTextYOffset(layout, layout.verticalAlign) -
        layout.availableHeight / 2 +
        lineIndex * getOffsetToNextLine(layout.lineHeight) +
        getGlyphOffsetY(layout.fontSize, layout.lineHeight));
    return { position: [x, y - layout.fontSize / 2], height: layout.fontSize };
}
function getSelectionTransformations(layout, range) {
    if (range == null || layout == null || layout.lines.length === 0) {
        return { caret: undefined, selections: noSelectionTransformations };
    }
    const whitespaceWidth = getWhitespaceWidth(layout);
    const [startCharIndexIncl, endCharIndexExcl] = range;
    if (endCharIndexExcl <= startCharIndexIncl) {
        return {
            caret: getCaretTransformation(layout, endCharIndexExcl),
            selections: noSelectionTransformations,
        };
    }
    const start = getGlyphLineAndX(layout, startCharIndexIncl, true, whitespaceWidth);
    const end = getGlyphLineAndX(layout, endCharIndexExcl - 1, false, whitespaceWidth);
    if (start.lineIndex === end.lineIndex) {
        return {
            caret: undefined,
            selections: [computeSelectionTransformation(start.lineIndex, start.x, end.x, layout, whitespaceWidth)],
        };
    }
    const selections = [
        computeSelectionTransformation(start.lineIndex, start.x, undefined, layout, whitespaceWidth),
    ];
    for (let i = start.lineIndex + 1; i < end.lineIndex; i++) {
        selections.push(computeSelectionTransformation(i, undefined, undefined, layout, whitespaceWidth));
    }
    selections.push(computeSelectionTransformation(end.lineIndex, undefined, end.x, layout, whitespaceWidth));
    return { caret: undefined, selections };
}
function computeSelectionTransformation(lineIndex, startX, endX, layout, whitespaceWidth) {
    const line = layout.lines[lineIndex];
    const firstEntry = line.entries[0];
    const lastEntry = line.entries[line.entries.length - 1];
    if (startX == null) {
        startX =
            firstEntry == null
                ? getTextXOffset(layout.availableWidth, line.nonWhitespaceWidth, layout.textAlign) - layout.availableWidth / 2
                : getEntryX(firstEntry, 0);
    }
    if (endX == null) {
        endX = lastEntry == null ? startX : getEntryX(lastEntry, 1, whitespaceWidth);
    }
    const height = getOffsetToNextLine(layout.lineHeight);
    const y = -(getTextYOffset(layout, layout.verticalAlign) - layout.availableHeight / 2 + lineIndex * height);
    const width = endX - startX;
    return { position: [startX + width / 2, y - height / 2], size: [width, height] };
}
function getGlyphLineAndX(layout, charIndex, start, whitespaceWidth) {
    const { lines, availableWidth, textAlign } = layout;
    const linesLength = lines.length;
    if (charIndex >= lines[0].charIndexOffset) {
        for (let lineIndex = 0; lineIndex < linesLength; lineIndex++) {
            const line = lines[lineIndex];
            if (charIndex >= line.charIndexOffset + line.charLength) {
                continue;
            }
            const entry = line.entries[Math.max(charIndex - line.charIndexOffset, 0)];
            if (entry != null) {
                return { lineIndex, x: getEntryX(entry, start ? 0 : 1, whitespaceWidth) };
            }
            return {
                lineIndex,
                x: getTextXOffset(availableWidth, line.nonWhitespaceWidth, textAlign) - availableWidth / 2,
            };
        }
    }
    const lastLine = lines[linesLength - 1];
    if (lastLine.entries.length === 0 || charIndex < lastLine.charIndexOffset) {
        return {
            lineIndex: linesLength - 1,
            x: getTextXOffset(availableWidth, lastLine.nonWhitespaceWidth, textAlign) - availableWidth / 2,
        };
    }
    const lastEntry = lastLine.entries[lastLine.entries.length - 1];
    return { lineIndex: linesLength - 1, x: getEntryX(lastEntry, 1, whitespaceWidth) };
}
function getEntryX(entry, widthMultiplier, fallbackWidth) {
    return entry.x + widthMultiplier * (entry.type === 'whitespace' ? (fallbackWidth ?? entry.width) : entry.width);
}

function setupTextLayout(target) {
    const layoutProperties = computedGlyphOutProperties(target.properties, target.fontSignal);
    const customLayouting = computedCustomLayouting(layoutProperties);
    const layout = g(() => {
        const properties = layoutProperties.value;
        const { size: { value: size }, paddingInset: { value: paddingInset }, borderInset: { value: borderInset }, } = target;
        if (properties == null || size == null || paddingInset == null || borderInset == null) {
            return undefined;
        }
        const [width, height] = size;
        const [pTop, pRight, pBottom, pLeft] = paddingInset;
        const [bTop, bRight, bBottom, bLeft] = borderInset;
        const actualWidth = width - pRight - pLeft - bRight - bLeft;
        const actualHeight = height - pTop - pBottom - bTop - bBottom;
        return buildPositionedGlyphLayout(properties, actualWidth, actualHeight, target.properties.value.textAlign, target.properties.value.verticalAlign);
    });
    return { layout, customLayouting };
}

const {MeshBasicMaterial: MeshBasicMaterial$1} = await importShared('three');

class InstancedGlyphMaterial extends MeshBasicMaterial$1 {
    constructor(font) {
        super({
            transparent: true,
            depthWrite: false,
            toneMapped: false,
        });
        this.onBeforeCompile = (parameters, renderer) => {
            font.page.anisotropy = renderer.capabilities.getMaxAnisotropy();
            parameters.uniforms.fontPage = { value: font.page };
            parameters.uniforms.pageSize = { value: [font.pageWidth, font.pageHeight] };
            parameters.uniforms.distanceRange = { value: font.distanceRange };
            parameters.vertexShader =
                `attribute vec4 instanceUVOffset;
        varying vec2 fontUv;
        attribute vec4 instanceRGBA;
        varying vec4 rgba;
        attribute mat4 instanceClipping;
        varying mat4 clipping;
        varying vec3 localPosition;
        attribute float instanceRenderSolid;
        varying float renderSolid;
        ` + parameters.vertexShader;
            parameters.vertexShader = parameters.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
            fontUv = instanceUVOffset.xy + uv * instanceUVOffset.zw;
            rgba = instanceRGBA;
            clipping = instanceClipping;
            localPosition = (instanceMatrix * vec4(position, 1.0)).xyz;
            renderSolid = instanceRenderSolid;`);
            parameters.fragmentShader =
                `uniform sampler2D fontPage;
            uniform vec2 pageSize;
            uniform int distanceRange;
        varying vec2 fontUv;
        varying vec4 rgba;
        varying mat4 clipping;
        varying vec3 localPosition;
        varying float renderSolid;
        float median(float r, float g, float b) {
            return max(min(r, g), min(max(r, g), b));
        }
        float getDistance() {
            vec3 msdf = texture(fontPage, fontUv).rgb;
            return median(msdf.r, msdf.g, msdf.b);
        }
        ` + parameters.fragmentShader;
            parameters.fragmentShader = parameters.fragmentShader.replace('#include <map_fragment>', ` #include <map_fragment>
          vec4 plane;
          float distanceToPlane, distanceGradient;
          float clipOpacity = 1.0;
          for(int i = 0; i < 4; i++) {
            plane = clipping[ i ];
            distanceToPlane = dot( localPosition, plane.xyz ) + plane.w;
            distanceGradient = max(fwidth( distanceToPlane ) / 2.0, 0.00001);
            clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );

            if ( clipOpacity == 0.0 ) discard;
          }
          // Distance to the edge of the glyph in texels.
          float dist = (getDistance() - 0.5) * float(distanceRange);

          // Calculate the antialiasing distance based on the number of texels per screen pixel.
          float aaDist = length(fwidth(fontUv * pageSize)) * 0.5;

          // Clamp the antialiasing distance to avoid excessive blurring.
          aaDist = clamp(aaDist, 0.0, float(distanceRange) * 0.5);

          float alpha = smoothstep(-aaDist, aaDist, dist);

          if (alpha <= 0.0 && renderSolid <= 0.5) discard;

          // Apply gamma correction to improve text appearance, or override for synthetic solid glyphs.
          float gamma = 1.3;
          alpha = renderSolid > 0.5 ? 1.0 : pow(alpha, 1.0 / gamma);

          diffuseColor.a *= clipOpacity * alpha;
          diffuseColor *= rgba;
            `);
        };
    }
}

const {Box3: Box3$1,Mesh: Mesh$3,PlaneGeometry,Sphere: Sphere$1} = await importShared('three');
class InstancedGlyphMesh extends Mesh$3 {
    root;
    instanceMatrix;
    instanceRGBA;
    instanceUV;
    instanceClipping;
    instanceRenderSolid;
    count = 0;
    isInstancedMesh = true;
    instanceColor = null;
    morphTexture = null;
    boundingBox = new Box3$1();
    boundingSphere = new Sphere$1();
    customUpdateMatrixWorld = () => computeWorldToGlobalMatrix(this.root, this.matrixWorld);
    constructor(root, instanceMatrix, instanceRGBA, instanceUV, instanceClipping, instanceRenderSolid, material) {
        const planeGeometry = new PlaneGeometry();
        planeGeometry.translate(0.5, -0.5, 0);
        super(planeGeometry, material);
        this.root = root;
        this.instanceMatrix = instanceMatrix;
        this.instanceRGBA = instanceRGBA;
        this.instanceUV = instanceUV;
        this.instanceClipping = instanceClipping;
        this.instanceRenderSolid = instanceRenderSolid;
        this.pointerEvents = 'none';
        planeGeometry.attributes.instanceUVOffset = instanceUV;
        planeGeometry.attributes.instanceRGBA = instanceRGBA;
        planeGeometry.attributes.instanceClipping = instanceClipping;
        planeGeometry.attributes.instanceRenderSolid = instanceRenderSolid;
        this.frustumCulled = false;
        root.onUpdateMatrixWorldSet.add(this.customUpdateMatrixWorld);
    }
    clone() {
        const cloned = new InstancedGlyphMesh(this.root, this.instanceMatrix, this.instanceRGBA, this.instanceUV, this.instanceClipping, this.instanceRenderSolid, this.material);
        cloned.count = this.count;
        return cloned;
    }
    copy() {
        throw new Error('InstancedGlyphMesh.copy() is not supported. Use clone() instead.');
    }
    dispose() {
        this.root.onUpdateMatrixWorldSet.delete(this.customUpdateMatrixWorld);
        this.dispatchEvent({ type: 'dispose' });
        this.geometry.dispose();
    }
    //functions not needed because intersection (and morphing) is intenionally disabled
    computeBoundingBox() { }
    computeBoundingSphere() { }
    updateMorphTargets() { }
    raycast() { }
    spherecast() { }
}

const {Matrix4: Matrix4$4} = await importShared('three');
const helperMatrix1 = new Matrix4$4();
const helperMatrix2 = new Matrix4$4();
function computedGylphGroupDependencies(fontSignal) {
    return g(() => ({ font: fontSignal.value }));
}
/**
 * renders an initially specified glyph
 */
class InstancedGlyph {
    group;
    baseMatrix;
    color;
    opacity;
    clippingRect;
    index;
    hidden = true;
    glyphInfo;
    x = 0;
    y = 0;
    fontSize = 0;
    pixelSize = 0;
    constructor(group, 
    //modifiable using update...
    baseMatrix, color, opacity, clippingRect) {
        this.group = group;
        this.baseMatrix = baseMatrix;
        this.color = color;
        this.opacity = opacity;
        this.clippingRect = clippingRect;
    }
    getX(widthMultiplier) {
        if (this.glyphInfo == null) {
            return this.x;
        }
        return this.x + widthMultiplier * this.glyphInfo.width * this.fontSize;
    }
    show() {
        if (!this.hidden) {
            return;
        }
        this.hidden = false;
        this.group.requestActivate(this);
    }
    hide() {
        if (this.hidden) {
            return;
        }
        this.hidden = true;
        this.group.delete(this);
    }
    activate(index) {
        this.index = index;
        this.writeUpdatedMatrix();
        this.writeUV();
        this.writeRenderSolid();
        this.updateColor(this.color, this.opacity);
        this.updateClippingRect(this.clippingRect);
    }
    setIndex(index) {
        this.index = index;
    }
    updateClippingRect(clippingRect) {
        this.clippingRect = clippingRect;
        if (this.index == null) {
            return;
        }
        const offset = this.index * 16;
        const { instanceClipping, root } = this.group;
        if (this.clippingRect == null) {
            instanceClipping.set(defaultClippingData, offset);
        }
        else {
            this.clippingRect.toArray(instanceClipping.array, offset);
        }
        instanceClipping.addUpdateRange(offset, 16);
        instanceClipping.needsUpdate = true;
        root.requestRender?.();
    }
    updateColor(color, opacity) {
        this.color = color;
        this.opacity = opacity;
        if (this.index == null) {
            return;
        }
        const { instanceRGBA, root } = this.group;
        const offset = instanceRGBA.itemSize * this.index;
        writeColor(instanceRGBA.array, offset, color, opacity);
        instanceRGBA.addUpdateRange(offset, 4);
        instanceRGBA.needsUpdate = true;
        root.requestRender?.();
    }
    updateGlyphAndTransformation(glyphInfo, x, y, fontSize, pixelSize) {
        if (this.glyphInfo === glyphInfo &&
            this.x === x &&
            this.y === y &&
            this.fontSize === fontSize &&
            this.pixelSize === pixelSize) {
            return;
        }
        if (this.glyphInfo != glyphInfo) {
            this.glyphInfo = glyphInfo;
            this.writeUV();
            this.writeRenderSolid();
        }
        this.x = x;
        this.y = y;
        this.fontSize = fontSize;
        this.pixelSize = pixelSize;
        this.writeUpdatedMatrix();
    }
    updateBaseMatrix(baseMatrix) {
        if (this.baseMatrix === baseMatrix) {
            return;
        }
        this.baseMatrix = baseMatrix;
        this.writeUpdatedMatrix();
    }
    writeUV() {
        if (this.index == null || this.glyphInfo == null) {
            return;
        }
        const offset = this.index * 4;
        const { instanceUV, root } = this.group;
        glyphIntoToUV(this.glyphInfo, instanceUV.array, offset);
        instanceUV.addUpdateRange(offset, 4);
        instanceUV.needsUpdate = true;
        root.requestRender?.();
    }
    writeRenderSolid() {
        if (this.index == null || this.glyphInfo == null) {
            return;
        }
        const { instanceRenderSolid, root } = this.group;
        const offset = this.index * 1;
        instanceRenderSolid.array[offset] = this.glyphInfo.renderSolid ? 1.0 : 0.0;
        instanceRenderSolid.addUpdateRange(offset, 1);
        instanceRenderSolid.needsUpdate = true;
        root.requestRender?.();
    }
    writeUpdatedMatrix() {
        if (this.index == null || this.glyphInfo == null || this.baseMatrix == null) {
            return;
        }
        const offset = this.index * 16;
        const { instanceMatrix, root } = this.group;
        instanceMatrix.addUpdateRange(offset, 16);
        helperMatrix1
            .makeTranslation(this.x * this.pixelSize, this.y * this.pixelSize, 0)
            .multiply(helperMatrix2.makeScale(this.fontSize * this.glyphInfo.width * this.pixelSize, this.fontSize * this.glyphInfo.height * this.pixelSize, 1))
            .premultiply(this.baseMatrix);
        helperMatrix1.toArray(instanceMatrix.array, offset);
        instanceMatrix.needsUpdate = true;
        root.requestRender?.();
    }
}

const {DynamicDrawUsage,InstancedBufferAttribute} = await importShared('three');
class GlyphGroupManager {
    root;
    object;
    map = new Map();
    constructor(root, object) {
        this.root = root;
        this.object = object;
    }
    init(abortSignal) {
        const onFrame = (delta) => this.traverse((group) => group.onFrame(delta));
        this.root.onFrameSet.add(onFrame);
        abortSignal.addEventListener('abort', () => {
            this.root.onFrameSet.delete(onFrame);
            this.traverse((group) => group.destroy());
        });
    }
    traverse(fn) {
        for (const groups of this.map.values()) {
            for (const group of groups.values()) {
                fn(group);
            }
        }
    }
    getGroup({ majorIndex, minorIndex }, depthTest, depthWrite, renderOrder, font) {
        let groups = this.map.get(font);
        if (groups == null) {
            this.map.set(font, (groups = new Map()));
        }
        const key = [majorIndex, minorIndex, depthTest, depthWrite, renderOrder].join(',');
        let glyphGroup = groups?.get(key);
        if (glyphGroup == null) {
            groups.set(key, (glyphGroup = new InstancedGlyphGroup(this.object, font, this.root, {
                majorIndex,
                minorIndex,
                elementType: ElementType.Text,
                patchIndex: 0,
            }, depthTest, depthWrite, renderOrder)));
        }
        return glyphGroup;
    }
}
class InstancedGlyphGroup {
    object;
    root;
    orderInfo;
    renderOrder;
    instanceMatrix;
    instanceUV;
    instanceRGBA;
    instanceClipping;
    instanceRenderSolid;
    glyphs = [];
    requestedGlyphs = [];
    holeIndicies = [];
    mesh;
    instanceMaterial;
    timeTillDecimate;
    constructor(object, font, root, orderInfo, depthTest, depthWrite, renderOrder) {
        this.object = object;
        this.root = root;
        this.orderInfo = orderInfo;
        this.renderOrder = renderOrder;
        this.instanceMaterial = new InstancedGlyphMaterial(font);
        this.instanceMaterial.depthTest = depthTest;
        this.instanceMaterial.depthWrite = depthWrite;
    }
    requestActivate(glyph) {
        const holeIndex = this.holeIndicies.shift();
        if (holeIndex != null) {
            //inserting into existing hole
            this.glyphs[holeIndex] = glyph;
            glyph.activate(holeIndex);
            this.root.requestRender?.();
            return;
        }
        if (this.mesh == null || this.mesh.count >= this.instanceMatrix.count) {
            //requesting insert because no space available
            this.requestedGlyphs.push(glyph);
            this.root.requestFrame?.();
            return;
        }
        //inserting at the end because space available
        const index = this.mesh.count;
        this.glyphs[index] = glyph;
        glyph.activate(index);
        this.mesh.count += 1;
        this.root.requestRender?.();
        return;
    }
    delete(glyph) {
        if (glyph.index == null) {
            //remove an not yet added glyph
            const indexInRequested = this.requestedGlyphs.indexOf(glyph);
            if (indexInRequested === -1) {
                return;
            }
            this.requestedGlyphs.splice(indexInRequested, 1);
            return;
        }
        //can directly request render because we don't need "onFrame" to handle delete
        this.root.requestRender?.();
        const replacement = this.requestedGlyphs.shift();
        if (replacement != null) {
            //replace
            replacement.activate(glyph.index);
            this.glyphs[glyph.index] = replacement;
            glyph.index = undefined;
            return;
        }
        if (glyph.index === this.glyphs.length - 1) {
            //remove at the end
            this.glyphs.length -= 1;
            this.mesh.count -= 1;
            glyph.index = undefined;
            return;
        }
        //remove in between
        //hiding the glyph by writing a 0 matrix (0 scale ...)
        const bufferOffset = glyph.index * 16;
        this.instanceMatrix.array.fill(0, bufferOffset, bufferOffset + 16);
        this.instanceMatrix.addUpdateRange(bufferOffset, 16);
        this.instanceMatrix.needsUpdate = true;
        this.holeIndicies.push(glyph.index);
        this.glyphs[glyph.index] = undefined;
        glyph.index = undefined;
    }
    onFrame(delta) {
        const requiredSize = this.glyphs.length - this.holeIndicies.length + this.requestedGlyphs.length;
        if (this.mesh != null) {
            this.mesh.visible = requiredSize > 0;
        }
        if (requiredSize === 0) {
            return;
        }
        const availableSize = this.instanceMatrix?.count ?? 0;
        //if the buffer is continously to small over a period of 1 second, it will be decimated
        if (requiredSize < availableSize / 3) {
            this.timeTillDecimate ??= 1;
        }
        else {
            this.timeTillDecimate = undefined;
        }
        if (this.timeTillDecimate != null) {
            this.timeTillDecimate -= delta;
        }
        if ((this.timeTillDecimate == null || this.timeTillDecimate > 0) && requiredSize <= availableSize) {
            return;
        }
        this.timeTillDecimate = undefined;
        this.resize(requiredSize);
        const indexOffset = this.mesh.count;
        const requestedGlyphsLength = this.requestedGlyphs.length;
        for (let i = 0; i < requestedGlyphsLength; i++) {
            const glyph = this.requestedGlyphs[i];
            glyph.activate(indexOffset + i);
            this.glyphs[indexOffset + i] = glyph;
        }
        this.mesh.count += requestedGlyphsLength;
        this.mesh.visible = true;
        this.requestedGlyphs.length = 0;
    }
    resize(neededSize) {
        const newSize = Math.ceil(neededSize * 1.5);
        const matrixArray = new Float32Array(newSize * 16);
        const uvArray = new Float32Array(newSize * 4);
        const rgbaArray = new Float32Array(newSize * 4);
        const clippingArray = new Float32Array(newSize * 16);
        const renderSolidArray = new Float32Array(newSize * 1);
        this.instanceMatrix = new InstancedBufferAttribute(matrixArray, 16, false);
        this.instanceMatrix.setUsage(DynamicDrawUsage);
        this.instanceUV = new InstancedBufferAttribute(uvArray, 4, false);
        this.instanceUV.setUsage(DynamicDrawUsage);
        this.instanceRGBA = new InstancedBufferAttribute(rgbaArray, 4, false);
        this.instanceRGBA.setUsage(DynamicDrawUsage);
        this.instanceClipping = new InstancedBufferAttribute(clippingArray, 16, false);
        this.instanceClipping.setUsage(DynamicDrawUsage);
        this.instanceRenderSolid = new InstancedBufferAttribute(renderSolidArray, 1, false);
        this.instanceRenderSolid.setUsage(DynamicDrawUsage);
        const oldMesh = this.mesh;
        this.mesh = new InstancedGlyphMesh(this.root, this.instanceMatrix, this.instanceRGBA, this.instanceUV, this.instanceClipping, this.instanceRenderSolid, this.instanceMaterial);
        this.mesh.renderOrder = this.renderOrder;
        //copy over old arrays and merging the holes
        if (oldMesh != null) {
            this.holeIndicies.sort((i1, i2) => i1 - i2);
            const holesLength = this.holeIndicies.length;
            let afterPrevHoleIndex = 0;
            let i = 0;
            while (i < holesLength) {
                const holeIndex = this.holeIndicies[i];
                copyBuffer(afterPrevHoleIndex - i, afterPrevHoleIndex, holeIndex, oldMesh, this.mesh);
                afterPrevHoleIndex = holeIndex + 1;
                this.glyphs.splice(holeIndex - i, 1);
                i++;
            }
            copyBuffer(afterPrevHoleIndex - i, afterPrevHoleIndex, oldMesh.count, oldMesh, this.mesh);
            if (this.holeIndicies.length > 0) {
                for (let i = this.holeIndicies[0]; i < this.glyphs.length; i++) {
                    this.glyphs[i].setIndex(i);
                }
            }
            this.holeIndicies.length = 0;
            //destroying the old mesh
            this.object.remove(oldMesh);
            oldMesh.dispose();
        }
        //finalizing the new mesh
        setupRenderOrder(this.mesh, { peek: () => this.root }, { value: this.orderInfo });
        this.mesh.count = this.glyphs.length;
        this.object.addUnsafe(this.mesh);
    }
    destroy() {
        if (this.mesh == null) {
            return;
        }
        this.object.remove(this.mesh);
        this.mesh.dispose();
        this.instanceMaterial.dispose();
    }
}
function copyBuffer(target, start, end, oldMesh, newMesh) {
    copy(target, start, end, oldMesh.instanceMatrix.array, newMesh.instanceMatrix.array, 16);
    copy(target, start, end, oldMesh.instanceUV.array, newMesh.instanceUV.array, 4);
    copy(target, start, end, oldMesh.instanceRGBA.array, newMesh.instanceRGBA.array, 4);
    copy(target, start, end, oldMesh.instanceClipping.array, newMesh.instanceClipping.array, 16);
    copy(target, start, end, oldMesh.instanceRenderSolid.array, newMesh.instanceRenderSolid.array, 1);
}
function copy(target, start, end, from, to, itemSize) {
    if (start === end) {
        return;
    }
    const targetIndex = target * itemSize;
    const startIndex = start * itemSize;
    const endIndex = end * itemSize;
    to.set(from.subarray(startIndex, endIndex), targetIndex);
}

const additionalTextDefaults = {
  verticalAlign: "middle"
};
function createInstancedText(text, parentClippingRect, layoutSignal) {
  abortableEffect(() => {
    const font = text.fontSignal.value;
    const orderInfo = text.orderInfo.value;
    if (font == null || orderInfo == null) {
      return;
    }
    const instancedText = new InstancedText(text.root.value.glyphGroupManager.getGroup(orderInfo, text.properties.value.depthTest, text.properties.value.depthWrite ?? false, parseNumberValue(text.properties.value.renderOrder ?? 0), font), text.properties, layoutSignal, text.globalTextMatrix, text.isVisible, parentClippingRect);
    return () => instancedText.destroy();
  }, text.abortSignal);
}
class InstancedText {
  group;
  properties;
  layoutSignal;
  matrix;
  parentClippingRect;
  glyphLines = [];
  unsubscribeInitialList = [];
  unsubscribeShowList = [];
  constructor(group, properties, layoutSignal, matrix, isVisible, parentClippingRect) {
    this.group = group;
    this.properties = properties;
    this.layoutSignal = layoutSignal;
    this.matrix = matrix;
    this.parentClippingRect = parentClippingRect;
    this.unsubscribeInitialList = [
      j(() => {
        if (!isVisible.value || toAbsoluteNumber(this.properties.value.opacity, () => 1) < 0.01) {
          this.hide();
          return;
        }
        this.show();
      })
    ];
  }
  show() {
    if (this.unsubscribeShowList.length > 0) {
      return;
    }
    traverseGlyphs(this.glyphLines, (glyph) => glyph.show());
    this.unsubscribeShowList.push(j(() => {
      const matrix = this.matrix.value;
      if (matrix == null) {
        return;
      }
      traverseGlyphs(this.glyphLines, (glyph) => glyph.updateBaseMatrix(matrix));
    }), j(() => {
      const clippingRect = this.parentClippingRect?.value;
      traverseGlyphs(this.glyphLines, (glyph) => glyph.updateClippingRect(clippingRect));
    }), j(() => {
      const color = this.properties.value.color;
      const opacity = toAbsoluteNumber(this.properties.value.opacity, () => 1);
      traverseGlyphs(this.glyphLines, (glyph) => glyph.updateColor(color ?? 0, opacity));
    }), j(() => {
      const layout = this.layoutSignal.value;
      if (layout == null) {
        return;
      }
      const { lines, fontSize = 16 } = layout;
      const linesLength = lines.length;
      const pixelSize = parseNumberValue(this.properties.value.pixelSize);
      for (let lineIndex = 0; lineIndex < linesLength; lineIndex++) {
        if (lineIndex === this.glyphLines.length) {
          this.glyphLines.push([]);
        }
        const { entries } = lines[lineIndex];
        const glyphs = this.glyphLines[lineIndex];
        for (let glyphIndex = 0; glyphIndex < entries.length; glyphIndex++) {
          const entry = entries[glyphIndex];
          if (entry.type === "whitespace") {
            if (typeof glyphs[glyphIndex] === "number") {
              glyphs[glyphIndex] = entry.x;
            } else {
              glyphs.splice(glyphIndex, 0, entry.x);
            }
            continue;
          }
          let glyphOrNumber = glyphs[glyphIndex];
          while (glyphIndex < glyphs.length && typeof glyphOrNumber == "number") {
            glyphs.splice(glyphIndex, 1);
            glyphOrNumber = glyphs[glyphIndex];
          }
          let glyph = glyphOrNumber;
          if (glyph == null) {
            glyphs[glyphIndex] = glyph = new InstancedGlyph(this.group, this.matrix.peek(), this.properties.peek().color ?? 0, toAbsoluteNumber(this.properties.peek().opacity, () => 1), this.parentClippingRect?.peek());
          }
          glyph.updateGlyphAndTransformation(entry.glyphInfo, entry.x, entry.y, fontSize, pixelSize);
          glyph.show();
        }
        const glyphsLength = glyphs.length;
        const newGlyphsLength = entries.length;
        for (let ii = newGlyphsLength; ii < glyphsLength; ii++) {
          const glyph = glyphs[ii];
          if (typeof glyph === "number") {
            continue;
          }
          glyph.hide();
        }
        glyphs.length = newGlyphsLength;
      }
      traverseGlyphs(this.glyphLines, (glyph) => glyph.hide(), linesLength);
      this.glyphLines.length = linesLength;
    }));
  }
  hide() {
    const unsubscribeListLength = this.unsubscribeShowList.length;
    if (unsubscribeListLength === 0) {
      return;
    }
    for (let i = 0; i < unsubscribeListLength; i++) {
      this.unsubscribeShowList[i]();
    }
    this.unsubscribeShowList.length = 0;
    traverseGlyphs(this.glyphLines, (glyph) => glyph.hide());
  }
  destroy() {
    this.hide();
    this.glyphLines.length = 0;
    const length = this.unsubscribeInitialList.length;
    for (let i = 0; i < length; i++) {
      this.unsubscribeInitialList[i]();
    }
  }
}
function traverseGlyphs(glyphLines, fn, offset = 0) {
  const glyphLinesLength = glyphLines.length;
  for (let i = offset; i < glyphLinesLength; i++) {
    const glyphs = glyphLines[i];
    const glyphsLength = glyphs.length;
    for (let ii = 0; ii < glyphsLength; ii++) {
      const glyph = glyphs[ii];
      if (typeof glyph == "number") {
        continue;
      }
      fn(glyph);
    }
  }
}

const caretBorderKeys = [
  "caretBorderRightWidth",
  "caretBorderTopWidth",
  "caretBorderLeftWidth",
  "caretBorderBottomWidth"
];
let caretMaterialConfig;
function getCaretMaterialConfig() {
  caretMaterialConfig ??= createPanelMaterialConfig({
    backgroundColor: "caretColor",
    borderBend: "caretBorderBend",
    borderBottomLeftRadius: "caretBorderBottomLeftRadius",
    borderBottomRightRadius: "caretBorderBottomRightRadius",
    borderColor: "caretBorderColor",
    borderTopLeftRadius: "caretBorderTopLeftRadius",
    borderTopRightRadius: "caretBorderTopRightRadius"
  }, {
    backgroundColor: 0
  });
  return caretMaterialConfig;
}
function setupCaret(properties, globalMatrix, caretTransformation, isVisible, parentOrderInfo, parentGroupDeps, parentClippingRect, root, abortSignal) {
  const orderInfo = y(void 0);
  setupOrderInfo(orderInfo, properties, "zIndex", ElementType.Panel, parentGroupDeps, parentOrderInfo, abortSignal);
  const blinkingCaretTransformation = y(void 0);
  abortableEffect(() => {
    const pos = caretTransformation.value;
    if (pos == null) {
      blinkingCaretTransformation.value = void 0;
      return;
    }
    blinkingCaretTransformation.value = pos;
    const ref = setInterval(() => blinkingCaretTransformation.value = blinkingCaretTransformation.peek() == null ? pos : void 0, 500);
    return () => clearInterval(ref);
  }, abortSignal);
  const borderInset = computedBorderInset(properties, caretBorderKeys);
  const panelSize = g(() => {
    const height = blinkingCaretTransformation.value?.height;
    if (height == null) {
      return [0, 0];
    }
    return [parseAbsoluteLengthValue(properties.value.caretWidth ?? 0), height];
  });
  const panelOffset = g(() => {
    const position = blinkingCaretTransformation.value?.position;
    if (position == null) {
      return [0, 0];
    }
    return [position[0] - parseAbsoluteLengthValue(properties.value.caretWidth ?? 0) / 2, position[1]];
  });
  const panelMatrix = computedPanelMatrix(properties, globalMatrix, panelSize, panelOffset);
  setupInstancedPanel(properties, root, orderInfo, parentGroupDeps, panelMatrix, panelSize, borderInset, parentClippingRect, isVisible, getCaretMaterialConfig(), abortSignal);
}

const cancelSet = new Set();
function cancelBlur(event) {
    cancelSet.add(event);
}
const canvasInputProps = {
    onPointerDown: (e) => {
        if (!(document.activeElement instanceof HTMLElement)) {
            return;
        }
        if (!cancelSet.has(e.nativeEvent)) {
            return;
        }
        cancelSet.delete(e.nativeEvent);
        e.preventDefault();
    },
};
const segmenter = typeof Intl === 'undefined' ? undefined : new Intl.Segmenter(undefined, { granularity: 'word' });
function setupSelectionHandlers(target, properties, text, component, textLayout, focus, abortSignal) {
    abortableEffect(() => {
        if (properties.value.disabled) {
            target.value = undefined;
            return;
        }
        let dragState;
        const onPointerFinish = (e) => {
            if (dragState == null || dragState.pointerId != e.pointerId) {
                return;
            }
            e.stopImmediatePropagation?.();
            dragState = undefined;
        };
        target.value = {
            onPointerDown: (e) => {
                const layout = textLayout.peek();
                if (dragState != null || e.uv == null || layout == null) {
                    return;
                }
                cancelBlur(e.nativeEvent);
                e.stopImmediatePropagation?.();
                if ('setPointerCapture' in e.object &&
                    typeof e.object.setPointerCapture === 'function' &&
                    e.pointerId != null) {
                    e.object.setPointerCapture(e.pointerId);
                }
                const startCharIndex = uvToCharIndex(component, e.uv, layout, 'between');
                dragState = {
                    pointerId: e.pointerId,
                    startCharIndex,
                };
                setTimeout(() => focus(startCharIndex, startCharIndex));
            },
            onDblClick: (e) => {
                const layout = textLayout.peek();
                if (segmenter == null || e.uv == null || layout == null) {
                    return;
                }
                e.stopImmediatePropagation?.();
                if (properties.peek().type === 'password') {
                    setTimeout(() => focus(0, text.peek().length, 'none'));
                    return;
                }
                const charIndex = uvToCharIndex(component, e.uv, layout, 'on');
                const segments = segmenter.segment(text.peek());
                let segmentLengthSum = 0;
                for (const { segment } of segments) {
                    const segmentLength = segment.length;
                    if (charIndex < segmentLengthSum + segmentLength) {
                        setTimeout(() => focus(segmentLengthSum, segmentLengthSum + segmentLength, 'none'));
                        break;
                    }
                    segmentLengthSum += segmentLength;
                }
            },
            onPointerUp: onPointerFinish,
            onPointerLeave: onPointerFinish,
            onPointerCancel: onPointerFinish,
            onPointerMove: (e) => {
                const layout = textLayout.peek();
                if (dragState == null || dragState?.pointerId != e.pointerId || e.uv == null || layout == null) {
                    return;
                }
                e.stopImmediatePropagation?.();
                const charIndex = uvToCharIndex(component, e.uv, layout, 'between');
                const start = Math.min(dragState.startCharIndex, charIndex);
                const end = Math.max(dragState.startCharIndex, charIndex);
                const direction = dragState.startCharIndex < charIndex ? 'forward' : 'backward';
                setTimeout(() => focus(start, end, direction));
            },
        };
    }, abortSignal);
}
function uvToCharIndex({ size: s, borderInset: b, paddingInset: p }, uv, layout, position) {
    const size = s.peek();
    const borderInset = b.peek();
    const paddingInset = p.peek();
    if (size == null || borderInset == null || paddingInset == null) {
        return 0;
    }
    const [width, height] = size;
    const [bTop, , , bLeft] = borderInset;
    const [pTop, , , pLeft] = paddingInset;
    const x = uv.x * width - bLeft - pLeft;
    const y = (uv.y - 1) * height + bTop + pTop;
    return getCharIndex(layout, x, y, position);
}

const selectionBorderKeys = [
  "selectionBorderRightWidth",
  "selectionBorderTopWidth",
  "selectionBorderLeftWidth",
  "selectionBorderBottomWidth"
];
let selectionMaterialConfig;
function getSelectionMaterialConfig() {
  selectionMaterialConfig ??= createPanelMaterialConfig({
    backgroundColor: "selectionColor",
    borderBend: "selectionBorderBend",
    borderBottomLeftRadius: "selectionBorderBottomLeftRadius",
    borderBottomRightRadius: "selectionBorderBottomRightRadius",
    borderColor: "selectionBorderColor",
    borderTopLeftRadius: "selectionBorderTopLeftRadius",
    borderTopRightRadius: "selectionBorderTopRightRadius"
  }, {
    backgroundColor: 11851775
  });
  return selectionMaterialConfig;
}
function createSelection(properties, root, globalMatrix, selectionTransformations, isVisible, prevOrderInfo, prevPanelDeps, parentClippingRect, abortSignal) {
  const panels = [];
  const orderInfo = y(void 0);
  setupOrderInfo(orderInfo, properties, "zIndex", ElementType.Panel, prevPanelDeps, prevOrderInfo, abortSignal);
  const borderInset = computedBorderInset(properties, selectionBorderKeys);
  abortableEffect(() => {
    const selections = selectionTransformations.value;
    const selectionsLength = selections.length;
    for (let i = 0; i < selectionsLength; i++) {
      let panelData = panels[i];
      if (panelData == null) {
        const size = y([0, 0]);
        const offset = y([0, 0]);
        const abortController = new AbortController();
        const panelMatrix = computedPanelMatrix(properties, globalMatrix, size, offset);
        setupInstancedPanel(properties, root, orderInfo, prevPanelDeps, panelMatrix, size, borderInset, parentClippingRect, isVisible, getSelectionMaterialConfig(), abortController.signal);
        panels[i] = panelData = {
          abortController,
          offset,
          size
        };
      }
      const selection = selections[i];
      panelData.size.value = selection.size;
      panelData.offset.value = selection.position;
    }
    const panelsLength = panels.length;
    for (let i = selectionsLength; i < panelsLength; i++) {
      panels[i].abortController.abort();
    }
    panels.length = selectionsLength;
  }, abortSignal);
  abortSignal.addEventListener("abort", () => {
    const panelsLength = panels.length;
    for (let i = 0; i < panelsLength; i++) {
      panels[i].abortController.abort();
    }
  });
}

function updateHtmlSelectionRange(target, element) {
    const selectionStart = element?.selectionStart;
    const selectionEnd = element?.selectionEnd;
    const next = selectionStart == null || selectionEnd == null ? undefined : [selectionStart, selectionEnd];
    const current = target.peek();
    if (current?.[0] === next?.[0] && current?.[1] === next?.[1]) {
        return;
    }
    target.value = next;
}

const {Matrix4: Matrix4$3} = await importShared('three');
function buildRootContext(component, renderContext) {
    const root = g(() => component.parentContainer.value == null
        ? createRootContext(component, renderContext)
        : component.parentContainer.value.root.value);
    abortableEffect(() => {
        const rootValue = root.value;
        if (rootValue.component != component || !component.isAttached.value) {
            return;
        }
        const abortController = new AbortController();
        rootValue.glyphGroupManager.init(abortController.signal);
        rootValue.panelGroupManager.init(abortController.signal);
        rootValue.requestCalculateLayout = createDeferredRequestLayoutCalculation(rootValue, component);
        const onFrame = () => void (rootValue.reversePainterSortStableCache = undefined);
        rootValue.onFrameSet.add(onFrame);
        abortController.signal.addEventListener('abort', () => rootValue.onFrameSet.delete(onFrame));
        return () => abortController.abort();
    }, component.abortSignal);
    return root;
}
function createRootContext(component, renderContext) {
    const ctx = {
        isUpdateRunning: false,
        onFrameSet: new Set(),
        requestFrame: renderContext?.requestFrame,
        requestRender() {
            if (ctx.isUpdateRunning) {
                //request render unnecassary -> while render after updates ran
                return;
            }
            //not updating -> requesting a new frame so we will render after updating
            renderContext?.requestFrame();
        },
        onUpdateMatrixWorldSet: new Set(),
        requestCalculateLayout: () => { },
        component,
    };
    return Object.assign(ctx, {
        glyphGroupManager: new GlyphGroupManager(ctx, component),
        panelGroupManager: new PanelGroupManager(ctx, component),
    });
}
function createDeferredRequestLayoutCalculation(root, component) {
    let requested = true;
    const onFrame = () => {
        if (!requested) {
            return;
        }
        requested = false;
        component.node.calculateLayout();
    };
    root.onFrameSet.add(onFrame);
    component.abortSignal.addEventListener('abort', () => root.onFrameSet.delete(onFrame));
    return () => {
        requested = true;
        root.requestFrame?.();
    };
}
function buildRootMatrix(properties, size) {
    const sizeValue = size.value;
    if (sizeValue == null) {
        return undefined;
    }
    const [width, height] = sizeValue;
    const pixelSize = parseNumberValue(properties.value.pixelSize);
    return new Matrix4$3().makeTranslation(alignmentXMap[properties.value.anchorX] * width * pixelSize, alignmentYMap[properties.value.anchorY] * height * pixelSize, 0);
}

const inheritedPropertyKeys = [
    'depthTest',
    'depthWrite',
    'renderOrder',
    'pixelSize',
    'opacity',
    'color',
    'fill',
    'textAlign',
    'verticalAlign',
    'fontSize',
    'letterSpacing',
    'lineHeight',
    'wordBreak',
    'fontFamily',
    'fontWeight',
    'visibility',
    'scrollbarBorderRightWidth',
    'scrollbarBorderTopWidth',
    'scrollbarBorderLeftWidth',
    'scrollbarBorderBottomWidth',
    'scrollbarColor',
    'scrollbarWidth',
    'scrollbarBorderTopLeftRadius',
    'scrollbarBorderTopRightRadius',
    'scrollbarBorderBottomLeftRadius',
    'scrollbarBorderBottomRightRadius',
    'scrollbarBorderColor',
    'scrollbarBorderBend',
    'caretColor',
    'caretWidth',
    'caretBorderRightWidth',
    'caretBorderTopWidth',
    'caretBorderLeftWidth',
    'caretBorderBottomWidth',
    'caretBorderTopLeftRadius',
    'caretBorderTopRightRadius',
    'caretBorderBottomLeftRadius',
    'caretBorderBottomRightRadius',
    'caretBorderColor',
    'caretBorderBend',
    'selectionColor',
    'selectionWidth',
    'selectionBorderRightWidth',
    'selectionBorderTopWidth',
    'selectionBorderLeftWidth',
    'selectionBorderBottomWidth',
    'selectionBorderTopLeftRadius',
    'selectionBorderTopRightRadius',
    'selectionBorderBottomLeftRadius',
    'selectionBorderBottomRightRadius',
    'selectionBorderColor',
    'selectionBorderBend',
    //the following 3 properties need to be inheriting since we are building interactable descandents in the pointer events, so the interaction system might not run through the tree but access the descandents directly
    'pointerEvents',
    'pointerEventsType',
    'pointerEventsOrder',
];

const {Matrix4: Matrix4$2,Mesh: Mesh$2,Sphere} = await importShared('three');
const IdentityMatrix$1 = new Matrix4$2();
const sphereHelper = new Sphere();
const worldToGlobalMatrixHelper = new Matrix4$2();
const returnFalseFunction = () => false;
let currentGlobalProperties;
const baseLayerIndex = getLayerIndex({ type: "base", section: "base" });
function resetGlobalProperties(properties) {
  currentGlobalProperties = properties;
  globalProperties.setLayer(baseLayerIndex, currentGlobalProperties);
}
function setGlobalProperties(properties) {
  resetGlobalProperties({
    ...properties,
    ...currentGlobalProperties
  });
}
const globalProperties = new PropertiesImplementation(allAliases, new Proxy({}, { get: () => returnFalseFunction }));
globalProperties.setEnabled(true);
class Component extends Mesh$2 {
  inputProperties;
  initialClasses;
  abortController = new AbortController();
  handlers;
  orderInfo = y(void 0);
  isVisible;
  isClipped;
  boundingSphere = new Sphere();
  /**
   * the properties of the this component
   * e.g. get the final computed backgroundColor using `component.properties.value.backgroundColor`
   */
  properties;
  starProperties;
  node;
  size = y(void 0);
  relativeCenter = y(void 0);
  borderInset = y(void 0);
  overflow = y(Overflow.Visible);
  displayed = y(false);
  scrollable = y([false, false]);
  paddingInset = y(void 0);
  maxScrollPosition = y([void 0, void 0]);
  root;
  parentContainer = y(void 0);
  isAttached = y(false);
  isRootAttached = g(() => this.parentContainer.value?.isRootAttached.value ?? this.isAttached.value);
  hoveredList = y([]);
  activeList = y([]);
  ancestorsHaveListenersSignal;
  globalMatrix;
  globalPanelMatrix;
  abortSignal = this.abortController.signal;
  classList;
  needsRenderTraversal;
  renderTraversalChildCount = y(0);
  constructor(inputProperties, initialClasses, config) {
    super(panelGeometry, config?.material);
    this.inputProperties = inputProperties;
    this.initialClasses = initialClasses;
    this.matrixAutoUpdate = false;
    const updateParentState = () => {
      n(() => {
        const isAttached = this.parent != null;
        this.parentContainer.value = this.parent instanceof Component ? this.parent : void 0;
        this.isAttached.value = isAttached;
      });
    };
    this.addEventListener("added", updateParentState);
    this.addEventListener("removed", updateParentState);
    this.root = buildRootContext(this, config?.renderContext);
    const conditionals = createConditionals(this.root, this.hoveredList, this.activeList, config?.hasFocus, config?.isPlaceholder);
    this.properties = new PropertiesImplementation(allAliases, conditionals, config?.defaults ?? componentDefaults);
    this.properties.setLayersWithConditionals({ type: "default-overrides" }, {
      width: g(() => {
        const sizeX = this.properties.value.sizeX;
        if (sizeX == null) {
          return void 0;
        }
        return parseAbsoluteLengthValue(sizeX) / parseNumberValue(this.properties.value.pixelSize);
      }),
      height: g(() => {
        const sizeY = this.properties.value.sizeY;
        if (sizeY == null) {
          return void 0;
        }
        return parseAbsoluteLengthValue(sizeY) / parseNumberValue(this.properties.value.pixelSize);
      }),
      ...config?.defaultOverrides
    });
    abortableEffect(() => {
      if (!this.properties.enabled.value) {
        return;
      }
      const parentProprties = this.parentContainer.value?.properties;
      const layerIndex = getLayerIndex({ type: "inheritance" });
      const cleanup = parentProprties?.subscribePropertyKeys((key) => {
        if (!inheritedPropertyKeys.includes(key)) {
          return;
        }
        const signal2 = parentProprties.signal[key];
        this.properties.set(layerIndex, key, signal2);
      });
      return () => {
        cleanup?.();
        this.properties.setLayer(layerIndex, void 0);
      };
    }, this.abortSignal);
    this.starProperties = new PropertiesImplementation(allAliases, conditionals);
    this.starProperties.setLayersWithConditionals({ type: "default-overrides" }, getStarProperties(config?.defaultOverrides));
    abortableEffect(() => {
      const isRootAttached = this.isRootAttached.value;
      this.properties.setEnabled(isRootAttached);
      this.starProperties.setEnabled(isRootAttached);
    }, this.abortSignal);
    abortableEffect(() => {
      if (!this.properties.enabled.value || !this.starProperties.enabled.value) {
        return;
      }
      const parentStarProprties = this.parentContainer.value?.starProperties ?? globalProperties;
      const layerIndex = getLayerIndex({ type: "star-inheritance" });
      const cleanup = parentStarProprties?.subscribePropertyKeys((key) => {
        const signal2 = parentStarProprties.signal[key];
        this.starProperties.set(layerIndex, key, signal2);
        this.properties.set(layerIndex, key, signal2);
      });
      return () => {
        cleanup?.();
        this.properties.setLayer(layerIndex, void 0);
        this.starProperties.setLayer(layerIndex, void 0);
      };
    }, this.abortSignal);
    this.resetProperties(inputProperties);
    this.classList = new ClassList(this.properties, this.starProperties);
    if (initialClasses != null) {
      this.classList.add(...initialClasses);
    }
    abortableEffect(() => {
      const elementId = this.properties.value.id;
      if (elementId == null) {
        return;
      }
      const idClassName = `__id__${elementId}`;
      if (!(idClassName in StyleSheet)) {
        return;
      }
      this.classList.add(idClassName);
      return () => this.classList.remove(idClassName);
    }, this.abortSignal);
    this.node = new FlexNode(this);
    this.globalMatrix = computedGlobalMatrix(g(() => this.parentContainer.value?.childrenMatrix.value ?? buildRootMatrix(this.properties, this.size)), computedTransformMatrix(this));
    const pixelSize = g(() => parseNumberValue(this.properties.value.pixelSize));
    this.isClipped = computedIsClipped(this.parentContainer, this.globalMatrix, this.size, pixelSize);
    this.isVisible = computedIsVisible(this, this.isClipped, this.properties);
    this.handlers = computedHandlers(this.properties, this.starProperties, this.hoveredList, this.activeList, config?.dynamicHandlers);
    this.ancestorsHaveListenersSignal = computedAncestorsHaveListeners(this.parentContainer, this.handlers);
    this.globalPanelMatrix = computedPanelMatrix(this.properties, this.globalMatrix, this.size, void 0);
    this.raycast = makeClippedCast(this, this.raycast.bind(this), this.root, this.parentContainer, this.orderInfo);
    this.spherecast = makeClippedCast(this, makePanelSpherecast(this.root, this.boundingSphere, this.globalPanelMatrix, this), this.root, this.parentContainer, this.orderInfo);
    setupCursorCleanup(this.hoveredList, this.abortSignal);
    setupBoundingSphere(this.boundingSphere, pixelSize, this.globalMatrix, this.size, this.abortSignal);
    const hasNonUikitChildren = config?.hasNonUikitChildren ?? true;
    const isRenderless = config?.isRenderless ?? false;
    this.needsRenderTraversal = g(() => !isRenderless || this.parentContainer.value == null || this.renderTraversalChildCount.value > 0);
    abortableEffect(() => {
      const parent = this.parentContainer.value;
      if (parent == null || !this.needsRenderTraversal.value) {
        return;
      }
      parent.renderTraversalChildCount.value = parent.renderTraversalChildCount.peek() + 1;
      return () => {
        parent.renderTraversalChildCount.value = parent.renderTraversalChildCount.peek() - 1;
      };
    }, this.abortSignal);
    if (isRenderless) {
      abortableEffect(() => {
        this.visible = this.needsRenderTraversal.value;
      }, this.abortSignal);
    }
    setupPointerEvents(this, hasNonUikitChildren);
    abortableEffect(() => {
      const { value } = this.handlers;
      for (const key in value) {
        this.addEventListener(keyToEventName(key), value[key]);
      }
      return () => {
        for (const key in value) {
          this.removeEventListener(keyToEventName(key), value[key]);
        }
      };
    }, this.abortSignal);
    if (!hasNonUikitChildren) {
      const listener = ({ child }) => {
        if (child instanceof Component || child instanceof InstancedPanelMesh || child instanceof InstancedGlyphMesh) {
          return;
        }
        throw new Error(`Only pmndrs/uikit components can be added as children to this component. Got ${child.constructor.name} instead.`);
      };
      this.addEventListener("childadded", listener);
      this.abortSignal.addEventListener("abort", () => this.removeEventListener("childadded", listener));
    }
  }
  raycast(raycaster, intersects) {
    this.root.peek().component.updateMatrix();
    computeWorldToGlobalMatrix(this.root.peek(), worldToGlobalMatrixHelper);
    sphereHelper.copy(this.boundingSphere).applyMatrix4(worldToGlobalMatrixHelper);
    if (!raycaster.ray.intersectsSphere(sphereHelper)) {
      return false;
    }
    this.updateWorldMatrix(false, false);
    super.raycast(raycaster, intersects);
    return false;
  }
  updateMatrixWorld() {
    this.updateWorldMatrix(false, true);
  }
  updateWorldMatrix(updateParents, updateChildren) {
    const root = this.root.peek().component;
    const rootParent = root.parent;
    if (updateParents) {
      rootParent?.updateWorldMatrix(true, false);
    }
    if (this === root) {
      root.updateMatrix();
    }
    computeWorldToGlobalMatrix(this.root.peek(), worldToGlobalMatrixHelper);
    this.matrixWorld.multiplyMatrices(worldToGlobalMatrixHelper, this.globalPanelMatrix.peek() ?? IdentityMatrix$1);
    if (updateChildren && this.root.peek().component === this) {
      for (const update of this.root.value.onUpdateMatrixWorldSet) {
        update();
      }
    }
  }
  /**
   * allows to extending the existing properties
   */
  setProperties(inputProperties) {
    this.resetProperties({
      ...this.inputProperties,
      ...inputProperties
    });
  }
  /**
   * allows to overwrite the properties
   */
  resetProperties(inputProperties) {
    this.inputProperties = inputProperties;
    this.properties.setLayersWithConditionals({ type: "base" }, inputProperties);
    this.starProperties.setLayersWithConditionals({ type: "base" }, getStarProperties(inputProperties));
  }
  /**
   * must only be called for the root component; the component that has a non-uikit component as a parent
   */
  update(delta) {
    const root = this.root.peek();
    if (root.component != this) {
      return;
    }
    root.isUpdateRunning = true;
    for (const onFrame of this.root.peek().onFrameSet) {
      onFrame(delta);
    }
    root.isUpdateRunning = false;
  }
  copyInto(target, recursive) {
    target.name = this.name;
    target.up.copy(this.up);
    target.position.copy(this.position);
    target.rotation.order = this.rotation.order;
    target.quaternion.copy(this.quaternion);
    target.scale.copy(this.scale);
    target.matrix.copy(this.matrix);
    target.matrixWorld.copy(this.matrixWorld);
    target.matrixAutoUpdate = this.matrixAutoUpdate;
    target.matrixWorldAutoUpdate = this.matrixWorldAutoUpdate;
    target.layers.mask = this.layers.mask;
    target.visible = this.visible;
    target.castShadow = this.castShadow;
    target.receiveShadow = this.receiveShadow;
    target.frustumCulled = this.frustumCulled;
    target.renderOrder = this.renderOrder;
    target.animations = this.animations.slice();
    target.userData = JSON.parse(JSON.stringify(this.userData));
    if (recursive !== false) {
      for (const child of this.children) {
        if (child instanceof InstancedPanelMesh || child instanceof InstancedGlyphMesh) {
          continue;
        }
        if (child instanceof Component) {
          target.add(child.clone());
        }
      }
    }
  }
  clone(recursive) {
    const cloned = new Component(this.inputProperties, this.initialClasses);
    this.copyInto(cloned, recursive);
    return cloned;
  }
  copy(_source, _recursive) {
    throw new Error("Component.copy() is not supported because uikit components require constructor-based initialization. Use Component.clone() instead.");
  }
  dispose() {
    this.parent?.remove(this);
    this.abortController.abort();
  }
  /**
   * only used for internally adding instanced panel group and instanced gylph group in case this component is a root component
   */
  addUnsafe(...objects) {
    for (const object of objects) {
      super.add(object);
    }
    return this;
  }
}
function keyToEventName(key) {
  return key.slice(2).toLowerCase();
}

function searchFor(from, _class, maxSteps, allowNonUikit = false) {
  if (from instanceof _class) {
    return from;
  }
  let parent;
  if (from instanceof Component) {
    parent = from.parentContainer.value;
  }
  if (allowNonUikit) {
    parent ??= from.parent;
  }
  if (maxSteps === 0 || parent == null) {
    return void 0;
  }
  return searchFor(parent, _class, maxSteps - 1, allowNonUikit);
}
function computedGlobalMatrix(parentMatrix, localMatrix) {
  return g(() => {
    const local = localMatrix.value;
    const parent = parentMatrix.value;
    if (local == null || parent == null) {
      return void 0;
    }
    return parent.clone().multiply(local);
  });
}
function computedIsVisible(component, isClipped, properties) {
  return g(() => component.displayed.value && (isClipped == null || !isClipped?.value) && properties.value.visibility === "visible");
}
function loadResourceWithParams(target, fn, cleanup, abortSignal, param, ...additionals) {
  abortableEffect(() => {
    let canceled = false;
    let current;
    fn(readReactive(param), ...additionals).then((value) => {
      if (!canceled) {
        target.value = current = value;
      }
    }).catch(console.error);
    return () => {
      canceled = true;
      if (current != null && cleanup != null) {
        cleanup(current);
      }
    };
  }, abortSignal);
}
const eventHandlerKeys = [
  "onClick",
  "onContextMenu",
  "onDblClick",
  "onPointerCancel",
  "onPointerDown",
  "onPointerEnter",
  "onPointerLeave",
  "onPointerMove",
  "onPointerOut",
  "onPointerOver",
  "onPointerUp",
  "onWheel"
];
function computedHandlers(properties, starProperties, hoveredSignal, activeSignal, dynamicHandlers) {
  return g(() => {
    if (!properties.enabled.value) {
      return {};
    }
    const handlers = {};
    for (const key of eventHandlerKeys) {
      const handler = properties.value[key];
      if (handler != null) {
        handlers[key] = handler;
      }
    }
    addHandlers(handlers, dynamicHandlers?.value);
    addHoverHandlers(handlers, properties, hoveredSignal, properties.usedConditionals.hover, starProperties.usedConditionals.hover);
    addActiveHandlers(handlers, properties, activeSignal, properties.usedConditionals.active, starProperties.usedConditionals.active);
    return handlers;
  });
}
function computedAncestorsHaveListeners(parent, handlers) {
  return g(() => (parent.value?.ancestorsHaveListenersSignal.value ?? false) || Object.keys(handlers.value).length > 0);
}
function addHandlers(target, handlers) {
  for (const key in handlers) {
    addHandler(key, target, handlers[key]);
  }
}
function addHandler(key, target, handler) {
  if (handler == null) {
    return;
  }
  const existingHandler = target[key];
  if (existingHandler == null) {
    target[key] = handler;
    return;
  }
  target[key] = ((e) => {
    existingHandler(e);
    handler(e);
  });
}
function setupMatrixWorldUpdate(component, rootSignal, globalPanelMatrixSignal, abortSignal) {
  if (globalPanelMatrixSignal != null && !abortSignal.aborted) {
    const unsubscribe = globalPanelMatrixSignal.subscribe(() => {
      rootSignal.peek().requestRender?.();
    });
    abortSignal.addEventListener("abort", unsubscribe);
  }
  abortableEffect(() => {
    const root = rootSignal.value;
    if (root.component === component) {
      return;
    }
    const updateMatrixWorld = component.updateWorldMatrix.bind(component, false, true);
    root.onUpdateMatrixWorldSet.add(updateMatrixWorld);
    return () => root.onUpdateMatrixWorldSet.delete(updateMatrixWorld);
  }, abortSignal);
}
function setupPointerEvents(component, canHaveNonUikitChildren) {
  component.defaultPointerEvents = "auto";
  abortableEffect(() => {
    component.ancestorsHaveListeners = component.ancestorsHaveListenersSignal.value;
    component.pointerEvents = component.isVisible.value ? component.properties.value.pointerEvents : "none";
    component.pointerEventsOrder = parseNumberValue(component.properties.value.pointerEventsOrder ?? 0);
    component.pointerEventsType = component.properties.value.pointerEventsType;
  }, component.abortSignal);
  abortableEffect(() => {
    if (!component.properties.enabled.value) {
      return;
    }
    const rootComponent = component.root.value.component;
    component.intersectChildren = canHaveNonUikitChildren || rootComponent === component;
    if (!canHaveNonUikitChildren && component.properties.value.pointerEvents === "none") {
      return;
    }
    if (rootComponent === component) {
      return;
    }
    rootComponent.interactableDescendants ??= [];
    const interactableDescendants = rootComponent.interactableDescendants;
    interactableDescendants.push(component);
    return () => {
      const index = interactableDescendants.indexOf(component);
      if (index === -1) {
        return;
      }
      interactableDescendants.splice(index, 1);
    };
  }, component.abortSignal);
}
function abortableEffect(fn, abortSignal) {
  if (abortSignal.aborted) {
    return;
  }
  const unsubscribe = j(fn);
  abortSignal.addEventListener("abort", unsubscribe);
}
const alignmentXMap = { left: 0.5, center: 0, middle: 0, right: -0.5 };
const alignmentYMap = { top: -0.5, center: 0, middle: 0, bottom: 0.5 };
const alignmentZMap = { back: -0.5, center: 0, middle: 0, front: 0.5 };
function readReactive(value) {
  value = value instanceof l ? value.value : value;
  if (value === "initial") {
    return void 0;
  }
  return value;
}
function computedBorderInset(properties, keys) {
  return g(() => keys.map((key) => {
    const value = properties.value[key];
    return value == null ? 0 : parseAbsoluteLengthValue(value);
  }));
}
function withOpacity(value, opacity) {
  return g(() => {
    const result = [0, 0, 0, 0];
    writeColor(result, 0, readReactive(value), readReactive(opacity));
    return result;
  });
}
function computeWorldToGlobalMatrix(root, target) {
  const rootComponent = root.component;
  if (rootComponent.parent == null) {
    target.copy(rootComponent.matrix);
    return;
  }
  target.multiplyMatrices(rootComponent.parent.matrixWorld, rootComponent.matrix);
}

const reversePainterSortStableCacheKey = Symbol('reverse-painter-sort-stable-cache-key');
const orderInfoKey = Symbol('order-info-key');
function reversePainterSortStable(a, b) {
    if (a.groupOrder !== b.groupOrder) {
        return a.groupOrder - b.groupOrder;
    }
    if (a.renderOrder !== b.renderOrder) {
        return a.renderOrder - b.renderOrder;
    }
    let az = a.z;
    let bz = b.z;
    const aRootSignal = a.object[reversePainterSortStableCacheKey];
    const bRootSignal = b.object[reversePainterSortStableCacheKey];
    if (aRootSignal != null) {
        const root = aRootSignal.peek();
        root.reversePainterSortStableCache ??= az;
        az = root.reversePainterSortStableCache;
    }
    if (bRootSignal != null) {
        const root = bRootSignal.peek();
        root.reversePainterSortStableCache ??= bz;
        bz = root.reversePainterSortStableCache;
    }
    if (aRootSignal != null && aRootSignal.peek() === bRootSignal?.peek()) {
        return compareOrderInfo(a.object[orderInfoKey].value, b.object[orderInfoKey].value);
    }
    //default z comparison
    return az !== bz ? bz - az : a.id - b.id;
}
//the following order tries to represent the most common element order of the respective element types (e.g. panels are most likely the background element)
const ElementType = {
    Panel: 0, //render first
    Image: 1,
    Content: 2,
    Custom: 3,
    Text: 4, //render last
};
function compareOrderInfo(o1, o2) {
    if (o1 == null || o2 == null) {
        return 0;
    }
    let dif = o1.majorIndex - o2.majorIndex;
    if (dif != 0) {
        return dif;
    }
    dif = o1.minorIndex - o2.minorIndex;
    if (dif != 0) {
        return dif;
    }
    dif = o1.elementType - o2.elementType;
    if (dif != 0) {
        return dif;
    }
    return o1.patchIndex - o2.patchIndex;
}
function setupOrderInfo(target, properties, zIndexKey, type, instancedGroupDependencies, basisOrderInfoSignal, abortSignal) {
    abortableEffect(() => {
        if (!properties.enabled.value) {
            target.value = undefined;
            return;
        }
        if (basisOrderInfoSignal.value === undefined) {
            target.value = undefined;
            return;
        }
        const basisOrderInfo = basisOrderInfoSignal.value;
        //similiar but not the same as in css
        const majorIndex = parseNumberValue(properties.value[zIndexKey] ?? basisOrderInfo?.majorIndex ?? 0);
        let minorIndex;
        let patchIndex;
        if (basisOrderInfo == null) {
            minorIndex = 0;
            patchIndex = 0;
        }
        else if (type > basisOrderInfo.elementType) {
            minorIndex = basisOrderInfo.minorIndex;
            patchIndex = 0;
        }
        else if (type != basisOrderInfo.elementType ||
            !shallowEqualRecord(readReactive(instancedGroupDependencies), readReactive(basisOrderInfo.instancedGroupDependencies))) {
            minorIndex = basisOrderInfo.minorIndex + 1;
            patchIndex = 0;
        }
        else {
            minorIndex = basisOrderInfo.minorIndex;
            patchIndex = basisOrderInfo.patchIndex + 1;
        }
        patchIndex += parseNumberValue(properties.value['zIndexOffset'] ?? 0);
        target.value = {
            instancedGroupDependencies,
            elementType: type,
            majorIndex,
            minorIndex,
            patchIndex,
        };
    }, abortSignal);
}
function shallowEqualRecord(r1, r2) {
    if (r1 === r2) {
        return true;
    }
    if (r1 == null || r2 == null) {
        return false;
    }
    //i counts the number of keys in r1
    let i = 0;
    for (const key in r1) {
        if (r1[key] != r2[key]) {
            return false;
        }
        ++i;
    }
    return i === Object.keys(r2).length;
}
function setupRenderOrder(target, root, orderInfo) {
    target[reversePainterSortStableCacheKey] = root;
    target[orderInfoKey] = orderInfo;
}

const {Box2: Box2$1,Matrix4: Matrix4$1,Vector2: Vector2$3,Vector3: Vector3$3} = await importShared('three');
const distanceHelper = new Vector3$3();
const localPointHelper = new Vector3$3();
function computedGlobalScrollMatrix(properties, scrollPosition, globalMatrix) {
  return g(() => {
    const global = globalMatrix.value;
    if (global == null) {
      return void 0;
    }
    const [scrollX, scrollY] = scrollPosition.value;
    const pixelSize = parseNumberValue(properties.value.pixelSize);
    return new Matrix4$1().makeTranslation(-scrollX * pixelSize, scrollY * pixelSize, 0).premultiply(global);
  });
}
function computedAnyAncestorScrollable(parentSignal) {
  return g(() => {
    const parent = parentSignal.value;
    const [ancestorX, ancestorY] = parent?.anyAncestorScrollable?.value ?? [false, false];
    const [x, y] = parent?.scrollable.value ?? [false, false];
    return [ancestorX || x, ancestorY || y];
  });
}
function setupScrollHandlers(target, container, abortSignal, updateScrollFrame) {
  const isScrollable = g(() => container.scrollable.value.some((scrollable) => scrollable) ?? false);
  abortableEffect(() => {
    if (!isScrollable.value) {
      target.value = void 0;
      return;
    }
    const onPointerFinish = (event) => {
      if ("releasePointerCapture" in container && typeof container.releasePointerCapture === "function" && event.pointerId != null) {
        container.releasePointerCapture(event.pointerId);
      }
      if (event.pointerId == null || !container.downPointerMap.delete(event.pointerId) || container.scrollPosition.value == null) {
        return;
      }
      event.stopImmediatePropagation?.();
      if (container.downPointerMap.size > 0) {
        return;
      }
      container.root.peek().requestRender?.();
      updateScrollFrame();
    };
    target.value = {
      onPointerDown: (event) => {
        event.stopImmediatePropagation?.();
        const localPoint = container.worldToLocal(event.point.clone());
        const ponterIsMouse = event.nativeEvent != null && typeof event.nativeEvent === "object" && "pointerType" in event.nativeEvent && event.nativeEvent.pointerType === "mouse";
        const scrollbarAxisIndex = ponterIsMouse ? getIntersectedScrollbarIndex(localPoint, parseAbsoluteLengthValue(container.properties.peek().scrollbarWidth ?? 0), container.size.peek(), container.maxScrollPosition.peek(), container.borderInset.peek(), container.scrollPosition.peek()) : void 0;
        if (event.pointerId == null || ponterIsMouse && scrollbarAxisIndex == null) {
          return;
        }
        if ("setPointerCapture" in event.object && typeof event.object.setPointerCapture === "function") {
          event.object.setPointerCapture(event.pointerId);
        }
        container.downPointerMap.set(event.pointerId, scrollbarAxisIndex != null ? {
          type: "scroll-bar",
          localPoint,
          axisIndex: scrollbarAxisIndex
        } : {
          type: "scroll-panel",
          timestamp: performance.now(),
          localPoint
        });
      },
      onPointerUp: onPointerFinish,
      onPointerLeave: onPointerFinish,
      onPointerCancel: onPointerFinish,
      onPointerMove: (event) => {
        if (event.pointerId == null) {
          return;
        }
        const prevInteraction = container.downPointerMap.get(event.pointerId);
        if (prevInteraction == null) {
          return;
        }
        event.stopImmediatePropagation?.();
        container.worldToLocal(localPointHelper.copy(event.point));
        distanceHelper.copy(localPointHelper).sub(prevInteraction.localPoint);
        distanceHelper.x *= container.size.peek()?.[0] ?? 0;
        distanceHelper.y *= container.size.peek()?.[1] ?? 0;
        prevInteraction.localPoint.copy(localPointHelper);
        if (prevInteraction.type === "scroll-bar") {
          const size = container.size.peek();
          if (size == null) {
            return;
          }
          toScrollbarScrollDistance(distanceHelper, prevInteraction.axisIndex, size, container.borderInset.peek(), container.maxScrollPosition.peek(), parseAbsoluteLengthValue(container.properties.peek().scrollbarWidth ?? 0));
          scroll(container, event, distanceHelper.x, -distanceHelper.y, void 0, false);
          updateScrollFrame();
          return;
        }
        const timestamp = performance.now();
        const deltaTime = timestamp - prevInteraction.timestamp;
        scroll(container, event, -distanceHelper.x, distanceHelper.y, deltaTime, true);
        updateScrollFrame();
        prevInteraction.timestamp = timestamp;
      },
      onWheel: (event) => {
        const { nativeEvent } = event;
        if (nativeEvent == null || typeof nativeEvent != "object" || !("deltaX" in nativeEvent) || typeof nativeEvent.deltaX != "number" || !("deltaY" in nativeEvent) || typeof nativeEvent.deltaY != "number") {
          return;
        }
        scroll(container, event, nativeEvent.deltaX, nativeEvent.deltaY, void 0, false);
        updateScrollFrame();
      }
    };
  }, abortSignal);
}
function scroll(container, event, deltaX, deltaY, deltaTime, enableRubberBand) {
  const scrollPosition = container.scrollPosition.value;
  if (scrollPosition == null) {
    return;
  }
  const [wasScrolledX, wasScrolledY] = event == null ? [false, false] : getWasScrolled(event.nativeEvent);
  if (wasScrolledX) {
    deltaX = 0;
  }
  if (wasScrolledY) {
    deltaY = 0;
  }
  const [x, y] = scrollPosition;
  const [maxX, maxY] = container.maxScrollPosition.value;
  let [newX, newY] = scrollPosition;
  const [ancestorScrollableX, ancestorScrollableY] = container.anyAncestorScrollable?.value ?? [false, false];
  newX = computeScroll(x, maxX, deltaX, enableRubberBand && !ancestorScrollableX);
  newY = computeScroll(y, maxY, deltaY, enableRubberBand && !ancestorScrollableY);
  if (deltaTime != null && deltaTime > 0) {
    container.scrollVelocity.set(deltaX, deltaY).divideScalar(deltaTime);
  }
  if (event != null) {
    setWasScrolled(event.nativeEvent, wasScrolledX || Math.min(x, (maxX ?? 0) - x) > 5, wasScrolledY || Math.min(y, (maxY ?? 0) - y) > 5);
  }
  const preventScroll = container.properties.peek().onScroll?.(newX, newY, container.scrollPosition, event);
  if (preventScroll === false || x === newX && y === newY) {
    return;
  }
  container.scrollPosition.value = [newX, newY];
}
function setupScroll(container) {
  const scrollFrameNeeded = y(false);
  const updateScrollFrame = () => {
    const scrollPosition = container.scrollPosition.value;
    const [maxX, maxY] = container.maxScrollPosition.value;
    const needed = scrollPosition != null && (container.scrollVelocity.x !== 0 || container.scrollVelocity.y !== 0 || Math.abs(outsideDistance(scrollPosition[0], 0, maxX ?? 0)) > 1 || Math.abs(outsideDistance(scrollPosition[1], 0, maxY ?? 0)) > 1);
    scrollFrameNeeded.value = needed;
    if (needed) {
      container.root.peek().requestFrame?.();
    }
  };
  const onFrame = (delta) => {
    if (container.downPointerMap.size > 0) {
      return;
    }
    const scrollPosition = container.scrollPosition.value;
    if (scrollPosition == null) {
      updateScrollFrame();
      return;
    }
    let deltaX = 0;
    let deltaY = 0;
    const [x, y] = scrollPosition;
    const [maxX, maxY] = container.maxScrollPosition.value;
    const outsideDistanceX = outsideDistance(x, 0, maxX ?? 0);
    const outsideDistanceY = outsideDistance(y, 0, maxY ?? 0);
    deltaX += outsideDistanceX * -0.3;
    deltaY += outsideDistanceY * -0.3;
    deltaX += container.scrollVelocity.x * delta;
    deltaY += container.scrollVelocity.y * delta;
    container.scrollVelocity.multiplyScalar(0.9);
    if (Math.abs(container.scrollVelocity.x) < 0.01) {
      container.scrollVelocity.x = 0;
    }
    if (Math.abs(container.scrollVelocity.y) < 0.01) {
      container.scrollVelocity.y = 0;
    }
    if (deltaX !== 0 || deltaY !== 0) {
      scroll(container, void 0, deltaX, deltaY, void 0, true);
    }
    updateScrollFrame();
  };
  abortableEffect(updateScrollFrame, container.abortSignal);
  abortableEffect(() => {
    if (!scrollFrameNeeded.value) {
      return;
    }
    const root = container.root.value;
    root.onFrameSet.add(onFrame);
    root.requestFrame?.();
    return () => root.onFrameSet.delete(onFrame);
  }, container.abortSignal);
  return updateScrollFrame;
}
const wasScrolledSymbol = /* @__PURE__ */ Symbol("was-scrolled");
function getWasScrolled(event) {
  return event[wasScrolledSymbol] ?? [false, false];
}
function setWasScrolled(event, x, y) {
  event[wasScrolledSymbol] = [x, y];
}
function computeScroll(position, maxPosition, delta, enableRubberBand) {
  if (delta === 0) {
    return position;
  }
  const outside = outsideDistance(position, 0, maxPosition ?? 0);
  if (sign(delta) === sign(outside)) {
    delta *= Math.max(0, 1 - Math.abs(outside) / 100);
  }
  let newPosition = position + delta;
  if (enableRubberBand && maxPosition != null) {
    return newPosition;
  }
  return clamp(newPosition, 0, maxPosition ?? 0);
}
function sign(value) {
  return value >= 0;
}
function outsideDistance(value, min, max) {
  if (value < min) {
    return value - min;
  }
  if (value > max) {
    return value - max;
  }
  return 0;
}
const scrollbarBorderPropertyKeys = [
  "scrollbarBorderLeftWidth",
  "scrollbarBorderRightWidth",
  "scrollbarBorderTopWidth",
  "scrollbarBorderBottomWidth"
];
function setupScrollbars(container, parentClippingRect, prevOrderInfo, prevPanelDeps) {
  const scrollbarOrderInfo = y(void 0);
  setupOrderInfo(scrollbarOrderInfo, container.properties, "scrollbarZIndex", ElementType.Panel, prevPanelDeps, prevOrderInfo, container.abortSignal);
  const borderInset = computedBorderInset(container.properties, scrollbarBorderPropertyKeys);
  setupScrollbar(container, 0, parentClippingRect, scrollbarOrderInfo, prevPanelDeps, borderInset);
  setupScrollbar(container, 1, parentClippingRect, scrollbarOrderInfo, prevPanelDeps, borderInset);
}
let scrollbarMaterialConfig;
function getScrollbarMaterialConfig() {
  scrollbarMaterialConfig ??= createPanelMaterialConfig({
    backgroundColor: "scrollbarColor",
    borderBottomLeftRadius: "scrollbarBorderBottomLeftRadius",
    borderBottomRightRadius: "scrollbarBorderBottomRightRadius",
    borderTopRightRadius: "scrollbarBorderTopRightRadius",
    borderTopLeftRadius: "scrollbarBorderTopLeftRadius",
    borderColor: "scrollbarBorderColor",
    borderBend: "scrollbarBorderBend"
  }, {
    backgroundColor: 16777215
  });
  return scrollbarMaterialConfig;
}
function setupScrollbar(container, primaryIndex, parentClippingRect, orderInfo, groupDeps, borderSize) {
  const scrollbarTransformation = g(() => computeScrollbarTransformation(primaryIndex, parseAbsoluteLengthValue(container.properties.value.scrollbarWidth ?? 0), container.size.value, container.maxScrollPosition.value, container.borderInset.value, container.scrollPosition.value));
  const scrollbarPosition = g(() => scrollbarTransformation.value?.slice(0, 2) ?? [0, 0]);
  const scrollbarSize = g(() => scrollbarTransformation.value?.slice(2, 4) ?? [0, 0]);
  const panelMatrix = computedPanelMatrix(container.properties, container.globalMatrix, scrollbarSize, scrollbarPosition);
  setupInstancedPanel(container.properties, container.root, orderInfo, groupDeps, panelMatrix, scrollbarSize, borderSize, parentClippingRect, container.isVisible, getScrollbarMaterialConfig(), container.abortSignal);
}
function computeScrollbarTransformation(primaryAxisIndex, secondaryScrollbarSize, size, maxScrollPosition, borderInset, scrollPosition) {
  if (size == null || borderInset == null || scrollPosition == null) {
    return void 0;
  }
  const primaryMaxScrollPosition = maxScrollPosition[primaryAxisIndex];
  if (primaryMaxScrollPosition == null) {
    return void 0;
  }
  const result = [0, 0, 0, 0];
  const endInsetIndex = 1 - primaryAxisIndex;
  const primarySizeWithoutBorder = size[primaryAxisIndex] - borderInset[endInsetIndex] - borderInset[endInsetIndex + 2];
  const primaryScrollbarSize = computePrimaryScrollbarSize(primarySizeWithoutBorder, primaryMaxScrollPosition, secondaryScrollbarSize);
  const primaryMaxScrollbarPosition = primarySizeWithoutBorder - primaryScrollbarSize;
  const primaryScrollPosition = scrollPosition[primaryAxisIndex];
  const invertedIndex = 1 - primaryAxisIndex;
  result[primaryAxisIndex] = size[primaryAxisIndex] * 0.5 - primaryScrollbarSize * 0.5 - borderInset[(primaryAxisIndex + 3) % 4] - primaryMaxScrollbarPosition * clamp(primaryScrollPosition / primaryMaxScrollPosition, 0, 1);
  result[invertedIndex] = size[invertedIndex] * 0.5 - secondaryScrollbarSize * 0.5 - borderInset[invertedIndex + 1];
  if (primaryAxisIndex === 0) {
    result[0] *= -1;
    result[1] *= -1;
  }
  result[primaryAxisIndex + 2] = primaryScrollbarSize;
  result[endInsetIndex + 2] = secondaryScrollbarSize;
  return result;
}
function computePrimaryScrollbarSize(primarySizeWithoutBorder, primaryMaxScrollPosition, secondaryScrollbarSize) {
  return Math.max(secondaryScrollbarSize, primarySizeWithoutBorder * primarySizeWithoutBorder / (primaryMaxScrollPosition + primarySizeWithoutBorder));
}
function toScrollbarScrollDistance(target, primaryAxisIndex, size, borderInset, maxScrollPosition, secondaryScrollbarSize) {
  const primaryMaxScrollPosition = maxScrollPosition[primaryAxisIndex];
  if (size == null || borderInset == null || primaryMaxScrollPosition == null) {
    return;
  }
  const delta = target.getComponent(primaryAxisIndex);
  const primarySizeWithoutBorder = size[primaryAxisIndex] - borderInset[1 - primaryAxisIndex] - borderInset[1 - primaryAxisIndex + 2];
  const primaryScrollbarSize = computePrimaryScrollbarSize(primarySizeWithoutBorder, primaryMaxScrollPosition, secondaryScrollbarSize);
  const primaryMaxScrollbarPosition = primarySizeWithoutBorder - primaryScrollbarSize;
  target.setComponent(primaryAxisIndex, delta / primaryMaxScrollbarPosition * primaryMaxScrollPosition);
  target.setComponent(1 - primaryAxisIndex, 0);
  target.z = 0;
}
const box2Helper = new Box2$1();
const point2Helper = new Vector2$3();
function getIntersectedScrollbarIndex(point, secondaryScrollbarSize, size, maxScrollPosition, borderInset, scrollPosition) {
  if (size == null) {
    return void 0;
  }
  point2Helper.copy(point);
  point2Helper.x *= size[0];
  point2Helper.y *= size[1];
  for (let i = 0; i < 2; i++) {
    if (intersectsScrollbar(point2Helper, i, secondaryScrollbarSize, size, maxScrollPosition, borderInset, scrollPosition)) {
      return i;
    }
  }
  return void 0;
}
const centerHelper = new Vector2$3();
const sizeHelper = new Vector2$3();
function intersectsScrollbar(point, axisIndex, secondaryScrollbarSize, size, maxScrollPosition, borderInset, scrollPosition) {
  const result = computeScrollbarTransformation(axisIndex, secondaryScrollbarSize, size, maxScrollPosition, borderInset, scrollPosition);
  if (result == null) {
    return false;
  }
  box2Helper.setFromCenterAndSize(centerHelper.fromArray(result, 0), sizeHelper.fromArray(result, 2));
  return box2Helper.containsPoint(point);
}

const {Vector2: Vector2$2} = await importShared('three');
const ContainerPropertiesSchema = /* @__PURE__ */ defineSchema(() => createInPropertiesSchema(baseOutPropertiesSchema));
class Container extends Component {
  inputConfig;
  downPointerMap = /* @__PURE__ */ new Map();
  scrollVelocity = new Vector2$2();
  anyAncestorScrollable;
  clippingRect;
  childrenMatrix;
  fontFamilies;
  scrollPosition = y([0, 0]);
  constructor(inputProperties, initialClasses, inputConfig) {
    const scrollHandlers = y(void 0);
    super(inputProperties, initialClasses, {
      hasNonUikitChildren: false,
      isRenderless: true,
      dynamicHandlers: scrollHandlers,
      ...inputConfig
    });
    this.inputConfig = inputConfig;
    this.material.visible = false;
    const updateScrollFrame = setupScroll(this);
    setupScrollHandlers(scrollHandlers, this, this.abortSignal, updateScrollFrame);
    this.childrenMatrix = computedGlobalScrollMatrix(this.properties, this.scrollPosition, this.globalMatrix);
    const parentClippingRect = g(() => this.parentContainer.value?.clippingRect.value);
    this.fontFamilies = computedFontFamilies(this.properties, this.parentContainer);
    this.clippingRect = computedClippingRect(this.globalMatrix, this, g(() => parseNumberValue(this.properties.value.pixelSize)), parentClippingRect);
    this.anyAncestorScrollable = computedAnyAncestorScrollable(this.parentContainer);
    const panelGroupDeps = computedPanelGroupDependencies(this.properties);
    setupOrderInfo(this.orderInfo, this.properties, "zIndex", ElementType.Panel, panelGroupDeps, g(() => this.parentContainer.value == null ? null : this.parentContainer.value.orderInfo.value), this.abortSignal);
    setupInstancedPanel(this.properties, this.root, this.orderInfo, panelGroupDeps, this.globalPanelMatrix, this.size, this.borderInset, parentClippingRect, this.isVisible, getDefaultPanelMaterialConfig(), this.abortSignal);
    setupScrollbars(this, parentClippingRect, this.orderInfo, panelGroupDeps);
  }
  clone(recursive) {
    const cloned = new Container(this.inputProperties, this.initialClasses, this.inputConfig);
    this.copyInto(cloned, recursive);
    return cloned;
  }
}

const {SRGBColorSpace: SRGBColorSpace$2,Texture,TextureLoader} = await importShared('three');
const imageOutPropertiesSchema = /* @__PURE__ */ defineSchema(() => baseOutPropertiesSchema.extend({
  src: union([string(), instanceSchema("Texture", Texture)]).optional(),
  objectFit: _enum(["cover", "fill"]).optional(),
  keepAspectRatio: boolean().optional()
}));
const ImagePropertiesSchema = /* @__PURE__ */ defineSchema(() => createInPropertiesSchema(imageOutPropertiesSchema));
const imageDefaults = {
  ...componentDefaults,
  objectFit: "fill",
  keepAspectRatio: true
};
class Image extends Component {
  inputConfig;
  texture = y(void 0);
  constructor(inputProperties, initialClasses, inputConfig) {
    const aspectRatio = y(void 0);
    super(inputProperties, initialClasses, {
      defaults: imageDefaults,
      hasNonUikitChildren: false,
      ...inputConfig,
      defaultOverrides: { aspectRatio, ...inputConfig?.defaultOverrides }
    });
    this.inputConfig = inputConfig;
    setupOrderInfo(this.orderInfo, this.properties, "zIndex", ElementType.Image, void 0, g(() => this.parentContainer.value == null ? null : this.parentContainer.value.orderInfo.value), this.abortSignal);
    this.frustumCulled = false;
    setupRenderOrder(this, this.root, this.orderInfo);
    if (inputConfig?.loadTexture ?? true) {
      loadResourceWithParams(this.texture, loadTextureImpl, cleanupTexture, this.abortSignal, this.properties.signal.src);
    }
    const clippingPlanes = createGlobalClippingPlanes(this);
    const isMeshVisible = getImageMaterialConfig().computedIsVisibile(this.properties, this.borderInset, this.size, g(() => this.isVisible.value && this.texture.value != null));
    const data = new Float32Array(16);
    const info = { data, type: "normal" };
    this.customDepthMaterial = new PanelDepthMaterial(info);
    this.customDistanceMaterial = new PanelDistanceMaterial(info);
    this.customDepthMaterial.clippingPlanes = clippingPlanes;
    this.customDistanceMaterial.clippingPlanes = clippingPlanes;
    abortableEffect(() => {
      this.material.depthTest = this.properties.value.depthTest;
      this.root.peek().requestRender?.();
    }, this.abortSignal);
    abortableEffect(() => {
      this.material.depthWrite = this.properties.value.depthWrite ?? false;
      this.root.peek().requestRender?.();
    }, this.abortSignal);
    abortableEffect(() => {
      this.material.map = this.texture.value ?? null;
      this.material.needsUpdate = true;
      this.root.peek().requestRender?.();
    }, this.abortSignal);
    abortableEffect(() => {
      const material = createPanelMaterial(resolvePanelMaterialClassProperty(this.properties.value.panelMaterialClass), info);
      material.clippingPlanes = clippingPlanes;
      material.map = this.material.map;
      material.depthWrite = this.material.depthWrite;
      material.depthTest = this.material.depthTest;
      this.material = material;
      return () => material.dispose();
    }, this.abortSignal);
    abortableEffect(() => {
      this.renderOrder = parseNumberValue(this.properties.value.renderOrder ?? 0);
      this.root.peek().requestRender?.();
    }, this.abortSignal);
    abortableEffect(() => {
      this.castShadow = this.properties.value.castShadow;
      this.root.peek().requestRender?.();
    }, this.abortSignal);
    abortableEffect(() => {
      this.receiveShadow = this.properties.value.receiveShadow;
      this.root.peek().requestRender?.();
    }, this.abortSignal);
    setupMatrixWorldUpdate(this, this.root, this.globalPanelMatrix, this.abortSignal);
    const imageMaterialConfig2 = getImageMaterialConfig();
    abortableEffect(() => {
      if (!this.isVisible.value) {
        return;
      }
      data.set(imageMaterialConfig2.defaultData);
      const cleanupSizeEffect = j(() => {
        const size = this.size.value;
        if (size != null) {
          data.set(size, 14);
        }
      });
      const cleanupBorderEffect = j(() => {
        const borderInset = this.borderInset.value;
        if (borderInset != null) {
          data.set(borderInset, 0);
        }
      });
      this.root.peek().requestRender?.();
      return () => {
        cleanupSizeEffect();
        cleanupBorderEffect();
      };
    }, this.abortSignal);
    abortableEffect(() => {
      if (!this.isVisible.value) {
        return;
      }
      const opacity = toAbsoluteNumber(this.properties.value.opacity ?? 1, () => 1);
      writeColor(data, 4, 16777215, opacity, void 0);
      this.root.peek().requestRender?.();
    }, this.abortSignal);
    const setters = imageMaterialConfig2.setters;
    abortableEffect(() => {
      if (!this.isVisible.value) {
        return;
      }
      return this.properties.subscribePropertyKeys((key) => {
        if (!imageMaterialConfig2.hasProperty(key)) {
          return;
        }
        abortableEffect(() => {
          setters[key](data, 0, this.properties.value[key], this.size, this.properties.signal.opacity, void 0);
          this.root.peek().requestRender?.();
        }, this.abortSignal);
      });
    }, this.abortSignal);
    abortableEffect(() => {
      const texture = this.texture.value;
      const size = this.size.value;
      const borderInset = this.borderInset.value;
      if (texture == null || size == null || borderInset == null) {
        return;
      }
      texture.matrix.identity();
      this.root.peek().requestRender?.();
      if (this.properties.value.objectFit === "fill" || texture == null) {
        transformInsideBorder(borderInset, size, texture);
        return;
      }
      const { width: textureWidth, height: textureHeight } = texture.source.data;
      const textureRatio = textureWidth / textureHeight;
      const [width, height] = size;
      const [top, right, bottom, left] = borderInset;
      const boundsRatioValue = (width - left - right) / (height - top - bottom);
      if (textureRatio > boundsRatioValue) {
        texture.matrix.translate(-(0.5 * (boundsRatioValue - textureRatio)) / boundsRatioValue, 0).scale(boundsRatioValue / textureRatio, 1);
      } else {
        texture.matrix.translate(0, -(0.5 * (textureRatio - boundsRatioValue)) / textureRatio).scale(1, textureRatio / boundsRatioValue);
      }
      transformInsideBorder(borderInset, size, texture);
    }, this.abortSignal);
    abortableEffect(() => {
      this.visible = isMeshVisible.value;
      this.root.peek().requestRender?.();
    }, this.abortSignal);
    abortableEffect(() => {
      if (!this.properties.value.keepAspectRatio) {
        aspectRatio.value = void 0;
        return;
      }
      const tex = this.texture.value;
      if (tex == null) {
        aspectRatio.value = void 0;
        return;
      }
      const image = tex.source.data;
      const width = image.videoWidth ?? image.naturalWidth ?? image.width;
      const height = image.videoHeight ?? image.naturalHeight ?? image.height;
      aspectRatio.value = width / height;
    }, this.abortSignal);
  }
  clone(recursive) {
    const cloned = new Image(this.inputProperties, this.initialClasses, this.inputConfig);
    this.copyInto(cloned, recursive);
    return cloned;
  }
  add() {
    throw new Error(`the image component can not have any children`);
  }
}
function transformInsideBorder(borderInset, size, texture) {
  const [outerWidth, outerHeight] = size;
  const [top, right, bottom, left] = borderInset;
  const width = outerWidth - left - right;
  const height = outerHeight - top - bottom;
  texture.matrix.translate(-1 + (left + width) / outerWidth, -1 + (top + height) / outerHeight).scale(outerWidth / width, outerHeight / height);
}
const textureLoader = new TextureLoader();
function cleanupTexture(texture) {
  if (texture?.disposable === true) {
    texture.dispose();
  }
}
async function loadTextureImpl(src) {
  if (src == null) {
    return Promise.resolve(void 0);
  }
  if (src instanceof Texture) {
    return Promise.resolve(src);
  }
  try {
    const texture = await textureLoader.loadAsync(src);
    texture.colorSpace = SRGBColorSpace$2;
    texture.matrixAutoUpdate = false;
    return Object.assign(texture, { disposable: true });
  } catch (error) {
    console.error(error);
    return void 0;
  }
}
let imageMaterialConfig;
function getImageMaterialConfig() {
  imageMaterialConfig ??= createPanelMaterialConfig({
    borderBend: "borderBend",
    borderBottomLeftRadius: "borderBottomLeftRadius",
    borderBottomRightRadius: "borderBottomRightRadius",
    borderColor: "borderColor",
    borderTopLeftRadius: "borderTopLeftRadius",
    borderTopRightRadius: "borderTopRightRadius"
  }, {
    backgroundColor: 16777215
  });
  return imageMaterialConfig;
}

const textOutPropertiesSchema = /* @__PURE__ */ defineSchema(() => baseOutPropertiesSchema.extend({
  text: unknown().optional()
}));
const TextPropertiesSchema = /* @__PURE__ */ defineSchema(() => createInPropertiesSchema(textOutPropertiesSchema));
const textDefaults = { ...componentDefaults, ...additionalTextDefaults };
class Text extends Component {
  inputConfig;
  backgroundOrderInfo = y(void 0);
  backgroundGroupDeps;
  fontSignal;
  textLayout;
  globalTextMatrix;
  constructor(inputProperties, initialClasses, inputConfig) {
    super(inputProperties, initialClasses, {
      defaults: textDefaults,
      hasNonUikitChildren: false,
      isRenderless: true,
      ...inputConfig
    });
    this.inputConfig = inputConfig;
    this.material.visible = false;
    const parentClippingRect = g(() => this.parentContainer.value?.clippingRect.value);
    this.backgroundGroupDeps = computedPanelGroupDependencies(this.properties);
    this.globalTextMatrix = computedGlobalTextMatrix(this);
    setupOrderInfo(this.backgroundOrderInfo, this.properties, "zIndex", ElementType.Panel, this.backgroundGroupDeps, g(() => this.parentContainer.value == null ? null : this.parentContainer.value.orderInfo.value), this.abortSignal);
    const fontFamilies = computedFontFamilies(this.properties, this.parentContainer);
    this.fontSignal = computedFont(this.properties, fontFamilies);
    setupOrderInfo(this.orderInfo, this.properties, "zIndex", ElementType.Text, computedGylphGroupDependencies(this.fontSignal), this.backgroundOrderInfo, this.abortSignal);
    setupInstancedPanel(this.properties, this.root, this.backgroundOrderInfo, this.backgroundGroupDeps, this.globalPanelMatrix, this.size, this.borderInset, parentClippingRect, this.isVisible, getDefaultPanelMaterialConfig(), this.abortSignal);
    const { layout, customLayouting } = setupTextLayout(this);
    this.textLayout = layout;
    createInstancedText(this, parentClippingRect, this.textLayout);
    abortableEffect(() => this.node.setCustomLayouting(customLayouting.value), this.abortSignal);
  }
  clone(recursive) {
    const cloned = new Text(this.inputProperties, this.initialClasses, this.inputConfig);
    this.copyInto(cloned, recursive);
    return cloned;
  }
  add() {
    throw new Error(`the text component can not have any children`);
  }
}

const {Box3,Color,Matrix4,Mesh: Mesh$1,Object3D,Quaternion,Vector3: Vector3$2} = await importShared('three');
const contentOutPropertiesSchema = /* @__PURE__ */ defineSchema(() => baseOutPropertiesSchema.extend({
  depthAlign: _enum(["back", "center", "middle", "front"]).optional(),
  keepAspectRatio: boolean().optional()
}));
const ContentPropertiesSchema = /* @__PURE__ */ defineSchema(() => createInPropertiesSchema(contentOutPropertiesSchema));
const contentDefaults = {
  ...componentDefaults,
  depthAlign: "back",
  keepAspectRatio: true
};
const IdentityQuaternion = new Quaternion();
const IdentityMatrix = new Matrix4();
const box3Helper = new Box3();
const smallValue = new Vector3$2().setScalar(1e-6);
const positionHelper = new Vector3$2();
const scaleHelper = new Vector3$2();
const vectorHelper$1 = new Vector3$2();
const RemeasureOnChildrenChangeDefault = true;
const DepthWriteDefaultDefault = true;
const SupportFillPropertyDefault = false;
class Content extends Component {
  inputConfig;
  boundingBox;
  clippingPlanes;
  childrenMatrix = new Matrix4();
  constructor(inputProperties, initialClasses, inputConfig) {
    const defaultAspectRatio = y(void 0);
    super(inputProperties, initialClasses, {
      defaults: contentDefaults,
      hasNonUikitChildren: true,
      ...inputConfig,
      defaultOverrides: {
        aspectRatio: defaultAspectRatio,
        ...inputConfig?.defaultOverrides
      }
    });
    this.inputConfig = inputConfig;
    this.boundingBox = inputConfig?.boundingBox ?? y({ size: new Vector3$2(1, 1.01, 1), center: new Vector3$2(0, 0, 0) });
    abortableEffect(() => {
      const boundingBox = this.boundingBox.value;
      if (!this.properties.value.keepAspectRatio || boundingBox == null) {
        defaultAspectRatio.value = void 0;
        return;
      }
      defaultAspectRatio.value = boundingBox.size.x / boundingBox.size.y;
    }, this.abortSignal);
    this.material.visible = false;
    const panelGroupDeps = computedPanelGroupDependencies(this.properties);
    const backgroundOrderInfo = y();
    setupOrderInfo(backgroundOrderInfo, this.properties, "zIndex", ElementType.Panel, panelGroupDeps, g(() => this.parentContainer.value == null ? null : this.parentContainer.value.orderInfo.value), this.abortSignal);
    setupInstancedPanel(this.properties, this.root, backgroundOrderInfo, panelGroupDeps, this.globalPanelMatrix, this.size, this.borderInset, g(() => this.parentContainer.value?.clippingRect.value), this.isVisible, getDefaultPanelMaterialConfig(), this.abortSignal);
    abortableEffect(() => {
      if (this.size.value == null || this.paddingInset.value == null || this.borderInset.value == null || this.boundingBox.value == null) {
        this.childrenMatrix.copy(IdentityMatrix);
        return;
      }
      const [width, height] = this.size.value;
      const [pTop, pRight, pBottom, pLeft] = this.paddingInset.value;
      const [bTop, bRight, bBottom, bLeft] = this.borderInset.value;
      const topInset = pTop + bTop;
      const rightInset = pRight + bRight;
      const bottomInset = pBottom + bBottom;
      const leftInset = pLeft + bLeft;
      const innerWidth = width - leftInset - rightInset;
      const innerHeight = height - topInset - bottomInset;
      const pixelSize = parseNumberValue(this.properties.value.pixelSize);
      scaleHelper.set(innerWidth * pixelSize, innerHeight * pixelSize, this.properties.value.keepAspectRatio ? innerHeight * pixelSize * this.boundingBox.value.size.z / this.boundingBox.value.size.y : this.boundingBox.value.size.z).divide(this.boundingBox.value.size);
      positionHelper.copy(this.boundingBox.value.center).negate();
      positionHelper.z -= alignmentZMap[this.properties.value.depthAlign] * this.boundingBox.value.size.z;
      positionHelper.multiply(scaleHelper);
      positionHelper.add(vectorHelper$1.set((leftInset - rightInset) * 0.5 * pixelSize, (bottomInset - topInset) * 0.5 * pixelSize, 0));
      this.childrenMatrix.compose(positionHelper, IdentityQuaternion, scaleHelper);
    }, this.abortSignal);
    setupMatrixWorldUpdate(this, this.root, void 0, this.abortSignal);
    setupOrderInfo(this.orderInfo, this.properties, "zIndex", ElementType.Content, void 0, backgroundOrderInfo, this.abortSignal);
    this.clippingPlanes = createGlobalClippingPlanes(this);
    abortableEffect(() => {
      this.visible = this.isVisible.value;
      applyAppearancePropertiesToGroup(this.properties, this, this.inputConfig?.depthWriteDefault ?? DepthWriteDefaultDefault, this.inputConfig?.supportFillProperty ?? SupportFillPropertyDefault);
      this.root.peek().requestRender?.();
    }, this.abortSignal);
    const remeasureOnChildrenChange = this.inputConfig?.remeasureOnChildrenChange ?? RemeasureOnChildrenChangeDefault;
    if (remeasureOnChildrenChange) {
      const onChildrenChanged = this.debounceNotifyAncestorsChanged.bind(this);
      this.addEventListener("childadded", onChildrenChanged);
      this.addEventListener("childremoved", onChildrenChanged);
      this.abortSignal.addEventListener("abort", () => {
        this.removeEventListener("childadded", onChildrenChanged);
        this.removeEventListener("childremoved", onChildrenChanged);
      });
    }
  }
  childUpdateWorldMatrix(child, updateParents, updateChildren) {
    if (!(child.parent instanceof Content)) {
      Object3D.prototype.updateWorldMatrix.apply(child, [updateParents, updateChildren]);
      return;
    }
    if (updateParents) {
      this.updateWorldMatrix(true, false);
    }
    computeWorldToGlobalMatrix(this.root.value, child.matrixWorld);
    child.matrixWorld.multiply(this.globalMatrix.peek() ?? IdentityMatrix).multiply(this.childrenMatrix);
    child.updateMatrix();
    child.matrixWorld.multiply(child.matrix);
    if (updateChildren) {
      for (const childChild of child.children) {
        childChild.updateMatrixWorld(true);
      }
    }
  }
  timeoutRef;
  debounceNotifyAncestorsChanged() {
    if (this.timeoutRef != null) {
      return;
    }
    this.timeoutRef = setTimeout(this.notifyAncestorsChanged.bind(this), 0);
  }
  notifyAncestorsChanged() {
    this.timeoutRef = void 0;
    applyAppearancePropertiesToGroup(this.properties, this, this.inputConfig?.depthWriteDefault ?? DepthWriteDefaultDefault, this.inputConfig?.supportFillProperty ?? SupportFillPropertyDefault);
    this.traverse((descendant) => {
      if (descendant instanceof InstancedGlyphMesh || descendant instanceof InstancedPanelMesh || !(descendant instanceof Mesh$1)) {
        return;
      }
      setupRenderOrder(descendant, this.root, this.orderInfo);
      descendant.material.clippingPlanes = this.clippingPlanes;
      descendant.material.needsUpdate = true;
      descendant.material.transparent = true;
      descendant.raycast = makeClippedCast(this, descendant.raycast.bind(descendant), this.root, this.parentContainer, this.orderInfo);
      descendant.spherecast = descendant.spherecast != null ? makeClippedCast(this, descendant.spherecast?.bind(descendant), this.root, this.parentContainer, this.orderInfo) : void 0;
    });
    for (const child of this.children) {
      child.updateMatrixWorld = this.childUpdateWorldMatrix.bind(this, child, false, true);
      child.updateWorldMatrix = this.childUpdateWorldMatrix.bind(this, child);
    }
    if (this.inputConfig?.boundingBox == null) {
      box3Helper.makeEmpty();
      for (const child of this.children) {
        if (child instanceof InstancedGlyphMesh || child instanceof InstancedPanelMesh) {
          continue;
        }
        child.parent = null;
        box3Helper.expandByObject(child);
        child.parent = this;
      }
      const size = new Vector3$2();
      const center = new Vector3$2();
      box3Helper.getSize(size).max(smallValue);
      box3Helper.getCenter(center);
      this.boundingBox.value = { center, size };
    }
    this.root.peek().requestRender?.();
  }
  updateWorldMatrix(updateParents, updateChildren) {
    super.updateWorldMatrix(updateParents, updateChildren);
    if (updateChildren) {
      for (const child of this.children) {
        child.updateWorldMatrix(false, true);
      }
    }
  }
  clone(recursive) {
    const cloned = new Content(this.inputProperties, this.initialClasses, this.inputConfig);
    this.copyInto(cloned, recursive);
    return cloned;
  }
  dispose() {
    if (this.timeoutRef != null) {
      this.timeoutRef = void 0;
      clearInterval(this.timeoutRef);
    }
    super.dispose();
  }
}
const colorHelper = new Color();
const colorArrayHelper = [0, 0, 0, 0];
function applyAppearancePropertiesToGroup(properties, group, depthWriteDefault, supportFillProperty) {
  const color = (supportFillProperty ? properties.value.fill : void 0) ?? properties.value.color;
  const opacity = toAbsoluteNumber(properties.value.opacity, () => 1);
  if (color != null) {
    writeColor(colorArrayHelper, 0, color, opacity, void 0);
    colorHelper.fromArray(colorArrayHelper);
  }
  const depthTest = properties.value.depthTest;
  const depthWrite = properties.value.depthWrite ?? depthWriteDefault;
  const renderOrder = parseNumberValue(properties.value.renderOrder ?? 0);
  group.traverse((child) => {
    if (child instanceof InstancedGlyphMesh || child instanceof InstancedPanelMesh || !(child instanceof Mesh$1)) {
      return;
    }
    child.renderOrder = renderOrder;
    const material = child.material;
    child.userData.color ??= material.color.clone();
    material.color.copy(color != null ? colorHelper : child.userData.color);
    material.opacity = color != null ? colorArrayHelper[3] : opacity;
    material.depthTest = depthTest;
    material.depthWrite = depthWrite;
  });
}

const {Box2,BufferGeometry,FileLoader: FileLoader$1,Float32BufferAttribute,Loader: Loader$1,Matrix3,Path,Shape,ShapePath,ShapeUtils,SRGBColorSpace: SRGBColorSpace$1,Vector2: Vector2$1,Vector3: Vector3$1} = await importShared('three');


const COLOR_SPACE_SVG = SRGBColorSpace$1;

/**
 * A loader for the SVG format.
 *
 * Scalable Vector Graphics is an XML-based vector image format for two-dimensional graphics
 * with support for interactivity and animation.
 *
 * ```js
 * const loader = new SVGLoader();
 * const data = await loader.loadAsync( 'data/svgSample.svg' );
 *
 * const paths = data.paths;
 * const group = new THREE.Group();
 *
 * for ( let i = 0; i < paths.length; i ++ ) {
 *
 * 	const path = paths[ i ];
 * 	const material = new THREE.MeshBasicMaterial( {
 * 		color: path.color,
 * 		side: THREE.DoubleSide,
 * 		depthWrite: false
 * 	} );
 *
 * 	const shapes = SVGLoader.createShapes( path );
 *
 * 	for ( let j = 0; j < shapes.length; j ++ ) {
 *
 * 		const shape = shapes[ j ];
 * 		const geometry = new THREE.ShapeGeometry( shape );
 * 		const mesh = new THREE.Mesh( geometry, material );
 * 		group.add( mesh );
 *
 * 	}
 *
 * }
 *
 * scene.add( group );
 * ```
 *
 * @augments Loader
 * @three_import import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
 */
class SVGLoader extends Loader$1 {

	/**
	 * Constructs a new SVG loader.
	 *
	 * @param {LoadingManager} [manager] - The loading manager.
	 */
	constructor( manager ) {

		super( manager );

		/**
		 * Default dots per inch.
		 *
		 * @type {number}
		 * @default 90
		 */
		this.defaultDPI = 90;

		/**
		 * Default unit.
		 *
		 * @type {('mm'|'cm'|'in'|'pt'|'pc'|'px')}
		 * @default 'px'
		 */
		this.defaultUnit = 'px';

	}

	/**
	 * Starts loading from the given URL and passes the loaded SVG asset
	 * to the `onLoad()` callback.
	 *
	 * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
	 * @param {function({paths:Array<ShapePath>,xml:string})} onLoad - Executed when the loading process has been finished.
	 * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
	 * @param {onErrorCallback} onError - Executed when errors occur.
	 */
	load( url, onLoad, onProgress, onError ) {

		const scope = this;

		const loader = new FileLoader$1( scope.manager );
		loader.setPath( scope.path );
		loader.setRequestHeader( scope.requestHeader );
		loader.setWithCredentials( scope.withCredentials );
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
	 * Parses the given SVG data and returns the resulting data.
	 *
	 * @param {string} text - The raw SVG data as a string.
	 * @return {{paths:Array<ShapePath>,xml:string}} An object holding an array of shape paths and the
	 * SVG XML document.
	 */
	parse( text ) {

		const scope = this;

		function parseNode( node, style ) {

			if ( node.nodeType !== 1 ) return;

			const transform = getNodeTransform( node );

			let isDefsNode = false;

			let path = null;

			switch ( node.nodeName ) {

				case 'svg':
					style = parseStyle( node, style );
					break;

				case 'style':
					parseCSSStylesheet( node );
					break;

				case 'g':
					style = parseStyle( node, style );
					break;

				case 'path':
					style = parseStyle( node, style );
					if ( node.hasAttribute( 'd' ) ) path = parsePathNode( node );
					break;

				case 'rect':
					style = parseStyle( node, style );
					path = parseRectNode( node );
					break;

				case 'polygon':
					style = parseStyle( node, style );
					path = parsePolygonNode( node );
					break;

				case 'polyline':
					style = parseStyle( node, style );
					path = parsePolylineNode( node );
					break;

				case 'circle':
					style = parseStyle( node, style );
					path = parseCircleNode( node );
					break;

				case 'ellipse':
					style = parseStyle( node, style );
					path = parseEllipseNode( node );
					break;

				case 'line':
					style = parseStyle( node, style );
					path = parseLineNode( node );
					break;

				case 'defs':
					isDefsNode = true;
					break;

				case 'use':
					style = parseStyle( node, style );

					const href = node.getAttributeNS( 'http://www.w3.org/1999/xlink', 'href' ) || '';
					const usedNodeId = href.substring( 1 );
					const usedNode = node.viewportElement.getElementById( usedNodeId );
					if ( usedNode ) {

						parseNode( usedNode, style );

					} else {

						console.warn( 'SVGLoader: \'use node\' references non-existent node id: ' + usedNodeId );

					}

					break;
					// console.log( node );

			}

			if ( path ) {

				if ( style.fill !== undefined && style.fill !== 'none' ) {

					path.color.setStyle( style.fill, COLOR_SPACE_SVG );

				}

				transformPath( path, currentTransform );

				paths.push( path );

				path.userData = { node: node, style: style };

			}

			const childNodes = node.childNodes;

			for ( let i = 0; i < childNodes.length; i ++ ) {

				const node = childNodes[ i ];

				if ( isDefsNode && node.nodeName !== 'style' && node.nodeName !== 'defs' ) {

					// Ignore everything in defs except CSS style definitions
					// and nested defs, because it is OK by the standard to have
					// <style/> there.
					continue;

				}

				parseNode( node, style );

			}


			if ( transform ) {

				transformStack.pop();

				if ( transformStack.length > 0 ) {

					currentTransform.copy( transformStack[ transformStack.length - 1 ] );

				} else {

					currentTransform.identity();

				}

			}

		}

		function parsePathNode( node ) {

			const path = new ShapePath();

			const point = new Vector2$1();
			const control = new Vector2$1();

			const firstPoint = new Vector2$1();
			let isFirstPoint = true;
			let doSetFirstPoint = false;

			const d = node.getAttribute( 'd' );

			if ( d === '' || d === 'none' ) return null;

			// console.log( d );

			const commands = d.match( /[a-df-z][^a-df-z]*/ig );

			for ( let i = 0, l = commands.length; i < l; i ++ ) {

				const command = commands[ i ];

				const type = command.charAt( 0 );
				const data = command.slice( 1 ).trim();

				if ( isFirstPoint === true ) {

					doSetFirstPoint = true;
					isFirstPoint = false;

				}

				let numbers;

				switch ( type ) {

					case 'M':
						numbers = parseFloats( data );
						for ( let j = 0, jl = numbers.length; j < jl; j += 2 ) {

							point.x = numbers[ j + 0 ];
							point.y = numbers[ j + 1 ];
							control.x = point.x;
							control.y = point.y;

							if ( j === 0 ) {

								path.moveTo( point.x, point.y );

							} else {

								path.lineTo( point.x, point.y );

							}

							if ( j === 0 ) firstPoint.copy( point );

						}

						break;

					case 'H':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j ++ ) {

							point.x = numbers[ j ];
							control.x = point.x;
							control.y = point.y;
							path.lineTo( point.x, point.y );

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'V':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j ++ ) {

							point.y = numbers[ j ];
							control.x = point.x;
							control.y = point.y;
							path.lineTo( point.x, point.y );

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'L':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 2 ) {

							point.x = numbers[ j + 0 ];
							point.y = numbers[ j + 1 ];
							control.x = point.x;
							control.y = point.y;
							path.lineTo( point.x, point.y );

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'C':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 6 ) {

							path.bezierCurveTo(
								numbers[ j + 0 ],
								numbers[ j + 1 ],
								numbers[ j + 2 ],
								numbers[ j + 3 ],
								numbers[ j + 4 ],
								numbers[ j + 5 ]
							);
							control.x = numbers[ j + 2 ];
							control.y = numbers[ j + 3 ];
							point.x = numbers[ j + 4 ];
							point.y = numbers[ j + 5 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'S':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 4 ) {

							path.bezierCurveTo(
								getReflection( point.x, control.x ),
								getReflection( point.y, control.y ),
								numbers[ j + 0 ],
								numbers[ j + 1 ],
								numbers[ j + 2 ],
								numbers[ j + 3 ]
							);
							control.x = numbers[ j + 0 ];
							control.y = numbers[ j + 1 ];
							point.x = numbers[ j + 2 ];
							point.y = numbers[ j + 3 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'Q':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 4 ) {

							path.quadraticCurveTo(
								numbers[ j + 0 ],
								numbers[ j + 1 ],
								numbers[ j + 2 ],
								numbers[ j + 3 ]
							);
							control.x = numbers[ j + 0 ];
							control.y = numbers[ j + 1 ];
							point.x = numbers[ j + 2 ];
							point.y = numbers[ j + 3 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'T':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 2 ) {

							const rx = getReflection( point.x, control.x );
							const ry = getReflection( point.y, control.y );
							path.quadraticCurveTo(
								rx,
								ry,
								numbers[ j + 0 ],
								numbers[ j + 1 ]
							);
							control.x = rx;
							control.y = ry;
							point.x = numbers[ j + 0 ];
							point.y = numbers[ j + 1 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'A':
						numbers = parseFloats( data, [ 3, 4 ], 7 );

						for ( let j = 0, jl = numbers.length; j < jl; j += 7 ) {

							// skip command if start point == end point
							if ( numbers[ j + 5 ] == point.x && numbers[ j + 6 ] == point.y ) continue;

							const start = point.clone();
							point.x = numbers[ j + 5 ];
							point.y = numbers[ j + 6 ];
							control.x = point.x;
							control.y = point.y;
							parseArcCommand(
								path, numbers[ j ], numbers[ j + 1 ], numbers[ j + 2 ], numbers[ j + 3 ], numbers[ j + 4 ], start, point
							);

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'm':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 2 ) {

							point.x += numbers[ j + 0 ];
							point.y += numbers[ j + 1 ];
							control.x = point.x;
							control.y = point.y;

							if ( j === 0 ) {

								path.moveTo( point.x, point.y );

							} else {

								path.lineTo( point.x, point.y );

							}

							if ( j === 0 ) firstPoint.copy( point );

						}

						break;

					case 'h':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j ++ ) {

							point.x += numbers[ j ];
							control.x = point.x;
							control.y = point.y;
							path.lineTo( point.x, point.y );

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'v':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j ++ ) {

							point.y += numbers[ j ];
							control.x = point.x;
							control.y = point.y;
							path.lineTo( point.x, point.y );

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'l':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 2 ) {

							point.x += numbers[ j + 0 ];
							point.y += numbers[ j + 1 ];
							control.x = point.x;
							control.y = point.y;
							path.lineTo( point.x, point.y );

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'c':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 6 ) {

							path.bezierCurveTo(
								point.x + numbers[ j + 0 ],
								point.y + numbers[ j + 1 ],
								point.x + numbers[ j + 2 ],
								point.y + numbers[ j + 3 ],
								point.x + numbers[ j + 4 ],
								point.y + numbers[ j + 5 ]
							);
							control.x = point.x + numbers[ j + 2 ];
							control.y = point.y + numbers[ j + 3 ];
							point.x += numbers[ j + 4 ];
							point.y += numbers[ j + 5 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 's':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 4 ) {

							path.bezierCurveTo(
								getReflection( point.x, control.x ),
								getReflection( point.y, control.y ),
								point.x + numbers[ j + 0 ],
								point.y + numbers[ j + 1 ],
								point.x + numbers[ j + 2 ],
								point.y + numbers[ j + 3 ]
							);
							control.x = point.x + numbers[ j + 0 ];
							control.y = point.y + numbers[ j + 1 ];
							point.x += numbers[ j + 2 ];
							point.y += numbers[ j + 3 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'q':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 4 ) {

							path.quadraticCurveTo(
								point.x + numbers[ j + 0 ],
								point.y + numbers[ j + 1 ],
								point.x + numbers[ j + 2 ],
								point.y + numbers[ j + 3 ]
							);
							control.x = point.x + numbers[ j + 0 ];
							control.y = point.y + numbers[ j + 1 ];
							point.x += numbers[ j + 2 ];
							point.y += numbers[ j + 3 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 't':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 2 ) {

							const rx = getReflection( point.x, control.x );
							const ry = getReflection( point.y, control.y );
							path.quadraticCurveTo(
								rx,
								ry,
								point.x + numbers[ j + 0 ],
								point.y + numbers[ j + 1 ]
							);
							control.x = rx;
							control.y = ry;
							point.x = point.x + numbers[ j + 0 ];
							point.y = point.y + numbers[ j + 1 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'a':
						numbers = parseFloats( data, [ 3, 4 ], 7 );

						for ( let j = 0, jl = numbers.length; j < jl; j += 7 ) {

							// skip command if no displacement
							if ( numbers[ j + 5 ] == 0 && numbers[ j + 6 ] == 0 ) continue;

							const start = point.clone();
							point.x += numbers[ j + 5 ];
							point.y += numbers[ j + 6 ];
							control.x = point.x;
							control.y = point.y;
							parseArcCommand(
								path, numbers[ j ], numbers[ j + 1 ], numbers[ j + 2 ], numbers[ j + 3 ], numbers[ j + 4 ], start, point
							);

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'Z':
					case 'z':
						path.currentPath.autoClose = true;

						if ( path.currentPath.curves.length > 0 ) {

							// Reset point to beginning of Path
							point.copy( firstPoint );
							path.currentPath.currentPoint.copy( point );
							isFirstPoint = true;

						}

						break;

					default:
						console.warn( command );

				}

				// console.log( type, parseFloats( data ), parseFloats( data ).length  )

				doSetFirstPoint = false;

			}

			return path;

		}

		function parseCSSStylesheet( node ) {

			if ( ! node.sheet || ! node.sheet.cssRules || ! node.sheet.cssRules.length ) return;

			for ( let i = 0; i < node.sheet.cssRules.length; i ++ ) {

				const stylesheet = node.sheet.cssRules[ i ];

				if ( stylesheet.type !== 1 ) continue;

				const selectorList = stylesheet.selectorText
					.split( /,/gm )
					.filter( Boolean )
					.map( i => i.trim() );

				for ( let j = 0; j < selectorList.length; j ++ ) {

					// Remove empty rules
					const definitions = Object.fromEntries(
						Object.entries( stylesheet.style ).filter( ( [ , v ] ) => v !== '' )
					);

					stylesheets[ selectorList[ j ] ] = Object.assign(
						stylesheets[ selectorList[ j ] ] || {},
						definitions
					);

				}

			}

		}

		/**
		 * https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes
		 * https://mortoray.com/2017/02/16/rendering-an-svg-elliptical-arc-as-bezier-curves/ Appendix: Endpoint to center arc conversion
		 * From
		 * rx ry x-axis-rotation large-arc-flag sweep-flag x y
		 * To
		 * aX, aY, xRadius, yRadius, aStartAngle, aEndAngle, aClockwise, aRotation
		 */

		function parseArcCommand( path, rx, ry, x_axis_rotation, large_arc_flag, sweep_flag, start, end ) {

			if ( rx == 0 || ry == 0 ) {

				// draw a line if either of the radii == 0
				path.lineTo( end.x, end.y );
				return;

			}

			x_axis_rotation = x_axis_rotation * Math.PI / 180;

			// Ensure radii are positive
			rx = Math.abs( rx );
			ry = Math.abs( ry );

			// Compute (x1', y1')
			const dx2 = ( start.x - end.x ) / 2.0;
			const dy2 = ( start.y - end.y ) / 2.0;
			const x1p = Math.cos( x_axis_rotation ) * dx2 + Math.sin( x_axis_rotation ) * dy2;
			const y1p = - Math.sin( x_axis_rotation ) * dx2 + Math.cos( x_axis_rotation ) * dy2;

			// Compute (cx', cy')
			let rxs = rx * rx;
			let rys = ry * ry;
			const x1ps = x1p * x1p;
			const y1ps = y1p * y1p;

			// Ensure radii are large enough
			const cr = x1ps / rxs + y1ps / rys;

			if ( cr > 1 ) {

				// scale up rx,ry equally so cr == 1
				const s = Math.sqrt( cr );
				rx = s * rx;
				ry = s * ry;
				rxs = rx * rx;
				rys = ry * ry;

			}

			const dq = ( rxs * y1ps + rys * x1ps );
			const pq = ( rxs * rys - dq ) / dq;
			let q = Math.sqrt( Math.max( 0, pq ) );
			if ( large_arc_flag === sweep_flag ) q = - q;
			const cxp = q * rx * y1p / ry;
			const cyp = - q * ry * x1p / rx;

			// Step 3: Compute (cx, cy) from (cx', cy')
			const cx = Math.cos( x_axis_rotation ) * cxp - Math.sin( x_axis_rotation ) * cyp + ( start.x + end.x ) / 2;
			const cy = Math.sin( x_axis_rotation ) * cxp + Math.cos( x_axis_rotation ) * cyp + ( start.y + end.y ) / 2;

			// Step 4: Compute θ1 and Δθ
			const theta = svgAngle( 1, 0, ( x1p - cxp ) / rx, ( y1p - cyp ) / ry );
			const delta = svgAngle( ( x1p - cxp ) / rx, ( y1p - cyp ) / ry, ( - x1p - cxp ) / rx, ( - y1p - cyp ) / ry ) % ( Math.PI * 2 );

			path.currentPath.absellipse( cx, cy, rx, ry, theta, theta + delta, sweep_flag === 0, x_axis_rotation );

		}

		function svgAngle( ux, uy, vx, vy ) {

			const dot = ux * vx + uy * vy;
			const len = Math.sqrt( ux * ux + uy * uy ) * Math.sqrt( vx * vx + vy * vy );
			let ang = Math.acos( Math.max( -1, Math.min( 1, dot / len ) ) ); // floating point precision, slightly over values appear
			if ( ( ux * vy - uy * vx ) < 0 ) ang = - ang;
			return ang;

		}

		/*
		* According to https://www.w3.org/TR/SVG/shapes.html#RectElementRXAttribute
		* rounded corner should be rendered to elliptical arc, but bezier curve does the job well enough
		*/

		function parseRectNode( node ) {

			const x = parseFloatWithUnits( node.getAttribute( 'x' ) || 0 );
			const y = parseFloatWithUnits( node.getAttribute( 'y' ) || 0 );
			const rx = parseFloatWithUnits( node.getAttribute( 'rx' ) || node.getAttribute( 'ry' ) || 0 );
			const ry = parseFloatWithUnits( node.getAttribute( 'ry' ) || node.getAttribute( 'rx' ) || 0 );
			const w = parseFloatWithUnits( node.getAttribute( 'width' ) );
			const h = parseFloatWithUnits( node.getAttribute( 'height' ) );

			// Ellipse arc to Bezier approximation Coefficient (Inversed). See:
			// https://spencermortensen.com/articles/bezier-circle/
			const bci = 1 - 0.551915024494;

			const path = new ShapePath();

			// top left
			path.moveTo( x + rx, y );

			// top right
			path.lineTo( x + w - rx, y );
			if ( rx !== 0 || ry !== 0 ) {

				path.bezierCurveTo(
					x + w - rx * bci,
					y,
					x + w,
					y + ry * bci,
					x + w,
					y + ry
				);

			}

			// bottom right
			path.lineTo( x + w, y + h - ry );
			if ( rx !== 0 || ry !== 0 ) {

				path.bezierCurveTo(
					x + w,
					y + h - ry * bci,
					x + w - rx * bci,
					y + h,
					x + w - rx,
					y + h
				);

			}

			// bottom left
			path.lineTo( x + rx, y + h );
			if ( rx !== 0 || ry !== 0 ) {

				path.bezierCurveTo(
					x + rx * bci,
					y + h,
					x,
					y + h - ry * bci,
					x,
					y + h - ry
				);

			}

			// back to top left
			path.lineTo( x, y + ry );
			if ( rx !== 0 || ry !== 0 ) {

				path.bezierCurveTo( x, y + ry * bci, x + rx * bci, y, x + rx, y );

			}

			return path;

		}

		function parsePolygonNode( node ) {

			function iterator( match, a, b ) {

				const x = parseFloatWithUnits( a );
				const y = parseFloatWithUnits( b );

				if ( index === 0 ) {

					path.moveTo( x, y );

				} else {

					path.lineTo( x, y );

				}

				index ++;

			}

			const regex = /([+-]?\d*\.?\d+(?:e[+-]?\d+)?)(?:,|\s)([+-]?\d*\.?\d+(?:e[+-]?\d+)?)/g;

			const path = new ShapePath();

			let index = 0;

			node.getAttribute( 'points' ).replace( regex, iterator );

			path.currentPath.autoClose = true;

			return path;

		}

		function parsePolylineNode( node ) {

			function iterator( match, a, b ) {

				const x = parseFloatWithUnits( a );
				const y = parseFloatWithUnits( b );

				if ( index === 0 ) {

					path.moveTo( x, y );

				} else {

					path.lineTo( x, y );

				}

				index ++;

			}

			const regex = /([+-]?\d*\.?\d+(?:e[+-]?\d+)?)(?:,|\s)([+-]?\d*\.?\d+(?:e[+-]?\d+)?)/g;

			const path = new ShapePath();

			let index = 0;

			node.getAttribute( 'points' ).replace( regex, iterator );

			path.currentPath.autoClose = false;

			return path;

		}

		function parseCircleNode( node ) {

			const x = parseFloatWithUnits( node.getAttribute( 'cx' ) || 0 );
			const y = parseFloatWithUnits( node.getAttribute( 'cy' ) || 0 );
			const r = parseFloatWithUnits( node.getAttribute( 'r' ) || 0 );

			const subpath = new Path();
			subpath.absarc( x, y, r, 0, Math.PI * 2 );

			const path = new ShapePath();
			path.subPaths.push( subpath );

			return path;

		}

		function parseEllipseNode( node ) {

			const x = parseFloatWithUnits( node.getAttribute( 'cx' ) || 0 );
			const y = parseFloatWithUnits( node.getAttribute( 'cy' ) || 0 );
			const rx = parseFloatWithUnits( node.getAttribute( 'rx' ) || 0 );
			const ry = parseFloatWithUnits( node.getAttribute( 'ry' ) || 0 );

			const subpath = new Path();
			subpath.absellipse( x, y, rx, ry, 0, Math.PI * 2 );

			const path = new ShapePath();
			path.subPaths.push( subpath );

			return path;

		}

		function parseLineNode( node ) {

			const x1 = parseFloatWithUnits( node.getAttribute( 'x1' ) || 0 );
			const y1 = parseFloatWithUnits( node.getAttribute( 'y1' ) || 0 );
			const x2 = parseFloatWithUnits( node.getAttribute( 'x2' ) || 0 );
			const y2 = parseFloatWithUnits( node.getAttribute( 'y2' ) || 0 );

			const path = new ShapePath();
			path.moveTo( x1, y1 );
			path.lineTo( x2, y2 );
			path.currentPath.autoClose = false;

			return path;

		}

		//

		function parseStyle( node, style ) {

			style = Object.assign( {}, style ); // clone style

			let stylesheetStyles = {};

			if ( node.hasAttribute( 'class' ) ) {

				const classSelectors = node.getAttribute( 'class' )
					.split( /\s/ )
					.filter( Boolean )
					.map( i => i.trim() );

				for ( let i = 0; i < classSelectors.length; i ++ ) {

					stylesheetStyles = Object.assign( stylesheetStyles, stylesheets[ '.' + classSelectors[ i ] ] );

				}

			}

			if ( node.hasAttribute( 'id' ) ) {

				stylesheetStyles = Object.assign( stylesheetStyles, stylesheets[ '#' + node.getAttribute( 'id' ) ] );

			}

			function addStyle( svgName, jsName, adjustFunction ) {

				if ( adjustFunction === undefined ) adjustFunction = function copy( v ) {

					if ( v.startsWith( 'url' ) ) console.warn( 'SVGLoader: url access in attributes is not implemented.' );

					return v;

				};

				if ( node.hasAttribute( svgName ) ) style[ jsName ] = adjustFunction( node.getAttribute( svgName ) );
				if ( stylesheetStyles[ jsName ] ) style[ jsName ] = adjustFunction( stylesheetStyles[ jsName ] );
				if ( node.style && node.style[ svgName ] !== '' ) style[ jsName ] = adjustFunction( node.style[ svgName ] );

			}

			function clamp( v ) {

				return Math.max( 0, Math.min( 1, parseFloatWithUnits( v ) ) );

			}

			function positive( v ) {

				return Math.max( 0, parseFloatWithUnits( v ) );

			}

			addStyle( 'fill', 'fill' );
			addStyle( 'fill-opacity', 'fillOpacity', clamp );
			addStyle( 'fill-rule', 'fillRule' );
			addStyle( 'opacity', 'opacity', clamp );
			addStyle( 'stroke', 'stroke' );
			addStyle( 'stroke-opacity', 'strokeOpacity', clamp );
			addStyle( 'stroke-width', 'strokeWidth', positive );
			addStyle( 'stroke-linejoin', 'strokeLineJoin' );
			addStyle( 'stroke-linecap', 'strokeLineCap' );
			addStyle( 'stroke-miterlimit', 'strokeMiterLimit', positive );
			addStyle( 'visibility', 'visibility' );

			return style;

		}

		// http://www.w3.org/TR/SVG11/implnote.html#PathElementImplementationNotes

		function getReflection( a, b ) {

			return a - ( b - a );

		}

		// from https://github.com/ppvg/svg-numbers (MIT License)

		function parseFloats( input, flags, stride ) {

			if ( typeof input !== 'string' ) {

				throw new TypeError( 'Invalid input: ' + typeof input );

			}

			// Character groups
			const RE = {
				WHITESPACE: /[ \t\r\n]/,
				DIGIT: /[\d]/,
				SIGN: /[-+]/,
				POINT: /\./,
				COMMA: /,/,
				EXP: /e/i,
				FLAGS: /[01]/
			};

			// States
			const SEP = 0;
			const INT = 1;
			const FLOAT = 2;
			const EXP = 3;

			let state = SEP;
			let seenComma = true;
			let number = '', exponent = '';
			const result = [];

			function throwSyntaxError( current, i, partial ) {

				const error = new SyntaxError( 'Unexpected character "' + current + '" at index ' + i + '.' );
				error.partial = partial;
				throw error;

			}

			function newNumber() {

				if ( number !== '' ) {

					if ( exponent === '' ) result.push( Number( number ) );
					else result.push( Number( number ) * Math.pow( 10, Number( exponent ) ) );

				}

				number = '';
				exponent = '';

			}

			let current;
			const length = input.length;

			for ( let i = 0; i < length; i ++ ) {

				current = input[ i ];

				// check for flags
				if ( Array.isArray( flags ) && flags.includes( result.length % stride ) && RE.FLAGS.test( current ) ) {

					state = INT;
					number = current;
					newNumber();
					continue;

				}

				// parse until next number
				if ( state === SEP ) {

					// eat whitespace
					if ( RE.WHITESPACE.test( current ) ) {

						continue;

					}

					// start new number
					if ( RE.DIGIT.test( current ) || RE.SIGN.test( current ) ) {

						state = INT;
						number = current;
						continue;

					}

					if ( RE.POINT.test( current ) ) {

						state = FLOAT;
						number = current;
						continue;

					}

					// throw on double commas (e.g. "1, , 2")
					if ( RE.COMMA.test( current ) ) {

						if ( seenComma ) {

							throwSyntaxError( current, i, result );

						}

						seenComma = true;

					}

				}

				// parse integer part
				if ( state === INT ) {

					if ( RE.DIGIT.test( current ) ) {

						number += current;
						continue;

					}

					if ( RE.POINT.test( current ) ) {

						number += current;
						state = FLOAT;
						continue;

					}

					if ( RE.EXP.test( current ) ) {

						state = EXP;
						continue;

					}

					// throw on double signs ("-+1"), but not on sign as separator ("-1-2")
					if ( RE.SIGN.test( current )
							&& number.length === 1
							&& RE.SIGN.test( number[ 0 ] ) ) {

						throwSyntaxError( current, i, result );

					}

				}

				// parse decimal part
				if ( state === FLOAT ) {

					if ( RE.DIGIT.test( current ) ) {

						number += current;
						continue;

					}

					if ( RE.EXP.test( current ) ) {

						state = EXP;
						continue;

					}

					// throw on double decimal points (e.g. "1..2")
					if ( RE.POINT.test( current ) && number[ number.length - 1 ] === '.' ) {

						throwSyntaxError( current, i, result );

					}

				}

				// parse exponent part
				if ( state === EXP ) {

					if ( RE.DIGIT.test( current ) ) {

						exponent += current;
						continue;

					}

					if ( RE.SIGN.test( current ) ) {

						if ( exponent === '' ) {

							exponent += current;
							continue;

						}

						if ( exponent.length === 1 && RE.SIGN.test( exponent ) ) {

							throwSyntaxError( current, i, result );

						}

					}

				}


				// end of number
				if ( RE.WHITESPACE.test( current ) ) {

					newNumber();
					state = SEP;
					seenComma = false;

				} else if ( RE.COMMA.test( current ) ) {

					newNumber();
					state = SEP;
					seenComma = true;

				} else if ( RE.SIGN.test( current ) ) {

					newNumber();
					state = INT;
					number = current;

				} else if ( RE.POINT.test( current ) ) {

					newNumber();
					state = FLOAT;
					number = current;

				} else {

					throwSyntaxError( current, i, result );

				}

			}

			// add the last number found (if any)
			newNumber();

			return result;

		}

		// Units

		const units = [ 'mm', 'cm', 'in', 'pt', 'pc', 'px' ];

		// Conversion: [ fromUnit ][ toUnit ] (-1 means dpi dependent)
		const unitConversion = {

			'mm': {
				'mm': 1,
				'cm': 0.1,
				'in': 1 / 25.4,
				'pt': 72 / 25.4,
				'pc': 6 / 25.4,
				'px': -1
			},
			'cm': {
				'mm': 10,
				'cm': 1,
				'in': 1 / 2.54,
				'pt': 72 / 2.54,
				'pc': 6 / 2.54,
				'px': -1
			},
			'in': {
				'mm': 25.4,
				'cm': 2.54,
				'in': 1,
				'pt': 72,
				'pc': 6,
				'px': -1
			},
			'pt': {
				'mm': 25.4 / 72,
				'cm': 2.54 / 72,
				'in': 1 / 72,
				'pt': 1,
				'pc': 6 / 72,
				'px': -1
			},
			'pc': {
				'mm': 25.4 / 6,
				'cm': 2.54 / 6,
				'in': 1 / 6,
				'pt': 72 / 6,
				'pc': 1,
				'px': -1
			},
			'px': {
				'px': 1
			}

		};

		function parseFloatWithUnits( string ) {

			let theUnit = 'px';

			if ( typeof string === 'string' || string instanceof String ) {

				for ( let i = 0, n = units.length; i < n; i ++ ) {

					const u = units[ i ];

					if ( string.endsWith( u ) ) {

						theUnit = u;
						string = string.substring( 0, string.length - u.length );
						break;

					}

				}

			}

			let scale = undefined;

			if ( theUnit === 'px' && scope.defaultUnit !== 'px' ) {

				// Conversion scale from  pixels to inches, then to default units

				scale = unitConversion[ 'in' ][ scope.defaultUnit ] / scope.defaultDPI;

			} else {

				scale = unitConversion[ theUnit ][ scope.defaultUnit ];

				if ( scale < 0 ) {

					// Conversion scale to pixels

					scale = unitConversion[ theUnit ][ 'in' ] * scope.defaultDPI;

				}

			}

			return scale * parseFloat( string );

		}

		// Transforms

		function getNodeTransform( node ) {

			if ( ! ( node.hasAttribute( 'transform' ) || ( node.nodeName === 'use' && ( node.hasAttribute( 'x' ) || node.hasAttribute( 'y' ) ) ) ) ) {

				return null;

			}

			const transform = parseNodeTransform( node );

			if ( transformStack.length > 0 ) {

				transform.premultiply( transformStack[ transformStack.length - 1 ] );

			}

			currentTransform.copy( transform );
			transformStack.push( transform );

			return transform;

		}

		function parseNodeTransform( node ) {

			const transform = new Matrix3();
			const currentTransform = tempTransform0;

			if ( node.nodeName === 'use' && ( node.hasAttribute( 'x' ) || node.hasAttribute( 'y' ) ) ) {

				const tx = parseFloatWithUnits( node.getAttribute( 'x' ) || 0 );
				const ty = parseFloatWithUnits( node.getAttribute( 'y' ) || 0 );

				transform.translate( tx, ty );

			}

			if ( node.hasAttribute( 'transform' ) ) {

				const transformsTexts = node.getAttribute( 'transform' ).split( ')' );

				for ( let tIndex = transformsTexts.length - 1; tIndex >= 0; tIndex -- ) {

					const transformText = transformsTexts[ tIndex ].trim();

					if ( transformText === '' ) continue;

					const openParPos = transformText.indexOf( '(' );
					const closeParPos = transformText.length;

					if ( openParPos > 0 && openParPos < closeParPos ) {

						const transformType = transformText.slice( 0, openParPos );

						const array = parseFloats( transformText.slice( openParPos + 1 ) );

						currentTransform.identity();

						switch ( transformType ) {

							case 'translate':

								if ( array.length >= 1 ) {

									const tx = array[ 0 ];
									let ty = 0;

									if ( array.length >= 2 ) {

										ty = array[ 1 ];

									}

									currentTransform.translate( tx, ty );

								}

								break;

							case 'rotate':

								if ( array.length >= 1 ) {

									let angle = 0;
									let cx = 0;
									let cy = 0;

									// Angle
									angle = array[ 0 ] * Math.PI / 180;

									if ( array.length >= 3 ) {

										// Center x, y
										cx = array[ 1 ];
										cy = array[ 2 ];

									}

									// Rotate around center (cx, cy)
									tempTransform1.makeTranslation( - cx, - cy );
									tempTransform2.makeRotation( angle );
									tempTransform3.multiplyMatrices( tempTransform2, tempTransform1 );
									tempTransform1.makeTranslation( cx, cy );
									currentTransform.multiplyMatrices( tempTransform1, tempTransform3 );

								}

								break;

							case 'scale':

								if ( array.length >= 1 ) {

									const scaleX = array[ 0 ];
									let scaleY = scaleX;

									if ( array.length >= 2 ) {

										scaleY = array[ 1 ];

									}

									currentTransform.scale( scaleX, scaleY );

								}

								break;

							case 'skewX':

								if ( array.length === 1 ) {

									currentTransform.set(
										1, Math.tan( array[ 0 ] * Math.PI / 180 ), 0,
										0, 1, 0,
										0, 0, 1
									);

								}

								break;

							case 'skewY':

								if ( array.length === 1 ) {

									currentTransform.set(
										1, 0, 0,
										Math.tan( array[ 0 ] * Math.PI / 180 ), 1, 0,
										0, 0, 1
									);

								}

								break;

							case 'matrix':

								if ( array.length === 6 ) {

									currentTransform.set(
										array[ 0 ], array[ 2 ], array[ 4 ],
										array[ 1 ], array[ 3 ], array[ 5 ],
										0, 0, 1
									);

								}

								break;

						}

					}

					transform.premultiply( currentTransform );

				}

			}

			return transform;

		}

		function transformPath( path, m ) {

			function transfVec2( v2 ) {

				tempV3.set( v2.x, v2.y, 1 ).applyMatrix3( m );

				v2.set( tempV3.x, tempV3.y );

			}

			function transfEllipseGeneric( curve ) {

				// For math description see:
				// https://math.stackexchange.com/questions/4544164

				const a = curve.xRadius;
				const b = curve.yRadius;

				const cosTheta = Math.cos( curve.aRotation );
				const sinTheta = Math.sin( curve.aRotation );

				const v1 = new Vector3$1( a * cosTheta, a * sinTheta, 0 );
				const v2 = new Vector3$1( - b * sinTheta, b * cosTheta, 0 );

				const f1 = v1.applyMatrix3( m );
				const f2 = v2.applyMatrix3( m );

				const mF = tempTransform0.set(
					f1.x, f2.x, 0,
					f1.y, f2.y, 0,
					0, 0, 1,
				);

				const mFInv = tempTransform1.copy( mF ).invert();
				const mFInvT = tempTransform2.copy( mFInv ).transpose();
				const mQ = mFInvT.multiply( mFInv );
				const mQe = mQ.elements;

				const ed = eigenDecomposition( mQe[ 0 ], mQe[ 1 ], mQe[ 4 ] );
				const rt1sqrt = Math.sqrt( ed.rt1 );
				const rt2sqrt = Math.sqrt( ed.rt2 );

				curve.xRadius = 1 / rt1sqrt;
				curve.yRadius = 1 / rt2sqrt;
				curve.aRotation = Math.atan2( ed.sn, ed.cs );

				const isFullEllipse =
					( curve.aEndAngle - curve.aStartAngle ) % ( 2 * Math.PI ) < Number.EPSILON;

				// Do not touch angles of a full ellipse because after transformation they
				// would converge to a single value effectively removing the whole curve

				if ( ! isFullEllipse ) {

					const mDsqrt = tempTransform1.set(
						rt1sqrt, 0, 0,
						0, rt2sqrt, 0,
						0, 0, 1,
					);

					const mRT = tempTransform2.set(
						ed.cs, ed.sn, 0,
						- ed.sn, ed.cs, 0,
						0, 0, 1,
					);

					const mDRF = mDsqrt.multiply( mRT ).multiply( mF );

					const transformAngle = phi => {

						const { x: cosR, y: sinR } =
							new Vector3$1( Math.cos( phi ), Math.sin( phi ), 0 ).applyMatrix3( mDRF );

						return Math.atan2( sinR, cosR );

					};

					curve.aStartAngle = transformAngle( curve.aStartAngle );
					curve.aEndAngle = transformAngle( curve.aEndAngle );

					if ( isTransformFlipped( m ) ) {

						curve.aClockwise = ! curve.aClockwise;

					}

				}

			}

			function transfEllipseNoSkew( curve ) {

				// Faster shortcut if no skew is applied
				// (e.g, a euclidean transform of a group containing the ellipse)

				const sx = getTransformScaleX( m );
				const sy = getTransformScaleY( m );

				curve.xRadius *= sx;
				curve.yRadius *= sy;

				// Extract rotation angle from the matrix of form:
				//
				//  | cosθ sx   -sinθ sy |
				//  | sinθ sx    cosθ sy |
				//
				// Remembering that tanθ = sinθ / cosθ; and that
				// `sx`, `sy`, or both might be zero.
				const theta =
					sx > Number.EPSILON
						? Math.atan2( m.elements[ 1 ], m.elements[ 0 ] )
						: Math.atan2( - m.elements[ 3 ], m.elements[ 4 ] );

				curve.aRotation += theta;

				if ( isTransformFlipped( m ) ) {

					curve.aStartAngle *= -1;
					curve.aEndAngle *= -1;
					curve.aClockwise = ! curve.aClockwise;

				}

			}

			const subPaths = path.subPaths;

			for ( let i = 0, n = subPaths.length; i < n; i ++ ) {

				const subPath = subPaths[ i ];
				const curves = subPath.curves;

				for ( let j = 0; j < curves.length; j ++ ) {

					const curve = curves[ j ];

					if ( curve.isLineCurve ) {

						transfVec2( curve.v1 );
						transfVec2( curve.v2 );

					} else if ( curve.isCubicBezierCurve ) {

						transfVec2( curve.v0 );
						transfVec2( curve.v1 );
						transfVec2( curve.v2 );
						transfVec2( curve.v3 );

					} else if ( curve.isQuadraticBezierCurve ) {

						transfVec2( curve.v0 );
						transfVec2( curve.v1 );
						transfVec2( curve.v2 );

					} else if ( curve.isEllipseCurve ) {

						// Transform ellipse center point

						tempV2.set( curve.aX, curve.aY );
						transfVec2( tempV2 );
						curve.aX = tempV2.x;
						curve.aY = tempV2.y;

						// Transform ellipse shape parameters

						if ( isTransformSkewed( m ) ) {

							transfEllipseGeneric( curve );

						} else {

							transfEllipseNoSkew( curve );

						}

					}

				}

			}

		}

		function isTransformFlipped( m ) {

			const te = m.elements;
			return te[ 0 ] * te[ 4 ] - te[ 1 ] * te[ 3 ] < 0;

		}

		function isTransformSkewed( m ) {

			const te = m.elements;
			const basisDot = te[ 0 ] * te[ 3 ] + te[ 1 ] * te[ 4 ];

			// Shortcut for trivial rotations and transformations
			if ( basisDot === 0 ) return false;

			const sx = getTransformScaleX( m );
			const sy = getTransformScaleY( m );

			return Math.abs( basisDot / ( sx * sy ) ) > Number.EPSILON;

		}

		function getTransformScaleX( m ) {

			const te = m.elements;
			return Math.sqrt( te[ 0 ] * te[ 0 ] + te[ 1 ] * te[ 1 ] );

		}

		function getTransformScaleY( m ) {

			const te = m.elements;
			return Math.sqrt( te[ 3 ] * te[ 3 ] + te[ 4 ] * te[ 4 ] );

		}

		// Calculates the eigensystem of a real symmetric 2x2 matrix
		//    [ A  B ]
		//    [ B  C ]
		// in the form
		//    [ A  B ]  =  [ cs  -sn ] [ rt1   0  ] [  cs  sn ]
		//    [ B  C ]     [ sn   cs ] [  0   rt2 ] [ -sn  cs ]
		// where rt1 >= rt2.
		//
		// Adapted from: https://www.mpi-hd.mpg.de/personalhomes/globes/3x3/index.html
		// -> Algorithms for real symmetric matrices -> Analytical (2x2 symmetric)
		function eigenDecomposition( A, B, C ) {

			let rt1, rt2, cs, sn, t;
			const sm = A + C;
			const df = A - C;
			const rt = Math.sqrt( df * df + 4 * B * B );

			if ( sm > 0 ) {

				rt1 = 0.5 * ( sm + rt );
				t = 1 / rt1;
				rt2 = A * t * C - B * t * B;

			} else if ( sm < 0 ) {

				rt2 = 0.5 * ( sm - rt );

			} else {

				// This case needs to be treated separately to avoid div by 0

				rt1 = 0.5 * rt;
				rt2 = -0.5 * rt;

			}

			// Calculate eigenvectors

			if ( df > 0 ) {

				cs = df + rt;

			} else {

				cs = df - rt;

			}

			if ( Math.abs( cs ) > 2 * Math.abs( B ) ) {

				t = -2 * B / cs;
				sn = 1 / Math.sqrt( 1 + t * t );
				cs = t * sn;

			} else if ( Math.abs( B ) === 0 ) {

				cs = 1;
				sn = 0;

			} else {

				t = -0.5 * cs / B;
				cs = 1 / Math.sqrt( 1 + t * t );
				sn = t * cs;

			}

			if ( df > 0 ) {

				t = cs;
				cs = - sn;
				sn = t;

			}

			return { rt1, rt2, cs, sn };

		}

		//

		const paths = [];
		const stylesheets = {};

		const transformStack = [];

		const tempTransform0 = new Matrix3();
		const tempTransform1 = new Matrix3();
		const tempTransform2 = new Matrix3();
		const tempTransform3 = new Matrix3();
		const tempV2 = new Vector2$1();
		const tempV3 = new Vector3$1();

		const currentTransform = new Matrix3();

		const xml = new DOMParser().parseFromString( text, 'image/svg+xml' ); // application/xml

		parseNode( xml.documentElement, {
			fill: '#000',
			fillOpacity: 1,
			strokeOpacity: 1,
			strokeWidth: 1,
			strokeLineJoin: 'miter',
			strokeLineCap: 'butt',
			strokeMiterLimit: 4
		} );

		const data = { paths: paths, xml: xml.documentElement };

		// console.log( paths );
		return data;

	}

	/**
	 * Creates from the given shape path and array of shapes.
	 *
	 * @param {ShapePath} shapePath - The shape path.
	 * @return {Array<Shape>} An array of shapes.
	 */
	static createShapes( shapePath ) {

		const BIGNUMBER = 999999999;

		const IntersectionLocationType = {
			ORIGIN: 0,
			DESTINATION: 1,
			BETWEEN: 2,
			LEFT: 3,
			RIGHT: 4,
			BEHIND: 5,
			BEYOND: 6
		};

		const classifyResult = {
			loc: IntersectionLocationType.ORIGIN,
			t: 0
		};

		function findEdgeIntersection( a0, a1, b0, b1 ) {

			const x1 = a0.x;
			const x2 = a1.x;
			const x3 = b0.x;
			const x4 = b1.x;
			const y1 = a0.y;
			const y2 = a1.y;
			const y3 = b0.y;
			const y4 = b1.y;
			const nom1 = ( x4 - x3 ) * ( y1 - y3 ) - ( y4 - y3 ) * ( x1 - x3 );
			const nom2 = ( x2 - x1 ) * ( y1 - y3 ) - ( y2 - y1 ) * ( x1 - x3 );
			const denom = ( y4 - y3 ) * ( x2 - x1 ) - ( x4 - x3 ) * ( y2 - y1 );
			const t1 = nom1 / denom;
			const t2 = nom2 / denom;

			if ( ( ( denom === 0 ) && ( nom1 !== 0 ) ) || ( t1 <= 0 ) || ( t1 >= 1 ) || ( t2 < 0 ) || ( t2 > 1 ) ) {

				//1. lines are parallel or edges don't intersect

				return null;

			} else if ( ( nom1 === 0 ) && ( denom === 0 ) ) {

				//2. lines are colinear

				//check if endpoints of edge2 (b0-b1) lies on edge1 (a0-a1)
				for ( let i = 0; i < 2; i ++ ) {

					classifyPoint( i === 0 ? b0 : b1, a0, a1 );
					//find position of this endpoints relatively to edge1
					if ( classifyResult.loc == IntersectionLocationType.ORIGIN ) {

						const point = ( i === 0 ? b0 : b1 );
						return { x: point.x, y: point.y, t: classifyResult.t };

					} else if ( classifyResult.loc == IntersectionLocationType.BETWEEN ) {

						const x = + ( ( x1 + classifyResult.t * ( x2 - x1 ) ).toPrecision( 10 ) );
						const y = + ( ( y1 + classifyResult.t * ( y2 - y1 ) ).toPrecision( 10 ) );
						return { x: x, y: y, t: classifyResult.t, };

					}

				}

				return null;

			} else {

				//3. edges intersect

				for ( let i = 0; i < 2; i ++ ) {

					classifyPoint( i === 0 ? b0 : b1, a0, a1 );

					if ( classifyResult.loc == IntersectionLocationType.ORIGIN ) {

						const point = ( i === 0 ? b0 : b1 );
						return { x: point.x, y: point.y, t: classifyResult.t };

					}

				}

				const x = + ( ( x1 + t1 * ( x2 - x1 ) ).toPrecision( 10 ) );
				const y = + ( ( y1 + t1 * ( y2 - y1 ) ).toPrecision( 10 ) );
				return { x: x, y: y, t: t1 };

			}

		}

		function classifyPoint( p, edgeStart, edgeEnd ) {

			const ax = edgeEnd.x - edgeStart.x;
			const ay = edgeEnd.y - edgeStart.y;
			const bx = p.x - edgeStart.x;
			const by = p.y - edgeStart.y;
			const sa = ax * by - bx * ay;

			if ( ( p.x === edgeStart.x ) && ( p.y === edgeStart.y ) ) {

				classifyResult.loc = IntersectionLocationType.ORIGIN;
				classifyResult.t = 0;
				return;

			}

			if ( ( p.x === edgeEnd.x ) && ( p.y === edgeEnd.y ) ) {

				classifyResult.loc = IntersectionLocationType.DESTINATION;
				classifyResult.t = 1;
				return;

			}

			if ( sa < - Number.EPSILON ) {

				classifyResult.loc = IntersectionLocationType.LEFT;
				return;

			}

			if ( sa > Number.EPSILON ) {

				classifyResult.loc = IntersectionLocationType.RIGHT;
				return;


			}

			if ( ( ( ax * bx ) < 0 ) || ( ( ay * by ) < 0 ) ) {

				classifyResult.loc = IntersectionLocationType.BEHIND;
				return;

			}

			if ( ( Math.sqrt( ax * ax + ay * ay ) ) < ( Math.sqrt( bx * bx + by * by ) ) ) {

				classifyResult.loc = IntersectionLocationType.BEYOND;
				return;

			}

			let t;

			if ( ax !== 0 ) {

				t = bx / ax;

			} else {

				t = by / ay;

			}

			classifyResult.loc = IntersectionLocationType.BETWEEN;
			classifyResult.t = t;

		}

		function getIntersections( path1, path2 ) {

			const intersectionsRaw = [];
			const intersections = [];

			for ( let index = 1; index < path1.length; index ++ ) {

				const path1EdgeStart = path1[ index - 1 ];
				const path1EdgeEnd = path1[ index ];

				for ( let index2 = 1; index2 < path2.length; index2 ++ ) {

					const path2EdgeStart = path2[ index2 - 1 ];
					const path2EdgeEnd = path2[ index2 ];

					const intersection = findEdgeIntersection( path1EdgeStart, path1EdgeEnd, path2EdgeStart, path2EdgeEnd );

					if ( intersection !== null && intersectionsRaw.find( i => i.t <= intersection.t + Number.EPSILON && i.t >= intersection.t - Number.EPSILON ) === undefined ) {

						intersectionsRaw.push( intersection );
						intersections.push( new Vector2$1( intersection.x, intersection.y ) );

					}

				}

			}

			return intersections;

		}

		function getScanlineIntersections( scanline, boundingBox, paths ) {

			const center = new Vector2$1();
			boundingBox.getCenter( center );

			const allIntersections = [];

			paths.forEach( path => {

				// check if the center of the bounding box is in the bounding box of the paths.
				// this is a pruning method to limit the search of intersections in paths that can't envelop of the current path.
				// if a path envelops another path. The center of that other path, has to be inside the bounding box of the enveloping path.
				if ( path.boundingBox.containsPoint( center ) ) {

					const intersections = getIntersections( scanline, path.points );

					intersections.forEach( p => {

						allIntersections.push( { identifier: path.identifier, isCW: path.isCW, point: p } );

					} );

				}

			} );

			allIntersections.sort( ( i1, i2 ) => {

				return i1.point.x - i2.point.x;

			} );

			return allIntersections;

		}

		function isHoleTo( simplePath, allPaths, scanlineMinX, scanlineMaxX, _fillRule ) {

			if ( _fillRule === null || _fillRule === undefined || _fillRule === '' ) {

				_fillRule = 'nonzero';

			}

			const centerBoundingBox = new Vector2$1();
			simplePath.boundingBox.getCenter( centerBoundingBox );

			const scanline = [ new Vector2$1( scanlineMinX, centerBoundingBox.y ), new Vector2$1( scanlineMaxX, centerBoundingBox.y ) ];

			const scanlineIntersections = getScanlineIntersections( scanline, simplePath.boundingBox, allPaths );

			scanlineIntersections.sort( ( i1, i2 ) => {

				return i1.point.x - i2.point.x;

			} );

			const baseIntersections = [];
			const otherIntersections = [];

			scanlineIntersections.forEach( i => {

				if ( i.identifier === simplePath.identifier ) {

					baseIntersections.push( i );

				} else {

					otherIntersections.push( i );

				}

			} );

			const firstXOfPath = baseIntersections[ 0 ].point.x;

			// build up the path hierarchy
			const stack = [];
			let i = 0;

			while ( i < otherIntersections.length && otherIntersections[ i ].point.x < firstXOfPath ) {

				if ( stack.length > 0 && stack[ stack.length - 1 ] === otherIntersections[ i ].identifier ) {

					stack.pop();

				} else {

					stack.push( otherIntersections[ i ].identifier );

				}

				i ++;

			}

			stack.push( simplePath.identifier );

			if ( _fillRule === 'evenodd' ) {

				const isHole = stack.length % 2 === 0 ? true : false;
				const isHoleFor = stack[ stack.length - 2 ];

				return { identifier: simplePath.identifier, isHole: isHole, for: isHoleFor };

			} else if ( _fillRule === 'nonzero' ) {

				// check if path is a hole by counting the amount of paths with alternating rotations it has to cross.
				let isHole = true;
				let isHoleFor = null;
				let lastCWValue = null;

				for ( let i = 0; i < stack.length; i ++ ) {

					const identifier = stack[ i ];
					if ( isHole ) {

						lastCWValue = allPaths[ identifier ].isCW;
						isHole = false;
						isHoleFor = identifier;

					} else if ( lastCWValue !== allPaths[ identifier ].isCW ) {

						lastCWValue = allPaths[ identifier ].isCW;
						isHole = true;

					}

				}

				return { identifier: simplePath.identifier, isHole: isHole, for: isHoleFor };

			} else {

				console.warn( 'fill-rule: "' + _fillRule + '" is currently not implemented.' );

			}

		}

		// check for self intersecting paths
		// TODO

		// check intersecting paths
		// TODO

		// prepare paths for hole detection
		let scanlineMinX = BIGNUMBER;
		let scanlineMaxX = - BIGNUMBER;

		let simplePaths = shapePath.subPaths.map( p => {

			const points = p.getPoints();
			let maxY = - BIGNUMBER;
			let minY = BIGNUMBER;
			let maxX = - BIGNUMBER;
			let minX = BIGNUMBER;

	      	//points.forEach(p => p.y *= -1);

			for ( let i = 0; i < points.length; i ++ ) {

				const p = points[ i ];

				if ( p.y > maxY ) {

					maxY = p.y;

				}

				if ( p.y < minY ) {

					minY = p.y;

				}

				if ( p.x > maxX ) {

					maxX = p.x;

				}

				if ( p.x < minX ) {

					minX = p.x;

				}

			}

			//
			if ( scanlineMaxX <= maxX ) {

				scanlineMaxX = maxX + 1;

			}

			if ( scanlineMinX >= minX ) {

				scanlineMinX = minX - 1;

			}

			return { curves: p.curves, points: points, isCW: ShapeUtils.isClockWise( points ), identifier: -1, boundingBox: new Box2( new Vector2$1( minX, minY ), new Vector2$1( maxX, maxY ) ) };

		} );

		simplePaths = simplePaths.filter( sp => sp.points.length > 1 );

		for ( let identifier = 0; identifier < simplePaths.length; identifier ++ ) {

			simplePaths[ identifier ].identifier = identifier;

		}

		// check if path is solid or a hole
		const isAHole = simplePaths.map( p => isHoleTo( p, simplePaths, scanlineMinX, scanlineMaxX, ( shapePath.userData ? shapePath.userData.style.fillRule : undefined ) ) );


		const shapesToReturn = [];
		simplePaths.forEach( p => {

			const amIAHole = isAHole[ p.identifier ];

			if ( ! amIAHole.isHole ) {

				const shape = new Shape();
				shape.curves = p.curves;
				const holes = isAHole.filter( h => h.isHole && h.for === p.identifier );
				holes.forEach( h => {

					const hole = simplePaths[ h.identifier ];
					const path = new Path();
					path.curves = hole.curves;
					shape.holes.push( path );

				} );
				shapesToReturn.push( shape );

			}

		} );

		return shapesToReturn;

	}

	/**
	 * Returns a stroke style object from the given parameters.
	 *
	 * @param {number} [width=1] - The stroke width.
	 * @param {string} [color='#000'] - The stroke color, as  returned by {@link Color#getStyle}.
	 * @param {'round'|'bevel'|'miter'|'miter-limit'} [lineJoin='miter'] - The line join style.
	 * @param {'round'|'square'|'butt'} [lineCap='butt'] - The line cap style.
	 * @param {number} [miterLimit=4] - Maximum join length, in multiples of the `width` parameter (join is truncated if it exceeds that distance).
	 * @return {Object} The style object.
	 */
	static getStrokeStyle( width, color, lineJoin, lineCap, miterLimit ) {

		width = width !== undefined ? width : 1;
		color = color !== undefined ? color : '#000';
		lineJoin = lineJoin !== undefined ? lineJoin : 'miter';
		lineCap = lineCap !== undefined ? lineCap : 'butt';
		miterLimit = miterLimit !== undefined ? miterLimit : 4;

		return {
			strokeColor: color,
			strokeWidth: width,
			strokeLineJoin: lineJoin,
			strokeLineCap: lineCap,
			strokeMiterLimit: miterLimit
		};

	}

	/**
	 * Creates a stroke from an array of points.
	 *
	 * @param {Array<Vector2>} points - The points in 2D space. Minimum 2 points. The path can be open or closed (last point equals to first point).
	 * @param {Object} style - Object with SVG properties as returned by `SVGLoader.getStrokeStyle()`, or `SVGLoader.parse()` in the `path.userData.style` object.
	 * @param {number} [arcDivisions=12] - Arc divisions for round joins and endcaps.
	 * @param {number} [minDistance=0.001] - Points closer to this distance will be merged.
	 * @return {?BufferGeometry} The stroke geometry. UV coordinates are generated ('u' along path. 'v' across it, from left to right).
	 * Returns `null` if not geometry was generated.
	 */
	static pointsToStroke( points, style, arcDivisions, minDistance ) {

		const vertices = [];
		const normals = [];
		const uvs = [];

		if ( SVGLoader.pointsToStrokeWithBuffers( points, style, arcDivisions, minDistance, vertices, normals, uvs ) === 0 ) {

			return null;

		}

		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new Float32BufferAttribute( vertices, 3 ) );
		geometry.setAttribute( 'normal', new Float32BufferAttribute( normals, 3 ) );
		geometry.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );

		return geometry;

	}

	/**
	 * Creates a stroke from an array of points.
	 *
	 * @param {Array<Vector2>} points - The points in 2D space. Minimum 2 points.
	 * @param {Object} style - Object with SVG properties as returned by `SVGLoader.getStrokeStyle()`, or `SVGLoader.parse()` in the `path.userData.style` object.
	 * @param {number} [arcDivisions=12] - Arc divisions for round joins and endcaps.
	 * @param {number} [minDistance=0.001] - Points closer to this distance will be merged.
	 * @param {Array<number>} vertices - An array holding vertices.
	 * @param {Array<number>} normals - An array holding normals.
	 * @param {Array<number>} uvs - An array holding uvs.
	 * @param {number} [vertexOffset=0] - The vertex offset.
	 * @return {number} The number of vertices.
	 */
	static pointsToStrokeWithBuffers( points, style, arcDivisions, minDistance, vertices, normals, uvs, vertexOffset ) {

		// This function can be called to update existing arrays or buffers.
		// Accepts same parameters as pointsToStroke, plus the buffers and optional offset.
		// Param vertexOffset: Offset vertices to start writing in the buffers (3 elements/vertex for vertices and normals, and 2 elements/vertex for uvs)
		// Returns number of written vertices / normals / uvs pairs
		// if 'vertices' parameter is undefined no triangles will be generated, but the returned vertices count will still be valid (useful to preallocate the buffers)
		// 'normals' and 'uvs' buffers are optional

		const tempV2_1 = new Vector2$1();
		const tempV2_2 = new Vector2$1();
		const tempV2_3 = new Vector2$1();
		const tempV2_4 = new Vector2$1();
		const tempV2_5 = new Vector2$1();
		const tempV2_6 = new Vector2$1();
		const tempV2_7 = new Vector2$1();
		const lastPointL = new Vector2$1();
		const lastPointR = new Vector2$1();
		const point0L = new Vector2$1();
		const point0R = new Vector2$1();
		const currentPointL = new Vector2$1();
		const currentPointR = new Vector2$1();
		const nextPointL = new Vector2$1();
		const nextPointR = new Vector2$1();
		const innerPoint = new Vector2$1();
		const outerPoint = new Vector2$1();

		arcDivisions = arcDivisions !== undefined ? arcDivisions : 12;
		minDistance = minDistance !== undefined ? minDistance : 0.001;
		vertexOffset = vertexOffset !== undefined ? vertexOffset : 0;

		// First ensure there are no duplicated points
		points = removeDuplicatedPoints( points );

		const numPoints = points.length;

		if ( numPoints < 2 ) return 0;

		const isClosed = points[ 0 ].equals( points[ numPoints - 1 ] );

		let currentPoint;
		let previousPoint = points[ 0 ];
		let nextPoint;

		const strokeWidth2 = style.strokeWidth / 2;

		const deltaU = 1 / ( numPoints - 1 );
		let u0 = 0, u1;

		let innerSideModified;
		let joinIsOnLeftSide;
		let isMiter;
		let initialJoinIsOnLeftSide = false;

		let numVertices = 0;
		let currentCoordinate = vertexOffset * 3;
		let currentCoordinateUV = vertexOffset * 2;

		// Get initial left and right stroke points
		getNormal( points[ 0 ], points[ 1 ], tempV2_1 ).multiplyScalar( strokeWidth2 );
		lastPointL.copy( points[ 0 ] ).sub( tempV2_1 );
		lastPointR.copy( points[ 0 ] ).add( tempV2_1 );
		point0L.copy( lastPointL );
		point0R.copy( lastPointR );

		for ( let iPoint = 1; iPoint < numPoints; iPoint ++ ) {

			currentPoint = points[ iPoint ];

			// Get next point
			if ( iPoint === numPoints - 1 ) {

				if ( isClosed ) {

					// Skip duplicated initial point
					nextPoint = points[ 1 ];

				} else nextPoint = undefined;

			} else {

				nextPoint = points[ iPoint + 1 ];

			}

			// Normal of previous segment in tempV2_1
			const normal1 = tempV2_1;
			getNormal( previousPoint, currentPoint, normal1 );

			tempV2_3.copy( normal1 ).multiplyScalar( strokeWidth2 );
			currentPointL.copy( currentPoint ).sub( tempV2_3 );
			currentPointR.copy( currentPoint ).add( tempV2_3 );

			u1 = u0 + deltaU;

			innerSideModified = false;

			if ( nextPoint !== undefined ) {

				// Normal of next segment in tempV2_2
				getNormal( currentPoint, nextPoint, tempV2_2 );

				tempV2_3.copy( tempV2_2 ).multiplyScalar( strokeWidth2 );
				nextPointL.copy( currentPoint ).sub( tempV2_3 );
				nextPointR.copy( currentPoint ).add( tempV2_3 );

				joinIsOnLeftSide = true;
				tempV2_3.subVectors( nextPoint, previousPoint );
				if ( normal1.dot( tempV2_3 ) < 0 ) {

					joinIsOnLeftSide = false;

				}

				if ( iPoint === 1 ) initialJoinIsOnLeftSide = joinIsOnLeftSide;

				tempV2_3.subVectors( nextPoint, currentPoint );
				tempV2_3.normalize();
				const dot = Math.abs( normal1.dot( tempV2_3 ) );

				// If path is straight, don't create join
				if ( dot > Number.EPSILON ) {

					// Compute inner and outer segment intersections
					const miterSide = strokeWidth2 / dot;
					tempV2_3.multiplyScalar( - miterSide );
					tempV2_4.subVectors( currentPoint, previousPoint );
					tempV2_5.copy( tempV2_4 ).setLength( miterSide ).add( tempV2_3 );
					innerPoint.copy( tempV2_5 ).negate();
					const miterLength2 = tempV2_5.length();
					const segmentLengthPrev = tempV2_4.length();
					tempV2_4.divideScalar( segmentLengthPrev );
					tempV2_6.subVectors( nextPoint, currentPoint );
					const segmentLengthNext = tempV2_6.length();
					tempV2_6.divideScalar( segmentLengthNext );
					// Check that previous and next segments doesn't overlap with the innerPoint of intersection
					if ( tempV2_4.dot( innerPoint ) < segmentLengthPrev && tempV2_6.dot( innerPoint ) < segmentLengthNext ) {

						innerSideModified = true;

					}

					outerPoint.copy( tempV2_5 ).add( currentPoint );
					innerPoint.add( currentPoint );

					isMiter = false;

					if ( innerSideModified ) {

						if ( joinIsOnLeftSide ) {

							nextPointR.copy( innerPoint );
							currentPointR.copy( innerPoint );

						} else {

							nextPointL.copy( innerPoint );
							currentPointL.copy( innerPoint );

						}

					} else {

						// The segment triangles are generated here if there was overlapping

						makeSegmentTriangles();

					}

					switch ( style.strokeLineJoin ) {

						case 'bevel':

							makeSegmentWithBevelJoin( joinIsOnLeftSide, innerSideModified, u1 );

							break;

						case 'round':

							// Segment triangles

							createSegmentTrianglesWithMiddleSection( joinIsOnLeftSide, innerSideModified );

							// Join triangles

							if ( joinIsOnLeftSide ) {

								makeCircularSector( currentPoint, currentPointL, nextPointL, u1, 0 );

							} else {

								makeCircularSector( currentPoint, nextPointR, currentPointR, u1, 1 );

							}

							break;

						case 'miter':
						case 'miter-clip':
						default:

							const miterFraction = ( strokeWidth2 * style.strokeMiterLimit ) / miterLength2;

							if ( miterFraction < 1 ) {

								// The join miter length exceeds the miter limit

								if ( style.strokeLineJoin !== 'miter-clip' ) {

									makeSegmentWithBevelJoin( joinIsOnLeftSide, innerSideModified, u1 );
									break;

								} else {

									// Segment triangles

									createSegmentTrianglesWithMiddleSection( joinIsOnLeftSide, innerSideModified );

									// Miter-clip join triangles

									if ( joinIsOnLeftSide ) {

										tempV2_6.subVectors( outerPoint, currentPointL ).multiplyScalar( miterFraction ).add( currentPointL );
										tempV2_7.subVectors( outerPoint, nextPointL ).multiplyScalar( miterFraction ).add( nextPointL );

										addVertex( currentPointL, u1, 0 );
										addVertex( tempV2_6, u1, 0 );
										addVertex( currentPoint, u1, 0.5 );

										addVertex( currentPoint, u1, 0.5 );
										addVertex( tempV2_6, u1, 0 );
										addVertex( tempV2_7, u1, 0 );

										addVertex( currentPoint, u1, 0.5 );
										addVertex( tempV2_7, u1, 0 );
										addVertex( nextPointL, u1, 0 );

									} else {

										tempV2_6.subVectors( outerPoint, currentPointR ).multiplyScalar( miterFraction ).add( currentPointR );
										tempV2_7.subVectors( outerPoint, nextPointR ).multiplyScalar( miterFraction ).add( nextPointR );

										addVertex( currentPointR, u1, 1 );
										addVertex( tempV2_6, u1, 1 );
										addVertex( currentPoint, u1, 0.5 );

										addVertex( currentPoint, u1, 0.5 );
										addVertex( tempV2_6, u1, 1 );
										addVertex( tempV2_7, u1, 1 );

										addVertex( currentPoint, u1, 0.5 );
										addVertex( tempV2_7, u1, 1 );
										addVertex( nextPointR, u1, 1 );

									}

								}

							} else {

								// Miter join segment triangles

								if ( innerSideModified ) {

									// Optimized segment + join triangles

									if ( joinIsOnLeftSide ) {

										addVertex( lastPointR, u0, 1 );
										addVertex( lastPointL, u0, 0 );
										addVertex( outerPoint, u1, 0 );

										addVertex( lastPointR, u0, 1 );
										addVertex( outerPoint, u1, 0 );
										addVertex( innerPoint, u1, 1 );

									} else {

										addVertex( lastPointR, u0, 1 );
										addVertex( lastPointL, u0, 0 );
										addVertex( outerPoint, u1, 1 );

										addVertex( lastPointL, u0, 0 );
										addVertex( innerPoint, u1, 0 );
										addVertex( outerPoint, u1, 1 );

									}


									if ( joinIsOnLeftSide ) {

										nextPointL.copy( outerPoint );

									} else {

										nextPointR.copy( outerPoint );

									}


								} else {

									// Add extra miter join triangles

									if ( joinIsOnLeftSide ) {

										addVertex( currentPointL, u1, 0 );
										addVertex( outerPoint, u1, 0 );
										addVertex( currentPoint, u1, 0.5 );

										addVertex( currentPoint, u1, 0.5 );
										addVertex( outerPoint, u1, 0 );
										addVertex( nextPointL, u1, 0 );

									} else {

										addVertex( currentPointR, u1, 1 );
										addVertex( outerPoint, u1, 1 );
										addVertex( currentPoint, u1, 0.5 );

										addVertex( currentPoint, u1, 0.5 );
										addVertex( outerPoint, u1, 1 );
										addVertex( nextPointR, u1, 1 );

									}

								}

								isMiter = true;

							}

							break;

					}

				} else {

					// The segment triangles are generated here when two consecutive points are collinear

					makeSegmentTriangles();

				}

			} else {

				// The segment triangles are generated here if it is the ending segment

				makeSegmentTriangles();

			}

			if ( ! isClosed && iPoint === numPoints - 1 ) {

				// Start line endcap
				addCapGeometry( points[ 0 ], point0L, point0R, joinIsOnLeftSide, true, u0 );

			}

			// Increment loop variables

			u0 = u1;

			previousPoint = currentPoint;

			lastPointL.copy( nextPointL );
			lastPointR.copy( nextPointR );

		}

		if ( ! isClosed ) {

			// Ending line endcap
			addCapGeometry( currentPoint, currentPointL, currentPointR, joinIsOnLeftSide, false, u1 );

		} else if ( innerSideModified && vertices ) {

			// Modify path first segment vertices to adjust to the segments inner and outer intersections

			let lastOuter = outerPoint;
			let lastInner = innerPoint;

			if ( initialJoinIsOnLeftSide !== joinIsOnLeftSide ) {

				lastOuter = innerPoint;
				lastInner = outerPoint;

			}

			if ( joinIsOnLeftSide ) {

				if ( isMiter || initialJoinIsOnLeftSide ) {

					lastInner.toArray( vertices, 0 * 3 );
					lastInner.toArray( vertices, 3 * 3 );

					if ( isMiter ) {

						lastOuter.toArray( vertices, 1 * 3 );

					}

				}

			} else {

				if ( isMiter || ! initialJoinIsOnLeftSide ) {

					lastInner.toArray( vertices, 1 * 3 );
					lastInner.toArray( vertices, 3 * 3 );

					if ( isMiter ) {

						lastOuter.toArray( vertices, 0 * 3 );

					}

				}

			}

		}

		return numVertices;

		// -- End of algorithm

		// -- Functions

		function getNormal( p1, p2, result ) {

			result.subVectors( p2, p1 );
			return result.set( - result.y, result.x ).normalize();

		}

		function addVertex( position, u, v ) {

			if ( vertices ) {

				vertices[ currentCoordinate ] = position.x;
				vertices[ currentCoordinate + 1 ] = position.y;
				vertices[ currentCoordinate + 2 ] = 0;

				if ( normals ) {

					normals[ currentCoordinate ] = 0;
					normals[ currentCoordinate + 1 ] = 0;
					normals[ currentCoordinate + 2 ] = 1;

				}

				currentCoordinate += 3;

				if ( uvs ) {

					uvs[ currentCoordinateUV ] = u;
					uvs[ currentCoordinateUV + 1 ] = v;

					currentCoordinateUV += 2;

				}

			}

			numVertices += 3;

		}

		function makeCircularSector( center, p1, p2, u, v ) {

			// param p1, p2: Points in the circle arc.
			// p1 and p2 are in clockwise direction.

			tempV2_1.copy( p1 ).sub( center ).normalize();
			tempV2_2.copy( p2 ).sub( center ).normalize();

			let angle = Math.PI;
			const dot = tempV2_1.dot( tempV2_2 );
			if ( Math.abs( dot ) < 1 ) angle = Math.abs( Math.acos( dot ) );

			angle /= arcDivisions;

			tempV2_3.copy( p1 );

			for ( let i = 0, il = arcDivisions - 1; i < il; i ++ ) {

				tempV2_4.copy( tempV2_3 ).rotateAround( center, angle );

				addVertex( tempV2_3, u, v );
				addVertex( tempV2_4, u, v );
				addVertex( center, u, 0.5 );

				tempV2_3.copy( tempV2_4 );

			}

			addVertex( tempV2_4, u, v );
			addVertex( p2, u, v );
			addVertex( center, u, 0.5 );

		}

		function makeSegmentTriangles() {

			addVertex( lastPointR, u0, 1 );
			addVertex( lastPointL, u0, 0 );
			addVertex( currentPointL, u1, 0 );

			addVertex( lastPointR, u0, 1 );
			addVertex( currentPointL, u1, 0 );
			addVertex( currentPointR, u1, 1 );

		}

		function makeSegmentWithBevelJoin( joinIsOnLeftSide, innerSideModified, u ) {

			if ( innerSideModified ) {

				// Optimized segment + bevel triangles

				if ( joinIsOnLeftSide ) {

					// Path segments triangles

					addVertex( lastPointR, u0, 1 );
					addVertex( lastPointL, u0, 0 );
					addVertex( currentPointL, u1, 0 );

					addVertex( lastPointR, u0, 1 );
					addVertex( currentPointL, u1, 0 );
					addVertex( innerPoint, u1, 1 );

					// Bevel join triangle

					addVertex( currentPointL, u, 0 );
					addVertex( nextPointL, u, 0 );
					addVertex( innerPoint, u, 0.5 );

				} else {

					// Path segments triangles

					addVertex( lastPointR, u0, 1 );
					addVertex( lastPointL, u0, 0 );
					addVertex( currentPointR, u1, 1 );

					addVertex( lastPointL, u0, 0 );
					addVertex( innerPoint, u1, 0 );
					addVertex( currentPointR, u1, 1 );

					// Bevel join triangle

					addVertex( currentPointR, u, 1 );
					addVertex( innerPoint, u, 0 );
					addVertex( nextPointR, u, 1 );

				}

			} else {

				// Bevel join triangle. The segment triangles are done in the main loop

				if ( joinIsOnLeftSide ) {

					addVertex( currentPointL, u, 0 );
					addVertex( nextPointL, u, 0 );
					addVertex( currentPoint, u, 0.5 );

				} else {

					addVertex( currentPointR, u, 1 );
					addVertex( nextPointR, u, 0 );
					addVertex( currentPoint, u, 0.5 );

				}

			}

		}

		function createSegmentTrianglesWithMiddleSection( joinIsOnLeftSide, innerSideModified ) {

			if ( innerSideModified ) {

				if ( joinIsOnLeftSide ) {

					addVertex( lastPointR, u0, 1 );
					addVertex( lastPointL, u0, 0 );
					addVertex( currentPointL, u1, 0 );

					addVertex( lastPointR, u0, 1 );
					addVertex( currentPointL, u1, 0 );
					addVertex( innerPoint, u1, 1 );

					addVertex( currentPointL, u0, 0 );
					addVertex( currentPoint, u1, 0.5 );
					addVertex( innerPoint, u1, 1 );

					addVertex( currentPoint, u1, 0.5 );
					addVertex( nextPointL, u0, 0 );
					addVertex( innerPoint, u1, 1 );

				} else {

					addVertex( lastPointR, u0, 1 );
					addVertex( lastPointL, u0, 0 );
					addVertex( currentPointR, u1, 1 );

					addVertex( lastPointL, u0, 0 );
					addVertex( innerPoint, u1, 0 );
					addVertex( currentPointR, u1, 1 );

					addVertex( currentPointR, u0, 1 );
					addVertex( innerPoint, u1, 0 );
					addVertex( currentPoint, u1, 0.5 );

					addVertex( currentPoint, u1, 0.5 );
					addVertex( innerPoint, u1, 0 );
					addVertex( nextPointR, u0, 1 );

				}

			}

		}

		function addCapGeometry( center, p1, p2, joinIsOnLeftSide, start, u ) {

			// param center: End point of the path
			// param p1, p2: Left and right cap points

			switch ( style.strokeLineCap ) {

				case 'round':

					if ( start ) {

						makeCircularSector( center, p2, p1, u, 0.5 );

					} else {

						makeCircularSector( center, p1, p2, u, 0.5 );

					}

					break;

				case 'square':

					if ( start ) {

						tempV2_1.subVectors( p1, center );
						tempV2_2.set( tempV2_1.y, - tempV2_1.x );

						tempV2_3.addVectors( tempV2_1, tempV2_2 ).add( center );
						tempV2_4.subVectors( tempV2_2, tempV2_1 ).add( center );

						// Modify already existing vertices
						if ( joinIsOnLeftSide ) {

							tempV2_3.toArray( vertices, 1 * 3 );
							tempV2_4.toArray( vertices, 0 * 3 );
							tempV2_4.toArray( vertices, 3 * 3 );

						} else {

							tempV2_3.toArray( vertices, 1 * 3 );
							// using tempV2_4 to update 3rd vertex if the uv.y of 3rd vertex is 1
							uvs[ 3 * 2 + 1 ] === 1 ? tempV2_4.toArray( vertices, 3 * 3 ) : tempV2_3.toArray( vertices, 3 * 3 );
							tempV2_4.toArray( vertices, 0 * 3 );

						}

					} else {

						tempV2_1.subVectors( p2, center );
						tempV2_2.set( tempV2_1.y, - tempV2_1.x );

						tempV2_3.addVectors( tempV2_1, tempV2_2 ).add( center );
						tempV2_4.subVectors( tempV2_2, tempV2_1 ).add( center );

						const vl = vertices.length;

						// Modify already existing vertices
						if ( joinIsOnLeftSide ) {

							tempV2_3.toArray( vertices, vl - 1 * 3 );
							tempV2_4.toArray( vertices, vl - 2 * 3 );
							tempV2_4.toArray( vertices, vl - 4 * 3 );

						} else {

							tempV2_4.toArray( vertices, vl - 2 * 3 );
							tempV2_3.toArray( vertices, vl - 1 * 3 );
							tempV2_4.toArray( vertices, vl - 4 * 3 );

						}

					}

					break;

			}

		}

		function removeDuplicatedPoints( points ) {

			// Creates a new array if necessary with duplicated points removed.
			// This does not remove duplicated initial and ending points of a closed path.

			let dupPoints = false;
			for ( let i = 1, n = points.length - 1; i < n; i ++ ) {

				if ( points[ i ].distanceTo( points[ i + 1 ] ) < minDistance ) {

					dupPoints = true;
					break;

				}

			}

			if ( ! dupPoints ) return points;

			const newPoints = [];
			newPoints.push( points[ 0 ] );

			for ( let i = 1, n = points.length - 1; i < n; i ++ ) {

				if ( points[ i ].distanceTo( points[ i + 1 ] ) >= minDistance ) {

					newPoints.push( points[ i ] );

				}

			}

			newPoints.push( points[ points.length - 1 ] );

			return newPoints;

		}

	}


}

const {Material,Mesh,MeshBasicMaterial,ShapeGeometry,Vector3} = await importShared('three');
const svgOutPropertiesSchema = /* @__PURE__ */ defineSchema(() => contentOutPropertiesSchema.extend({
    src: string().optional(),
    content: string().optional(),
}));
const SvgPropertiesSchema = /* @__PURE__ */ defineSchema(() => createInPropertiesSchema(svgOutPropertiesSchema));
class Svg extends Content {
    inputConfig;
    constructor(inputProperties, initialClasses, inputConfig) {
        const boundingBox = y(undefined);
        super(inputProperties, initialClasses, {
            ...inputConfig,
            remeasureOnChildrenChange: false,
            depthWriteDefault: false,
            supportFillProperty: true,
            boundingBox,
        });
        this.inputConfig = inputConfig;
        const svgResult = y(undefined);
        loadResourceWithParams(svgResult, loadSvg, disposeSvg, this.abortSignal, g(() => ({
            src: this.properties.value.src,
            content: this.properties.value.content,
        })));
        abortableEffect(() => {
            const result = svgResult.value;
            boundingBox.value = result?.boundingBox;
            if (result == null || result.meshes.length === 0) {
                this.notifyAncestorsChanged();
                return;
            }
            super.addUnsafe(...result.meshes);
            this.notifyAncestorsChanged();
            return () => {
                super.remove(...result.meshes);
            };
        }, this.abortSignal);
    }
    add() {
        throw new Error(`the svg component can not have any children`);
    }
    clone(recursive) {
        const cloned = new Svg(this.inputProperties, this.initialClasses, this.inputConfig);
        this.copyInto(cloned, recursive);
        return cloned;
    }
}
const svgCache = new Map();
const loader = new SVGLoader();
async function loadSvg({ src, content, }) {
    if (src == null && content == null) {
        return undefined;
    }
    let result;
    if (src != null) {
        let promise = svgCache.get(src);
        if (promise == null) {
            svgCache.set(src, (promise = loader.loadAsync(src)));
        }
        result = (await promise);
    }
    else {
        result = loader.parse(content);
    }
    const meshes = [];
    for (const path of result.paths) {
        const shapes = SVGLoader.createShapes(path);
        const material = new MeshBasicMaterial({ color: path.color, toneMapped: false });
        for (const shape of shapes) {
            const mesh = new Mesh(new ShapeGeometry(shape), material);
            mesh.matrixAutoUpdate = false;
            mesh.scale.y = -1;
            mesh.updateMatrix();
            meshes.push(mesh);
        }
    }
    let boundingBox;
    const viewBoxNumbers = result.xml
        .getAttribute('viewBox')
        ?.split(/\s+/)
        .map((s) => Number.parseFloat(s))
        .filter((value) => !isNaN(value));
    if (viewBoxNumbers?.length === 4) {
        const [minX, minY, width, height] = viewBoxNumbers;
        boundingBox = {
            center: new Vector3(width / 2 + minX, -height / 2 - minY, 0),
            size: new Vector3(width, height, 0.00001),
        };
    }
    return { meshes, boundingBox };
}
function disposeSvg(result) {
    result?.meshes.forEach((mesh) => {
        if (mesh.material instanceof Material) {
            mesh.material.dispose();
        }
        mesh.geometry.dispose();
    });
}

function createHtmlInputElement(onChange, multiline, onSelectionChange) {
    const element = document.createElement(multiline ? 'textarea' : 'input');
    const style = element.style;
    style.setProperty('position', 'absolute');
    style.setProperty('left', '-1000vw');
    style.setProperty('top', '0');
    style.setProperty('pointerEvents', 'none');
    style.setProperty('opacity', '0');
    element.addEventListener('input', () => {
        onChange?.(element.value);
        onSelectionChange();
    });
    element.addEventListener('focus', onSelectionChange);
    element.addEventListener('keydown', onSelectionChange);
    element.addEventListener('keyup', onSelectionChange);
    element.addEventListener('blur', onSelectionChange);
    return element;
}
function setupHtmlInputElement(properties, element, value, abortSignal) {
    document.body.appendChild(element);
    abortSignal.addEventListener('abort', () => element.remove());
    abortableEffect(() => {
        element.value = value.value;
    }, abortSignal);
    abortableEffect(() => {
        element.disabled = properties.value.disabled;
    }, abortSignal);
    abortableEffect(() => {
        element.tabIndex = parseNumberValue(properties.value.tabIndex);
    }, abortSignal);
    abortableEffect(() => {
        element.autocomplete = properties.value.autocomplete;
    }, abortSignal);
    abortableEffect(() => element.setAttribute('type', properties.value.type), abortSignal);
}
function setupUpdateHasFocus(element, hasFocusSignal, onFocusChange, abortSignal) {
    if (abortSignal.aborted) {
        return;
    }
    hasFocusSignal.value = document.activeElement === element;
    const listener = () => {
        const hasFocus = document.activeElement === element;
        if (hasFocus == hasFocusSignal.value) {
            return;
        }
        hasFocusSignal.value = hasFocus;
        onFocusChange(hasFocus);
    };
    element.addEventListener('focus', listener);
    element.addEventListener('blur', listener);
    abortSignal.addEventListener('abort', () => {
        element.removeEventListener('focus', listener);
        element.removeEventListener('blur', listener);
    });
}

const inputOutPropertiesSchema = /* @__PURE__ */ defineSchema(() => textOutPropertiesSchema.omit({ text: true }).extend({
  placeholder: string().optional(),
  defaultValue: string().optional(),
  value: string().optional(),
  disabled: boolean().optional(),
  tabIndex: numberValueSchema.optional(),
  autocomplete: string().optional(),
  type: _enum(["text", "password", "number"]).optional(),
  onValueChange: functionSchema.optional(),
  onFocusChange: functionSchema.optional(),
  whiteSpace: _enum(["normal", "collapse", "pre", "pre-line"]).optional()
}));
const InputPropertiesSchema = /* @__PURE__ */ defineSchema(() => createInPropertiesSchema(inputOutPropertiesSchema));
const inputDefaults = {
  ...textDefaults,
  type: "text",
  disabled: false,
  tabIndex: 0,
  autocomplete: "",
  whiteSpace: "pre"
};
class Input extends Text {
  inputConfig;
  element;
  selectionRange;
  hasFocus;
  updateSelectionRange = () => {
  };
  uncontrolledSignal = y(void 0);
  currentSignal = g(() => this.properties.value.value ?? this.uncontrolledSignal.value ?? this.properties.value.defaultValue ?? "");
  constructor(inputProperties, initialClasses, inputConfig) {
    const caretColor = y(void 0);
    const selectionHandlers = y(void 0);
    let element;
    const htmlSelectionRange = y(void 0);
    const updateSelectionRange = () => updateHtmlSelectionRange(htmlSelectionRange, element);
    const hasFocus = y(false);
    const selectionRange = g(() => {
      if (!hasFocus.value) {
        return void 0;
      }
      return htmlSelectionRange.value;
    });
    super(inputProperties, initialClasses, {
      defaults: inputDefaults,
      dynamicHandlers: selectionHandlers,
      hasFocus,
      isPlaceholder: g(() => this.currentSignal.value.length === 0),
      ...inputConfig,
      defaultOverrides: {
        cursor: "text",
        ...{
          text: g(() => this.currentSignal.value.length === 0 ? this.properties.value.placeholder : this.properties.value.type === "password" ? "*".repeat(this.currentSignal.value.length ?? 0) : this.currentSignal.value)
        },
        caretColor,
        ...inputConfig?.defaultOverrides
      }
    });
    this.inputConfig = inputConfig;
    this.selectionRange = selectionRange;
    this.hasFocus = hasFocus;
    this.updateSelectionRange = updateSelectionRange;
    abortableEffect(() => {
      caretColor.value = this.properties.value.color;
    }, this.abortSignal);
    setupSelectionHandlers(selectionHandlers, this.properties, this.currentSignal, this, this.textLayout, this.focus.bind(this), this.abortSignal);
    const textSelection = g(() => getSelectionTransformations(this.textLayout.value, selectionRange.value));
    const caretTransformation = g(() => textSelection.value.caret);
    const selectionTransformations = g(() => textSelection.value.selections);
    const parentClippingRect = g(() => this.parentContainer.value?.clippingRect.value);
    this.element = createHtmlInputElement((newValue) => {
      if (this.properties.peek().value == null) {
        this.uncontrolledSignal.value = newValue;
      }
      this.properties.peek().onValueChange?.(newValue);
    }, inputConfig?.multiline ?? false, updateSelectionRange);
    element = this.element;
    setupCaret(this.properties, this.globalTextMatrix, caretTransformation, this.isVisible, this.backgroundOrderInfo, this.backgroundGroupDeps, parentClippingRect, this.root, this.abortSignal);
    createSelection(this.properties, this.root, this.globalTextMatrix, selectionTransformations, this.isVisible, this.backgroundOrderInfo, this.backgroundGroupDeps, parentClippingRect, this.abortSignal);
    setupHtmlInputElement(this.properties, this.element, this.currentSignal, this.abortSignal);
    setupUpdateHasFocus(this.element, this.hasFocus, (hasFocus2) => {
      this.properties.peek().onFocusChange?.(hasFocus2);
    }, this.abortSignal);
  }
  focus(start, end, direction) {
    if (!this.hasFocus.peek()) {
      this.element.focus();
    }
    if (start != null && end != null) {
      this.element.setSelectionRange(start, end, direction);
    }
    this.updateSelectionRange();
  }
  clone(recursive) {
    const cloned = new Input(this.inputProperties, this.initialClasses, this.inputConfig);
    this.copyInto(cloned, recursive);
    return cloned;
  }
  blur() {
    this.element.blur();
  }
}

const TextareaPropertiesSchema = InputPropertiesSchema;
class Textarea extends Input {
    inputConfig;
    constructor(inputProperties, initialClasses, inputConfig) {
        super(inputProperties, initialClasses, { multiline: true, ...inputConfig });
        this.inputConfig = inputConfig;
    }
    clone(recursive) {
        const cloned = new Textarea(this.inputProperties, this.initialClasses, this.inputConfig);
        this.copyInto(cloned, recursive);
        return cloned;
    }
}

const {MeshDepthMaterial,MeshDistanceMaterial} = await importShared('three');
const CustomPropertiesSchema = /* @__PURE__ */ defineSchema(() => createInPropertiesSchema(baseOutPropertiesSchema));
class Custom extends Component {
  inputConfig;
  constructor(inputProperties, initialClasses, inputConfig) {
    super(inputProperties, initialClasses, { hasNonUikitChildren: false, ...inputConfig });
    this.inputConfig = inputConfig;
    setupOrderInfo(this.orderInfo, this.properties, "zIndex", ElementType.Custom, void 0, g(() => this.parentContainer.value == null ? null : this.parentContainer.value.orderInfo.value), this.abortSignal);
    this.frustumCulled = false;
    setupRenderOrder(this, this.root, this.orderInfo);
    const clippingPlanes = createGlobalClippingPlanes(this);
    this.customDepthMaterial = new MeshDepthMaterial();
    this.customDistanceMaterial = new MeshDistanceMaterial();
    this.material.clippingPlanes = clippingPlanes;
    this.customDepthMaterial.clippingPlanes = clippingPlanes;
    this.customDistanceMaterial.clippingPlanes = clippingPlanes;
    abortableEffect(() => {
      this.material.depthTest = this.properties.value.depthTest;
      this.root.peek().requestRender?.();
    }, this.abortSignal);
    abortableEffect(() => {
      this.material.depthWrite = this.properties.value.depthWrite ?? false;
      this.root.peek().requestRender?.();
    }, this.abortSignal);
    abortableEffect(() => {
      this.renderOrder = parseNumberValue(this.properties.value.renderOrder ?? 0);
      this.root.peek().requestRender?.();
    }, this.abortSignal);
    abortableEffect(() => {
      this.castShadow = this.properties.value.castShadow;
      this.root.peek().requestRender?.();
    }, this.abortSignal);
    abortableEffect(() => {
      this.receiveShadow = this.properties.value.receiveShadow;
      this.root.peek().requestRender?.();
    }, this.abortSignal);
    setupMatrixWorldUpdate(this, this.root, this.globalPanelMatrix, this.abortSignal);
    abortableEffect(() => {
      this.visible = this.isVisible.value;
      this.root.peek().requestRender?.();
    }, this.abortSignal);
  }
  clone(recursive) {
    const cloned = new Custom(this.inputProperties, this.initialClasses, this.inputConfig);
    this.copyInto(cloned, recursive);
    return cloned;
  }
}

const {Camera,OrthographicCamera,PerspectiveCamera,Vector2} = await importShared('three');
const fullscreenOutPropertiesSchema = /* @__PURE__ */ defineSchema(() => baseOutPropertiesSchema.extend({
    distanceToCamera: numberValueSchema.optional(),
}));
const FullscreenPropertiesSchema = /* @__PURE__ */ defineSchema(() => createInPropertiesSchema(fullscreenOutPropertiesSchema));
const vectorHelper = new Vector2();
class Fullscreen extends Container {
    renderer;
    inputConfig;
    sizeX;
    sizeY;
    transformTranslateZ;
    pixelSize;
    constructor(renderer, properties, initialClasses, inputConfig) {
        const sizeX = y(0);
        const sizeY = y(0);
        const transformTranslateZ = y(0);
        const pixelSize = y(0);
        super(properties, initialClasses, {
            ...inputConfig,
            defaultOverrides: {
                sizeX,
                sizeY,
                pixelSize,
                transformTranslateZ,
                pointerEvents: 'listener',
                ...inputConfig?.defaultOverrides,
            },
        });
        this.renderer = renderer;
        this.inputConfig = inputConfig;
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.transformTranslateZ = transformTranslateZ;
        this.pixelSize = pixelSize;
    }
    clone(recursive) {
        const cloned = new Fullscreen(this.renderer, this.inputProperties, this.initialClasses, this.inputConfig);
        this.copyInto(cloned, recursive);
        return cloned;
    }
    update(delta) {
        super.update(delta);
        const camera = searchFor(this, Camera, 2, true);
        if (!(camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera)) {
            throw new Error(`fullscreen can only be added to a camera`);
        }
        const distanceToCamera = parseNumberValue(this.properties.peek().distanceToCamera ?? camera.near + 0.1);
        n(() => {
            let pixelSize;
            if (camera instanceof PerspectiveCamera) {
                const cameraHeight = 2 * Math.tan((Math.PI * camera.fov) / 360) * distanceToCamera;
                pixelSize = cameraHeight / this.renderer.getSize(vectorHelper).y;
                this.sizeY.value = cameraHeight;
                this.sizeX.value = cameraHeight * camera.aspect;
            }
            else if (camera instanceof OrthographicCamera) {
                const cameraHeight = (camera.top - camera.bottom) / camera.zoom;
                const cameraWidth = (camera.right - camera.left) / camera.zoom;
                pixelSize = cameraHeight / this.renderer.getSize(vectorHelper).y;
                this.sizeY.value = cameraHeight;
                this.sizeX.value = cameraWidth;
            }
            else {
                //to make TS happy, this else branch cannot happen
                return;
            }
            //if we are in a screen-based xr session, apply the pixel ratio to the pixel size to display the UI in the same size as outside of XR
            if (this.renderer.xr.getSession()?.interactionMode === 'screen-space') {
                pixelSize *= window.devicePixelRatio;
            }
            this.pixelSize.value = pixelSize;
            this.transformTranslateZ.value = -distanceToCamera / pixelSize;
        });
    }
}

const {SRGBColorSpace,VideoTexture} = await importShared('three');
const videoOutPropertiesSchema = /* @__PURE__ */ defineSchema(() => imageOutPropertiesSchema.omit({ src: true }).extend({
    src: union([
        string(),
        custom((value) => typeof MediaStream !== 'undefined' && value instanceof MediaStream),
        custom((value) => typeof HTMLVideoElement !== 'undefined' && value instanceof HTMLVideoElement),
    ]).optional(),
    volume: numberValueSchema.optional(),
    preservesPitch: boolean().optional(),
    playbackRate: numberValueSchema.optional(),
    muted: boolean().optional(),
    loop: boolean().optional(),
    autoplay: boolean().optional(),
    crossOrigin: string().nullable().optional(),
}));
const VideoPropertiesSchema = /* @__PURE__ */ defineSchema(() => createInPropertiesSchema(videoOutPropertiesSchema));
function isVideoElement(value) {
    return typeof HTMLVideoElement !== 'undefined' && value instanceof HTMLVideoElement;
}
class Video extends Image {
    inputConfig;
    element = y();
    constructor(inputProperties, initialClasses, inputConfig) {
        super(inputProperties, initialClasses, {
            loadTexture: false,
            ...inputConfig,
        });
        this.inputConfig = inputConfig;
        const srcIsElement = g(() => isVideoElement(this.properties.value.src));
        const notYetLoadedElement = g(() => {
            if (srcIsElement.value) {
                return this.properties.value.src;
            }
            if (typeof document === 'undefined') {
                return undefined;
            }
            const element = document.createElement('video');
            element.style.position = 'absolute';
            element.style.width = '1px';
            element.style.zIndex = '-1000';
            element.style.top = '0px';
            element.style.left = '0px';
            return element;
        });
        abortableEffect(() => {
            const element = notYetLoadedElement.value;
            if (element == null) {
                return;
            }
            element.playsInline = true;
            element.volume = parseNumberValue(this.properties.value.volume ?? 1);
            element.preservesPitch = this.properties.value.preservesPitch ?? true;
            element.playbackRate = parseNumberValue(this.properties.value.playbackRate ?? 1);
            element.muted = this.properties.value.muted ?? false;
            element.loop = this.properties.value.loop ?? false;
            element.autoplay = this.properties.value.autoplay ?? false;
            element.crossOrigin = this.properties.value.crossOrigin ?? null;
            const src = this.properties.value.src;
            if (isVideoElement(src)) {
                return;
            }
            updateVideoElementSrc(element, src);
        }, this.abortSignal);
        abortableEffect(() => {
            const element = notYetLoadedElement.value;
            if (typeof document === 'undefined' || srcIsElement.value || element == null) {
                return;
            }
            document.body.appendChild(element);
            return () => element.remove();
        }, this.abortSignal);
        loadResourceWithParams(this.element, loadVideoElement, () => { }, this.abortSignal, notYetLoadedElement);
        abortableEffect(() => {
            const element = this.element.value;
            if (element == null) {
                return;
            }
            const updateTexture = () => {
                const texture = new VideoTexture(element);
                texture.colorSpace = SRGBColorSpace;
                texture.needsUpdate = true;
                this.texture.value = texture;
            };
            updateTexture();
            element.addEventListener('resize', updateTexture);
            return () => element.removeEventListener('resize', updateTexture);
        }, this.abortSignal);
        abortableEffect(() => {
            const { requestRender } = this.root.value;
            const element = this.element.value;
            if (requestRender == null || element == null) {
                return;
            }
            let requestId;
            const callback = () => {
                requestRender();
                requestId = element.requestVideoFrameCallback(callback);
            };
            requestId = element.requestVideoFrameCallback(callback);
            return () => element.cancelVideoFrameCallback(requestId);
        }, this.abortSignal);
    }
    clone(recursive) {
        const cloned = new Video(this.inputProperties, this.initialClasses, this.inputConfig);
        this.copyInto(cloned, recursive);
        return cloned;
    }
}
async function loadVideoElement(element) {
    if (element == null) {
        return undefined;
    }
    if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise((resolve) => (element.onloadedmetadata = resolve));
    }
    return element;
}
function updateVideoElementSrc(element, src) {
    if (src == null) {
        element.removeAttribute('src');
        element.removeAttribute('srcObject');
        return;
    }
    if (typeof src === 'string') {
        element.src = src;
        return;
    }
    element.srcObject = src;
}

const {FileLoader,Loader} = await importShared('three');

const DEFAULT_OPTIONS = Object.freeze({
    charset: ' \tABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?.,;:\'"()-[]{}@#$%&*+=/\\<>',
    fontSize: 48,
    textureSize: [512, 512],
    fieldRange: 4,
    padding: 4,
    fixOverlaps: true,
});
function normalizeInput(input) {
    const items = Array.isArray(input) ? input : [input];
    return items.map((item, index) => {
        if (typeof item === 'string')
            return { url: item };
        if (!item.url)
            throw new Error(`TTFLoader: Font at index ${index} is missing 'url'`);
        return { ...item, url: item.url };
    });
}
class TTFLoader extends Loader {
    constructor(manager) {
        super(manager);
    }
    load(input, onLoad, onProgress, onError) {
        this.loadAsync(input, onProgress)
            .then(onLoad)
            .catch((err) => {
            if (onError) {
                onError(err);
            }
            else {
                console.error('TTFLoader:', err);
            }
        });
    }
    async loadAsync(input, onProgress) {
        const fonts = normalizeInput(input);
        const arrayBuffers = await this._loadFontFiles(fonts, onProgress);
        return this._generate(arrayBuffers, fonts);
    }
    async _loadFontFiles(fonts, onProgress) {
        const loader = new FileLoader(this.manager);
        loader.setResponseType('arraybuffer');
        loader.setPath(this.path);
        loader.setRequestHeader(this.requestHeader);
        loader.setWithCredentials(this.withCredentials);
        const loadPromises = fonts.map((font) => loader.loadAsync(font.url, onProgress));
        return Promise.all(loadPromises);
    }
    async _generate(arrayBuffers, fonts) {
        const { MSDF } = await __vitePreload(async () => { const { MSDF } = await import('./index-CxGO-1df.js');return { MSDF }},true              ?[]:void 0);
        const { workerSource, wasmUrl } = await __vitePreload(async () => { const { workerSource, wasmUrl } = await import('./msdf-worker-D6HZN771.js');return { workerSource, wasmUrl }},true              ?[]:void 0);
        const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
        const generator = new MSDF({ workerUrl, wasmUrl });
        try {
            await generator.initialize();
            const fontConfigs = arrayBuffers.map((arrayBuffer, index) => {
                const opts = fonts[index];
                return {
                    font: new Uint8Array(arrayBuffer),
                    charset: opts?.charset ?? DEFAULT_OPTIONS.charset,
                    fontSize: opts?.fontSize ?? DEFAULT_OPTIONS.fontSize,
                    textureSize: opts?.textureSize ?? DEFAULT_OPTIONS.textureSize,
                    fieldRange: opts?.fieldRange ?? DEFAULT_OPTIONS.fieldRange,
                    padding: opts?.padding ?? DEFAULT_OPTIONS.padding,
                    fixOverlaps: opts?.fixOverlaps ?? DEFAULT_OPTIONS.fixOverlaps,
                };
            });
            if (fontConfigs.length === 1) {
                const [config] = fontConfigs;
                const [font] = fonts;
                return await generator.generate({ ...config, onProgress: font?.onProgress });
            }
            return await generator.generate({ fonts: fontConfigs });
        }
        catch (err) {
            const urls = fonts.map((f) => f.url).join(', ');
            throw new Error(`TTFLoader: MSDF generation failed for ${urls}: ${err instanceof Error ? err.message : err}`);
        }
        finally {
            await generator.dispose();
            URL.revokeObjectURL(workerUrl);
        }
    }
}

const index = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    ClassList,
    Component,
    Container,
    ContainerPropertiesSchema,
    Content,
    ContentPropertiesSchema,
    Custom,
    CustomPropertiesSchema,
    FontFamiliesSchema,
    FontFamilyWeightMapSchema,
    FontWeightSchema,
    Fullscreen,
    FullscreenPropertiesSchema,
    Image,
    ImagePropertiesSchema,
    Input,
    InputPropertiesSchema,
    PropertiesImplementation,
    StyleSheet,
    Svg,
    SvgPropertiesSchema,
    TTFLoader,
    Text,
    TextPropertiesSchema,
    Textarea,
    TextareaPropertiesSchema,
    Video,
    VideoPropertiesSchema,
    abortableEffect,
    absoluteLengthValueSchema,
    baseOutPropertiesSchema,
    baseOutPropertyShape,
    basedOnPreferredColorScheme,
    canvasInputProps,
    componentDefaults,
    contentDefaults,
    createInPropertiesSchema,
    defineSchema,
    getPreferredColorScheme,
    getStarProperties,
    imageDefaults,
    inputDefaults,
    isDarkMode,
    lengthValueSchema,
    numberOrPercentageValueSchema,
    numberStringSchema,
    numberValueSchema,
    percentageStringSchema,
    pixelLengthStringSchema,
    readReactive,
    resetGlobalProperties,
    reversePainterSortStable,
    searchFor,
    setGlobalProperties,
    setPreferredColorScheme,
    textDefaults,
    updateVideoElementSrc,
    videoOutPropertiesSchema,
    viewportLengthStringSchema,
    withOpacity
}, Symbol.toStringTag, { value: 'Module' }));

export { Container as C, Fullscreen as F, Image as I, Svg as S, TTFLoader as T, Video as V, Content as a, Custom as b, Input as c, Text as d, Textarea as e, Component as f, g, basedOnPreferredColorScheme as h, canvasInputProps as i, j, getPreferredColorScheme as k, l, isDarkMode as m, readReactive as n, index as o, reversePainterSortStable as r, setPreferredColorScheme as s, updateVideoElementSrc as u, withOpacity as w };
