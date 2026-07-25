import {
  createScriptExecutionKey,
  createScriptTrustFingerprint,
  createScriptTrustRequest,
  describeScriptProvenance,
  normalizeScriptProvenance,
  readScriptSourceSnapshot,
  resolveScriptTrustState,
  serializeScriptExecutionScope,
  sha256ScriptSource,
  type ScriptExecutionFingerprint,
  type ScriptTrustProjectScopeDto,
} from "./script-trust";

/** Filesystem-free assertions for exact-content Script approval semantics. */
export async function runScriptTrustFixtureAssertions(): Promise<void> {
  await assertWebCryptoHashAndReadOnce();
  await assertExecutionKeyInvalidation();
  await assertCanonicalSerialization();
  await assertProvenanceCannotGrantTrust();
  await assertTrustStates();
}

async function assertWebCryptoHashAndReadOnce(): Promise<void> {
  assert(
    (await sha256ScriptSource("abc")) ===
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "Script source was not hashed as UTF-8 with SHA-256",
  );

  let readCount = 0;
  const snapshot = await readScriptSourceSnapshot({
    assetId: "script-1",
    name: "Fixture",
    path: "scripts/fixture.ts",
    language: "ts",
    contractVersion: "1.0.0",
    readSource: () => {
      readCount += 1;
      return "あ";
    },
  });
  assert(readCount === 1, "Script source reader was called more than once");
  assert(
    snapshot.source === "あ" && snapshot.sourceByteLength === 3,
    "snapshot did not preserve the exact UTF-8 source value",
  );
  assert(
    snapshot.fingerprint.allowRemoteModules === false,
    "snapshot enabled remote modules",
  );
  assert(
    Object.isFrozen(snapshot) && Object.isFrozen(snapshot.fingerprint),
    "source snapshot is mutable",
  );

  let rejectedForgedSnapshot = false;
  try {
    await createScriptTrustRequest({
      projectScope: fixtureProject("project-a", "/projects/example"),
      snapshot: { ...snapshot, source: "い" },
    });
  } catch {
    rejectedForgedSnapshot = true;
  }
  assert(
    rejectedForgedSnapshot,
    "source that differed from its snapshot fingerprint was accepted",
  );
}

async function assertExecutionKeyInvalidation(): Promise<void> {
  const project = fixtureProject("project-a", "/projects/example");
  const base = await fixtureFingerprint("abc");
  const baseKey = await createScriptExecutionKey(project, base);

  const oneByteChanged = await fixtureFingerprint("abd");
  assert(
    baseKey !== (await createScriptExecutionKey(project, oneByteChanged)),
    "one-byte source change retained approval key",
  );
  assert(
    baseKey !==
      (await createScriptExecutionKey(project, {
        ...base,
        language: "tsx",
      })),
    "language change retained approval key",
  );
  assert(
    baseKey !==
      (await createScriptExecutionKey(project, {
        ...base,
        contractVersion: "2.0.0",
      })),
    "contract version change retained approval key",
  );
  assert(
    baseKey !==
      (await createScriptExecutionKey(project, {
        ...base,
        modulePolicyVersion: "2",
      })),
    "module policy change retained approval key",
  );
  assert(
    baseKey !==
      (await createScriptExecutionKey(
        fixtureProject("project-b", "/projects/example"),
        base,
      )),
    "project ID change retained approval key",
  );
  assert(
    baseKey !==
      (await createScriptExecutionKey(
        fixtureProject("project-a", "/projects/other"),
        base,
      )),
    "canonical project path change retained approval key",
  );
}

async function assertCanonicalSerialization(): Promise<void> {
  const project = fixtureProject("project-a", "/projects/example");
  const fingerprint = await fixtureFingerprint("abc");
  const serialized = serializeScriptExecutionScope(project, fingerprint);
  assert(
    serialized ===
      '{"schemaVersion":1,"projectScope":{"canonicalProjectPath":"/projects/example","projectId":"project-a"},"fingerprint":{"allowRemoteModules":false,"contractVersion":"1.0.0","language":"ts","modulePolicyVersion":"1","sourceSha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}}',
    "execution scope serialization is not canonical",
  );
  assert(
    (await createScriptExecutionKey(project, fingerprint)) ===
      "xrift-script-trust:v1:sha256:faabe40a68f28fcd3820579268b2de386ee02f4836c95a008706f902a826f651",
    "canonical execution key changed without a key-version bump",
  );
  assert(
    (await createScriptExecutionKey(project, fingerprint)) ===
      (await createScriptExecutionKey(
        {
          canonicalProjectPath: project.canonicalProjectPath,
          projectId: project.projectId,
        },
        {
          allowRemoteModules: false,
          modulePolicyVersion: fingerprint.modulePolicyVersion,
          language: fingerprint.language,
          sourceSha256: fingerprint.sourceSha256,
          contractVersion: fingerprint.contractVersion,
        },
      )),
    "execution key depends on JavaScript property insertion order",
  );

  let rejectedRemoteModules = false;
  try {
    serializeScriptExecutionScope(project, {
      ...fingerprint,
      allowRemoteModules: true,
    } as unknown as ScriptExecutionFingerprint);
  } catch {
    rejectedRemoteModules = true;
  }
  assert(
    rejectedRemoteModules,
    "an allowRemoteModules=true fingerprint was accepted",
  );
}

