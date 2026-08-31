import {
  LOCAL_BASIS_TRANSCODER_DIRECTORY,
  resolveLocalBasisTranscoderPath,
} from "./basis-transcoder";
import {
  VENDOR_BUNDLES,
  publishedVendorFileName,
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
    VENDOR_BUNDLES["three-draco"].files.includes("draco_wasm_wrapper.js"),
    "the Draco bundle must ship the wrapper DRACOLoader asks for",
  );
  // A published world serves nothing below its own root, so a decoder file
  // keeps the name its loader appends and is published there directly.
  assert(
    publishedVendorFileName("three-draco", "draco_wasm_wrapper.js") ===
      "draco_wasm_wrapper.js" &&
      publishedVendorFileName("three-basis", "basis_transcoder.wasm") ===
        "basis_transcoder.wasm",
    "a decoder file must publish under the name its loader requests",
  );
  assert(
    publishedVendorFileName("three-draco", "README.md") ===
      "three-draco-README.md",
    "a license file must not take a generic name at the world root",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
