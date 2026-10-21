import { expect, test } from '@playwright/test';
import type { recordMovingCanvas } from './recording-render.fixture';

test.use({ permissions: ['local-network-access'], launchOptions: { args: [] } });
test('描画直後に要求したフレームを実際の動画へ保存できる', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/e2e.html?recording-render', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto('/e2e.html?recording-render');
  const result = await page.evaluate(async () => {
    const url = '/e2e/recording-render.fixture.ts';
    return (await import(/* @vite-ignore */url)).recordMovingCanvas();
  }) as Awaited<ReturnType<typeof recordMovingCanvas>>;
  expect(errors).toEqual([]);
  expect(result.state.status, result.state.message ?? '').toBe('completed');
  expect(result.metadata.frameCount).toBeGreaterThan(55);
  const bytes = Buffer.from(result.dataUrl.split(',')[1]!, 'base64');
  expect(bytes.length).toBeGreaterThan(2000);
  await testInfo.attach('moving-canvas', { body: bytes, contentType: 'video/webm' });
  const frames = await page.evaluate(async (dataUrl) => {
    const video = document.createElement('video'); video.muted = true; video.src = dataUrl;
    await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('Recorded video cannot be decoded')); });
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720; const context = canvas.getContext('2d')!;
    const samples = [];
    for (const time of [.1, .3, .5, .7, 1, 1.3, 1.6, 1.8, 2.1]) {
      video.currentTime = time; await new Promise<void>(resolve => { video.onseeked = () => resolve(); });
      context.drawImage(video, 0, 0);
      const pixels = context.getImageData(0, 300, 1280, 1).data;
      let x = 0; while (x < 1280 && pixels[x * 4]! < 200) x++;
      samples.push(x);
    }
    return { width: video.videoWidth, height: video.videoHeight, samples };
  }, result.dataUrl);
  console.log('Real recording frames:', result.metadata.frameCount, frames);
  expect([frames.width, frames.height]).toEqual([1280, 720]);
  for (const [index, time] of [.1, .3, .5, .7, 1, 1.3, 1.6, 1.8, 2.1].entries()) {
    expect(Math.abs(frames.samples[index]! - time * 300)).toBeLessThan(45);
  }
});
