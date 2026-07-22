import { listXriftComponentDefinitions } from "./component-registry";
import {
  DREI_R3F_IMPORT_SAMPLE,
  analyzeComponentCode,
  applyComponentCodeImportPlan,
  createOfficialXriftComponentSample,
} from "./component-code-import";
import { createPrototypeProject } from "./prototype-project";

/** Pure assertions for official XRift samples and the safe Drei/R3F adapter. */
export function runComponentCodeImportFixtureAssertions(): void {
  const definitions = listXriftComponentDefinitions("world");
  assert(definitions.length === 15, "The official world catalog must contain 15 scene components");

  for (const definition of definitions) {
    const plan = analyzeComponentCode(
      createOfficialXriftComponentSample(definition.importName),
      "world",
    );
    assert(
      !plan.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
      `${definition.importName} sample must be importable`,
    );
    assert(
      plan.summary.entityCount === 1 &&
        plan.summary.xriftComponentCount === 1 &&
        plan.nodes[0]?.xriftComponents[0]?.schemaId === definition.schemaId,
      `${definition.importName} sample must preserve its official schema`,
    );
  }

  const dreiPlan = analyzeComponentCode(DREI_R3F_IMPORT_SAMPLE, "world");
  assert(
    !dreiPlan.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    "The bundled Drei/R3F sample must convert without errors",
  );
  assert(
    dreiPlan.summary.entityCount === 3 &&
      dreiPlan.summary.primitiveCount === 1 &&
      dreiPlan.summary.xriftComponentCount === 3,
    "Drei Sky, Billboard/Box, and Reflector must map to the expected scene nodes",
  );

  const project = createPrototypeProject("world", "component-import-fixture");
  const entityCountBefore = Object.keys(project.scene.entities).length;
  const applied = applyComponentCodeImportPlan({
    scene: project.scene,
    assets: project.assets,
    projectKind: "world",
    plan: dreiPlan,
  });
  assert(
    applied.entityIds.length === 3 &&
      Object.keys(applied.scene.entities).length === entityCountBefore + 3,
    "Applying a valid plan must create every converted entity atomically",
  );
  assert(
    !applied.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    "Applying the bundled conversion must not produce errors",
  );

  const rejected = applyComponentCodeImportPlan({
    scene: project.scene,
    assets: project.assets,
    projectKind: "world",
    plan: {
      ...dreiPlan,
      diagnostics: [
        ...dreiPlan.diagnostics,
        {
          severity: "error",
          code: "fixture-error",
          message: "fixture rejection",
        },
      ],
    },
  });
  assert(
    rejected.scene === project.scene &&
      rejected.assets === project.assets &&
      rejected.entityIds.length === 0,
    "A plan with errors must leave the scene and asset manifest unchanged",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
