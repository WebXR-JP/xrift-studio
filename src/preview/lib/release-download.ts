/**
 * Turns a GitHub release into the download the visitor actually needs.
 *
 * The landing page used to send everyone to the releases page on GitHub, which
 * asks a first-time visitor to pick one file out of a dozen — `.msi` or
 * `-setup.exe`? what is a `.sig`? — on a page that looks like it belongs to
 * developers. That is the part people called scary, not the app.
 *
 * So the choice is made here instead: the assets of the latest release are
 * classified by platform and format, the one that suits the visitor's OS is
 * marked as the recommended download, and everything the release publishes for
 * other systems stays reachable one disclosure away. The release flow itself is
 * untouched — this only reads what `.github/workflows/release.yml` already
 * attaches, using the `[name]_[version]_[platform]_[arch]_[mode][setup][ext]`
 * names that `tauri-action` writes.
 */

export type PlatformId = "windows" | "macos" | "linux";

/** What the visitor is browsing from. Phones get an explanation, not a button. */
export type VisitorPlatform = PlatformId | "mobile" | "unknown";

export type ReleaseAssetInput = {
  name: string;
  browser_download_url: string;
  size: number;
  /** `sha256:...`, present on releases GitHub has digested. */
  digest?: string | null;
};

export type LatestReleaseInput = {
  tag_name: string;
  html_url: string;
  published_at: string | null;
  assets: readonly ReleaseAssetInput[];
};

export type DownloadOption = {
  /** Asset file name, shown so the saved file is recognisable afterwards. */
  fileName: string;
  url: string;
  sizeBytes: number;
  platform: PlatformId;
  /** `.exe` / `.dmg` — the extension as a person would say it. */
  extension: string;
  /** Short reading of the format, e.g. 「インストーラー」. */
  formatLabel: string;
  /** `x64`, `universal`, `arm64`… taken from the asset name. */
  arch: string | null;
  sha256: string | null;
  /** Lower is offered first within a platform. */
  rank: number;
};

export type ResolvedRelease = {
  /** `0.9.15` — the tag without its leading `v`. */
  version: string;
  tag: string;
  releaseUrl: string;
  publishedAt: string | null;
  options: readonly DownloadOption[];
};

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

/**
 * Assets that exist for the in-app updater or for verification, not for a
 * person to download. `.app.tar.gz` in particular looks like a macOS download
 * but is only ever consumed by `@tauri-apps/plugin-updater`.
 */
function isMachineOnlyAsset(name: string): boolean {
  return (
    name.endsWith(".sig") ||
    name.endsWith(".tar.gz") ||
    name.endsWith(".zip") ||
    name === "latest.json"
  );
}

type FormatRule = {
  suffix: string;
  platform: PlatformId;
  extension: string;
  formatLabel: string;
  rank: number;
};

/**
 * Ranked so that rank 0 is the file to hand someone who has no opinion:
 * the NSIS installer on Windows, the disk image on macOS, and the AppImage on
 * Linux, which runs without a package manager.
 */
const FORMAT_RULES: readonly FormatRule[] = [
  {
    suffix: "-setup.exe",
    platform: "windows",
    extension: ".exe",
    formatLabel: "インストーラー",
    rank: 0,
  },
  {
    suffix: ".exe",
    platform: "windows",
    extension: ".exe",
    formatLabel: "インストーラー",
    rank: 0,
  },
  {
    suffix: ".msi",
    platform: "windows",
    extension: ".msi",
    formatLabel: "Windows Installer 形式",
    rank: 1,
  },
  {
    suffix: ".dmg",
    platform: "macos",
    extension: ".dmg",
    formatLabel: "ディスクイメージ",
    rank: 0,
  },
  {
    suffix: ".appimage",
    platform: "linux",
    extension: ".AppImage",
    formatLabel: "そのまま実行できる形式",
    rank: 0,
  },
  {
    suffix: ".deb",
    platform: "linux",
    extension: ".deb",
    formatLabel: "Debian / Ubuntu 向け",
    rank: 1,
  },
  {
    suffix: ".rpm",
    platform: "linux",
    extension: ".rpm",
    formatLabel: "Fedora / RHEL 向け",
    rank: 2,
  },
];

