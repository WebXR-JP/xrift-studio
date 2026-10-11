import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { buildAuthorizeUrl, parseCallback, verifyIdentity, joinInferenceEvents } from "./siwc-local.mjs";

const config = {
  hostId: "urn:uuid:11223344-1234-4123-9123-123456789abc",
  state: "state-check",
  nonce: "nonce-check",
  verifier: "verifier-check",
  redirectUri: "http://127.0.0.1:3333/auth/callback"
};

test("initial authorization uses a dynamic client with state, nonce and PKCE", () => {
  const url = new URL(buildAuthorizeUrl(config));
  assert.equal(url.hostname, "auth.openai.com");
  assert.equal(url.searchParams.get("client_id"), "dynamic_agent_client");
  assert.equal(url.searchParams.get("state"), "state-check");
  assert.equal(url.searchParams.get("nonce"), "nonce-check");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.ok(url.searchParams.get("scope").includes("chatgpt.tokens.use.direct"));
});

test("subsequent authorization reuses issued client id", () => {
  const url = new URL(buildAuthorizeUrl({ ...config, clientId: "client-real", idToken: "old-token" }));
  assert.equal(url.searchParams.get("client_id"), "client-real");
  assert.equal(url.searchParams.get("id_token_hint"), "old-token");
  assert.equal(url.searchParams.get("agent_name_hint"), null);
});

test("callback rejects state/client mismatch or missing authorization code", () => {
  const url = "/auth/callback?state=state-check&client_id=client-real&code=abc";
  assert.deepEqual(parseCallback(url, "state-check", null), { code: "abc", clientId: "client-real" });
  assert.throws(() => parseCallback(url, "wrong", null), /Invalid/);
  assert.throws(() => parseCallback(url, "state-check", "another-client"), /mismatch/);
  assert.throws(() => parseCallback("/auth/callback?state=state-check&client_id=client-real", "state-check", null), /Missing/);
});

test("ID token must validate signature, issuer, audience, nonce, and expiry", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const now = Date.now();
  const encode = v => Buffer.from(JSON.stringify(v)).toString("base64url");
  const jwt = claims => {
    const head = encode({ alg: "RS256", kid: "trusted" });
    const body = encode(claims);
    const signature = sign("RSA-SHA256", Buffer.from(head + "." + body), privateKey).toString("base64url");
    return head + "." + body + "." + signature;
  };
  const claims = { iss: "https://auth.openai.com", aud: "client-real", nonce: "nonce-check", sub: "user-1", exp: Math.floor(now / 1000) + 180, email: "person@example.invalid" };
  const keys = { keys: [{ ...jwk, kid: "trusted", use: "sig" }] };
  assert.equal((await verifyIdentity(jwt(claims), { clientId: "client-real", nonce: "nonce-check", jwks: keys, now })).subject, "user-1");
  await assert.rejects(verifyIdentity(jwt({ ...claims, aud: "other" }), { clientId: "client-real", nonce: "nonce-check", jwks: keys, now }), /claims/);
  await assert.rejects(verifyIdentity(jwt({ ...claims, exp: 1 }), { clientId: "client-real", nonce: "nonce-check", jwks: keys, now }), /claims/);
  await assert.rejects(verifyIdentity(jwt(claims).replace(/.$/, "A"), { clientId: "client-real", nonce: "nonce-check", jwks: keys, now }), /signature/);
});

test("SSE assembly requires completed and refuses failed/incomplete responses", () => {
  const events = [
    { type: "response.output_text.delta", delta: "Good" },
    { type: "response.output_text.delta", delta: " result" },
    { type: "response.completed" }
  ];
  assert.equal(joinInferenceEvents(events), "Good result");
  assert.throws(() => joinInferenceEvents(events.slice(0, 2)), /before completion/);
  assert.throws(() => joinInferenceEvents([{ type: "response.failed" }]), /failed/);
  assert.throws(() => joinInferenceEvents([{ type: "response.incomplete" }]), /incomplete/);
});
