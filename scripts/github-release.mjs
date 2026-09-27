import { Buffer } from "node:buffer";

function requireReleaseInputs({ tag, commit, notes }) {
  if (!tag || !commit || typeof notes !== "string" || !notes.trim()) {
    throw new Error("Release tag, source commit, and release notes are required.");
  }
}

function requireMatchingDraft(release, { tag, commit }) {
  if (release.tag_name !== tag) {
    throw new Error(`Release ${release.id} belongs to ${release.tag_name}, not ${tag}.`);
  }
  if (!release.draft || release.immutable) {
    throw new Error(
      `Release ${tag} is already published or immutable. Bump the app version and use a new release tag.`,
    );
  }
  if (release.target_commitish !== commit) {
    throw new Error(
      `Draft ${tag} targets ${release.target_commitish}, not source commit ${commit}. ` +
        "Retry the original workflow run, or bump the app version and use a new release tag.",
    );
  }
}

async function requireMatchingTag({ github, owner, repo, tag, commit }) {
  let reference;
  try {
    ({ data: reference } = await github.rest.git.getRef({ owner, repo, ref: `tags/${tag}` }));
  } catch (error) {
    // A new draft has no tag yet. Authentication and server errors must stop it.
    if (error.status === 404) return;
    throw error;
  }
  let object = reference.object;
  const visited = new Set();
  while (object.type === "tag" && !visited.has(object.sha)) {
    visited.add(object.sha);
    const { data: annotated } = await github.rest.git.getTag({ owner, repo, tag_sha: object.sha });
    object = annotated.object;
  }
  if (object.type !== "commit" || object.sha !== commit) {
    throw new Error(
      `Tag ${tag} does not point to source commit ${commit}. Bump the app version and use a new release tag.`,
    );
  }
}

/** Create one mutable release before the build matrix starts, or reuse its draft on retry. */
export async function prepareDraftRelease({
  github,
  owner,
  repo,
  tag,
  commit,
  notes,
  prerelease = false,
  productName = "XRift Studio",
}) {
  requireReleaseInputs({ tag, commit, notes });
  // listReleases includes drafts for the authenticated contents:write token.
  // An API error (including 404) must not be mistaken for a missing tag.
  const releases = await github.paginate(github.rest.repos.listReleases, {
    owner,
    repo,
    per_page: 100,
  });
  const matches = releases.filter((release) => release.tag_name === tag);
  if (matches.length > 1) {
    throw new Error(`Multiple releases use ${tag}; resolve the duplicate drafts before retrying.`);
  }
  if (matches.length === 1) {
    requireMatchingDraft(matches[0], { tag, commit });
    await requireMatchingTag({ github, owner, repo, tag, commit });
    return matches[0];
  }
  await requireMatchingTag({ github, owner, repo, tag, commit });
  const { data: release } = await github.rest.repos.createRelease({
    owner,
    repo,
    tag_name: tag,
    target_commitish: commit,
    name: `${productName} ${tag}`,
    body: notes,
    draft: true,
    prerelease,
  });
  requireMatchingDraft(release, { tag, commit });
  return release;
}

// Keep these in sync with release.yml's Windows x64 / macOS universal / Linux x64
// matrix and assetNamePattern. The unqualified Windows key must keep using MSI
// so installed versions keep receiving the same installer type.
function expectedBundles(version, productName) {
  // GitHub turns the spaces in uploaded file names into periods.
  const prefix = `${productName.replaceAll(" ", ".")}_${version}`;
  return [
    { name: `${prefix}_windows_x64_release.msi`, platforms: ["windows-x86_64", "windows-x86_64-msi"] },
    { name: `${prefix}_windows_x64_release-setup.exe`, platforms: ["windows-x86_64-nsis"] },
    {
      name: `${prefix}_darwin_universal_release.app.tar.gz`,
      platforms: ["darwin-aarch64", "darwin-x86_64", "darwin-aarch64-app", "darwin-x86_64-app"],
    },
    { name: `${prefix}_darwin_universal_release.dmg`, platforms: [] },
    { name: `${prefix}_linux_amd64_release.AppImage`, platforms: ["linux-x86_64", "linux-x86_64-appimage"] },
    { name: `${prefix}_linux_amd64_release.deb`, platforms: ["linux-x86_64-deb"] },
    { name: `${prefix}_linux_x86_64_release.rpm`, platforms: ["linux-x86_64-rpm"] },
  ];
}

