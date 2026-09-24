import { decodeBase64DataUrl } from "./dist-upload-files";
import { DEFAULT_IGNORE_PATTERNS, XriftClient, type UploadFile, type WorldUploadOptions } from "@xrift/sdk";
import { createPrototypeProject } from "./prototype-project";
import { createTextComponent } from "./scene-document";
import {
  assertCompiledModuleEntry,
  parseStagedXriftConfig,
  resolveExistingPublicationId,
} from "./publish";
import { describeVisualUploadCapabilities } from "./upload";
import {
  SHELL_ENTRY_PATH,
  REQUIRED_RUNTIME_SHELL_CONTRACT,
  WebUploadUnsupportedError,
  assertUploadableToken,
  assertRuntimeShellDependencies,
  describeSdkError,
  loadRuntimeShell,
  parseShellManifest,
  redactToken,
  resolveWebRuntimePermissions,
  uploadVisualProjectFromWeb,
} from "./web-upload";

/**
 * Assertions for the native/web upload branch. Performs no network request and
 * never touches Tauri IPC.
 *
 * Token shape is not a scope check: XRift decides whether a key can publish.
 * The fixture also verifies that the browser sends the same bundled files and
 * compiled world options as the desktop staging path.
 */
export async function runVisualUploadFixtureAssertions(): Promise<void> {
  assertCapabilities();
  assertTokenRules();
  assertSecretRedaction();
  assertShellManifestRules();
  await assertRuntimeShellPayloadValidation();
  assertStagedConfigParsing();
  assertDataUrlDecoding();
  await assertBrowserUploadParity();
}

