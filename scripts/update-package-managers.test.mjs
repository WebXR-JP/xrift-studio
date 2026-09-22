import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  fetchLatestRelease,
  readPackageRelease,
  renderPackageManifests,
  writePackageManifests,
} from "./update-package-managers.mjs";

const checkedRelease = JSON.parse(readFileSync(new URL("../packaging/release.json", import.meta.url), "utf8"));
const release = () => structuredClone(checkedRelease);
const root = new URL("../", import.meta.url);

function withVersion(input, version) {
  return JSON.parse(JSON.stringify(input).replaceAll(input.tag_name.slice(1), version));
}

function temporary(t) {
  const path = mkdtempSync(join(tmpdir(), "xrift-packages-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

test("checked-in definitions reproduce the release snapshot, without a network request", () => {
  for (const [path, content] of Object.entries(renderPackageManifests(checkedRelease))) {
    assert.equal(readFileSync(new URL(path, root), "utf8").replace(/\r\n/g, "\n"), content, path);
  }
});

test("release metadata is reduced to installer information, ignoring irrelevant assets", () => {
  const input = release();
  input.body = "Release notes must not be executed or inserted into package definitions";
  input.assets.push({ name: "latest.json", digest: null });
  assert.deepEqual(readPackageRelease(input), readPackageRelease(checkedRelease));
});

for (const field of ["draft", "prerelease"]) {
  test(`rejects ${field} releases`, () => {
    const input = release();
    input[field] = true;
    assert.throws(() => renderPackageManifests(input), /published stable release/);
  });
}

test("rejects unpublished releases and non-stable or unsafe tags", () => {
  for (const date of [null, "not a date"]) {
    assert.throws(() => renderPackageManifests({ ...release(), published_at: date }), /published stable release/);
  }
  for (const tag of ["v1.2.3-beta.1", "v1.2.3+build", "v01.2.3", "1.2.3", "v1.2.3\n", "../main", 'v1.2.3";system("cmd")']) {
    assert.throws(() => renderPackageManifests({ ...release(), tag_name: tag }), /stable version/);
  }
});

test("rejects releases and installers outside the expected repository and version", () => {
  assert.throws(() => renderPackageManifests({ ...release(), html_url: "https://example.com/release" }), /belong to/);
  for (const url of [
    "http://github.com/WebXR-JP/xrift-studio/releases/download/file.dmg",
    "https://example.com/file.dmg",
    checkedRelease.assets[0].browser_download_url.replace("WebXR-JP", "someone-else"),
    checkedRelease.assets[0].browser_download_url.replace(checkedRelease.tag_name, "v999.0.0"),
    `${checkedRelease.assets[0].browser_download_url}?alternate=true`,
  ]) {
    const input = release();
    input.assets[0].browser_download_url = url;
    assert.throws(() => renderPackageManifests(input), /Unexpected release download URL/);
  }
});

test("requires exactly one complete installer for both supported platforms", () => {
  for (let index = 0; index < checkedRelease.assets.length; index++) {
    const missing = release();
    missing.assets.splice(index, 1);
    assert.throws(() => renderPackageManifests(missing), /exactly one release asset/);
    const duplicate = release();
    duplicate.assets.push(duplicate.assets[index]);
    assert.throws(() => renderPackageManifests(duplicate), /exactly one release asset/);
    const incomplete = release();
    incomplete.assets[index].state = "new";
    assert.throws(() => renderPackageManifests(incomplete), /not completely uploaded/);
    for (const size of [0, -1, null, 0.5]) {
      const empty = release();
      empty.assets[index].size = size;
      assert.throws(() => renderPackageManifests(empty), /not completely uploaded/);
    }
  }
});

test("requires valid SHA-256 digests and normalizes their case", () => {
  for (const digest of [null, "", "sha256:no_check", `sha512:${"a".repeat(64)}`, `sha256:${"a".repeat(63)}`]) {
    const input = release();
    input.assets[0].digest = digest;
    assert.throws(() => renderPackageManifests(input), /missing its SHA-256/);
  }
  const uppercase = release();
  uppercase.assets[0].digest = `sha256:${uppercase.assets[0].digest.slice(7).toUpperCase()}`;
  assert.deepEqual(readPackageRelease(uppercase), readPackageRelease(checkedRelease));
});

test("invalid new input leaves every existing definition untouched", (t) => {
  const directory = temporary(t);
  const before = renderPackageManifests(checkedRelease);
  writePackageManifests(checkedRelease, directory);
  const broken = withVersion(release(), "100.0.0");
  broken.assets[1].digest = null;
  assert.throws(() => writePackageManifests(broken, directory), /missing its SHA-256/);
  for (const [path, content] of Object.entries(before)) {
    assert.equal(readFileSync(join(directory, path), "utf8"), content);
  }
});

test("repeated generation is idempotent and check detects missing or modified files", (t) => {
  const directory = temporary(t);
  writePackageManifests(checkedRelease, directory);
  writePackageManifests(checkedRelease, directory);
  writePackageManifests(checkedRelease, directory, { check: true });
  const cask = join(directory, "Casks/xrift-studio.rb");
  writeFileSync(cask, "changed\n");
  assert.throws(() => writePackageManifests(checkedRelease, directory, { check: true }), /out of date/);
  assert.equal(readFileSync(cask, "utf8"), "changed\n");
  rmSync(cask);
  assert.throws(() => writePackageManifests(checkedRelease, directory, { check: true }), /ENOENT/);
});

test("numeric version ordering prevents stale releases from downgrading the cask", (t) => {
  const directory = temporary(t);
  writePackageManifests(withVersion(release(), "0.9.9"), directory);
  writePackageManifests(withVersion(release(), "0.10.0"), directory);
  assert.throws(() => writePackageManifests(withVersion(release(), "0.9.10"), directory), /older release/);
  writePackageManifests(withVersion(release(), "1.0.0"), directory);
  assert.throws(() => writePackageManifests(withVersion(release(), "0.99.999"), directory), /older release/);
});

test("replacing installer bytes for the same version requires a new release", (t) => {
  const directory = temporary(t);
  writePackageManifests(checkedRelease, directory);
  const changed = release();
  changed.assets[0].digest = `sha256:${"a".repeat(64)}`;
  assert.throws(() => writePackageManifests(changed, directory), /assets changed/);
  writePackageManifests(checkedRelease, directory, { check: true });
});

test("fetches the stable latest endpoint, limits time and refuses redirects", async () => {
  const input = release();
  const actual = await fetchLatestRelease({
    token: "fixture-token",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.github.com/repos/WebXR-JP/xrift-studio/releases/latest");
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.headers.Authorization, "Bearer fixture-token");
      return { ok: true, json: async () => input };
    },
  });
  assert.equal(actual, input);
  await assert.rejects(fetchLatestRelease({
    fetchImpl: async () => ({ ok: false, status: 403 }),
  }), /HTTP 403/);
});
