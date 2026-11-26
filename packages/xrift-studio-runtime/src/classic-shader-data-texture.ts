import {
  ClampToEdgeWrapping,
  FileLoader,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Loader,
  NoColorSpace,
  type DataTexture,
} from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";

/**
 * Float data for a Custom Shader `sampler2D`, read from an EXR Texture Asset.
 *
 * Kept apart from the Material builder so that a world without such a uniform
 * does not carry the EXR decoder.
 */

/**
 * The widest sample type stored in an EXR file's first part.
 *
 * EXR keeps a type per channel: 16-bit half floats, 32-bit floats or 32-bit
 * unsigned integers. Returns null when the bytes are not an EXR header.
 */
export function readExrSampleType(
  buffer: ArrayBuffer,
): "half" | "float" | null {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.length < 8 || view.getUint32(0, true) !== 20000630) return null;
  let offset = 8;
  const readName = (): string | null => {
    let end = offset;
    while (end < bytes.length && bytes[end] !== 0) end += 1;
    if (end >= bytes.length) return null;
    let name = "";
    for (let index = offset; index < end; index += 1) {
      name += String.fromCharCode(bytes[index] ?? 0);
    }
    offset = end + 1;
    return name;
  };
  for (;;) {
    const name = readName();
    if (name === null) return null;
    // An empty name ends the header without a channel list.
    if (name === "") return null;
    const type = readName();
    if (type === null || offset + 4 > bytes.length) return null;
    const size = view.getInt32(offset, true);
    offset += 4;
    if (size < 0 || offset + size > bytes.length) return null;
    if (name !== "channels" || type !== "chlist") {
      offset += size;
      continue;
    }
    const end = offset + size;
    let widest: "half" | "float" | null = null;
    while (offset < end && bytes[offset] !== 0) {
      if (readName() === null || offset + 16 > end) return null;
      // 0 is a 32-bit unsigned integer, 1 a half float, 2 a 32-bit float.
      const sampleType = view.getInt32(offset, true);
      offset += 16;
      if (sampleType === 1) widest ??= "half";
      else widest = "float";
    }
    return widest;
  }
}

/**
 * Decodes an EXR as a data texture in the precision the file stores.
 *
 * A half-float file stays 16-bit, which every WebGL 2 device can filter. A
 * 32-bit file stays 32-bit so that values wider than a half float (16-bit
 * integers, large coordinates) arrive exactly; filtering those linearly needs
 * a device that supports it, so `filter: "nearest"` is the portable choice.
 * Rows are arranged the way three.js arranges every EXR: the picture's top row
 * is v = 1, as it is for an 8-bit image.
 */
export function createClassicShaderDataTexture(
  buffer: ArrayBuffer,
): DataTexture {
  const type = readExrSampleType(buffer) === "float" ? FloatType : HalfFloatType;
  const texture = new EXRLoader()
    .setDataType(type)
    .createDataTexture(buffer) as DataTexture;
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Loads an EXR Texture Asset as Custom Shader float data.
 *
 * A three.js Loader, so a published world reads the file the way it reads
 * every other Asset and React Three Fiber's `useLoader` keeps one decoded
 * texture per URL.
 */
export class XriftClassicShaderDataTextureLoader extends Loader<DataTexture> {
  load(
    url: string,
    onLoad: (texture: DataTexture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): void {
    const loader = new FileLoader(this.manager);
    loader.setResponseType("arraybuffer");
    loader.setPath(this.path);
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);
    loader.load(
      url,
      (buffer) => {
        try {
          onLoad(createClassicShaderDataTexture(buffer as ArrayBuffer));
        } catch (error) {
          if (onError) onError(error);
          else console.error(error);
        }
      },
      onProgress,
      onError,
    );
  }
}
