import { resolveProps } from "../../../../packages/xrift-studio-runtime/src/script/host";
import {
  createDefaultScriptComponentState,
  extractScriptContract,
} from "./script-contract";

export function runScriptPropsFixtureAssertions(): void {
  const declaration = {
    speed: { kind: "number" as const, default: 1, min: 0, max: 10 },
    mode: {
      kind: "enum" as const,
      options: ["loop", "once"] as const,
    },
    tint: { kind: "color" as const, default: "#ffffff" },
    offset: { kind: "vec2" as const, min: -1, max: 1 },
  };
  const resolved = resolveProps(declaration, {
    speed: 99,
    mode: "invalid",
    tint: "red",
    offset: [2, 0],
  });
  assert(resolved.speed === 1, "an out-of-range number reached the runtime");
  assert(resolved.mode === "loop", "an invalid enum did not use options[0]");
  assert(resolved.tint === "#ffffff", "an invalid color reached the runtime");
  assert(
    JSON.stringify(resolved.offset) === "[0,0]",
    "an invalid vector did not use its bounded fallback",
  );

  const dynamicDefault = extractScriptContract(`
const INITIAL_SPEED = 5;
export default defineScript({
  name: "Dynamic default",
  props: {
    speed: prop.number({ default: INITIAL_SPEED }),
  },
});
`);
  const dynamicState = createDefaultScriptComponentState(dynamicDefault);
  assert(
    !dynamicDefault.complete &&
      dynamicDefault.issues.some(
        (issue) =>
          issue.code === "unreadable-prop-default" &&
          issue.propName === "speed",
      ),
    "a non-literal default was accepted as a complete static contract",
  );
  assert(
    dynamicState.properties.speed === undefined,
    "a guessed fallback overrode the Script's runtime default",
  );

  const dynamicPropsObject = extractScriptContract(`
const PROPS = { speed: prop.number({ default: 5 }) };
export default defineScript({ name: "Dynamic props", props: PROPS });
`);
  assert(
    !dynamicPropsObject.complete &&
      dynamicPropsObject.issues.some(
        (issue) => issue.code === "unreadable-props",
      ),
    "a non-literal props object was accepted as a complete static contract",
  );

  const dynamicEnumOptions = extractScriptContract(`
const MODES = ["loop", "once"];
export default defineScript({
  name: "Dynamic enum",
  props: { mode: prop.enum({ options: MODES }) },
});
`);
  assert(
    !dynamicEnumOptions.complete &&
      dynamicEnumOptions.issues.some(
        (issue) => issue.code === "unreadable-prop-options",
      ),
    "non-literal enum options were accepted as a complete static contract",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Script props fixture failed: ${message}`);
  }
}