const ARCH_TOKENS: Record<string, string> = {
  x64: "x64",
  x86_64: "x64",
  amd64: "x64",
  aarch64: "arm64",
  arm64: "arm64",
  universal: "universal",
};

function readArch(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  for (const [token, label] of Object.entries(ARCH_TOKENS)) {
    if (lower.includes(`_${token}_`) || lower.includes(`_${token}.`)) {
      return label;
    }
  }
  return null;
}

function readSha256(digest: string | null | undefined): string | null {
  if (!digest) return null;
  const [algorithm, value] = digest.split(":");
  return algorithm === "sha256" && value ? value : null;
}

function classify(asset: ReleaseAssetInput): DownloadOption | null {
  if (isMachineOnlyAsset(asset.name)) return null;
  const lower = asset.name.toLowerCase();
  const rule = FORMAT_RULES.find((candidate) => lower.endsWith(candidate.suffix));
  if (!rule) return null;

  return {
    fileName: asset.name,
    url: asset.browser_download_url,
    sizeBytes: asset.size,
    platform: rule.platform,
    extension: rule.extension,
    formatLabel: rule.formatLabel,
    arch: readArch(asset.name),
    sha256: readSha256(asset.digest),
    rank: rule.rank,
  };
}

export function resolveRelease(input: LatestReleaseInput): ResolvedRelease {
  const options = input.assets
    .map(classify)
    .filter((option): option is DownloadOption => option !== null)
    .sort((a, b) => a.rank - b.rank || a.fileName.localeCompare(b.fileName));

  return {
    version: input.tag_name.replace(/^v/, ""),
    tag: input.tag_name,
    releaseUrl: input.html_url,
    publishedAt: input.published_at,
    options,
  };
}

export function optionsForPlatform(
  release: ResolvedRelease | null,
  platform: PlatformId,
): readonly DownloadOption[] {
  if (!release) return [];
  return release.options.filter((option) => option.platform === platform);
}

/**
 * The one file to offer for a platform.
 *
 * When a release starts shipping more than one architecture for the same
 * format — an arm64 Windows build, say — the visitor's own architecture wins
 * over the file-name order, so nobody is handed a build their machine cannot
 * run. `universal` matches everything because that is what it is.
 */
export function recommendedOption(
  release: ResolvedRelease | null,
  platform: PlatformId,
  arch: string | null,
): DownloadOption | null {
  const options = optionsForPlatform(release, platform);
  if (options.length === 0) return null;
  if (arch) {
    const matching = options.filter(
      (option) => option.arch === null || option.arch === arch || option.arch === "universal",
    );
    if (matching.length > 0) return matching[0];
  }
  return options[0];
}

export function detectPlatform(userAgent: string, uaPlatform?: string): VisitorPlatform {
  const hint = `${uaPlatform ?? ""} ${userAgent}`.toLowerCase();
  // Checked before macOS: iPadOS reports a desktop Safari user agent.
  if (/android|iphone|ipad|ipod/.test(hint)) return "mobile";
  if (hint.includes("win")) return "windows";
  if (hint.includes("mac")) return "macos";
  if (hint.includes("linux") || hint.includes("x11") || hint.includes("cros")) {
    return "linux";
  }
  return "unknown";
}

export function detectArch(userAgent: string, uaArchitecture?: string): string | null {
  if (uaArchitecture) {
    const normalized = uaArchitecture.toLowerCase();
    if (normalized === "arm" || normalized === "arm64") return "arm64";
    if (normalized === "x86") return "x64";
  }
  const hint = userAgent.toLowerCase();
  if (hint.includes("arm64") || hint.includes("aarch64")) return "arm64";
  if (hint.includes("x86_64") || hint.includes("win64") || hint.includes("wow64")) {
    return "x64";
  }
  return null;
}

export function formatSize(bytes: number): string {
  const megabytes = bytes / 1000 / 1000;
  if (megabytes >= 100) return `約 ${Math.round(megabytes)} MB`;
  return `約 ${megabytes.toFixed(1)} MB`;
}

export function formatPublishedDate(publishedAt: string | null): string | null {
  if (!publishedAt) return null;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