function requireUploadedAsset(assets, name) {
  const matches = assets.filter((asset) => asset.name === name);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one release asset ${name}; found ${matches.length}.`);
  }
  const asset = matches[0];
  if (!Number.isSafeInteger(asset.id) || asset.id <= 0 || asset.state !== "uploaded" || !(asset.size > 0)) {
    throw new Error(`Release asset ${name} is empty or its upload has not completed.`);
  }
  return asset;
}

function publishedDownloadUrl(asset, tag) {
  const url = new URL(asset.browser_download_url);
  const marker = "/releases/download/";
  const index = url.pathname.indexOf(marker);
  if (url.protocol !== "https:" || index < 0) {
    throw new Error(`Release asset ${asset.name} has an invalid download URL.`);
  }
  // Draft API responses may contain /download/untagged-.../. The updater needs
  // the URL that will exist after publication, including the actual asset name.
  url.pathname = `${url.pathname.slice(0, index + marker.length)}${encodeURIComponent(tag)}/${encodeURIComponent(asset.name)}`;
  return url.href;
}

function signatureText(data, name) {
  let text;
  if (typeof data === "string") {
    text = data;
  } else if (data instanceof ArrayBuffer) {
    text = Buffer.from(data).toString("utf8");
  } else if (ArrayBuffer.isView(data)) {
    text = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  } else {
    throw new Error(`Expected signature contents for ${name}, but the API returned metadata.`);
  }
  if (!text.trim()) {
    throw new Error(`Release signature ${name} is empty.`);
  }
  return text.trim();
}

/** Validate every platform, upload the combined updater manifest, then publish once. */
export async function finalizeDraftRelease({
  github,
  owner,
  repo,
  releaseId,
  tag,
  version,
  commit,
  notes,
  draft = false,
  prerelease = false,
  productName = "XRift Studio",
}) {
  requireReleaseInputs({ tag, commit, notes });
  if (!version || tag !== `v${version}`) {
    throw new Error(`Release tag ${tag} must match app version v${version}.`);
  }
  const release_id = Number(releaseId);
  if (!Number.isSafeInteger(release_id) || release_id <= 0) {
    throw new Error("A valid draft release ID is required.");
  }
  const { data: release } = await github.rest.repos.getRelease({ owner, repo, release_id });
  requireMatchingDraft(release, { tag, commit });
  const assets = await github.paginate(github.rest.repos.listReleaseAssets, {
    owner,
    repo,
    release_id,
    per_page: 100,
  });
  // Complete inventory validation before downloading signatures or changing assets.
  const bundles = expectedBundles(version, productName).map(({ name, platforms }) => {
    const asset = requireUploadedAsset(assets, name);
    const url = publishedDownloadUrl(asset, tag);
    const signature = platforms.length ? requireUploadedAsset(assets, `${name}.sig`) : null;
    return { asset, url, signature, platforms };
  });
  const platforms = {};
  for (const bundle of bundles) {
    if (!bundle.signature) continue;
    // Draft downloads require authentication; public browser_download_url cannot
    // be fetched until publication. Octokit follows the API's download redirect.
    const { data } = await github.rest.repos.getReleaseAsset({
      owner,
      repo,
      asset_id: bundle.signature.id,
      headers: { accept: "application/octet-stream" },
    });
    const signature = signatureText(data, bundle.signature.name);
    for (const platform of bundle.platforms) {
      platforms[platform] = { signature, url: bundle.url };
    }
  }
  const manifest = { version, notes, pub_date: new Date().toISOString(), platforms };
  const data = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  // A manual publication while the files were being checked must also fail
  // before any deletion. The API additionally rejects writes after immutability.
  const { data: current } = await github.rest.repos.getRelease({ owner, repo, release_id });
  requireMatchingDraft(current, { tag, commit });
  await requireMatchingTag({ github, owner, repo, tag, commit });
  for (const asset of assets.filter((asset) => asset.name === "latest.json")) {
    await github.rest.repos.deleteReleaseAsset({ owner, repo, asset_id: asset.id });
  }
  const { data: uploaded } = await github.rest.repos.uploadReleaseAsset({
    owner,
    repo,
    release_id,
    name: "latest.json",
    data,
    headers: { "content-type": "application/json", "content-length": data.length },
  });
  if (uploaded.name !== "latest.json" || uploaded.state !== "uploaded" || uploaded.size !== data.length) {
    throw new Error("latest.json upload did not complete; the release remains a draft.");
  }
  const { data: finalized } = await github.rest.repos.updateRelease({
    owner,
    repo,
    release_id,
    name: `${productName} ${tag}`,
    body: notes,
    draft,
    prerelease,
    make_latest: draft || prerelease ? "false" : "true",
  });
  return { release: finalized, manifest };
}
