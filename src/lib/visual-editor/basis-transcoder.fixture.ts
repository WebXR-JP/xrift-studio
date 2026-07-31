import {
  LOCAL_BASIS_TRANSCODER_DIRECTORY,
  resolveLocalBasisTranscoderPath,
} from "./basis-transcoder";

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
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
