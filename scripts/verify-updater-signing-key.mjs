import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const probePath = join(process.cwd(), ".updater-signing-key-probe");
const signaturePath = `${probePath}.sig`;

function keyId(base64Key) {
  const text = Buffer.from(base64Key, "base64").toString("utf8");
  const encodedKey = text.trim().split(/\r?\n/)[1];
  const data = Buffer.from(encodedKey, "base64");
  return data.subarray(2, 10).toString("hex").toUpperCase();
}

function signatureKeyId(signature) {
  const encodedSignature = signature.trim().split(/\r?\n/)[1];
  const data = Buffer.from(encodedSignature, "base64");
  return data.subarray(2, 10).toString("hex").toUpperCase();
}

try {
  writeFileSync(probePath, "XRift Studio updater signing-key check\n");

  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(pnpm, ["tauri", "signer", "sign", probePath], {
    encoding: "utf8",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`Unable to sign the updater-key probe: ${result.stderr || result.stdout}`);
  }

  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const expectedKeyId = keyId(config.plugins.updater.pubkey);
  const actualKeyId = signatureKeyId(readFileSync(signaturePath, "utf8"));

  if (actualKeyId !== expectedKeyId) {
    throw new Error(
      `Updater signing key mismatch: expected ${expectedKeyId}, received ${actualKeyId}.`,
    );
  }

  console.log(`Updater signing key verified: ${actualKeyId}`);
} finally {
  rmSync(probePath, { force: true });
  rmSync(signaturePath, { force: true });
}
