import {
  AdditiveBlending,
  MultiplyBlending,
  NormalBlending,
  SubtractiveBlending,
  type Blending,
} from "three";
import type { materialBlendingConstant } from "../../lib/visual-editor";

/**
 * The three.js constants, keyed by the names the document layer resolves to.
 *
 * `asset-manifest` returns a name rather than a constant so it stays free of
 * three and so the compiler can emit the identifier verbatim. This is the other
 * half of that: the editor turns the same name into the value it renders with.
 */
export const THREE_BLENDING: Record<
  ReturnType<typeof materialBlendingConstant>,
  Blending
> = {
  NormalBlending,
  AdditiveBlending,
  MultiplyBlending,
  SubtractiveBlending,
};