async function assertRuntimeShellPayloadValidation(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const entry = "export const World = 1;";
  const manifest = {
    version: "ee2fbde7f8ed", // SHA-256("remoteEntry.js" + entry), first 12 hex chars.
    runtimeContract: REQUIRED_RUNTIME_SHELL_CONTRACT,
    entry: SHELL_ENTRY_PATH,
    files: [SHELL_ENTRY_PATH],
    dependencies: { [SHELL_ENTRY_PATH]: [] },
  };
  async function fetchFixtureFile(body: string, contentType: string) {
    const requests: RequestCache[] = [];
    try {
      globalThis.fetch = async (input, init) => {
        requests.push(init?.cache ?? "default");
        return String(input).endsWith("shell-manifest.json")
          ? new Response(JSON.stringify(manifest), { status: 200, headers: { "content-type": "application/json" } })
          : new Response(body, { status: 200, headers: { "content-type": contentType } });
      };
      const files = await loadRuntimeShell("https://fixture.invalid/shell");
      return { files, requests };
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  const valid = await fetchFixtureFile(entry, "application/javascript");
  assert(
    valid.files.length === 1 && valid.files[0]?.path === SHELL_ENTRY_PATH &&
      valid.requests.join(",") === "no-store,no-store",
    "a valid shell must pass its digest check and bypass the browser cache",
  );

  for (const contentType of ["text/html", "application/javascript"]) {
    let rejected: unknown;
    try {
      await fetchFixtureFile("<!doctype html><html><body>Vite fallback</body></html>", contentType);
    } catch (error) {
      rejected = error;
    }
    assert(
      rejected instanceof WebUploadUnsupportedError &&
        rejected.message.includes("HTML"),
      `a 200 HTML fallback labeled ${contentType} was accepted as JavaScript`,
    );
  }

  let corrupted: unknown;
  try {
    await fetchFixtureFile("export const World = 2;", "application/javascript");
  } catch (error) {
    corrupted = error;
  }
  assert(
    corrupted instanceof WebUploadUnsupportedError &&
      corrupted.message.includes("バージョンと一致しません"),
    "a changed JavaScript payload with HTTP 200 was accepted despite the manifest digest",
  );
}

async function assertBrowserUploadParity(): Promise<void> {
  const preserved = resolveWebRuntimePermissions({
    allowedDomains: ["assets.example.com"],
    allowedCodeRules: ["no-obfuscation", "no-network-without-permission"],
  });
  assert(
    preserved.allowedDomains?.[0] === "assets.example.com" &&
      preserved.allowedCodeRules?.join(",") ===
        "no-network-without-permission,no-obfuscation",
    "the shell permission must preserve compiler rules and domains without duplicates",
  );

  const prototype = createPrototypeProject("world", "web-upload-parity");
  const entityId = prototype.scene.rootEntityIds[0];
  const entity = prototype.scene.entities[entityId];
  const textComponent = createTextComponent("component-web-upload-font", {
    text: "公開用フォント",
    fontId: "noto-sans-jp",
  });
  assert(Boolean(entity && textComponent), "the fixture world needs a Text Entity");
  const scene = {
    ...prototype.scene,
    entities: {
      ...prototype.scene.entities,
      [entityId]: {
        ...entity,
        components: [...entity.components, textComponent!],
      },
    },
  };
  const documents = {
    project: prototype.project,
    scenes: { [scene.sceneId]: scene },
    assets: prototype.assets,
    prefabs: prototype.prefabs,
  };
  const originalFetch = globalThis.fetch;
  const worldApiPrototype = Object.getPrototypeOf(
    new XriftClient({ token: "xrf_fixture" }).worlds,
  ) as { upload: (files: UploadFile[], options: WorldUploadOptions) => Promise<{
    worldId: string; versionId: string; versionNumber: number; contentHash: string;
    files: UploadFile[];
  }> };
  const originalUpload = worldApiPrototype.upload;
  const fetched: string[] = [];
  let sentFiles: UploadFile[] = [];
  let sentOptions: WorldUploadOptions | undefined;
  try {
    globalThis.fetch = async (input) => {
      fetched.push(String(input));
      return new Response(new Blob(["font-bytes"]), { status: 200 });
    };
    worldApiPrototype.upload = async (files, options) => {
      sentFiles = files;
      sentOptions = options;
      return {
        worldId: "fixture-world-id",
        versionId: "fixture-version-id",
        versionNumber: 1,
        contentHash: "fixture-content-hash",
        files,
      };
    };

    await uploadVisualProjectFromWeb({
      kind: "world",
      documents,
      token: "xrf_fixture",
      readAssetBytes: async (path) => {
        throw new Error(`Unexpected authored Asset read: ${path}`);
      },
      shellFiles: [
        { path: "remoteEntry.js", data: new Uint8Array([1, 2, 3]) },
        {
          path: "__federation_shared_three/addons/loaders/DRACOLoader.js-fixture.js",
          data: new Uint8Array([4]),
        },
        {
          path: "__federation_shared_three/addons/loaders/KTX2Loader.js-fixture.js",
          data: new Uint8Array([5]),
        },
      ],
      thumbnail: new Uint8Array([137, 80, 78, 71]),
      report: () => {},
      signal: new AbortController().signal,
    });
  } finally {
    globalThis.fetch = originalFetch;
    worldApiPrototype.upload = originalUpload;
  }

  assert(
    fetched.some((url) => url.endsWith("noto-sans-jp-japanese-400-normal.woff")),
    "the browser path did not fetch the Text font that desktop staging copies",
  );
  assert(
    sentFiles.some((file) =>
      file.remotePath === "noto-sans-jp-japanese-400-normal.woff" &&
      file.size === "font-bytes".length,
    ),
    "the browser upload omitted the bundled Text font",
  );
  assert(
    sentFiles.some((file) => file.remotePath === "xrift-runtime.json") &&
      sentFiles.some((file) => file.remotePath === "remoteEntry.js") &&
      sentFiles.some((file) => file.remotePath === "thumbnail.png"),
    "the browser upload must include the manifest, federation entry and thumbnail",
  );
  assert(
    sentFiles.some((file) =>
      file.remotePath ===
      "__federation_shared_three/addons/loaders/DRACOLoader.js-fixture.js",
    ) &&
      sentFiles.some((file) =>
        file.remotePath ===
        "__federation_shared_three/addons/loaders/KTX2Loader.js-fixture.js",
      ),
    "the SDK's generic ignore rule removed a shell module imported by World",
  );
  assert(
    sentOptions?.permissions?.allowedCodeRules?.includes(
      "no-network-without-permission",
    ) &&
      typeof sentOptions.physics?.gravity === "number" &&
      typeof sentOptions.camera?.near === "number" &&
      sentOptions.thumbnailPath === "thumbnail.png",
    "the browser upload lost security, physics, camera or thumbnail options",
  );
}

function assertStagedConfigParsing(): void {
  const config = parseStagedXriftConfig(
    JSON.stringify({
      world: {
        distDir: "./dist",
        title: "My World",
        description: "説明",
        thumbnailPath: "thumbnail.png",
        ignore: ["**/*.map", "**/index.html"],
        physics: { gravity: 9.81, allowInfiniteJump: true },
        camera: { near: 0.1, far: 1000 },
        permissions: {
          allowedDomains: ["api.example.com"],
          allowedCodeRules: ["no-network-without-permission"],
        },
        outputBufferType: "HalfFloatType",
      },
    }),
    "world",
  );
  // "./dist" and "dist/" name the same directory; the collector joins paths
  // directly, so a surviving "./" would produce "./dist/index.js".
  assert(config.distDir === "dist", "distDir must be normalized");
  assert(config.title === "My World", "title was not read");
  assert(
    config.ignore.length === 2 + DEFAULT_IGNORE_PATTERNS.length &&
      DEFAULT_IGNORE_PATTERNS.every((pattern) => config.ignore.includes(pattern)),
    "SDK default ignore rules were not merged",
  );
  assert(config.physics?.gravity === 9.81, "physics was not read");
  assert(config.camera?.far === 1000, "camera was not read");
  assert(
    config.permissions?.allowedDomains?.[0] === "api.example.com",
    "permissions were not read",
  );
  assert(
    config.outputBufferType === "HalfFloatType",
    "outputBufferType was not read",
  );

  // The CLI/SDK require distDir. The direct SDK path must not silently accept a
  // staging config that the CLI would reject.
  assertThrows(
    () => parseStagedXriftConfig(JSON.stringify({ world: {} }), "world"),
    "a missing distDir was accepted",
  );

  // Studio's official World/Item templates are Module Federation remotes.
  // A non-empty dist without this entry would upload successfully but render
  // nothing on XRift.
  assertCompiledModuleEntry([
    { remotePath: "remoteEntry.js" },
    { remotePath: "index-abc.js" },
  ]);
  assertThrows(
    () => assertCompiledModuleEntry([{ remotePath: "index-abc.js" }]),
    "a built dist without remoteEntry.js was accepted",
  );
  assert(
    resolveExistingPublicationId(
      { uploadedAt: "2026-09-22T00:00:00.000Z", worldId: "world-existing" },
      "world",
    ) === "world-existing",
    "SDK re-publish lost the existing World ID",
  );
  assert(
    resolveExistingPublicationId(
      { uploadedAt: "2026-09-22T00:00:00.000Z", contentId: "legacy-world-id" },
      "world",
    ) === "legacy-world-id",
    "legacy publication contentId was not reused",
  );
  assert(
    resolveExistingPublicationId(undefined, "world") === undefined,
    "an unpublished project invented a remote World ID",
  );
  assertThrows(
    () => parseStagedXriftConfig("{ not json", "world"),
    "invalid JSON was accepted",
  );
  // Publishing a world using an item's config would send the wrong metadata.
  assertThrows(
    () => parseStagedXriftConfig(JSON.stringify({ item: {} }), "world"),
    "a config without the requested kind was accepted",
  );
}

function assertDataUrlDecoding(): void {
  // IPC returns bytes base64-encoded inside a data URL.
  const decoded = decodeBase64DataUrl(
    "data:application/octet-stream;base64,AAECA/8=",
    "chunk.bin",
  );
  assert(
    decoded.length === 5 &&
      decoded[0] === 0 &&
      decoded[3] === 3 &&
      decoded[4] === 255,
    "binary payload was not decoded byte-for-byte",
  );
  assert(
    decodeBase64DataUrl("data:text/plain;base64,", "empty.txt").length === 0,
    "an empty payload must decode to zero bytes",
  );
  assertThrows(
    () => decodeBase64DataUrl("not-a-data-url", "x.bin"),
    "a non data URL was accepted",
  );
}

function assertShellManifestRules(): void {
  const manifest = parseShellManifest({
    version: "4e10989ee355",
    runtimeContract: REQUIRED_RUNTIME_SHELL_CONTRACT,
    entry: SHELL_ENTRY_PATH,
    files: [SHELL_ENTRY_PATH, "index-abc.js", "../escape.js", ""],
    dependencies: { [SHELL_ENTRY_PATH]: [], "index-abc.js": [] },
  });
  assert(
    manifest.files.join(",") === `${SHELL_ENTRY_PATH},index-abc.js`,
    "a shell listing must drop traversal and empty entries before fetching them",
  );
  assert(manifest.version === "4e10989ee355", "shell version was not read");
  assert(
    manifest.runtimeContract === REQUIRED_RUNTIME_SHELL_CONTRACT,
    "shell runtime contract was not read",
  );

  // XRift loads the world as a Module Federation remote, so a listing without
  // remoteEntry.js would upload cleanly and then render nothing.
  assertThrows(
    () =>
      parseShellManifest({
        version: "1",
        runtimeContract: REQUIRED_RUNTIME_SHELL_CONTRACT,
        files: ["index-abc.js"],
      }),
    `a shell listing without ${SHELL_ENTRY_PATH} was accepted`,
  );
  assertThrows(
    () =>
      parseShellManifest({
        version: "1",
        runtimeContract: "2026-09-06-model-instancing-v1",
        files: [SHELL_ENTRY_PATH],
      }),
    "a runtime shell without Mirror reflection intervals was accepted",
  );
  assertThrows(
    () => parseShellManifest(null),
    "a non-object shell listing was accepted",
  );

  const dependencyPath =
    "__federation_shared_three/addons/loaders/DRACOLoader.js-fixture.js";
  const importingChunk = "__federation_expose_World-fixture.js";
  assertThrows(
    () => assertRuntimeShellDependencies({
      files: [importingChunk],
      dependencies: { [importingChunk]: [dependencyPath] },
    }),
    "a shell with a missing declared federation import was accepted",
  );
  assertRuntimeShellDependencies({
    files: [importingChunk, dependencyPath],
    dependencies: { [importingChunk]: [dependencyPath], [dependencyPath]: [] },
  });
  assertThrows(
    () => assertRuntimeShellDependencies({
      files: [importingChunk, dependencyPath],
      dependencies: { [importingChunk]: [dependencyPath] },
    }),
    "a JS file without a dependency declaration was accepted",
  );
}

function assertThrows(run: () => unknown, message: string): void {
  try {
    run();
  } catch {
    return;
  }
  throw new Error(message);
}

function assertCapabilities(): void {
  const native = describeVisualUploadCapabilities("native");
  assert(
    native.supportsItems &&
      native.supportsScripts &&
      native.runsPrePublishCheck &&
      !native.requiresToken,
    "the native path must keep full CLI capabilities",
  );

  const web = describeVisualUploadCapabilities("web");
  assert(
    !web.supportsItems,
    "Items need the official CLI and must stay desktop-only",
  );
  assert(
    !web.supportsScripts,
    "runtime.json cannot represent Script source, so web must report no Script support",
  );
  assert(
    !web.runsPrePublishCheck,
    "there is no local build in a browser, so no pre-publish check can run",
  );
  assert(
    web.requiresToken,
    "the web path has no CLI session and must require a token",
  );
}

function assertTokenRules(): void {
  // Only the server can judge a token. Every shape XRift might issue — CLI
  // tokens, API keys, and whatever it adds later — has to pass through.
  for (const token of [
    "xrf_abcdef123456",
    "xrift_sk_abcdef123456",
    "  xrf_abcdef123456  ",
    "xrf_short",
    "sk-live-AbCd+/=123",
    "an-entirely-unfamiliar-token",
  ]) {
    assertDoesNotThrow(
      () => assertUploadableToken(token),
      `token "${token.trim()}" was rejected locally, but only XRift can decide that`,
    );
  }

  const empty = expectThrow(
    () => assertUploadableToken("   "),
    "a blank token was accepted",
  );
  assert(
    empty instanceof WebUploadUnsupportedError && empty.code === "token-invalid",
    "a blank token must be refused with the token-invalid code",
  );

  // A pasted newline would build a malformed Authorization header rather than
  // producing a clean 401.
  expectThrow(
    () => assertUploadableToken("xrf_abc\n123"),
    "a token containing a newline was accepted",
  );
}

function assertSecretRedaction(): void {
  assert(
    redactToken("failed for xrf_supersecretvalue here") ===
      "failed for xrf_[REDACTED] here",
    "a CLI token must never reach the UI",
  );
  assert(
    redactToken("Authorization: Bearer abc.def-ghi") ===
      "Authorization: Bearer [REDACTED]",
    "a bearer header must be redacted",
  );
  // A signed upload URL carries its signature in the query string.
  assert(
    redactToken("PUT https://storage.example/o?X-Goog-Signature=deadbeef&x=1") ===
      "PUT https://storage.example/o?X-Goog-Signature=[REDACTED]&x=1",
    "a signed URL signature must be redacted",
  );

  assert(
    describeSdkError(new Error("boom xrf_leakedtoken")).includes("xrf_[REDACTED]"),
    "describeSdkError must redact tokens it passes through",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectThrow(run: () => unknown, message: string): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error(message);
}

function assertDoesNotThrow(run: () => unknown, message: string): void {
  try {
    run();
  } catch (error) {
    throw new Error(`${message}: ${error}`);
  }
}
