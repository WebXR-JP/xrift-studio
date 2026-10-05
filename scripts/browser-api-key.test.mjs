import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  cacheDir: "node_modules/.vite-browser-api-key-tests",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
});
after(() => server.close());
const {
  askBrowserToSaveXriftApiKey,
  canUseBrowserPasswordManager,
  readSavedXriftApiKey,
} = await server.ssrLoadModule("/src/lib/visual-editor/browser-api-key.ts");

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
after(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
});

test("browser password manager saves only on request and restores only XRift publishing key", async () => {
  let saved = null;
  let requests = [];
  class FakePasswordCredential {
    type = "password";
    constructor(options) { Object.assign(this, options); }
  }
  const windowStub = { isSecureContext: true, PasswordCredential: FakePasswordCredential };
  windowStub.self = windowStub;
  windowStub.top = windowStub;
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowStub });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    credentials: {
      get: async (options) => { requests.push(options); return saved; },
      store: async (credential) => { saved = credential; },
    },
  } });

  assert.equal(canUseBrowserPasswordManager(), true);
  assert.equal(await readSavedXriftApiKey(), null);
  assert.equal(saved, null);
  await askBrowserToSaveXriftApiKey("fixture-key");
  assert.equal(requests.length, 1, "saving must not open the chooser automatically");
  assert.equal(saved.password, "fixture-key");
  assert.equal(saved.id, "xrift-studio:world-publishing-api-key");
  assert.equal(await readSavedXriftApiKey(), "fixture-key");
  assert.equal(requests.at(-1).mediation, "silent");
  assert.equal(requests.at(-1).password, true);

  saved = { type: "password", id: "unrelated-login", password: "other-secret" };
  assert.equal(await readSavedXriftApiKey("required"), null);
  assert.equal(requests.at(-1).mediation, "required");
});

test("saving does not read back before the user accepts the browser prompt", async () => {
  let saved = null;
  let pending = null;
  const requests = [];
  class FakePasswordCredential {
    type = "password";
    constructor(options) { Object.assign(this, options); }
  }
  const windowStub = { isSecureContext: true, PasswordCredential: FakePasswordCredential };
  windowStub.self = windowStub;
  windowStub.top = windowStub;
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowStub });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    credentials: {
      get: async ({ mediation }) => { requests.push(mediation); return mediation === "required" ? saved : null; },
      // Chromium acknowledges store() before the user accepts the save prompt.
      store: async (credential) => { pending = credential; },
    },
  } });

  await askBrowserToSaveXriftApiKey("fixture-key");
  assert.deepEqual(requests, [], "the save prompt must finish before a separate read");
  assert.equal(saved, null);
  saved = pending; // The user accepts the prompt later.
  assert.equal(await readSavedXriftApiKey(), null);
  assert.equal(await readSavedXriftApiKey("required"), "fixture-key");
  assert.deepEqual(requests, ["silent", "required"]);
});

test("declining the save prompt leaves the separate read empty", async () => {
  class FakePasswordCredential {
    type = "password";
    constructor(options) { Object.assign(this, options); }
  }
  const windowStub = { isSecureContext: true, PasswordCredential: FakePasswordCredential };
  windowStub.self = windowStub;
  windowStub.top = windowStub;
  let storeCalled = false;
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowStub });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    credentials: {
      get: async () => null,
      store: async () => { storeCalled = true; },
    },
  } });

  await askBrowserToSaveXriftApiKey("fixture-key");
  assert.equal(storeCalled, true);
  assert.equal(await readSavedXriftApiKey("required"), null);
});

test("unsupported browser keeps manual entry available", async () => {
  const windowStub = { isSecureContext: true };
  windowStub.self = windowStub;
  windowStub.top = windowStub;
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowStub });
  assert.equal(canUseBrowserPasswordManager(), false);
  assert.equal(await readSavedXriftApiKey(), null);
  await assert.rejects(askBrowserToSaveXriftApiKey("fixture-key"), /対応していません/);
});
