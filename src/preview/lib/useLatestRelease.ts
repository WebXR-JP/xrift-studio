import { useEffect, useState } from "react";
import { RELEASE_SNAPSHOT } from "../generated/release-snapshot";
import {
  detectArch,
  detectPlatform,
  formatSize,
  PLATFORM_LABELS,
  recommendedOption,
  resolveRelease,
  type DownloadOption,
  type LatestReleaseInput,
  type ResolvedRelease,
  type VisitorPlatform,
} from "./release-download";

const LATEST_RELEASE_API =
  "https://api.github.com/repos/WebXR-JP/xrift-studio/releases/latest";

const REQUEST_TIMEOUT_MS = 8_000;

export type ReleaseSource = "snapshot" | "live";

export type LatestReleaseState = {
  release: ResolvedRelease;
  source: ReleaseSource;
  /** True while the live release is still being fetched. */
  checking: boolean;
  /** Set only when the live check failed; the snapshot is still being shown. */
  error: string | null;
};

const SNAPSHOT_STATE: LatestReleaseState = {
  release: resolveRelease(RELEASE_SNAPSHOT),
  source: "snapshot",
  checking: true,
  error: null,
};

/**
 * One check per page load, shared by every download button on it.
 *
 * The nav, the hero and the closing call to action all want the same answer,
 * and GitHub's unauthenticated API allows 60 requests an hour per address —
 * so the result is cached in the module and handed to every subscriber rather
 * than fetched once per component.
 */
let cachedState: LatestReleaseState = SNAPSHOT_STATE;
let inFlight: Promise<void> | null = null;
const subscribers = new Set<(state: LatestReleaseState) => void>();

function publish(state: LatestReleaseState) {
  cachedState = state;
  for (const subscriber of subscribers) subscriber(state);
}

async function fetchLatestRelease(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`GitHub responded ${response.status}`);
    }
    const payload = (await response.json()) as LatestReleaseInput;
    const release = resolveRelease(payload);
    // A release with no installer attached yet (a draft being filled in, or a
    // tag published before the build finished) would empty the page's download
    // list. The snapshot is the better answer until real files arrive.
    if (release.options.length === 0) {
      throw new Error("The latest release has no downloadable file yet");
    }
    publish({ release, source: "live", checking: false, error: null });
  } catch (error) {
    publish({
      ...cachedState,
      checking: false,
      error: error instanceof Error ? error.message : "unknown error",
    });
  } finally {
    clearTimeout(timeout);
  }
}

function ensureFetch(): void {
  if (inFlight) return;
  inFlight = fetchLatestRelease();
}

/** Re-runs the live check after a failure, from the page's retry control. */
export function recheckLatestRelease(): void {
  publish({ ...cachedState, checking: true, error: null });
  inFlight = fetchLatestRelease();
}

export function useLatestRelease(): LatestReleaseState {
  const [state, setState] = useState(cachedState);

  useEffect(() => {
    subscribers.add(setState);
    setState(cachedState);
    ensureFetch();
    return () => {
      subscribers.delete(setState);
    };
  }, []);

  return state;
}

/**
 * What the visitor's own machine is, resolved after mount.
 *
 * Detection is deliberately not done during render: the page is built as a
 * static bundle, and reading `navigator` while rendering would make the first
 * paint depend on it.
 */
export function useVisitorPlatform(): VisitorPlatform | null {
  const [platform, setPlatform] = useState<VisitorPlatform | null>(null);

  useEffect(() => {
    const uaData = (
      navigator as Navigator & { userAgentData?: { platform?: string } }
    ).userAgentData;
    setPlatform(
      detectPlatform(navigator.userAgent, uaData?.platform ?? navigator.platform),
    );
  }, []);

  return platform;
}

function useVisitorArch(): string | null {
  const [arch, setArch] = useState<string | null>(null);

  useEffect(() => {
    setArch(detectArch(navigator.userAgent));
  }, []);

  return arch;
}

export type DownloadCta = {
  release: ResolvedRelease;
  platform: VisitorPlatform | null;
  /** The file this visitor gets, when their platform is known and published. */
  option: DownloadOption | null;
  /** Direct link to the installer, or the in-page download section. */
  href: string;
  /** True when following `href` saves the installer instead of scrolling. */
  direct: boolean;
  label: string;
  /** One line under the button: version, format and size of what is offered. */
  meta: string;
  source: ReleaseSource;
  checking: boolean;
  error: string | null;
};

const DOWNLOAD_SECTION_HREF = "#download";

/**
 * The state every download button on the page shares.
 *
 * When the visitor's platform is known, the button is the installer itself:
 * one click, one file, no repository page in between. Otherwise — a phone, an
 * OS this release does not build for — it leads to the download section, which
 * can explain instead of handing over a file that will not run.
 */
export function useDownloadCta(): DownloadCta {
  const { release, source, checking, error } = useLatestRelease();
  const platform = useVisitorPlatform();
  const arch = useVisitorArch();

  const option =
    platform === "windows" || platform === "macos" || platform === "linux"
      ? recommendedOption(release, platform, arch)
      : null;

  const label = option
    ? `${PLATFORM_LABELS[option.platform]}版を無料ダウンロード`
    : "ダウンロードを見る";

  const meta = option
    ? `v${release.version} ・ ${option.extension} ${option.formatLabel} ・ ${formatSize(option.sizeBytes)}`
    : `v${release.version} ・ Windows / macOS / Linux`;

  return {
    release,
    platform,
    option,
    href: option ? option.url : DOWNLOAD_SECTION_HREF,
    direct: option !== null,
    label,
    meta,
    source,
    checking,
    error,
  };
}
