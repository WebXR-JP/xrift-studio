/**
 * Platform permissions a published world has to declare in `xrift.json`.
 *
 * XRift runs a security check over the built bundle and rejects a world that
 * uses a guarded capability without declaring it. The capabilities come from
 * what the compiler emits, not from author intent, so each emitted feature
 * states its own requirement here and the compiler merges them. A feature that
 * needs no permission declares nothing, and a world that uses no such feature
 * publishes with the checks fully enforced.
 *
 * Adding a feature that fetches, bundles obfuscated code, or otherwise trips a
 * rule means adding one `PublishPermissionRequirement` next to that feature —
 * not editing the generator.
 */
export type PublishPermissionRequirement = {
  /** Names the feature, for the publish-time summary shown to the author. */
  feature: string;
  /** Why the permission is unavoidable, in one sentence. */
  reason: string;
  /** Security rules the bundle cannot satisfy, e.g. `no-obfuscation`. */
  allowedCodeRules?: readonly string[];
  /** Hosts the world contacts at runtime. */
  allowedDomains?: readonly string[];
};

export type ResolvedPublishPermissions = {
  allowedCodeRules: string[];
  allowedDomains: string[];
  /** The requirements that produced the entries above, in declaration order. */
  requirements: PublishPermissionRequirement[];
};

/** Reads the host an emitted feature contacts, so a URL and its permission cannot drift apart. */
export function permissionDomainForUrl(url: string): string {
  return new URL(url).hostname;
}

export function resolvePublishPermissions(
  requirements: readonly PublishPermissionRequirement[],
): ResolvedPublishPermissions | undefined {
  const allowedCodeRules = uniqueSorted(
    requirements.flatMap((requirement) => requirement.allowedCodeRules ?? []),
  );
  const allowedDomains = uniqueSorted(
    requirements.flatMap((requirement) => requirement.allowedDomains ?? []),
  );
  if (allowedCodeRules.length === 0 && allowedDomains.length === 0) {
    return undefined;
  }
  return { allowedCodeRules, allowedDomains, requirements: [...requirements] };
}

/** Shapes the `permissions` object exactly as the XRift CLI reads it. */
export function publishPermissionsJson(
  permissions: ResolvedPublishPermissions | undefined,
): { permissions: Record<string, string[]> } | Record<string, never> {
  if (!permissions) return {};
  return {
    permissions: {
      ...(permissions.allowedCodeRules.length > 0
        ? { allowedCodeRules: permissions.allowedCodeRules }
        : {}),
      ...(permissions.allowedDomains.length > 0
        ? { allowedDomains: permissions.allowedDomains }
        : {}),
    },
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
