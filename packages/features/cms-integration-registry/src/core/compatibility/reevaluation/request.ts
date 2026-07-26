import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type { IntegrationCompatibilityReevaluationRequest } from "../../../interfaces/reevaluation";
import { IntegrationCompatibilityReevaluationValidationError } from "./errors";

const REQUIRED_KEYS = ["actor", "currentReportRevisionId", "kind", "reason", "version"];
const OPTIONAL_KEYS = ["evidenceIds"];
const MAX_EVIDENCE_IDS = 128;

export function validateCompatibilityReevaluationRequest(
    request: IntegrationCompatibilityReevaluationRequest,
): IntegrationCompatibilityReevaluationRequest {
    if (!isRecord(request) || !hasAllowedKeys(request, REQUIRED_KEYS, OPTIONAL_KEYS)) {
        throw new IntegrationCompatibilityReevaluationValidationError(
            "Compatibility reevaluation request has an invalid shape",
        );
    }
    try {
        assertIntegrationPackageKind(request.kind);
        assertIntegrationPackageVersion(request.version);
    } catch (error) {
        throw new IntegrationCompatibilityReevaluationValidationError(
            "Compatibility reevaluation kind or version is invalid",
            { cause: error },
        );
    }
    assertBoundedText(request.currentReportRevisionId, "report revision ID", 512);
    assertBoundedText(request.actor, "actor", 512);
    assertBoundedText(request.reason, "reason", 4_096);
    const evidenceIds = validateEvidenceIds(request.evidenceIds);
    return Object.freeze({
        kind: request.kind,
        version: request.version,
        currentReportRevisionId: request.currentReportRevisionId,
        actor: request.actor,
        reason: request.reason,
        ...(evidenceIds ? { evidenceIds } : {}),
    });
}

function validateEvidenceIds(value: unknown): readonly string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value) || value.length > MAX_EVIDENCE_IDS) {
        throw new IntegrationCompatibilityReevaluationValidationError(
            `Compatibility reevaluation evidence IDs must be an array of at most ${MAX_EVIDENCE_IDS} entries`,
        );
    }
    const ids = value.map((entry) => {
        assertBoundedText(entry, "evidence ID", 512);
        return entry;
    });
    if (new Set(ids).size !== ids.length) {
        throw new IntegrationCompatibilityReevaluationValidationError(
            "Compatibility reevaluation evidence IDs must be unique",
        );
    }
    return Object.freeze([...ids].sort());
}

function assertBoundedText(value: unknown, label: string, maxLength: number): asserts value is string {
    if (typeof value !== "string" || value.length === 0 || value.length > maxLength || value.trim() !== value) {
        throw new IntegrationCompatibilityReevaluationValidationError(
            `Compatibility reevaluation ${label} must be canonical non-empty text of at most ${maxLength} characters`,
        );
    }
}

function hasAllowedKeys(
    value: Record<string, unknown>,
    required: readonly string[],
    optional: readonly string[],
): boolean {
    const keys = Object.keys(value);
    return (
        required.every((key) => keys.includes(key)) &&
        keys.every((key) => required.includes(key) || optional.includes(key))
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
