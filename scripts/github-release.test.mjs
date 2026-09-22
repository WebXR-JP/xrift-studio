import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareDraftRelease, finalizeDraftRelease } from "./github-release.mjs";

const commit = "a".repeat(40);
const tag = "v1.2.3";
const notes = "# XRift Studio v1.2.3\n\n- 公開の手順を修正しました。";
const inputs = { owner: "example", repo: "studio", tag, commit, notes };
const suffixes = [
  "windows_x64_release.msi",
  "windows_x64_release-setup.exe",
  "darwin_universal_release.app.tar.gz",
  "darwin_universal_release.dmg",
  "linux_amd64_release.AppImage",
  "linux_amd64_release.deb",
  "linux_x86_64_release.rpm",
];

function makeAssets(version = "1.2.3", productName = "XRift.Studio") {
  const assets = [];
  for (const suffix of suffixes) {
    const name = `${productName}_${version}_${suffix}`;
    for (const filename of suffix.endsWith(".dmg") ? [name] : [name, `${name}.sig`]) {
      assets.push({
        id: assets.length + 100,
        name: filename,
        state: "uploaded",
        size: filename.endsWith(".sig") ? 420 : 10_000,
        browser_download_url: `https://github.com/example/studio/releases/download/untagged-abc/${filename}`,
      });
    }
  }
  return assets;
}

// No method in this fake contacts GitHub. Read and write calls are recorded so
// failure-path assertions also verify that publication was never attempted.
function fakeGithub() {
  const state = {
    release: { id: 7, tag_name: tag, target_commitish: commit, draft: true, immutable: false },
    releases: [],
    assets: makeAssets(),
    reference: null,
    annotatedTags: {},
  };
  const calls = [];
  const hooks = {};
  const writes = [];
  const mutating = new Set(["createRelease", "deleteReleaseAsset", "uploadReleaseAsset", "updateRelease"]);
  const method = (name, implementation) => async (args) => {
    calls.push({ name, args });
    if (mutating.has(name)) writes.push({ name, args });
    return { data: await (hooks[name] ?? implementation)(args) };
  };
  const github = {
    rest: {
      repos: {
        listReleases: method("listReleases", ({ page, per_page }) => state.releases.slice((page - 1) * per_page, page * per_page)),
        createRelease: method("createRelease", (args) => ({ ...state.release, ...args })),
        getRelease: method("getRelease", () => ({ ...state.release })),
        listReleaseAssets: method("listReleaseAssets", ({ page, per_page }) => state.assets.slice((page - 1) * per_page, page * per_page)),
        getReleaseAsset: method("getReleaseAsset", ({ asset_id }) => Buffer.from(`signature-for-${asset_id}\n`)),
        deleteReleaseAsset: method("deleteReleaseAsset", () => undefined),
        uploadReleaseAsset: method("uploadReleaseAsset", ({ name, data }) => ({ id: 900, name, state: "uploaded", size: data.length })),
        updateRelease: method("updateRelease", (args) => ({ ...state.release, ...args })),
      },
      git: {
        getRef: method("getRef", () => {
          if (!state.reference) throw Object.assign(new Error("Not Found"), { status: 404 });
          return state.reference;
        }),
        getTag: method("getTag", ({ tag_sha }) => state.annotatedTags[tag_sha]),
      },
    },
    async paginate(endpoint, args) {
      const result = [];
      for (let page = 1; ; page++) {
        const { data } = await endpoint({ ...args, page });
        result.push(...data);
        if (data.length < args.per_page) return result;
      }
    },
  };
  return { github, state, calls, hooks, writes };
}

const prepare = (fake, overrides = {}) => prepareDraftRelease({ ...inputs, github: fake.github, ...overrides });
const finalize = (fake, overrides = {}) => finalizeDraftRelease({
  ...inputs,
  github: fake.github,
  releaseId: 7,
  version: "1.2.3",
  ...overrides,
});

test("prepare creates a draft pinned to the source commit, including prerelease and notes", async () => {
  const fake = fakeGithub();
  const release = await prepare(fake, { prerelease: true });
  assert.equal(release.draft, true);
  assert.deepEqual(fake.writes, [{ name: "createRelease", args: {
    owner: "example", repo: "studio", tag_name: tag, target_commitish: commit,
    name: "XRift Studio v1.2.3", body: notes, draft: true, prerelease: true,
  } }]);
});

test("prepare finds a matching draft beyond the first page and retries without writes", async () => {
  const fake = fakeGithub();
  fake.state.releases = [
    ...Array.from({ length: 100 }, (_, id) => ({ id, tag_name: `v0.0.${id}`, draft: false })),
    fake.state.release,
  ];
  fake.state.reference = { object: { type: "commit", sha: commit } };
  assert.equal((await prepare(fake)).id, 7);
  assert.equal(fake.calls.filter((call) => call.name === "listReleases").length, 2);
  assert.deepEqual(fake.writes, []);
});

