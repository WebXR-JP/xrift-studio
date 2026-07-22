import {
  XRIFT_COMPONENT_REGISTRY_BY_SCHEMA_ID,
  getXriftComponentDefinition,
  validateXriftComponentFieldValue,
  type XriftComponentDefinition,
} from "../component-registry";
import type { VisualProjectKind } from "../project-document";
import type { JsonValue, XRiftComponent } from "../scene-document";
import type { CompilerDiagnostic } from "./types";

/** Compatibility export. The top-level authoring registry is the only schema source. */
export const XRIFT_COMPONENT_COMPILER_REGISTRY =
  XRIFT_COMPONENT_REGISTRY_BY_SCHEMA_ID;

export type CompilerSupportDeclaration = {
  key: string;
  source: string;
};

export type CompiledXriftComponent = {
  definition?: XriftComponentDefinition;
  importName?: string;
  mode: "leaf" | "wrapper" | "unsupported";
  jsx?: string;
  diagnostics: CompilerDiagnostic[];
  supportDeclarations: CompilerSupportDeclaration[];
  reactValueImports: string[];
  reactTypeImports: string[];
};

/**
 * Serializes only values accepted by the official authoring registry. Runtime
 * callbacks are selected from fixed registry adapters; document data is never
 * interpreted as JavaScript or JSX.
 */
export function compileXriftComponent(
  component: XRiftComponent,
  targetKind: VisualProjectKind,
  source: Pick<CompilerDiagnostic, "sceneId" | "entityId" | "componentId">,
): CompiledXriftComponent {
  const definition = getXriftComponentDefinition(component.schemaId);
  if (!definition) {
    return unsupported([
      diagnostic(
        source,
        "unknown-xrift-component",
        `未対応のXRift component schemaです: ${component.schemaId}`,
        { fieldPath: "schemaId" },
      ),
    ]);
  }

  const diagnostics: CompilerDiagnostic[] = [];
  if (!definition.allowedProjectKinds.includes(targetKind)) {
    diagnostics.push(
      diagnostic(
        source,
        "world-only-xrift-component",
        `${definition.importName}は${targetKind}プロジェクトでは使用できません`,
        { fieldPath: "schemaId" },
      ),
    );
  }
  if (component.schemaVersion !== definition.schemaVersion) {
    diagnostics.push(
      diagnostic(
        source,
        "unsupported-xrift-component-schema-version",
        `${definition.importName}のschemaVersion ${component.schemaVersion} は未対応です`,
        { fieldPath: "schemaVersion" },
      ),
    );
  }

  const props = new Map<string, JsonValue>();
  const fieldNames = new Set(definition.fields.map((field) => field.name));
  for (const field of definition.fields) {
    const value = component.properties[field.name];
    if (value === undefined) {
      if (field.required) {
        diagnostics.push(
          diagnostic(
            source,
            "missing-xrift-component-prop",
            `${definition.importName}.${field.name}は必須です`,
            { fieldPath: `properties.${field.name}` },
          ),
        );
      }
      continue;
    }
    const failure = validateXriftComponentFieldValue(value, field);
    if (failure) {
      diagnostics.push(
        diagnostic(
          source,
          "invalid-xrift-component-prop",
          `${definition.importName}.${field.name}: ${failure.message}`,
          { fieldPath: `properties.${field.name}` },
        ),
      );
      continue;
    }
    props.set(field.name, value);
  }
  for (const name of Object.keys(component.properties).sort()) {
    if (fieldNames.has(name)) continue;
    diagnostics.push({
      ...source,
      severity: "warning",
      code: "ignored-xrift-component-prop",
      message: `${definition.importName}.${name}は公式authoring registryに未登録のため出力しません`,
      fieldPath: `properties.${name}`,
    });
  }

  for (const binding of definition.runtimeBindings) {
    if (binding.required && binding.generation === "none") {
      diagnostics.push(
        diagnostic(
          source,
          "required-runtime-binding-unsupported",
          `${definition.importName}.${binding.name}の安全な生成adapterがありません`,
        ),
      );
    }
  }
  if (diagnostics.some((entry) => entry.severity === "blocking")) {
    return unsupported(diagnostics, definition);
  }

  const transformBinding = definition.runtimeBindings.find(
    (binding) => binding.generation === "managed-transform-state",
  );
  const textBinding = definition.runtimeBindings.find(
    (binding) => binding.generation === "managed-text-state",
  );
  const noopBindings = definition.runtimeBindings.filter(
    (binding) => binding.generation === "noop-callback",
  );
  if (transformBinding) {
    return compileManagedTransformWrapper(
      component,
      definition,
      props,
      transformBinding.name,
      diagnostics,
    );
  }
  if (textBinding) {
    return compileManagedTextWrapper(
      component,
      definition,
      props,
      textBinding.name,
      diagnostics,
    );
  }

  const propText = renderProps(
    props,
    noopBindings.map((binding) => `${binding.name}={() => {}}`),
  );
  const wrapper = definition.attachBehavior.kind === "wrapper";
  return {
    definition,
    importName: definition.importName,
    mode: wrapper ? "wrapper" : "leaf",
    jsx: wrapper
      ? `<${definition.importName}${propText}>{children}</${definition.importName}>`
      : `<${definition.importName}${propText} />`,
    diagnostics,
    supportDeclarations: [],
    reactValueImports: [],
    reactTypeImports: [],
  };
}

