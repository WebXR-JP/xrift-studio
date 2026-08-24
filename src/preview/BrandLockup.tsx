import { BrandMark } from "../components/Brand";

/**
 * The landing page's brand lockup.
 *
 * The mark itself comes from the app's own `Brand.tsx` rather than being drawn
 * again here. This page used to render a generic lucide cube on a near-black
 * gradient, which matched neither the glyph nor the colour of the real logo, so
 * the site and the application it advertises looked like two products. Reusing
 * the component means the page cannot drift from the app again.
 *
 * The wordmark follows the same treatment the app uses — "XRift" at full
 * weight, "Studio" stepped back — at the heavier landing-page typography.
 */
export function BrandLockup({ size = 36 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark size={size} />
      <span className="text-sm font-black tracking-[-0.025em] text-zinc-950">
        XRift <span className="text-zinc-400">Studio</span>
      </span>
    </span>
  );
}
