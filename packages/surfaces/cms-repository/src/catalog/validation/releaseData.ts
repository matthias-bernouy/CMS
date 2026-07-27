import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type { PublicRepositoryRelease } from "../../compatibility/releaseContracts";
import type { RepositoryCatalogVersionSummary } from "../contracts";
import { boundedArray, boundedText, REPOSITORY_CATALOG_LIMITS, RepositoryCatalogDataError } from "./limits";

const DIGEST = /^[a-f0-9]{64}$/u;
const RELEASE_STATUSES = new Set(["installable", "blocked", "inadmissible", "unverified"]);

export function assertReleaseSummary(summary: RepositoryCatalogVersionSummary["release"]): void {
    if (!summary) {
        return;
    }
    if (!RELEASE_STATUSES.has(summary.status) || typeof summary.installable !== "boolean") {
        throw invalid("Release summary status is invalid");
    }
    if (summary.installable !== (summary.status === "installable") || typeof summary.freshInstallOnly !== "boolean") {
        throw invalid("Release summary eligibility is inconsistent");
    }
    digest(summary.verificationDigest, false);
    boundedText(summary.verificationOrigin, "verification origin", REPOSITORY_CATALOG_LIMITS.shortTextBytes, false);
    boundedText(summary.verificationOutcome, "verification outcome", REPOSITORY_CATALOG_LIMITS.shortTextBytes, false);
}

export function assertReleaseEvidence(release: PublicRepositoryRelease, kind: string, version: string): void {
    assertIntegrationPackageKind(release.kind);
    assertIntegrationPackageVersion(release.version);
    if (release.kind !== kind || release.version !== version) {
        throw invalid("Release evidence identity does not match its version");
    }
    assertReleaseSummary(release);
    digest(release.packageDigest);
    digest(release.verificationDigest, false);
    if (release.compatibility) {
        boundedText(
            release.compatibility.reportId,
            "compatibility report ID",
            REPOSITORY_CATALOG_LIMITS.identifierBytes,
        );
        digest(release.compatibility.reportDigest);
        boundedText(release.compatibility.origin, "compatibility origin", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
        boundedText(release.compatibility.outcome, "compatibility outcome", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
        boundedText(release.compatibility.releaseLevel, "release level", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
        boundedText(
            release.compatibility.requiredReleaseLevel,
            "required release level",
            REPOSITORY_CATALOG_LIMITS.shortTextBytes,
        );
        validatePolicy(release.compatibility.evaluator);
        for (const baseline of boundedArray(
            release.compatibility.baselines,
            "compatibility baselines",
            REPOSITORY_CATALOG_LIMITS.compatibilityBaselines,
        )) {
            assertIntegrationPackageKind(baseline.kind);
            assertIntegrationPackageVersion(baseline.version);
            digest(baseline.packageDigest);
        }
        for (const finding of boundedArray(
            release.compatibility.findings,
            "compatibility findings",
            REPOSITORY_CATALOG_LIMITS.compatibilityEvidence,
        )) {
            boundedText(finding.findingId, "finding ID", REPOSITORY_CATALOG_LIMITS.identifierBytes);
            boundedText(finding.classification, "finding classification", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
            boundedText(finding.surface, "finding surface", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
            boundedText(finding.path, "finding path", REPOSITORY_CATALOG_LIMITS.descriptionBytes);
            boundedText(finding.code, "finding code", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
            boundedText(finding.message, "finding message", REPOSITORY_CATALOG_LIMITS.descriptionBytes);
        }
    }
    if (release.verification) {
        validateVerification(release.verification);
    }
    for (const migration of boundedArray(
        release.migrations,
        "migration reports",
        REPOSITORY_CATALOG_LIMITS.compatibilityBaselines,
    )) {
        boundedText(migration.reportId, "migration report ID", REPOSITORY_CATALOG_LIMITS.identifierBytes);
        digest(migration.reportDigest);
        assertIntegrationPackageKind(migration.source.kind);
        assertIntegrationPackageVersion(migration.source.version);
        digest(migration.source.packageDigest);
        boundedText(migration.supportedSourceRange, "migration source range", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
        boundedText(migration.connectorKey, "connector key", REPOSITORY_CATALOG_LIMITS.identifierBytes);
        boundedText(migration.lineageId, "lineage ID", REPOSITORY_CATALOG_LIMITS.identifierBytes);
        safeCount(migration.migrationRevision, "migration revision");
        validateRunner(migration.runner);
        digest(migration.environmentDigest);
        boundedText(migration.pointOfNoReturn, "point of no return", REPOSITORY_CATALOG_LIMITS.descriptionBytes);
    }
    if (release.decision) {
        boundedText(release.decision.decisionId, "decision ID", REPOSITORY_CATALOG_LIMITS.identifierBytes);
        digest(release.decision.decisionDigest);
        validatePolicy(release.decision.policy);
        boundedArray(release.decision.reasons, "decision reasons", 256).forEach((reason) =>
            boundedText(reason, "decision reason", REPOSITORY_CATALOG_LIMITS.descriptionBytes),
        );
    }
}

function validateVerification(verification: NonNullable<PublicRepositoryRelease["verification"]>): void {
    boundedText(verification.reportId, "verification report ID", REPOSITORY_CATALOG_LIMITS.identifierBytes);
    digest(verification.reportDigest);
    boundedText(verification.createdAt, "verification creation time", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
    validateRunner(verification.runner);
    digest(verification.environment.digest);
    for (const [name, version] of Object.entries(verification.environment.versions)) {
        boundedText(name, "environment component", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
        boundedText(version, "environment version", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
    }
    validatePolicy(verification.policy);
    for (const contract of boundedArray(verification.activeContracts, "active verification contracts", 4_096)) {
        boundedText(contract.contractId, "contract ID", REPOSITORY_CATALOG_LIMITS.identifierBytes);
        assertIntegrationPackageVersion(contract.ownerVersion);
        digest(contract.digest);
    }
    for (const result of boundedArray(verification.results, "verification results", 4_096)) {
        boundedText(result.suiteId, "verification suite ID", REPOSITORY_CATALOG_LIMITS.identifierBytes);
        safeCount(result.durationMs, "verification duration");
        safeCount(result.attempts, "verification attempts");
        boundedArray(result.diagnostics, "verification diagnostics", 4_096).forEach(({ code, message }) => {
            boundedText(code, "verification diagnostic code", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
            boundedText(message, "verification diagnostic message", REPOSITORY_CATALOG_LIMITS.descriptionBytes);
        });
    }
}

function validateRunner(runner: Readonly<{ name: string; version: string; imageDigest: string }>): void {
    boundedText(runner.name, "runner name", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
    boundedText(runner.version, "runner version", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
    boundedText(runner.imageDigest, "runner image digest", REPOSITORY_CATALOG_LIMITS.descriptionBytes);
}

function validatePolicy(policy: Readonly<{ name: string; version: string; snapshotDigest?: string }>): void {
    boundedText(policy.name, "policy name", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
    boundedText(policy.version, "policy version", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
    digest(policy.snapshotDigest, false);
}

function digest(value: unknown, required = true): void {
    if (value === undefined && !required) {
        return;
    }
    if (typeof value !== "string" || !DIGEST.test(value)) {
        throw invalid("Release evidence digest is invalid");
    }
}

function safeCount(value: unknown, label: string): void {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw invalid(`${label} must be a non-negative safe integer`);
    }
}

function invalid(message: string): RepositoryCatalogDataError {
    return new RepositoryCatalogDataError(message);
}
