import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readEvents, joinInferenceEvents, receiveAuthorization } from "./siwc-local.mjs";

const account = (key, extra = {}) => ({ key, clientId: "client-fixture", subject: key,
  accessToken: "access-fixture", refreshToken: "refresh-fixture",
  scopes: ["chatgpt.tokens.use.direct"], expiresAt: Date.now() + 3600000, ...extra });

async function fixture(t, accounts = [account("a")]) {
  const directory = await mkdtemp(join(tmpdir(), "xrift-siwc-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "accounts.json");
  await writeFile(file, JSON.stringify({ hostId: "urn:uuid:fixture", active: "a", accounts }), { mode: 0o600 });
  const previous = process.env.XRIFT_SIWC_DATA_DIR;
  process.env.XRIFT_SIWC_DATA_DIR = directory;
  let client;
  try { client = await import(`./siwc-local.mjs?fixture=${encodeURIComponent(directory)}`); }
  finally {
    if (previous === undefined) delete process.env.XRIFT_SIWC_DATA_DIR;
    else process.env.XRIFT_SIWC_DATA_DIR = previous;
  }
  return { directory, file, client };
}

test("real auth CLI starts, returns JSON and does not reveal credentials", async t => {
  const { directory } = await fixture(t);
  const child = spawnSync(process.execPath, [fileURLToPath(new URL("./siwc-local.mjs", import.meta.url)), "status"], {
    input: "{}", encoding: "utf8", env: { ...process.env, XRIFT_SIWC_DATA_DIR: directory }, timeout: 5000
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).result.active, "a");
  assert.ok(!child.stdout.includes("access-fixture"));
  assert.ok(!child.stdout.includes("refresh-fixture"));
});

test("SSE survives every byte boundary in CRLF and Japanese UTF-8", async () => {
  const bytes = Buffer.from('data: {"type":"response.output_text.delta","delta":"秋の公園"}\r\n\r\ndata: {"type":"response.completed"}\r\n\r\n');
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
  }, cancel() { cancelled = true; } });
  const events = [];
  for await (const event of readEvents(stream.getReader())) {
    events.push(event);
    if (event.type === "response.completed") break;
  }
  assert.equal(joinInferenceEvents(events), "秋の公園");
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});

test("SSE refuses malformed and oversized events and explicit error events", async () => {
  for (const value of ['data: null\n\n', 'data: nope\n\n', 'data: ' + 'x'.repeat(1000001)]) {
    const stream = new ReadableStream({ start(c) { c.enqueue(Buffer.from(value)); c.close(); } });
    await assert.rejects(async () => { for await (const event of readEvents(stream.getReader())) void event; }, /Malformed|too large/);
    assert.equal(stream.locked, false);
  }
  assert.throws(() => joinInferenceEvents([{ type: "error" }, { type: "response.completed" }]), /inference error/);
});

test("authorization timeout closes even an incomplete local HTTP connection", async () => {
  const { connect } = await import("node:net");
  let socket;
  await assert.rejects(receiveAuthorization({ state: "fixture", timeout: 100, urlFactory: uri => uri,
    open: uri => {
      socket = connect(Number(new URL(uri).port), "127.0.0.1");
      socket.on("error", () => {});
      socket.on("connect", () => socket.write("GET /auth/callback?state=fixture HTTP/1.1\r\n"));
    }
  }), /timed out/);
  socket.destroy();
});

test("declined authorization callback does not announce successful sign-in", async () => {
  let message;
  await receiveAuthorization({ state: "fixture", timeout: 5000,
    urlFactory: uri => uri + "?state=fixture&error=access_denied",
    open: uri => { message = fetch(uri).then(r => r.text()); }
  });
  assert.match(await message, /declined/);
});

