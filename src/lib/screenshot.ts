/**
 * Captures the current app viewport from the DOM without adding a screenshot
 * dependency. Loaded canvas elements are converted to images so editor views
 * have a chance to remain visible in the exported PNG.
 */
export async function captureCurrentAppAsPng(): Promise<string> {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const originalImages = Array.from(document.images);
  const originalCanvases = Array.from(document.querySelectorAll("canvas"));
  const body = document.body.cloneNode(true) as HTMLElement;

  body.style.margin = "0";
  body.style.width = `${width}px`;
  body.style.height = `${height}px`;
  body.style.overflow = "hidden";
  body.querySelectorAll("[data-support-overlay]").forEach((element) => element.remove());

  const style = document.createElement("style");
  style.textContent = Array.from(document.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules, (rule) => rule.cssText);
      } catch {
        return [];
      }
    })
    .join("\n");
  body.insertBefore(style, body.firstChild);

  const clonedCanvases = Array.from(body.querySelectorAll("canvas"));
  clonedCanvases.forEach((canvas, index) => {
    const original = originalCanvases[index];
    if (!original) return;
    try {
      const image = document.createElement("img");
      image.src = original.toDataURL("image/png");
      image.width = original.width;
      image.height = original.height;
      image.dataset.screenshotCanvas = "true";
      image.style.cssText = canvas.getAttribute("style") ?? "";
      canvas.replaceWith(image);
    } catch {
      // A tainted or protected canvas is left as an empty canvas placeholder.
    }
  });

  const clonedImages = Array.from(
    body.querySelectorAll<HTMLImageElement>("img:not([data-screenshot-canvas])"),
  );
  await Promise.all(
    clonedImages.map(async (image, index) => {
      const original = originalImages[index];
      if (!original?.complete || original.naturalWidth === 0) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = original.naturalWidth;
        canvas.height = original.naturalHeight;
        canvas.getContext("2d")?.drawImage(original, 0, 0);
        image.src = canvas.toDataURL("image/png");
      } catch {
        // Keep the original source when the browser blocks conversion.
      }
    }),
  );

  const serializedBody = new XMLSerializer().serializeToString(body);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${serializedBody}</foreignObject></svg>`;
  const blobUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("画面を画像へ変換できませんでした。"));
      image.src = blobUrl;
    });
    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像の保存準備に失敗しました。");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