for (const releaseState of [{ draft: false }, { immutable: true }]) {
  test(`prepare refuses an existing ${JSON.stringify(releaseState)} release`, async () => {
    const fake = fakeGithub();
    fake.state.releases = [{ ...fake.state.release, ...releaseState }];
    await assert.rejects(prepare(fake), /new release tag/);
    assert.deepEqual(fake.writes, []);
  });
}

test("prepare refuses to mix a draft built from another commit", async () => {
  const fake = fakeGithub();
  fake.state.releases = [{ ...fake.state.release, target_commitish: "b".repeat(40) }];
  await assert.rejects(prepare(fake), /Retry the original workflow run/);
  assert.deepEqual(fake.writes, []);
});

for (const status of [401, 403, 404, 500]) {
  test(`prepare propagates a releases-list ${status} without creating another release`, async () => {
    const fake = fakeGithub();
    const error = Object.assign(new Error("API error"), { status });
    fake.hooks.listReleases = () => { throw error; };
    await assert.rejects(prepare(fake), (actual) => actual === error);
    assert.deepEqual(fake.writes, []);
  });
}

for (const status of [401, 403, 500]) {
  test(`prepare propagates a tag-read ${status}; only 404 permits a new tag`, async () => {
    const fake = fakeGithub();
    const error = Object.assign(new Error("API error"), { status });
    fake.hooks.getRef = () => { throw error; };
    await assert.rejects(prepare(fake), (actual) => actual === error);
    assert.deepEqual(fake.writes, []);
  });
}

test("prepare verifies annotated tags and refuses a tag pointing at another commit", async () => {
  const fake = fakeGithub();
  fake.state.reference = { object: { type: "tag", sha: "annotated-tag" } };
  fake.state.annotatedTags["annotated-tag"] = { object: { type: "commit", sha: "b".repeat(40) } };
  await assert.rejects(prepare(fake), /does not point to source commit/);
  assert.deepEqual(fake.writes, []);
  fake.state.annotatedTags["annotated-tag"].object.sha = commit;
  assert.equal((await prepare(fake)).draft, true);
});

test("finalize assembles all 11 updater keys and publishes only after uploading one complete manifest", async () => {
  const fake = fakeGithub();
  // The required bundles are on a second page, unlike release.assets snapshots.
  fake.state.assets.unshift(...Array.from({ length: 100 }, (_, id) => ({ id: id + 1000, name: `unrelated-${id}` })));
  const result = await finalize(fake, { prerelease: true });
  assert.equal(fake.calls.filter((call) => call.name === "listReleaseAssets").length, 2);
  assert.deepEqual(fake.writes.map((call) => call.name), ["uploadReleaseAsset", "updateRelease"]);
  const upload = fake.writes[0].args;
  assert.equal(upload.headers["content-type"], "application/json");
  assert.equal(upload.headers["content-length"], upload.data.length);
  const manifest = JSON.parse(upload.data.toString("utf8"));
  assert.deepEqual(manifest, result.manifest);
  assert.equal(manifest.version, "1.2.3");
  assert.equal(manifest.notes, notes);
  assert.equal(new Date(manifest.pub_date).toISOString(), manifest.pub_date);
  const expected = {
    "windows-x86_64": "windows_x64_release.msi",
    "windows-x86_64-msi": "windows_x64_release.msi",
    "windows-x86_64-nsis": "windows_x64_release-setup.exe",
    "darwin-aarch64": "darwin_universal_release.app.tar.gz",
    "darwin-x86_64": "darwin_universal_release.app.tar.gz",
    "darwin-aarch64-app": "darwin_universal_release.app.tar.gz",
    "darwin-x86_64-app": "darwin_universal_release.app.tar.gz",
    "linux-x86_64": "linux_amd64_release.AppImage",
    "linux-x86_64-appimage": "linux_amd64_release.AppImage",
    "linux-x86_64-deb": "linux_amd64_release.deb",
    "linux-x86_64-rpm": "linux_x86_64_release.rpm",
  };
  assert.deepEqual(Object.keys(manifest.platforms).sort(), Object.keys(expected).sort());
  for (const [platform, suffix] of Object.entries(expected)) {
    const name = `XRift.Studio_1.2.3_${suffix}`;
    const signatureAsset = fake.state.assets.find((asset) => asset.name === `${name}.sig`);
    assert.deepEqual(manifest.platforms[platform], {
      url: `https://github.com/example/studio/releases/download/v1.2.3/${name}`,
      signature: `signature-for-${signatureAsset.id}`,
    });
  }
  const signatureReads = fake.calls.filter((call) => call.name === "getReleaseAsset");
  assert.equal(signatureReads.length, 6);
  for (const { args } of signatureReads) assert.equal(args.headers.accept, "application/octet-stream");
  assert.equal(result.release.draft, false);
  assert.equal(result.release.prerelease, true);
  assert.equal(fake.writes[1].args.body, notes);
  assert.equal(fake.writes[1].args.make_latest, "false");
});

