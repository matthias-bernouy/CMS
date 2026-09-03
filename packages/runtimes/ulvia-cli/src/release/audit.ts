import type { IntegrationDefinitionVersion } from "@bernouy/cms-integrations";
import { prepareFsIntegrationRegistryCandidate } from "@bernouy/cms-integration-registry/fs";
import type { LocalIntegrationRepository, PulledPackage } from "../repository/local";
import type { LocalPackageRecord } from "../repository/manifest";
import type { RemoteIntegrationRepository } from "../repository/remote";
import {
    assertLocalCompatibility,
    describeImmutableCoordinateChange,
    evaluateLocalCompatibility,
    type LocalCompatibilityResult,
} from "./compatibility";
import { ensureLocalBaselines, loadLocalReleasePackages, resolveRequiredPackages } from "./packages";
import { readLocalReleaseSource, type LocalReleaseSource } from "./source";
import type { LocalReleasePackage, LocalReleaseVerifier } from "./types";
import { assertSafeMigrationReleasePolicy } from "./verification/policy";

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
        const baseline = { package: await local.getPackage(existing), definition: existing.definition };
        throw immutableCoordinateError("Local", candidate, baseline);
    }
    const localVersions = (await local.list())
        .filter((record) => record.kind === kind)
        .map((record) => ({ version: record.version, path: "", definition: "" }));
    if ((existing && options.skipRemoteWhenLocal) || localVersions.length) {
        return { candidate, existing, published: null, publishedVersions: localVersions };
    }
    const publishedVersions = await remote.versionEntries(kind);
    const publishedEntry = publishedVersions.find((entry) => entry.version === version);
    const published = publishedEntry ? await remote.pull(kind, version) : null;
    if (published && published.package.digest !== candidate.package.digest) {
        throw immutableCoordinateError("Remote", candidate, published);
    }
    return { candidate, existing, published, publishedVersions };
}

function immutableCoordinateError(
    source: "Local" | "Remote",
    candidate: LocalReleaseSource,
    baseline: LocalReleasePackage,
): Error {
    const { kind, version } = candidate.package.envelope;
    const change = describeImmutableCoordinateChange(candidate, baseline);
    return new Error(
        `${source} package coordinate ${kind}@${version} is immutable and has different bytes; ` +
            `this change requires a ${change.requiredReleaseLevel} release, so bump the source to ${kind}@${change.suggestedVersion}`,
    );
}

export async function auditPreparedLocalRelease(
    prepared: PreparedLocalRelease,
    dependencies: AuditDependencies,
): Promise<LocalReleaseAudit> {
    const { candidate, publishedVersions } = prepared;
    const { kind, version } = candidate.package.envelope;
    await prepareFsIntegrationRegistryCandidate(candidate.package);
    dependencies.log("✓ repository admission: package and SQL policies passed");
    const baselineRecords = await ensureLocalBaselines(
        kind,
        version,
        dependencies.local,
        dependencies.remote,
        dependencies.log,
        publishedVersions,
    );
    const baselines = (await loadLocalReleasePackages(baselineRecords, dependencies.local)).map((baseline) =>
        attachReviewedSchemaEvidence(baseline, candidate.reviewedSchemaEvidence),
    );
    const candidateWithEvidence = attachReviewedSchemaEvidence(candidate, candidate.reviewedSchemaEvidence);
    const compatibility = evaluateLocalCompatibility(candidateWithEvidence, baselines);
    assertLocalCompatibility(compatibility);
    assertSafeMigrationReleasePolicy(candidateWithEvidence, compatibility, baselines);
    dependencies.log(
        `✓ compatibility: ${compatibility.releaseLevel} release, requires ${compatibility.requiredReleaseLevel}`,
    );
    dependencies.log("✓ migration policy: stateful changes use staged expand/contract releases");
    const availablePackages = await resolveRequiredPackages(
        [candidate, ...baselines],
        dependencies.local,
        dependencies.remote,
        dependencies.log,
    );
    const verification = await dependencies.verifier.verify({
        candidate,
        sourceRoot: candidate.integrationRoot,
        baselines,
        availablePackages,
    });
    return { prepared, compatibility, scenarioCount: verification?.scenarioCount ?? 1 + baselines.length };
}

function attachReviewedSchemaEvidence(
    releasePackage: LocalReleasePackage,
    evidence: LocalReleaseSource["reviewedSchemaEvidence"],
): LocalReleasePackage {
    const { kind, version } = releasePackage.package.envelope;
    const matching = evidence
        .filter(
            (entry) =>
                entry.kind === kind &&
                entry.version === version &&
                entry.packageDigest === releasePackage.package.digest,
        )
        .map((entry) => entry.baseline);
    return matching.length ? { ...releasePackage, reviewedSchemaBaselines: matching } : releasePackage;
}
