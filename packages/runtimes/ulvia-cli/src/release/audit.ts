import type { IntegrationDefinitionVersion } from "@bernouy/cms-integrations";
import type { LocalIntegrationRepository, PulledPackage } from "../repository/local";
import type { LocalPackageRecord } from "../repository/manifest";
import type { RemoteIntegrationRepository } from "../repository/remote";
import { assertLocalCompatibility, evaluateLocalCompatibility, type LocalCompatibilityResult } from "./compatibility";
import { ensureLocalBaselines, loadLocalReleasePackages, resolveRequiredPackages } from "./packages";
import { readLocalReleaseSource, type LocalReleaseSource } from "./source";
import type { LocalReleaseVerifier } from "./types";

export type PreparedLocalRelease = Readonly<{
    candidate: LocalReleaseSource;
    existing: LocalPackageRecord | null;
    published: PulledPackage | null;
    publishedVersions: readonly IntegrationDefinitionVersion[];
}>;

export type LocalReleaseAudit = Readonly<{
    prepared: PreparedLocalRelease;
    compatibility: LocalCompatibilityResult;
    scenarioCount: number;
}>;

type AuditDependencies = Readonly<{
    local: LocalIntegrationRepository;
    remote: RemoteIntegrationRepository;
    verifier: LocalReleaseVerifier;
    log: (message: string) => void;
}>;

export async function auditLocalRelease(
    root: string,
    kind: string,
    version: string | undefined,
    dependencies: AuditDependencies,
): Promise<LocalReleaseAudit> {
    const prepared = await prepareLocalRelease(root, kind, version, dependencies.local, dependencies.remote);
    return await auditPreparedLocalRelease(prepared, dependencies);
}

export async function prepareLocalRelease(
    root: string,
    requestedKind: string,
    requestedVersion: string | undefined,
    local: LocalIntegrationRepository,
    remote: RemoteIntegrationRepository,
    options: Readonly<{ skipRemoteWhenLocal?: boolean }> = {},
): Promise<PreparedLocalRelease> {
    const candidate = await readLocalReleaseSource(root, requestedKind, requestedVersion);
    const { kind, version } = candidate.package.envelope;
    const existing = await local.getRecord(kind, version);
    if (existing && existing.digest !== candidate.package.digest) {
        throw new Error(`Local package coordinate ${kind}@${version} already has a different digest`);
    }
    if (existing && options.skipRemoteWhenLocal) {
        return { candidate, existing, published: null, publishedVersions: [] };
    }
    const publishedVersions = await remote.versionEntries(kind);
    const publishedEntry = publishedVersions.find((entry) => entry.version === version);
    const published = publishedEntry ? await remote.pull(kind, version) : null;
    if (published && published.package.digest !== candidate.package.digest) {
        throw new Error(`Remote package coordinate ${kind}@${version} already has a different immutable digest`);
    }
    return { candidate, existing, published, publishedVersions };
}

export async function auditPreparedLocalRelease(
    prepared: PreparedLocalRelease,
    dependencies: AuditDependencies,
): Promise<LocalReleaseAudit> {
    const { candidate, publishedVersions } = prepared;
    const { kind, version } = candidate.package.envelope;
    const baselineRecords = await ensureLocalBaselines(
        kind,
        version,
        dependencies.local,
        dependencies.remote,
        dependencies.log,
        publishedVersions,
    );
    const baselines = await loadLocalReleasePackages(baselineRecords, dependencies.local);
    const compatibility = evaluateLocalCompatibility(candidate, baselines);
    assertLocalCompatibility(compatibility);
    dependencies.log(
        `✓ compatibility: ${compatibility.releaseLevel} release, requires ${compatibility.requiredReleaseLevel}`,
    );
    const availablePackages = await resolveRequiredPackages(
        [candidate, ...baselines],
        dependencies.local,
        dependencies.remote,
        dependencies.log,
    );
    await dependencies.verifier.verify({ candidate, baselines, availablePackages });
    return { prepared, compatibility, scenarioCount: 1 + baselines.length };
}
