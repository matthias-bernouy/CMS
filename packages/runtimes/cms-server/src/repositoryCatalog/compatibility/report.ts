import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import { IntegrationRepositoryContractError } from "@bernouy/cms-integrations";
import type {
    RepositoryCompatibilityBaselineSource,
    RepositoryCompatibilityEvidenceSource,
    RepositoryCompatibilityReportSource,
} from "@bernouy/cms-repository";

const SHA256 = /^[a-f0-9]{64}$/u;
const OUTCOMES = new Set(["compatible", "breaking", "unknown", "invalid", "not-applicable"]);
const CLASSIFICATIONS = new Set(["compatible", "additive", "breaking", "unknown", "invalid"]);
const SURFACES = new Set(["definition", "input", "dependency", "artifact", "schema", "function"]);
const RELEASE_LEVELS = new Set(["initial", "major", "minor", "patch"]);
const REQUIRED_RELEASE_LEVELS = new Set(["none", "major", "minor", "patch"]);
const NO_BASELINE_REASONS = new Set(["new-kind", "new-major"]);
const encoder = new TextEncoder();

export function parseCompatibilityReport(
    value: unknown,
    kind: string,
    version: string,
): RepositoryCompatibilityReportSource {
    const source = record(value);
    const revision = source.reportType === "revision";
    const required = [
        "admissible",
        "baselines",
        "createdAt",
        "evaluator",
        "evidence",
        "id",
        "informationalBaselines",
        "kind",
        "outcome",
        "packageDigest",
        "releaseLevel",
        "reportType",
        "requiredReleaseLevel",
        "version",
        ...(revision ? ["provenance", "supersedes"] : []),
    ];
    if (!hasAllowedKeys(source, required, ["noBaselineReason"]) || (!revision && source.reportType !== "admission")) {
        throw invalid();
    }
    const identity = exactIdentity(source.kind, source.version);
    if (identity.kind !== kind || identity.version !== version) {
        throw invalid();
    }
    const evaluator = record(source.evaluator);
    exactKeys(evaluator, ["name", "version"]);
    const common = {
        id: text(source.id, 256),
        reportType: source.reportType as "admission" | "revision",
        kind,
        version,
        packageDigest: digest(source.packageDigest),
        evaluator: { name: text(evaluator.name, 1_024), version: text(evaluator.version, 1_024) },
        createdAt: timestamp(source.createdAt),
        baselines: array(source.baselines, 16).map(parseBaseline),
        informationalBaselines: array(source.informationalBaselines, 16).map(parseBaseline),
        evidence: array(source.evidence, 256).map(parseEvidence),
        outcome: enumText(source.outcome, OUTCOMES),
        requiredReleaseLevel: enumText(source.requiredReleaseLevel, REQUIRED_RELEASE_LEVELS),
        releaseLevel: enumText(source.releaseLevel, RELEASE_LEVELS),
        admissible: boolean(source.admissible),
        ...(source.noBaselineReason === undefined
            ? {}
            : { noBaselineReason: enumText(source.noBaselineReason, NO_BASELINE_REASONS) }),
    };
    if (!revision) {
        return common as RepositoryCompatibilityReportSource;
    }
    const provenance = record(source.provenance);
    if (!hasAllowedKeys(provenance, ["reason"], ["evidenceIds"])) {
        throw invalid();
    }
    return {
        ...common,
        reportType: "revision",
        supersedes: text(source.supersedes, 256),
        provenance: {
            reason: text(provenance.reason, 8_192),
            ...(provenance.evidenceIds === undefined
                ? {}
                : { evidenceIds: array(provenance.evidenceIds, 256).map((entry) => text(entry, 256)) }),
        },
    };
}

function parseBaseline(value: unknown): RepositoryCompatibilityBaselineSource {
    const source = record(value);
    exactKeys(source, ["kind", "packageDigest", "version"]);
    const identity = exactIdentity(source.kind, source.version);
    return { ...identity, packageDigest: digest(source.packageDigest) };
}

function parseEvidence(value: unknown): RepositoryCompatibilityEvidenceSource {
    const source = record(value);
    exactKeys(source, ["classification", "code", "message", "surface"]);
    return {
        classification: enumText(source.classification, CLASSIFICATIONS),
        surface: enumText(source.surface, SURFACES),
        code: text(source.code, 1_024),
        message: text(source.message, 8_192),
    };
}

function exactIdentity(kind: unknown, version: unknown): { kind: string; version: string } {
    try {
        return { kind: assertIntegrationPackageKind(kind), version: assertIntegrationPackageVersion(version) };
    } catch {
        throw invalid();
    }
}

export function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw invalid();
    }
    return value as Record<string, unknown>;
}

export function array(value: unknown, maxItems: number): readonly unknown[] {
    if (!Array.isArray(value) || value.length > maxItems) {
        throw invalid();
    }
    return value;
}

export function text(value: unknown, maxBytes: number): string {
    if (typeof value !== "string" || value.length === 0 || encoder.encode(value).byteLength > maxBytes) {
        throw invalid();
    }
    return value;
}

export function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
    if (!hasAllowedKeys(value, keys, [])) {
        throw invalid();
    }
}

function hasAllowedKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[]) {
    const keys = Object.keys(value);
    return (
        required.every((key) => keys.includes(key)) &&
        keys.every((key) => required.includes(key) || optional.includes(key))
    );
}

function digest(value: unknown): string {
    const result = text(value, 64);
    if (!SHA256.test(result)) {
        throw invalid();
    }
    return result;
}

function timestamp(value: unknown): string {
    const result = text(value, 1_024);
    if (!Number.isFinite(Date.parse(result))) {
        throw invalid();
    }
    return result;
}

function enumText(value: unknown, allowed: ReadonlySet<string>): string {
    const result = text(value, 1_024);
    if (!allowed.has(result)) {
        throw invalid();
    }
    return result;
}

function boolean(value: unknown): boolean {
    if (typeof value !== "boolean") {
        throw invalid();
    }
    return value;
}

function invalid(): IntegrationRepositoryContractError {
    return new IntegrationRepositoryContractError();
}