test("parallel refresh and logout cannot overwrite rotated credentials", async t => {
  const { client, file, directory } = await fixture(t, [account("a", { expiresAt: 0 })]);
  let release, started;
  const inRefresh = new Promise(r => { started = r; });
  t.mock.method(globalThis, "fetch", async uri => {
    if (String(uri).endsWith("/token")) {
      started();
      await new Promise(r => { release = r; });
      return Response.json({ token_type: "Bearer", access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 });
    }
    return Response.json({ models: [] });
  });
  const refresh = client.models();
  await inRefresh;
  await assert.rejects(client.logout(), /store is busy/);
  release();
  await refresh;
  assert.equal(JSON.parse(await readFile(file)).accounts[0].refreshToken, "new-refresh");
  await assert.rejects(stat(join(directory, "accounts.lock")), { code: "ENOENT" });
  if (process.platform !== "win32") assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test("revoked permission is persisted with the rotated refresh token before refusing usage", async t => {
  const { client, file } = await fixture(t, [account("a", { expiresAt: 0 })]);
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return Response.json({ token_type: "Bearer", access_token: "revoked-access", refresh_token: "rotated-refresh", expires_in: 3600, scope: "openid" });
  });
  await assert.rejects(client.models(), /revoked/);
  assert.equal((await client.status()).accounts[0].planUsageEnabled, false);
  assert.equal(JSON.parse(await readFile(file)).accounts[0].refreshToken, "rotated-refresh");
  await assert.rejects(client.models(), /not granted/);
  assert.equal(requests, 1);
});

test("catalog and inference use the same account token even when active account switches", async t => {
  const { client } = await fixture(t, [account("a"), account("b", { accessToken: "access-b" })]);
  const requests = [];
  t.mock.method(globalThis, "fetch", async (uri, options) => {
    requests.push({ uri: String(uri), token: options.headers.Authorization });
    if (String(uri).endsWith("/models")) {
      await client.select({ key: "b" });
      return Response.json({ models: [{ slug: "fixture-model", visibility: "list" }] });
    }
    return new Response('data: {"type":"response.output_text.delta","delta":"{}"}\n\ndata: {"type":"response.completed"}\n\n');
  });
  assert.equal((await client.infer({ key: "a", model: "fixture-model", input: "fixture" })).text, "{}");
  assert.deepEqual(requests.map(r => r.token), ["Bearer access-fixture", "Bearer access-fixture"]);
  await assert.rejects(client.infer({ key: "a", model: "fixture-model", input: "fixture" }), /account changed/);
  assert.equal(requests.length, 2);
});

test("inference bounds accumulated output and cancels on early failure", async t => {
  const { client } = await fixture(t);
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async uri => {
    if (String(uri).endsWith("/models")) return Response.json({ models: [{ slug: "fixture-model", visibility: "list" }] });
    return new Response(new ReadableStream({ start(c) {
      c.enqueue(Buffer.from('data: ' + JSON.stringify({ type: "response.output_text.delta", delta: "x".repeat(100001) }) + '\n\n'));
    }, cancel() { cancelled = true; } }));
  });
  await assert.rejects(client.infer({ model: "fixture-model", input: "fixture" }), /output too large/);
  assert.equal(cancelled, true);
});

test("usage-limit codes are useful without exposing server error messages or tokens", async t => {
  const { client } = await fixture(t);
  const sensitive = "access-fixture refresh-fixture private server detail";
  t.mock.method(globalThis, "fetch", async uri => {
    if (String(uri).endsWith("/models")) return Response.json({ models: [{ slug: "fixture-model", visibility: "list" }] });
    return new Response('data: ' + JSON.stringify({ type: "response.failed", response: { error: {
      code: "subscription_sharing_usage_limit_exceeded", message: sensitive
    } } }) + '\n\n');
  });
  await assert.rejects(client.infer({ model: "fixture-model", input: "fixture" }), e => {
    assert.match(e.message, /subscription_sharing_usage_limit_exceeded/);
    assert.ok(!e.message.includes(sensitive));
    return true;
  });
});

test("async browser launch failures release the listener promptly", async () => {
  await assert.rejects(receiveAuthorization({ state: "fixture", timeout: 5000,
    urlFactory: uri => uri, open: async () => { throw new Error("no browser"); }
  }), /no browser/);
});
