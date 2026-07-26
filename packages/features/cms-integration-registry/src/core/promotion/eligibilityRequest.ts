import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type {
    IntegrationRegistryVersionBlockRequest,
    IntegrationRegistryVersionInadmissibleRequest,
} from "../../interfaces/promotion";
import {
    IntegrationRegistryVersionEligibilityConfirmationError,
    IntegrationRegistryVersionEligibilityValidationError,
} from "./eligibilityErrors";

export function validateVersionBlockRequest(
    request: IntegrationRegistryVersionBlockRequest,
): IntegrationRegistryVersionBlockRequest {
    validateCommon(request);
    const expected = request.confirmation;
    if (
        !hasExactKeys(expected, ["action", "decisionDigest", "decisionRevisionId", "kind", "version"]) ||
        expected.action !== "block" ||
        expected.kind !== request.kind ||
        expected.version !== request.version ||
        expected.decisionRevisionId !== request.currentDecision.revisionId ||
        expected.decisionDigest !== request.currentDecision.digest
    ) {
        throw new IntegrationRegistryVersionEligibilityConfirmationError();
    }
    return Object.freeze({
        ...request,
        currentDecision: Object.freeze({ ...request.currentDecision }),
        confirmation: Object.freeze({ ...request.confirmation }),
    });
}

export function validateVersionInadmissibleRequest(
    request: IntegrationRegistryVersionInadmissibleRequest,
): IntegrationRegistryVersionInadmissibleRequest {
    validateCommon(request);
    return Object.freeze({ ...request, currentDecision: Object.freeze({ ...request.currentDecision }) });
}

function validateCommon(request: IntegrationRegistryVersionInadmissibleRequest): void {
    try {
        assertIntegrationPackageKind(request.kind);
        assertIntegrationPackageVersion(request.version);
    } catch (error) {
        throw new IntegrationRegistryVersionEligibilityValidationError(
            "Version eligibility kind or version is invalid",
            {
                cause: error,
            },
        );
    }
    if (!hasExactKeys(request.currentDecision, ["digest", "revisionId"])) {
        throw new IntegrationRegistryVersionEligibilityValidationError(
            "Current decision reference must have exact fields",
        );
    }
    assertBoundedText(request.currentDecision.revisionId, "decision revision ID", 512);
    if (!/^[a-f0-9]{64}$/u.test(request.currentDecision.digest)) {
        throw new IntegrationRegistryVersionEligibilityValidationError("Decision digest must be a lowercase SHA-256");
    }
    assertBoundedText(request.actor, "actor", 512);
    assertBoundedText(request.reason, "reason", 4_096);
}

function assertBoundedText(value: unknown, label: string, maxLength: number): asserts value is string {
    if (typeof value !== "string" || value.length === 0 || value.length > maxLength || value.trim() !== value) {
        throw new IntegrationRegistryVersionEligibilityValidationError(
            `Version eligibility ${label} must be canonical non-empty text of at most ${maxLength} characters`,
        );
    }
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => keys.includes(key));
}
