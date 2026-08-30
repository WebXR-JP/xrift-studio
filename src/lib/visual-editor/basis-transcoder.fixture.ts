import {
  LOCAL_BASIS_TRANSCODER_DIRECTORY,
  resolveLocalBasisTranscoderPath,
} from "./basis-transcoder";
import {
  VENDOR_BUNDLES,
  resolveLocalVendorAssetPath,
} from "./vendor-assets";

export function runBasisTranscoderFixtureAssertions(): void {
  assert(
    LOCAL_BASIS_TRANSCODER_DIRECTORY ===
      "visual-editor/vendor/three-basis",
    "local Basis transcoder directory changed unexpectedly",
  );
  assert(
    resolveLocalBasisTranscoderPath("/") ===
      "/visual-editor/vendor/three-basis/",
    "root Basis transcoder path is incorrect",
  );
  assert(
    resolveLocalBasisTranscoderPath("./") ===
      "./visual-editor/vendor/three-basis/",
    "relative Basis transcoder path is incorrect",
  );
  assert(
    resolveLocalBasisTranscoderPath("/studio") ===
      "/studio/visual-editor/vendor/three-basis/",
    "prefixed Basis transcoder path is incorrect",
  );
  assert(
    resolveLocalBasisTranscoderPath("https://assets.example/studio/") ===
      "https://assets.example/studio/visual-editor/vendor/three-basis/",
    "absolute Basis transcoder path is incorrect",
  );
  assert(
    resolveLocalVendorAssetPath("three-draco", "/") ===
      "/visual-editor/vendor/three-draco/",
    "local Draco decoder path is incorrect",
  );
  assert(
    VENDOR_BUNDLES["three-draco"].publishedDirectory ===
      "xrift-studio/vendor/three-draco" &&
      VENDOR_BUNDLES["three-draco"].files.includes("draco_wasm_wrapper.js"),
    "published Draco decoder bundle changed unexpectedly",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
