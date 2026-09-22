import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { renderWingetManifests } from "./lib/winget-manifest.mjs";

const repository = "WebXR-JP/xrift-studio";
const repositoryUrl = `https://github.com/${repository}`;
const snapshotPath = "packaging/release.json";

// Publish only complete, stable releases. Never silently substitute a different
// architecture, an updater archive, or an unverified download for an installer.
export function readPackageRelease(release) {
  if (!release || release.draft !== false || release.prerelease !== false
    || !release.published_at || !Number.isFinite(Date.parse(release.published_at))) {
    throw new Error("Package managers require a published stable release");
  }
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(release.tag_name)) {
    throw new Error("Release tag must be a stable version such as v0.10.1");
  }
  const version = release.tag_name.slice(1);
  const releaseUrl = `${repositoryUrl}/releases/tag/${release.tag_name}`;
  if (release.html_url !== releaseUrl || !Array.isArray(release.assets)) {
    throw new Error("Release must belong to WebXR-JP/xrift-studio and include assets");
  }
  const assetNames = [
    `XRift.Studio_${version}_darwin_universal_release.dmg`,
    `XRift.Studio_${version}_windows_x64_release-setup.exe`,
  ];
  const assets = assetNames.map((name) => {
    const matches = release.assets.filter((asset) => asset.name === name);
    if (matches.length !== 1) throw new Error(`Expected exactly one release asset: ${name}`);
    const asset = matches[0];
    if (asset.state !== "uploaded" || !Number.isSafeInteger(asset.size) || asset.size <= 0) {
      throw new Error(`Release asset is not completely uploaded: ${name}`);
    }
    if (!/^sha256:[a-fA-F0-9]{64}$/.test(asset.digest)) {
      throw new Error(`Release asset is missing its SHA-256 digest: ${name}`);
    }
    if (asset.browser_download_url !== `${repositoryUrl}/releases/download/${release.tag_name}/${name}`) {
      throw new Error(`Unexpected release download URL: ${name}`);
    }
    return {
      name,
      state: asset.state,
      size: asset.size,
      digest: asset.digest.toLowerCase(),
      browser_download_url: asset.browser_download_url,
    };
  });
  return {
    version,
    snapshot: {
      tag_name: release.tag_name,
      html_url: releaseUrl,
      published_at: release.published_at,
      draft: false,
      prerelease: false,
      assets,
    },
  };
}

export function renderPackageManifests(release) {
  const { version, snapshot } = readPackageRelease(release);
  const [mac, windows] = snapshot.assets;
  return {
    [snapshotPath]: `${JSON.stringify(snapshot, null, 2)}\n`,
    "Casks/xrift-studio.rb": `cask "xrift-studio" do
  version "${version}"
  sha256 "${mac.digest.slice(7)}"

  url "${repositoryUrl}/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
`,
    ...renderWingetManifests({
      version,
      installerUrl: windows.browser_download_url,
      sha256: windows.digest.slice(7),
      releaseUrl: snapshot.html_url,
    }),
  };
}

export function writePackageManifests(release, root, { check = false } = {}) {
  // Resolve and validate all inputs before writing any files.
  const files = renderPackageManifests(release);
  const currentPath = resolve(root, snapshotPath);
  if (!check) {
    let previous;
    try {
      previous = JSON.parse(readFileSync(currentPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (previous) {
      const oldVersion = readPackageRelease(previous).version.split(".").map(BigInt);
      const newVersion = readPackageRelease(release).version.split(".").map(BigInt);
      const difference = oldVersion.findIndex((part, index) => part !== newVersion[index]);
      if (difference !== -1 && oldVersion[difference] > newVersion[difference]) {
        throw new Error("Refusing to replace package definitions with an older release");
      }
      if (difference === -1 && JSON.stringify(readPackageRelease(previous).snapshot.assets)
        !== JSON.stringify(readPackageRelease(release).snapshot.assets)) {
        throw new Error("Installer assets changed for an existing version; publish a new release");
      }
    }
  }
  for (const [path, content] of Object.entries(files)) {
    const destination = resolve(root, path);
    if (check) {
      if (readFileSync(destination, "utf8").replace(/\r\n/g, "\n") !== content) {
        throw new Error(`Package definition is out of date: ${path}`);
      }
    } else {
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, content);
    }
  }
  return Object.keys(files);
}

export async function fetchLatestRelease({ fetchImpl = fetch, token = process.env.GITHUB_TOKEN } = {}) {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "xrift-studio-package-managers",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Could not fetch the latest release: HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const { values } = parseArgs({
    options: {
      "release-file": { type: "string" },
      "output-dir": { type: "string" },
      check: { type: "boolean", default: false },
    },
  });
  const root = resolve(values["output-dir"] ?? process.cwd());
  const input = values["release-file"] ?? (values.check ? resolve(root, snapshotPath) : null);
  const release = input ? JSON.parse(readFileSync(input, "utf8")) : await fetchLatestRelease();
  const paths = writePackageManifests(release, root, { check: values.check });
  const { version } = readPackageRelease(release);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  }
  console.log(`${values.check ? "Verified" : "Generated"} package definitions for v${version}:\n${paths.join("\n")}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
