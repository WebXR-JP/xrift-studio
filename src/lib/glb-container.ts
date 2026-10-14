/** GLB v2 carries its own byte length; fixed store quotas do not apply to a verified container. */
export function hasGlbContainerHeader(bytes: Uint8Array, byteLength: number = bytes.byteLength): boolean {
  if (!Number.isSafeInteger(byteLength) || byteLength < 20 || bytes.byteLength < 20) return false;
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return header.getUint32(0, true) === 0x46546c67
    && header.getUint32(4, true) === 2
    && header.getUint32(8, true) === byteLength
    && header.getUint32(12, true) <= byteLength - 20
    && header.getUint32(16, true) === 0x4e4f534a;
}

/** Reject non-GLB streams from their prefix and never read beyond the container's declared length. */
export async function readGlbResponse(response: Response, formatError: string): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok) throw new Error(`GLBをダウンロードできませんでした (${response.status})`);
  if (!response.body) throw new Error(formatError);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  const prefix = new Uint8Array(20);
  let prefixLength = 0;
  let expectedLength: number | undefined;
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (prefixLength < prefix.length) {
        const part = value.subarray(0, prefix.length - prefixLength);
        prefix.set(part, prefixLength);
        prefixLength += part.length;
        if (prefixLength === prefix.length) {
          expectedLength = new DataView(prefix.buffer).getUint32(8, true);
          if (!hasGlbContainerHeader(prefix, expectedLength)) throw new Error(formatError);
        }
      }
      if (expectedLength !== undefined && size > expectedLength) throw new Error(formatError);
      chunks.push(value);
    }
    if (expectedLength === undefined || size !== expectedLength) throw new Error(formatError);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch (error) {
    if (error instanceof RangeError) throw new Error("GLBを読み込むためのメモリを確保できませんでした。");
    throw error;
  }
}
