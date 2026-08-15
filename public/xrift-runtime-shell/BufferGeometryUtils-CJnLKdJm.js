import { importShared } from './__federation_fn_import-CVj0xDfO.js';

const {BufferGeometry,BufferAttribute,InterleavedBuffer,InterleavedBufferAttribute,TrianglesDrawMode,TriangleFanDrawMode,TriangleStripDrawMode,Vector3,Float32BufferAttribute} = await importShared('three');
function mergeVertices(geometry, tolerance = 1e-4) {
  tolerance = Math.max(tolerance, Number.EPSILON);
  const hashToIndex = {};
  const indices = geometry.getIndex();
  const positions = geometry.getAttribute("position");
  const vertexCount = indices ? indices.count : positions.count;
  let nextIndex = 0;
  const attributeNames = Object.keys(geometry.attributes);
  const attrArrays = {};
  const morphAttrsArrays = {};
  const newIndices = [];
  const getters = ["getX", "getY", "getZ", "getW"];
  for (let i = 0, l = attributeNames.length; i < l; i++) {
    const name = attributeNames[i];
    attrArrays[name] = [];
    const morphAttr = geometry.morphAttributes[name];
    if (morphAttr) {
      morphAttrsArrays[name] = new Array(morphAttr.length).fill(0).map(() => []);
    }
  }
  const decimalShift = Math.log10(1 / tolerance);
  const shiftMultiplier = Math.pow(10, decimalShift);
  for (let i = 0; i < vertexCount; i++) {
    const index = indices ? indices.getX(i) : i;
    let hash = "";
    for (let j = 0, l = attributeNames.length; j < l; j++) {
      const name = attributeNames[j];
      const attribute = geometry.getAttribute(name);
      const itemSize = attribute.itemSize;
      for (let k = 0; k < itemSize; k++) {
        hash += `${~~(attribute[getters[k]](index) * shiftMultiplier)},`;
      }
    }
    if (hash in hashToIndex) {
      newIndices.push(hashToIndex[hash]);
    } else {
      for (let j = 0, l = attributeNames.length; j < l; j++) {
        const name = attributeNames[j];
        const attribute = geometry.getAttribute(name);
        const morphAttr = geometry.morphAttributes[name];
        const itemSize = attribute.itemSize;
        const newarray = attrArrays[name];
        const newMorphArrays = morphAttrsArrays[name];
        for (let k = 0; k < itemSize; k++) {
          const getterFunc = getters[k];
          newarray.push(attribute[getterFunc](index));
          if (morphAttr) {
            for (let m = 0, ml = morphAttr.length; m < ml; m++) {
              newMorphArrays[m].push(morphAttr[m][getterFunc](index));
            }
          }
        }
      }
      hashToIndex[hash] = nextIndex;
      newIndices.push(nextIndex);
      nextIndex++;
    }
  }
  const result = geometry.clone();
  for (let i = 0, l = attributeNames.length; i < l; i++) {
    const name = attributeNames[i];
    const oldAttribute = geometry.getAttribute(name);
    const buffer = new oldAttribute.array.constructor(attrArrays[name]);
    const attribute = new BufferAttribute(buffer, oldAttribute.itemSize, oldAttribute.normalized);
    result.setAttribute(name, attribute);
    if (name in morphAttrsArrays) {
      for (let j = 0; j < morphAttrsArrays[name].length; j++) {
        const oldMorphAttribute = geometry.morphAttributes[name][j];
        const buffer2 = new oldMorphAttribute.array.constructor(morphAttrsArrays[name][j]);
        const morphAttribute = new BufferAttribute(buffer2, oldMorphAttribute.itemSize, oldMorphAttribute.normalized);
        result.morphAttributes[name][j] = morphAttribute;
      }
    }
  }
  result.setIndex(newIndices);
  return result;
}
function toTrianglesDrawMode(geometry, drawMode) {
  if (drawMode === TrianglesDrawMode) {
    console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles.");
    return geometry;
  }
  if (drawMode === TriangleFanDrawMode || drawMode === TriangleStripDrawMode) {
    let index = geometry.getIndex();
    if (index === null) {
      const indices = [];
      const position = geometry.getAttribute("position");
      if (position !== void 0) {
        for (let i = 0; i < position.count; i++) {
          indices.push(i);
        }
        geometry.setIndex(indices);
        index = geometry.getIndex();
      } else {
        console.error(
          "THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."
        );
        return geometry;
      }
    }
    const numberOfTriangles = index.count - 2;
    const newIndices = [];
    if (index) {
      if (drawMode === TriangleFanDrawMode) {
        for (let i = 1; i <= numberOfTriangles; i++) {
          newIndices.push(index.getX(0));
          newIndices.push(index.getX(i));
          newIndices.push(index.getX(i + 1));
        }
      } else {
        for (let i = 0; i < numberOfTriangles; i++) {
          if (i % 2 === 0) {
            newIndices.push(index.getX(i));
            newIndices.push(index.getX(i + 1));
            newIndices.push(index.getX(i + 2));
          } else {
            newIndices.push(index.getX(i + 2));
            newIndices.push(index.getX(i + 1));
            newIndices.push(index.getX(i));
          }
        }
      }
    }
    if (newIndices.length / 3 !== numberOfTriangles) {
      console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.");
    }
    const newGeometry = geometry.clone();
    newGeometry.setIndex(newIndices);
    newGeometry.clearGroups();
    return newGeometry;
  } else {
    console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:", drawMode);
    return geometry;
  }
}
function toCreasedNormals(geometry, creaseAngle = Math.PI / 3) {
  const creaseDot = Math.cos(creaseAngle);
  const hashMultiplier = (1 + 1e-10) * 100;
  const verts = [new Vector3(), new Vector3(), new Vector3()];
  const tempVec1 = new Vector3();
  const tempVec2 = new Vector3();
  const tempNorm = new Vector3();
  const tempNorm2 = new Vector3();
  function hashVertex(v) {
    const x = ~~(v.x * hashMultiplier);
    const y = ~~(v.y * hashMultiplier);
    const z = ~~(v.z * hashMultiplier);
    return `${x},${y},${z}`;
  }
  const resultGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
  const posAttr = resultGeometry.attributes.position;
  const vertexMap = {};
  for (let i = 0, l = posAttr.count / 3; i < l; i++) {
    const i3 = 3 * i;
    const a = verts[0].fromBufferAttribute(posAttr, i3 + 0);
    const b = verts[1].fromBufferAttribute(posAttr, i3 + 1);
    const c = verts[2].fromBufferAttribute(posAttr, i3 + 2);
    tempVec1.subVectors(c, b);
    tempVec2.subVectors(a, b);
    const normal = new Vector3().crossVectors(tempVec1, tempVec2).normalize();
    for (let n = 0; n < 3; n++) {
      const vert = verts[n];
      const hash = hashVertex(vert);
      if (!(hash in vertexMap)) {
        vertexMap[hash] = [];
      }
      vertexMap[hash].push(normal);
    }
  }
  const normalArray = new Float32Array(posAttr.count * 3);
  const normAttr = new BufferAttribute(normalArray, 3, false);
  for (let i = 0, l = posAttr.count / 3; i < l; i++) {
    const i3 = 3 * i;
    const a = verts[0].fromBufferAttribute(posAttr, i3 + 0);
    const b = verts[1].fromBufferAttribute(posAttr, i3 + 1);
    const c = verts[2].fromBufferAttribute(posAttr, i3 + 2);
    tempVec1.subVectors(c, b);
    tempVec2.subVectors(a, b);
    tempNorm.crossVectors(tempVec1, tempVec2).normalize();
    for (let n = 0; n < 3; n++) {
      const vert = verts[n];
      const hash = hashVertex(vert);
      const otherNormals = vertexMap[hash];
      tempNorm2.set(0, 0, 0);
      for (let k = 0, lk = otherNormals.length; k < lk; k++) {
        const otherNorm = otherNormals[k];
        if (tempNorm.dot(otherNorm) > creaseDot) {
          tempNorm2.add(otherNorm);
        }
      }
      tempNorm2.normalize();
      normAttr.setXYZ(i3 + n, tempNorm2.x, tempNorm2.y, tempNorm2.z);
    }
  }
  resultGeometry.setAttribute("normal", normAttr);
  return resultGeometry;
}

export { toCreasedNormals as a, mergeVertices as m, toTrianglesDrawMode as t };