test("finalize preserves draft mode, custom product names, and encoded version tags", async () => {
  const fake = fakeGithub();
  const version = "1.2.3+build.1";
  const nextTag = `v${version}`;
  fake.state.release.tag_name = nextTag;
  fake.state.assets = makeAssets(version, "Custom.Studio");
  const { release, manifest } = await finalize(fake, {
    version, tag: nextTag, productName: "Custom Studio", draft: true, prerelease: true,
  });
  assert.equal(release.draft, true);
  assert.equal(release.prerelease, true);
  assert.equal(release.make_latest, "false");
  assert.equal(release.name, `Custom Studio ${nextTag}`);
  assert.equal(manifest.platforms["windows-x86_64"].url,
    "https://github.com/example/studio/releases/download/v1.2.3%2Bbuild.1/Custom.Studio_1.2.3%2Bbuild.1_windows_x64_release.msi");
});

for (const releaseState of [
  { draft: false },
  { immutable: true },
  { tag_name: "v1.2.2" },
  { target_commitish: "b".repeat(40) },
]) {
  test(`finalize refuses incompatible release ${JSON.stringify(releaseState)} without writes`, async () => {
    const fake = fakeGithub();
    Object.assign(fake.state.release, releaseState);
    await assert.rejects(finalize(fake));
    assert.deepEqual(fake.writes, []);
    assert.equal(fake.calls.length, 1);
  });
}

test("finalize refuses every missing required bundle or signature, including the DMG", async () => {
  for (const missing of makeAssets()) {
    const fake = fakeGithub();
    fake.state.assets = fake.state.assets.filter((asset) => asset.name !== missing.name);
    await assert.rejects(finalize(fake), /Expected exactly one release asset/);
    assert.deepEqual(fake.writes, [], missing.name);
    assert.equal(fake.calls.some((call) => call.name === "getReleaseAsset"), false);
  }
});

test("finalize rejects empty assets and unfinished uploads", async () => {
  for (const invalid of [{ size: 0 }, { state: "starter" }]) {
    const fake = fakeGithub();
    Object.assign(fake.state.assets[0], invalid);
    await assert.rejects(finalize(fake), /empty or its upload has not completed/);
    assert.deepEqual(fake.writes, []);
  }
});

test("finalize rejects empty signatures and API metadata instead of raw signature contents", async () => {
  for (const data of [" \n\t", Buffer.alloc(0), { name: "installer.sig" }]) {
    const fake = fakeGithub();
    fake.hooks.getReleaseAsset = () => data;
    await assert.rejects(finalize(fake), /empty|metadata/);
    assert.deepEqual(fake.writes, []);
  }
});

test("signature download errors leave an existing draft manifest untouched", async () => {
  const fake = fakeGithub();
  fake.state.assets.push({ id: 999, name: "latest.json" });
  const error = Object.assign(new Error("Forbidden"), { status: 403 });
  fake.hooks.getReleaseAsset = () => { throw error; };
  await assert.rejects(finalize(fake), (actual) => actual === error);
  assert.deepEqual(fake.writes, []);
});

test("finalize replaces a stale draft manifest after validation and retains all bundles", async () => {
  const fake = fakeGithub();
  fake.state.assets.push({ id: 999, name: "latest.json", state: "starter", size: 0 });
  await finalize(fake);
  assert.deepEqual(fake.writes.map((call) => call.name), ["deleteReleaseAsset", "uploadReleaseAsset", "updateRelease"]);
  assert.deepEqual(fake.writes[0].args, { owner: "example", repo: "studio", asset_id: 999 });
  assert.equal(fake.writes[2].args.make_latest, "true");
  const firstWrite = fake.calls.findIndex((call) => call.name === "deleteReleaseAsset");
  assert.equal(fake.calls.slice(firstWrite).some((call) => call.name === "getReleaseAsset"), false);
});

test("a failed or incomplete manifest upload never publishes the release", async () => {
  for (const outcome of ["error", "starter", "short"]) {
    const fake = fakeGithub();
    fake.hooks.uploadReleaseAsset = ({ data }) => {
      if (outcome === "error") throw new Error("Upload failed");
      return { name: "latest.json", state: outcome === "starter" ? "starter" : "uploaded", size: data.length - 1 };
    };
    await assert.rejects(finalize(fake), /Upload failed|upload did not complete/);
    assert.deepEqual(fake.writes.map((call) => call.name), ["uploadReleaseAsset"]);
  }
});

test("finalize rechecks draft state and tag target before its first mutation", async () => {
  for (const change of ["publication", "tag"]) {
    const fake = fakeGithub();
    let reads = 0;
    fake.hooks.getRelease = () => {
      reads++;
      if (reads === 2 && change === "publication") return { ...fake.state.release, draft: false, immutable: true };
      return fake.state.release;
    };
    if (change === "tag") fake.state.reference = { object: { type: "commit", sha: "b".repeat(40) } };
    await assert.rejects(finalize(fake), /new release tag/);
    assert.deepEqual(fake.writes, []);
  }
});

test("finalize validates tag/version agreement before requesting the release", async () => {
  const fake = fakeGithub();
  await assert.rejects(finalize(fake, { version: "1.2.4" }), /must match app version/);
  assert.deepEqual(fake.calls, []);
});