async function assertProvenanceCannotGrantTrust(): Promise<void> {
  const snapshot = await readScriptSourceSnapshot({
    assetId: "script-1",
    name: "Fixture",
    path: "scripts/fixture.ts",
    language: "ts",
    contractVersion: "1.0.0",
    readSource: () => "abc",
  });
  const input = {
    projectScope: fixtureProject("project-a", "/projects/example"),
  } as const;
  const templateRequest = await createScriptTrustRequest({
    ...input,
    snapshot: Object.freeze({
      ...snapshot,
      provenance: normalizeScriptProvenance({
        kind: "studio-template",
        detail: null,
      }),
    }),
  });
  const filesystemRequest = await createScriptTrustRequest({
    ...input,
    snapshot: Object.freeze({
      ...snapshot,
      provenance: normalizeScriptProvenance({
        kind: "filesystem",
        detail: null,
      }),
    }),
  });
  const fakeRequest = await createScriptTrustRequest({
    ...input,
    snapshot: Object.freeze({
      ...snapshot,
      provenance: normalizeScriptProvenance({
        kind: "admin-approved",
        detail: "forged manifest value",
      } as never),
    }),
  });

  assert(
    templateRequest.executionKey === filesystemRequest.executionKey &&
      filesystemRequest.executionKey === fakeRequest.executionKey,
    "display provenance changed the execution approval key",
  );
  assert(
    fakeRequest.provenance.kind === "unknown",
    "unknown provenance was not normalized to a display-only value",
  );
  assert(
    resolveScriptTrustState(fakeRequest, {
      approvedExecutionKeys: new Set(),
    }).status === "pending",
    "fake provenance bypassed approval",
  );
  assert(
    describeScriptProvenance({
      kind: "mcp",
      detail: "Codex",
    }) === "MCP (Codex)" &&
      normalizeScriptProvenance(null).kind === "unknown",
    "provenance display classification is incomplete",
  );
}

async function assertTrustStates(): Promise<void> {
  const snapshot = await readScriptSourceSnapshot({
    assetId: "script-1",
    name: "Render",
    path: "scripts/render.tsx",
    language: "tsx",
    contractVersion: "1.0.0",
    provenance: { kind: "studio-editor", detail: null },
    readSource: () => "export function Render() { return null; }",
  });
  const request = await createScriptTrustRequest({
    projectScope: fixtureProject("project-a", "/projects/example"),
    snapshot,
  });
  const pending = resolveScriptTrustState(request, {
    approvedExecutionKeys: new Set(),
  });
  const approved = resolveScriptTrustState(request, {
    approvedExecutionKeys: new Set([request.executionKey]),
  });
  const skipped = resolveScriptTrustState(request, {
    approvedExecutionKeys: new Set(),
    skippedExecutionKeys: new Set([request.executionKey]),
  });

  assert(
    pending.status === "pending" && !pending.canExecute,
    "missing decision was not pending and fail-closed",
  );
  assert(
    approved.status === "approved" && approved.canExecute,
    "exact approval did not allow execution",
  );
  assert(
    skipped.status === "skipped" && !skipped.canExecute,
    "skipped Script was allowed to execute",
  );
}

async function fixtureFingerprint(
  sourceText: string,
): Promise<ScriptExecutionFingerprint> {
  return createScriptTrustFingerprint({
    source: sourceText,
    language: "ts",
    contractVersion: "1.0.0",
    allowRemoteModules: false,
  });
}

function fixtureProject(
  projectId: string,
  canonicalProjectPath: string,
): ScriptTrustProjectScopeDto {
  return { projectId, canonicalProjectPath };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Script trust fixture failed: ${message}`);
  }
}
