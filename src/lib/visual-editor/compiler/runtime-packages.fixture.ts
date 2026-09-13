import {
  COMPILER_REACT_PACKAGE_SPECS,
  COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC,
  recordCompilerPackageSpecs,
} from "./runtime-packages.ts";

/** Pure dependency migrations; no filesystem, package install or upload. */
export function runRuntimePackageFixtureAssertions(): void {
  const specs = [COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC, ...COMPILER_REACT_PACKAGE_SPECS];
  const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message);
  };
  for (const react of ["^18.3.1", "^19.2.4", "19.3.0", "~19.2.4"]) {
    const manifest = {
      scripts: { build: "tsc && vite build" },
      dependencies: { "@xrift/world-components": "^0.47.0", custom: "^1.0.0" },
      devDependencies: { react, "react-dom": react, "@types/react": "^19.2.17" },
    };
    recordCompilerPackageSpecs(manifest, specs);
    assert(manifest.devDependencies.react === "19.2.8", `React was not migrated: ${react}`);
    assert(manifest.devDependencies["react-dom"] === "19.2.8", "React DOM differs from React");
    assert(!("react" in manifest.dependencies), "React was duplicated across dependency sections");
    assert(manifest.dependencies["@xrift/world-components"] === "0.53.0", "old Components survived");
    assert(manifest.dependencies.custom === "^1.0.0", "unrelated dependency changed");
    assert(manifest.scripts.build === "tsc && vite build", "build checks were changed");
    const saved = JSON.stringify(manifest);
    assert(recordCompilerPackageSpecs(manifest, specs).length === 0, "retry rewrote correct dependencies");
    assert(JSON.stringify(manifest) === saved, "retry changed the manifest");
  }
  const duplicated: Record<string, unknown> = {
    dependencies: { react: "19.2.8", "react-dom": "19.2.8" },
    devDependencies: { react: "^18.0.0", "react-dom": "19.3.0" },
  };
  recordCompilerPackageSpecs(duplicated, specs);
  assert(Object.keys(duplicated.devDependencies as object).length === 0, "conflicting dev peers survived");
  const previous = { dependencies: { "@xrift/world-components": "^0.52.0" } };
  recordCompilerPackageSpecs(previous, specs);
  assert(previous.dependencies["@xrift/world-components"] === "0.53.0", "0.52 template missed the local simulation update");
  const current = { dependencies: { "@xrift/world-components": "^0.53.0" } };
  recordCompilerPackageSpecs(current, specs);
  assert(current.dependencies["@xrift/world-components"] === "^0.53.0", "compatible author range changed");
  const empty: Record<string, unknown> = {};
  recordCompilerPackageSpecs(empty, specs);
  assert((empty.dependencies as Record<string, unknown>).react === "19.2.8", "missing React was not added");
}
