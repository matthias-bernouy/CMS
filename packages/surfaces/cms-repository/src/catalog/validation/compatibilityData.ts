import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type {
    RepositoryCatalogCompatibilityBaseline,
    RepositoryCatalogCompatibilityHistory,
    RepositoryCatalogCompatibilityReport,
    RepositoryCatalogCompatibilitySummary,
} from "../contracts";
import { boundedArray, boundedText, REPOSITORY_CATALOG_LIMITS, RepositoryCatalogDataError } from "./limits";

const OUTCOMES = new Set(["compatible", "breaking", "unknown", "invalid", "not-applicable"]);
const SHA256_HEX = /^[a-f0-9]{64}$/;

export function assertCompatibilitySummary(value: RepositoryCatalogCompatibilitySummary | undefined): void {
    if (!value) {
        return;
    }
    assertOutcome(value.admissionOutcome);
    assertOutcome(value.currentOutcome);
    boundedText(value.admissionReportId, "admission report ID", REPOSITORY_CATALOG_LIMITS.identifierBytes, false);
    boundedText(value.currentRevisionId, "current revision ID", REPOSITORY_CATALOG_LIMITS.identifierBytes, false);
}

export function assertCompatibilityHistory(history: RepositoryCatalogCompatibilityHistory): void {
    assertReport(history.admission, "admission");
    const revisions = boundedArray(
        history.revisions ?? [],
        "compatibility revisions",
        REPOSITORY_CATALOG_LIMITS.compatibilityRevisions,
    );
    const reports = [history.admission, ...revisions];
    for (const revision of revisions) {
        assertReport(revision, "revision");
    }
    boundedText(history.currentRevisionId, "current revision ID", REPOSITORY_CATALOG_LIMITS.identifierBytes);
    if (!reports.some(({ id }) => id === history.currentRevisionId)) {
        throw new RepositoryCatalogDataError("Current compatibility revision is absent from history");
    }
}

function assertReport(report: RepositoryCatalogCompatibilityReport, expectedType: "admission" | "revision"): void {
    if (report.reportType !== expectedType) {
        throw new RepositoryCatalogDataError(`Compatibility report must be ${expectedType}`);
    }
    boundedText(report.id, "compatibility report ID", REPOSITORY_CATALOG_LIMITS.identifierBytes);
    assertOutcome(report.outcome);
    assertDigest(report.packageDigest, "compatibility package digest");
    if (report.evaluator) {
        boundedText(report.evaluator.name, "compatibility evaluator name", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
        boundedText(
            report.evaluator.version,
            "compatibility evaluator version",
            REPOSITORY_CATALOG_LIMITS.shortTextBytes,
        );
    }
    const baselines = [
        ...boundedArray(
            report.baselines ?? [],
            "compatibility baselines",
            REPOSITORY_CATALOG_LIMITS.compatibilityBaselines,
        ),
        ...boundedArray(
            report.informationalBaselines ?? [],
            "informational compatibility baselines",
            REPOSITORY_CATALOG_LIMITS.compatibilityBaselines,
        ),
    ];
    if (baselines.length > REPOSITORY_CATALOG_LIMITS.compatibilityBaselines) {
        throw new RepositoryCatalogDataError("Compatibility baselines exceed their combined item limit");
    }
    for (const baseline of baselines) {
        assertBaseline(baseline);
    }
    boundedText(report.createdAt, "compatibility report timestamp", REPOSITORY_CATALOG_LIMITS.shortTextBytes, false);
    boundedText(report.releaseLevel, "release level", REPOSITORY_CATALOG_LIMITS.shortTextBytes, false);
    boundedText(report.requiredReleaseLevel, "required release level", REPOSITORY_CATALOG_LIMITS.shortTextBytes, false);
    boundedText(report.supersedes, "superseded report ID", REPOSITORY_CATALOG_LIMITS.identifierBytes, false);
    if (report.provenance) {
        boundedText(
            report.provenance.reason,
            "compatibility provenance reason",
            REPOSITORY_CATALOG_LIMITS.descriptionBytes,
        );
        for (const evidenceId of boundedArray(
            report.provenance.evidenceIds ?? [],
            "compatibility provenance evidence IDs",
            REPOSITORY_CATALOG_LIMITS.compatibilityEvidence,
        )) {
            boundedText(evidenceId, "compatibility provenance evidence ID", REPOSITORY_CATALOG_LIMITS.identifierBytes);
        }
    }
    for (const evidence of boundedArray(
        report.evidence ?? [],
        "compatibility evidence",
        REPOSITORY_CATALOG_LIMITS.compatibilityEvidence,
    )) {
        boundedText(evidence.classification, "evidence classification", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
        boundedText(evidence.surface, "evidence surface", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
        boundedText(evidence.code, "evidence code", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
        boundedText(evidence.path, "evidence path", REPOSITORY_CATALOG_LIMITS.descriptionBytes);
        boundedText(evidence.message, "evidence message", REPOSITORY_CATALOG_LIMITS.descriptionBytes);
    }
}

function assertBaseline(baseline: RepositoryCatalogCompatibilityBaseline): void {
    assertIntegrationPackageKind(baseline.kind);
    assertIntegrationPackageVersion(baseline.version);
    assertDigest(baseline.packageDigest, "compatibility baseline package digest");
}

function assertDigest(value: string | undefined, name: string): void {
    if (value !== undefined && !SHA256_HEX.test(value)) {
        throw new RepositoryCatalogDataError(`${name} must be a lowercase SHA-256 digest`);
    }
}

function assertOutcome(value: string | undefined): void {
    if (value !== undefined && !OUTCOMES.has(value)) {
        throw new RepositoryCatalogDataError("Unsupported compatibility outcome");
    }
}
