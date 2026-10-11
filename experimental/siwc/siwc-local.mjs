/**
 * Standalone local Sign in with ChatGPT proof of concept (Node.js 22+).
 *
 * EXPERIMENTAL: credentials are stored in a permission-restricted file, not
 * OS keychain. Do not bundle in distributed XRift Studio until this is fixed.
 * This module is not imported by production runtime or the renderer.
 */
import { createHash, createPublicKey, randomBytes, randomUUID, verify } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, chmod, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const AUTH = "https://auth.openai.com";
const API = "https://api.openai.com/v1";
const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const DATA_DIR = process.env.XRIFT_SIWC_DATA_DIR || join(homedir(), ".config", "xrift-studio", "experimental-chatgpt");
const FILE = join(DATA_DIR, "accounts.json");
const error = message => { throw new Error(message); };
const tokenString = () => randomBytes(32).toString("base64url");
const sha256 = value => createHash("sha256").update(value).digest("base64url");
const checkPermission = scopes => Array.isArray(scopes) && scopes.includes("chatgpt.tokens.use.direct");

async function jsonFetch(uri, opts = {}) {
  const response = await fetch(uri, { signal: AbortSignal.timeout(30000), ...opts });
  if (!response.ok) error("OpenAI request returned HTTP " + response.status);
  return response.json();
}

async function readStore() {
  try {
    const value = JSON.parse(await readFile(FILE, "utf8"));
    if (!Array.isArray(value.accounts) || typeof value.hostId !== "string") error("Invalid local credential store");
    return value;
  } catch (e) {
    if (e.code === "ENOENT") return { hostId: "urn:uuid:" + randomUUID(), active: null, accounts: [] };
    throw e;
  }
}

async function saveStore(data) {
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const temp = join(DATA_DIR, "." + randomUUID() + ".tmp");
  try {
    await writeFile(temp, JSON.stringify(data), { mode: 0o600, flag: "wx" });
    if (platform() !== "win32") await chmod(temp, 0o600);
    await rename(temp, FILE);
  } catch (e) {
    error("Unable to write local credentials (" + (e.code ?? "IO error") + ")");
  }
}

export function buildAuthorizeUrl({ hostId, state, nonce, verifier, redirectUri, clientId, idToken }) {
  const initial = !clientId;
  const url = new URL(AUTH + "/api/accounts/authorize");
  const params = {
    client_id: clientId || "dynamic_agent_client",
    ext_agent_host_id: hostId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    resource: API,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: sha256(verifier)
  };
  if (initial) params.agent_name_hint = "XRift Studio";
  if (idToken && !initial) params.id_token_hint = idToken;
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url.toString();
}

export function parseCallback(uri, state, expectedClientId) {
  const parsed = new URL(uri, "http://127.0.0.1");
  if (parsed.pathname !== "/auth/callback" || parsed.searchParams.get("state") !== state) {
    error("Invalid authorization callback");
  }
  if (parsed.searchParams.has("error")) error("Authorization was declined");
  const code = parsed.searchParams.get("code");
  const returnedClientId = parsed.searchParams.get("client_id");
  if (expectedClientId && returnedClientId && expectedClientId !== returnedClientId) error("OAuth client mismatch");
  const clientId = expectedClientId ?? returnedClientId;
  if (!code || !clientId || clientId === "dynamic_agent_client") error("Missing authorization code or issued client ID");
  return { code, clientId };
}

function openBrowser(uri) {
  const command = platform() === "win32" ? "explorer.exe" : platform() === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [uri], { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

async function receiveAuthorization({ state, urlFactory, timeout = 180000 }) {
  let server, timer;
  try {
    const callback = new Promise((resolveCallback, reject) => {
      server = createServer((req, res) => {
        if (req.method !== "GET" || !req.url?.startsWith("/auth/callback?")) {
          res.writeHead(404).end("Not found"); return;
        }
        const parsed = new URL(req.url, "http://127.0.0.1");
        if (parsed.searchParams.get("state") !== state) {
          res.writeHead(400).end("Invalid state"); return;
        }
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" })
          .end("ChatGPT sign-in completed. You may return to XRift Studio.");
        resolveCallback(req.url);
      });
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        try { openBrowser(urlFactory("http://127.0.0.1:" + port + "/auth/callback")); }
        catch (e) { reject(e); }
      });
      timer = setTimeout(() => reject(new Error("Sign-in timed out")), timeout);
    });
    return await callback;
  } finally {
    clearTimeout(timer);
    if (server) await new Promise(done => server.close(done));
  }
}

