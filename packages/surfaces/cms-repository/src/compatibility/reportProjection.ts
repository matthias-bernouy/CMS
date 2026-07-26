import {
    IntegrationPackageValidationError,
    assertIntegrationPackageKind,
    assertIntegrationPackageVersion,
} from "@bernouy/cms-integration-packages";
import type {
    PublicRepositoryCompatibilityAdmission,
    PublicRepositoryCompatibilityBaseline,
    PublicRepositoryCompatibilityEvidence,
    PublicRepositoryCompatibilityReport,
    PublicRepositoryCompatibilityRevision,
    RepositoryCompatibilityOutcome,
} from "./contracts";
import {
    invalidSource,
    optionalSourceText,
    PUBLIC_COMPATIBILITY_LIMITS,
    sourceArray,
    sourceBoolean,
    sourceIdentifier,
    sourceRecord,
    sourceText,
} from "./limits";

const OUTCOMES = new Set(["compatible", "breaking", "unknown", "invalid", "not-applicable"]);
const CLASSIFICATIONS = new Set(["compatible", "additive", "breaking", "unknown", "invalid"]);
const SURFACES = new Set(["definition", "input", "dependency", "artifact", "schema", "function"]);
const RELEASE_LEVELS = new Set(["initial", "major", "minor", "patch"]);
const REQUIRED_RELEASE_LEVELS = new Set(["none", "major", "minor", "patch"]);
const NO_BASELINE_REASONS = new Set(["new-kind", "new-major"]);
const SHA256 = /^[a-f0-9]{64}$/;

type ProjectedBase = Omit<PublicRepositoryCompatibilityAdmission, "reportType">;

export function projectAdmission(
    value: unknown,
    expectedKind: string,
    expectedVersion: string,
): PublicRepositoryCompatibilityAdmission {
    const source = sourceRecord(value);
    if (source.reportType !== "admission") {
        throw invalidSource();
    }
    return { reportType: "admission", ...projectBase(source, expectedKind, expectedVersion) };
}

export function projectRevision(
    value: unknown,
    expectedKind: string,
    expectedVersion: string,
): PublicRepositoryCompatibilityRevision {
    const source = sourceRecord(value);
    if (source.reportType !== "revision") {
        throw invalidSource();
    }
    const provenance = sourceRecord(source.provenance);
    const evidenceIds = sourceArray(provenance.evidenceIds ?? [], PUBLIC_COMPATIBILITY_LIMITS.evidenceIds).map(
        sourceIdentifier,
    );
    return {
        reportType: "revision",
        ...projectBase(source, expectedKind, expectedVersion),
        supersedes: sourceIdentifier(source.supersedes),
        provenance: {
            reason: sourceText(provenance.reason, PUBLIC_COMPATIBILITY_LIMITS.messageBytes),
            ...(evidenceIds.length > 0 ? { evidenceIds } : {}),
        },
    };
}

export function projectCurrent(
    value: unknown,
    expectedKind: string,
    expectedVersion: string,
): PublicRepositoryCompatibilityReport {
    const source = sourceRecord(value);
    return source.reportType === "admission"
        ? projectAdmission(source, expectedKind, expectedVersion)
        : projectRevision(source, expectedKind, expectedVersion);
}

function projectBase(
    source: Readonly<Record<string, unknown>>,
    expectedKind: string,
    expectedVersion: string,
): ProjectedBase {
    const kind = exactIdentity(source.kind, assertIntegrationPackageKind);
    const version = exactIdentity(source.version, assertIntegrationPackageVersion);
    if (kind !== expectedKind || version !== expectedVersion) {
        throw invalidSource();
    }
    const evaluator = sourceRecord(source.evaluator);
    const outcome = enumValue(source.outcome, OUTCOMES) as RepositoryCompatibilityOutcome;
    const noBaselineReason = optionalEnum(source.noBaselineReason, NO_BASELINE_REASONS);
    return {
        id: sourceIdentifier(source.id),
        kind,
        version,
        packageDigest: digest(source.packageDigest),
        evaluator: {
            name: sourceText(evaluator.name, PUBLIC_COMPATIBILITY_LIMITS.shortTextBytes),
            version: sourceText(evaluator.version, PUBLIC_COMPATIBILITY_LIMITS.shortTextBytes),
        },
        createdAt: sourceText(source.createdAt, PUBLIC_COMPATIBILITY_LIMITS.shortTextBytes),
        baselines: projectBaselines(source.baselines),
        informationalBaselines: projectBaselines(source.informationalBaselines),
        evidence: sourceArray(source.evidence, PUBLIC_COMPATIBILITY_LIMITS.evidencePerReport).map(projectEvidence),
        outcome,
        requiredReleaseLevel: enumValue(source.requiredReleaseLevel, REQUIRED_RELEASE_LEVELS),
        releaseLevel: enumValue(source.releaseLevel, RELEASE_LEVELS),
        admissible: sourceBoolean(source.admissible),
        ...(noBaselineReason ? { noBaselineReason } : {}),
    };
}

function projectBaselines(value: unknown): readonly PublicRepositoryCompatibilityBaseline[] {
    return sourceArray(value, PUBLIC_COMPATIBILITY_LIMITS.baselines).map((entry) => {
        const baseline = sourceRecord(entry);
        return {
            kind: exactIdentity(baseline.kind, assertIntegrationPackageKind),
            version: exactIdentity(baseline.version, assertIntegrationPackageVersion),
            packageDigest: digest(baseline.packageDigest),
        };
    });
}

function projectEvidence(value: unknown): PublicRepositoryCompatibilityEvidence {
    const evidence = sourceRecord(value);
    return {
        classification: enumValue(evidence.classification, CLASSIFICATIONS),
        surface: enumValue(evidence.surface, SURFACES),
        code: sourceText(evidence.code, PUBLIC_COMPATIBILITY_LIMITS.shortTextBytes),
        message: sourceText(evidence.message, PUBLIC_COMPATIBILITY_LIMITS.messageBytes),
    };
}

function exactIdentity(value: unknown, validate: (input: unknown) => string): string {
    try {
        return validate(value);
    } catch (error) {
        if (error instanceof IntegrationPackageValidationError) {
            throw invalidSource();
        }
        throw error;
    }
}

function digest(value: unknown): string {
    const text = sourceText(value, 64);
    if (!SHA256.test(text)) {
        throw invalidSource();
    }
    return text;
}

function enumValue(value: unknown, allowed: ReadonlySet<string>): string {
    const text = sourceText(value, PUBLIC_COMPATIBILITY_LIMITS.shortTextBytes);
    if (!allowed.has(text)) {
        throw invalidSource();
    }
    return text;
}

function optionalEnum(value: unknown, allowed: ReadonlySet<string>): string | undefined {
    const text = optionalSourceText(value, PUBLIC_COMPATIBILITY_LIMITS.shortTextBytes);
    if (text !== undefined && !allowed.has(text)) {
        throw invalidSource();
    }
    return text;
}
