import { isExactIntegrationVersion } from "@bernouy/cms-integrations";
import type {
    IntegrationCompatibilityBaselineReference,
    IntegrationCompatibilityEvaluationInput,
} from "../../../interfaces/compatibility";

const SHA256_DIGEST = /^[a-f0-9]{64}$/;

export function validateEvaluationPackage(
    packageState: IntegrationCompatibilityEvaluationInput["candidate"],
    label: string,
): void {
    if (!packageState.definition.version || !isExactIntegrationVersion(packageState.definition.version)) {
        throw new TypeError(`${label} definition must have an exact SemVer version`);
    }
    if (!SHA256_DIGEST.test(packageState.packageDigest)) {
        throw new TypeError(`${label} package digest must be a lowercase SHA-256 digest`);
    }
    for (const reviewed of packageState.reviewedSchemaBaselines ?? []) {
        if (reviewed.packageDigest !== packageState.packageDigest) {
            throw new TypeError(`${label} reviewed schema baseline must be bound to its package digest`);
        }
    }
    for (const evidence of packageState.schemaDeclarationEvidence ?? []) {
        if (evidence.packageDigest !== packageState.packageDigest) {
            throw new TypeError(`${label} schema declaration evidence must be bound to its package digest`);
        }
        assertCompatibilityText(evidence.evidenceId, `${label} schema evidence ID`);
        assertCompatibilityText(evidence.producer.name, `${label} schema evidence producer name`);
        assertCompatibilityText(evidence.producer.version, `${label} schema evidence producer version`);
        assertCompatibilityText(evidence.createdAt, `${label} schema evidence creation time`);
    }
}

export function validateCompatibilityBaselineIdentity(
    baseline: IntegrationCompatibilityEvaluationInput["candidate"],
    candidate: IntegrationCompatibilityEvaluationInput["candidate"],
): void {
    validateEvaluationPackage(baseline, "baseline");
    if (baseline.definition.kind !== candidate.definition.kind) {
        throw new TypeError("Compatibility baseline and candidate kinds must match");
    }
}

export function compatibilityBaselineReference(
    packageState: IntegrationCompatibilityEvaluationInput["candidate"],
): IntegrationCompatibilityBaselineReference {
    return {
        kind: packageState.definition.kind,
        version: packageState.definition.version!,
        packageDigest: packageState.packageDigest,
    };
}

export function normalizedChangedPaths(paths: readonly string[] | undefined): ReadonlySet<string> {
    return new Set((paths ?? []).map(normalizeChangedPath).sort());
}

export function assertCompatibilityText(value: string, label: string): void {
    if (!value.trim()) {
        throw new TypeError(`${label} must be a non-empty string`);
    }
}

function normalizeChangedPath(path: string): string {
    if (!path || path.includes("\\") || path.startsWith("/") || path.split("/").includes("..")) {
        throw new TypeError(`Changed package path "${path}" must be relative and normalized`);
    }
    return path.replace(/^\.\//, "").replaceAll(/\/{2,}/g, "/");
}
