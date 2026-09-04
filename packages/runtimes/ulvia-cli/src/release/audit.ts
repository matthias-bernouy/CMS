import type { IntegrationDefinitionVersion } from "@bernouy/cms-integrations";
import { prepareFsIntegrationRegistryCandidate } from "@bernouy/cms-integration-registry/fs";
import type { LocalIntegrationRepository, PulledPackage } from "../repository/local";
import type { LocalPackageRecord } from "../repository/manifest";
import {
    assertLocalCompatibility,
    describeImmutableCoordinateChange,
    evaluateLocalCompatibility,
    type LocalCompatibilityResult,
} from "./compatibility";
import {
    ensureLocalBaselines,
    loadLocalReleasePackage,
    loadLocalReleasePackages,
    resolveRequiredPackages,
} from "./packages";
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
    verifier: LocalReleaseVerifier;
    log: (message: string) => void;
}>;

export async function auditLocalRelease(
    root: string,
    kind: string,
    version: string | undefined,
    dependencies: AuditDependencies,
): Promise<LocalReleaseAudit> {
    const prepared = await prepareLocalRelease(root, kind, version, dependencies.local);
    return await auditPreparedLocalRelease(prepared, dependencies);
}

export async function prepareLocalRelease(
    root: string,
    requestedKind: string,
    requestedVersion: string | undefined,
    local: LocalIntegrationRepository,
): Promise<PreparedLocalRelease> {
    const candidate = await readLocalReleaseSource(root, requestedKind, requestedVersion);
    const { kind, version } = candidate.package.envelope;
    const existing = await local.getRecord(kind, version);
    if (existing && existing.digest !== candidate.package.digest) {
        const baseline = await loadLocalReleasePackage(existing, local);
        throw immutableCoordinateError("Local", candidate, baseline);
    }
    const localVersions = (await local.list())
        .filter((record) => record.kind === kind && record.admission?.status !== "rejected")
        .map((record) => ({ version: record.version, path: "", definition: "" }));
    return { candidate, existing, published: null, publishedVersions: localVersions };
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
    const baselineRecords = await ensureLocalBaselines(kind, version, dependencies.local, publishedVersions);
    const baselines = await loadLocalReleasePackages(baselineRecords, dependencies.local);
    const compatibility = evaluateLocalCompatibility(candidate, baselines);
    assertLocalCompatibility(compatibility);
    assertSafeMigrationReleasePolicy(candidate, compatibility, baselines);
    dependencies.log(
        `✓ compatibility: ${compatibility.releaseLevel} release, requires ${compatibility.requiredReleaseLevel}`,
    );
    dependencies.log("✓ migration policy: stateful changes use staged expand/contract releases");
    const availablePackages = await resolveRequiredPackages([candidate, ...baselines], dependencies.local);
    const verification = await dependencies.verifier.verify({
        candidate,
        sourceRoot: candidate.integrationRoot,
        baselines,
        availablePackages,
    });
    return { prepared, compatibility, scenarioCount: verification?.scenarioCount ?? 1 + baselines.length };
}
