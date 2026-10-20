import type { Page } from "@playwright/test";

/** Use an unchanged cache of the official metadata in restricted environments.
 * Other requests and all rendering/error assertions remain unchanged. */
export async function useOfficialFontMetrics(page: Page): Promise<void> {
  const metricsPath = process.env.XRIFT_E2E_FONT_METRICS_PATH;
  if (metricsPath) {
    await page.route("https://public.xrift.net/fonts/msdf/NotoSansJP/metrics.json?v=3", route =>
      route.fulfill({ contentType: "application/json", path: metricsPath }));
  }
}
