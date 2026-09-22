import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderWingetManifests } from "./lib/winget-manifest.mjs";

const release = {
  version: "0.10.1",
  installerUrl: "https://github.com/WebXR-JP/xrift-studio/releases/download/v0.10.1/XRift.Studio_0.10.1_windows_x64_release-setup.exe",
  sha256: "510d857569dc4ebd5ed50b1c2e2dd318b3a7645299e9c5d5c8d701eca56a15a3",
  releaseUrl: "https://github.com/WebXR-JP/xrift-studio/releases/tag/v0.10.1",
};

function manifestOf(files, suffix) {
  const entry = Object.entries(files).find(([path]) => path.endsWith(suffix));
  assert.ok(entry, `Missing manifest ${suffix}`);
  return entry[1];
}

test("WinGet files share the package identity and use the community repository layout", () => {
  const files = renderWingetManifests(release);
  const directory = "packaging/winget/manifests/w/WebXR-JP/XRiftStudio/0.10.1";
  assert.deepEqual(Object.keys(files).sort(), [
    `${directory}/WebXR-JP.XRiftStudio.installer.yaml`,
    `${directory}/WebXR-JP.XRiftStudio.locale.en-US.yaml`,
    `${directory}/WebXR-JP.XRiftStudio.yaml`,
  ]);
  for (const yaml of Object.values(files)) {
    assert.match(yaml, /^PackageIdentifier: WebXR-JP\.XRiftStudio$/m);
    assert.match(yaml, /^PackageVersion: "0\.10\.1"$/m);
    assert.match(yaml, /^ManifestVersion: 1\.9\.0$/m);
    assert.ok(yaml.endsWith("\n"));
  }
  assert.match(manifestOf(files, "XRiftStudio.yaml"), /^DefaultLocale: en-US$/m);
  assert.match(manifestOf(files, "locale.en-US.yaml"), /^ManifestType: defaultLocale$/m);
});

test("Windows identity and scope match the current Tauri installer settings", () => {
  const config = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
  const publisher = config.bundle.publisher ?? config.identifier.split(".")[1];
  const files = renderWingetManifests(release);
  const locale = manifestOf(files, "locale.en-US.yaml");
  const installer = manifestOf(files, "installer.yaml");
  assert.ok(locale.includes(`\nPackageName: ${config.productName}\n`));
  assert.ok(locale.includes(`\nPublisher: ${publisher}\n`));
  assert.ok(installer.includes(`\n  - DisplayName: ${config.productName}\n    Publisher: ${publisher}\n`));
  assert.equal(config.bundle.windows?.nsis?.installMode ?? "currentUser", "currentUser");
  assert.match(installer, /^Scope: user$/m);
  assert.match(locale, /^Author: xrift-studio contributors$/m);
  assert.doesNotMatch(installer, /ProductCode:|DisplayVersion:/);
});

test("NSIS supports unattended installs and updates without automatically launching the app", () => {
  const installer = manifestOf(renderWingetManifests(release), "installer.yaml");
  assert.match(installer, /^InstallerType: nullsoft$/m);
  assert.match(installer, /^  Silent: \/S$/m);
  assert.match(installer, /^  SilentWithProgress: \/P$/m);
  assert.match(installer, /^UpgradeBehavior: install$/m);
  assert.doesNotMatch(installer, /\/R\b|\/UPDATE\b|uninstallPrevious|Dependencies:/);
  assert.match(installer, /^  - Architecture: x64$/m);
  assert.ok(installer.includes(`InstallerUrl: ${JSON.stringify(release.installerUrl)}`));
  assert.ok(installer.includes(`InstallerSha256: "${release.sha256.toUpperCase()}"`));
});

test("release identity, URL and checksum change together for a new release", () => {
  const next = {
    version: "1.2.3",
    installerUrl: release.installerUrl.replaceAll("0.10.1", "1.2.3"),
    sha256: "1".repeat(64),
    releaseUrl: release.releaseUrl.replace("0.10.1", "1.2.3"),
  };
  const files = renderWingetManifests(next);
  for (const [path, yaml] of Object.entries(files)) {
    assert.ok(path.includes("/1.2.3/"));
    assert.match(yaml, /^PackageVersion: "1\.2\.3"$/m);
    assert.doesNotMatch(yaml, /0\.10\.1/);
  }
  const installer = manifestOf(files, "installer.yaml");
  assert.ok(installer.includes(`InstallerSha256: "${next.sha256}"`));
  assert.ok(manifestOf(files, "locale.en-US.yaml").includes(`ReleaseNotesUrl: "${next.releaseUrl}"`));
});

test("invalid versions and hashes cannot produce version directories or manifests", () => {
  for (const version of ["v0.10.1", "0.10.1-beta.1", "0.10.1+build", "../0.10.1", "1.2", "01.2.3", "1.2.3\nextra", null]) {
    assert.throws(() => renderWingetManifests({ ...release, version }), /version must/);
  }
  for (const sha256 of ["1".repeat(63), "1".repeat(65), "z".repeat(64), `${release.sha256}\n`, null]) {
    assert.throws(() => renderWingetManifests({ ...release, sha256 }), /sha256 must/);
  }
});

test("URLs must be absolute HTTPS without credentials, fragments or injected lines", () => {
  for (const field of ["installerUrl", "releaseUrl"]) {
    for (const value of ["http://example.com/release", "/release", "https://user:password@example.com/release", "https://example.com/release#fragment", "https://example.com/release\nOtherField: true", undefined]) {
      assert.throws(() => renderWingetManifests({ ...release, [field]: value }), new RegExp(`${field} must`));
    }
  }
});