function compileManagedTransformWrapper(
  component: XRiftComponent,
  definition: XriftComponentDefinition,
  props: Map<string, JsonValue>,
  callbackName: string,
  diagnostics: CompilerDiagnostic[],
): CompiledXriftComponent {
  const transform = props.get("transform");
  if (transform === undefined) {
    return unsupported(diagnostics, definition);
  }
  props.delete("transform");
  const helperName = generatedComponentName(definition.importName, component.id);
  const propText = renderProps(props);
  const source = `const ${helperName}: FC<PropsWithChildren> = ({ children }) => {
  const [transform, setTransform] = useState(${JSON.stringify(transform)});
  return (
    <${definition.importName}${propText} transform={transform} ${callbackName}={(next) => setTransform((previous) => ({ ...previous, ...next }))}>
      {children}
    </${definition.importName}>
  );
};`;
  return {
    definition,
    importName: definition.importName,
    mode: "wrapper",
    jsx: `<${helperName}>{children}</${helperName}>`,
    diagnostics,
    supportDeclarations: [
      { key: `xrift-runtime:${helperName}`, source },
    ],
    reactValueImports: ["useState"],
    reactTypeImports: ["PropsWithChildren"],
  };
}

function compileManagedTextWrapper(
  component: XRiftComponent,
  definition: XriftComponentDefinition,
  props: Map<string, JsonValue>,
  callbackName: string,
  diagnostics: CompilerDiagnostic[],
): CompiledXriftComponent {
  const initialValue = props.get("value");
  props.delete("value");
  const helperName = generatedComponentName(definition.importName, component.id);
  const propText = renderProps(props);
  const source = `const ${helperName}: FC<PropsWithChildren> = ({ children }) => {
  const [value, setValue] = useState(${JSON.stringify(
    typeof initialValue === "string" ? initialValue : "",
  )});
  return (
    <${definition.importName}${propText} value={value} ${callbackName}={setValue}>
      {children}
    </${definition.importName}>
  );
};`;
  return {
    definition,
    importName: definition.importName,
    mode: "wrapper",
    jsx: `<${helperName}>{children}</${helperName}>`,
    diagnostics,
    supportDeclarations: [
      { key: `xrift-runtime:${helperName}`, source },
    ],
    reactValueImports: ["useState"],
    reactTypeImports: ["PropsWithChildren"],
  };
}

function renderProps(
  props: ReadonlyMap<string, JsonValue>,
  runtimeProps: readonly string[] = [],
): string {
  const rendered = [...props.entries()].map(
    ([name, value]) => `${name}={${JSON.stringify(value)}}`,
  );
  const allProps = [...rendered, ...runtimeProps];
  return allProps.length > 0 ? ` ${allProps.join(" ")}` : "";
}

function generatedComponentName(importName: string, componentId: string): string {
  const stem = componentId
    .trim()
    .replace(/[^a-zA-Z0-9_$]+/g, "_")
    .replace(/^([^a-zA-Z_$])/, "_$1")
    .slice(0, 36);
  return `Generated${importName}_${stem || "component"}_${stableShortHash(componentId)}`;
}

function stableShortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function unsupported(
  diagnostics: CompilerDiagnostic[],
  definition?: XriftComponentDefinition,
): CompiledXriftComponent {
  return {
    definition,
    importName: definition?.importName,
    mode: "unsupported",
    diagnostics,
    supportDeclarations: [],
    reactValueImports: [],
    reactTypeImports: [],
  };
}

function diagnostic(
  source: Pick<CompilerDiagnostic, "sceneId" | "entityId" | "componentId">,
  code: string,
  message: string,
  extra: Partial<CompilerDiagnostic> = {},
): CompilerDiagnostic {
  return { ...source, ...extra, severity: "blocking", code, message };
}
