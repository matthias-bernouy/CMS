import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryStablePromotionRequest } from "../../interfaces/promotion";
import {
    IntegrationRegistryStablePromotionConfirmationError,
    IntegrationRegistryStablePromotionValidationError,
} from "./errors";

export function validateStablePromotionRequest(
    request: IntegrationRegistryStablePromotionRequest,
): IntegrationRegistryStablePromotionRequest {
    if (
        !isRecord(request.confirmation) ||
        !hasExactKeys(request.confirmation, ["reportRevisionId", "version"]) ||
        request.confirmation.version !== request.version ||
        request.confirmation.reportRevisionId !== request.currentReportRevisionId
    ) {
        throw new IntegrationRegistryStablePromotionConfirmationError();
    }
    try {
        assertIntegrationPackageKind(request.kind);
        assertIntegrationPackageVersion(request.version);
    } catch (error) {
        throw new IntegrationRegistryStablePromotionValidationError("Stable promotion kind or version is invalid", {
            cause: error,
        });
    }
    assertBoundedText(request.currentReportRevisionId, "report revision ID", 512);
    assertBoundedText(request.actor, "actor", 512);
    if (request.reason !== undefined) {
        assertBoundedText(request.reason, "reason", 4_096);
    }
    return Object.freeze({ ...request, confirmation: Object.freeze({ ...request.confirmation }) });
}

function assertBoundedText(value: unknown, label: string, maxLength: number): asserts value is string {
    if (typeof value !== "string" || value.length === 0 || value.length > maxLength || value.trim() !== value) {
        throw new IntegrationRegistryStablePromotionValidationError(
            `Stable promotion ${label} must be canonical non-empty text of at most ${maxLength} characters`,
        );
    }
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
