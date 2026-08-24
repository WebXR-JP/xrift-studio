import { BrandMark } from "../components/Brand";

/**
 * The landing page's brand lockup.
 *
 * The mark comes from the app's own `Brand.tsx` rather than being drawn again
 * here, so the site cannot drift from the application it advertises. A page
 * that redraws the logo ends up shipping a slightly different glyph or colour,
 * and then the two read as separate products.
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