export async function verifyIdentity(jwt, { clientId, nonce, jwks, now = Date.now() }) {
  const parts = typeof jwt === "string" ? jwt.split(".") : [];
  if (parts.length !== 3) error("Invalid ID token");
  let header, claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch { error("Invalid ID token"); }
  if (header.alg !== "RS256" || !header.kid ||
      claims.iss !== AUTH || claims.aud !== clientId || claims.nonce !== nonce ||
      typeof claims.sub !== "string" || !claims.sub || !Number.isFinite(claims.exp) ||
      claims.exp * 1000 <= now || (Number.isFinite(claims.iat) && claims.iat * 1000 > now + 120000)) {
    error("Invalid ID token claims");
  }
  const trusted = jwks.keys?.find(k => k.kid === header.kid && k.kty === "RSA" && (!k.use || k.use === "sig"));
  if (!trusted) error("Untrusted ID token signing key");
  const key = createPublicKey({ key: trusted, format: "jwk" });
  const ok = verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), key, Buffer.from(parts[2], "base64url"));
  if (!ok) error("ID token signature verification failed");
  return { subject: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}

async function jwks() {
  const metadata = await jsonFetch(AUTH + "/.well-known/openid-configuration");
  if (metadata.issuer !== AUTH) error("Unexpected identity issuer");
  const url = new URL(metadata.jwks_uri);
  if (url.protocol !== "https:" || url.hostname !== "auth.openai.com") error("Untrusted keys endpoint");
  return jsonFetch(url.toString());
}

async function exchange(params) {
  return jsonFetch(AUTH + "/api/accounts/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString()
  });
}

function updated(account, token) {
  if (token.token_type?.toLowerCase() !== "bearer" || typeof token.access_token !== "string") {
    error("Invalid token exchange");
  }
  return {
    ...account, accessToken: token.access_token,
    refreshToken: token.refresh_token || account.refreshToken,
    scopes: typeof token.scope === "string" ? token.scope.split(/\s+/).filter(Boolean) : account.scopes ?? [],
    expiresAt: Date.now() + Math.max(0, Number(token.expires_in) || 0) * 1000
  };
}

const summary = a => ({ key: a.key, email: a.email, subject: a.subject, planUsageEnabled: checkPermission(a.scopes) });

export async function login({ key } = {}) {
  const store = await readStore();
  const previous = key ? store.accounts.find(a => a.key === key) : undefined;
  if (key && !previous) error("Account not found");
  await saveStore(store); // Persist unique per-install host ID before requesting OAuth.
  const state = tokenString(), nonce = tokenString(), verifier = tokenString();
  let redirectUri;
  const callback = await receiveAuthorization({
    state,
    urlFactory: uri => {
      redirectUri = uri;
      return buildAuthorizeUrl({
        hostId: store.hostId, state, nonce, verifier,
        redirectUri: uri, clientId: previous?.clientId, idToken: previous?.idToken
      });
    }
  });
  const { code, clientId } = parseCallback(callback, state, previous?.clientId);
  const token = await exchange({
    grant_type: "authorization_code", code, client_id: clientId,
    code_verifier: verifier, redirect_uri: redirectUri, resource: API
  });
  const verified = await verifyIdentity(token.id_token, { clientId, nonce, jwks: await jwks() });
  if (previous && (previous.subject !== verified.subject || previous.clientId !== clientId)) {
    error("Authenticated account differs from selected account");
  }
  const accountKey = clientId + ":" + verified.subject;
  const account = {
    ...updated({ key: accountKey, subject: verified.subject, clientId, email: verified.email }, token),
    idToken: token.id_token
  };
  const index = store.accounts.findIndex(a => a.key === accountKey);
  if (index === -1) store.accounts.push(account); else store.accounts[index] = account;
  store.active = accountKey;
  await saveStore(store);
  return summary(account);
}

export async function status() {
  const store = await readStore();
  return { active: store.active, accounts: store.accounts.map(summary) };
}

export async function logout({ key } = {}) {
  const store = await readStore();
  store.accounts = store.accounts.filter(a => a.key !== (key || store.active));
  if (!store.accounts.some(a => a.key === store.active)) store.active = store.accounts[0]?.key ?? null;
  await saveStore(store);
  return status();
}

export async function select({ key }) {
  const store = await readStore();
  if (!store.accounts.some(a => a.key === key)) error("Account not found");
  store.active = key;
  await saveStore(store);
  return status();
}

async function accessToken() {
  const store = await readStore();
  const index = store.accounts.findIndex(a => a.key === store.active);
  if (index < 0) error("Sign in with ChatGPT first");
  const account = store.accounts[index];
  if (!checkPermission(account.scopes)) error("ChatGPT plan usage was not granted");
  if (Date.now() + 60000 < account.expiresAt) return account.accessToken;
  if (!account.refreshToken) error("Reconnect ChatGPT to renew permission");
  const next = await exchange({
    grant_type: "refresh_token", client_id: account.clientId,
    refresh_token: account.refreshToken, resource: API
  });
  const refreshed = updated(account, next);
  if (!checkPermission(refreshed.scopes)) error("ChatGPT plan usage has been revoked");
  store.accounts[index] = refreshed;
  await saveStore(store);
  return refreshed.accessToken;
}

export async function models() {
  const token = await accessToken();
  const result = await jsonFetch(API + "/models", { headers: { Authorization: "Bearer " + token } });
  return (result.models ?? []).filter(m => m.visibility === "list")
    .map(m => ({ slug: m.slug, displayName: m.display_name }));
}

export function joinInferenceEvents(events) {
  let text = "", complete = false;
  for (const event of events) {
    if (event.type === "response.output_text.delta") text += event.delta || "";
    if (event.type === "response.failed" || event.type === "response.incomplete") error("Model inference failed or incomplete");
    if (event.type === "response.completed") complete = true;
  }
  if (!complete) error("Inference stream ended before completion");
  return text;
}

async function* readEvents(reader) {
  const decoder = new TextDecoder();
  let data = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      data += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
      let pos;
      while ((pos = data.indexOf("\n\n")) >= 0) {
        const block = data.slice(0, pos);
        data = data.slice(pos + 2);
        const body = block.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
        if (!body || body === "[DONE]") continue;
        let event;
        try { event = JSON.parse(body); } catch { error("Malformed model event"); }
        yield event;
      }
    }
  } finally { reader.releaseLock(); }
}

export async function infer({ model, input }) {
  if (typeof model !== "string" || !model || typeof input !== "string" || !input ||
      input.length > 50000) error("Provide valid model and text input (max 50000 characters)");
  const available = await models();
  if (!available.some(m => m.slug === model)) error("Model not available to account");
  const token = await accessToken();
  const res = await fetch(API + "/responses", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, input: [{ role: "user", content: input }],
      store: false, stream: true
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!res.ok || !res.body) error("Inference returned HTTP " + res.status);
  const events = [];
  for await (const event of readEvents(res.body.getReader())) {
    events.push(event);
    if (["response.failed","response.incomplete","response.completed"].includes(event.type)) break;
  }
  return { text: joinInferenceEvents(events), model };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const actions = { login, status, logout, select, models, infer };
  const action = process.argv[2];
  (async () => {
    if (!Object.hasOwn(actions, action)) error("Unknown command");
    let input = {};
    if (!process.stdin.isTTY) {
      let raw = "";
      for await (const chunk of process.stdin) {
        raw += chunk;
        if (raw.length > 100000) error("Input too large");
      }
      if (raw.trim()) input = JSON.parse(raw);
    }
    return actions[action](input);
  })().then(result => {
    process.stdout.write(JSON.stringify({ ok: true, result }) + "\n");
  }).catch(e => {
    process.stdout.write(JSON.stringify({ ok: false, error: e.message || "Unexpected error" }) + "\n");
    process.exitCode = 1;
  });
}
