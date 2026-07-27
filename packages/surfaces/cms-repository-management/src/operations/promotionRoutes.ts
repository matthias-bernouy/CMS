import {
    IntegrationRegistryStablePromotionConfirmationError,
    IntegrationRegistryStablePromotionConflictError,
    IntegrationRegistryStablePromotionIneligibleError,
    IntegrationRegistryStablePromotionNotFoundError,
    IntegrationRegistryStablePromotionStaleReportError,
    IntegrationRegistryStablePromotionValidationError,
    type IntegrationRegistryStablePromoter,
    type IntegrationRegistryStablePromotionRequest,
} from "@bernouy/cms-integration-registry";
import type { Runner } from "@bernouy/http-runner";
import {
    readRepositoryManagementJsonBody,
    RepositoryManagementJsonBodyError,
} from "cms-repository-management/operations/jsonBody";

export const REPOSITORY_STABLE_PROMOTIONS_PATH = "/api/integrations/stable-promotions";

export type RepositoryStablePromotionRoutesConfig = Readonly<{
    promoter: IntegrationRegistryStablePromoter;
    maxBodyBytes: number;
}>;

export function mountRepositoryStablePromotionRoutes(
    runner: Runner,
    config: RepositoryStablePromotionRoutesConfig,
): void {
    runner.post(REPOSITORY_STABLE_PROMOTIONS_PATH, async (request) => {
        try {
            const input = parsePromotionRequest(await readRepositoryManagementJsonBody(request, config.maxBodyBytes));
            const result = await config.promoter.promoteStable(input);
            return jsonResponse(201, {
                operationId: result.operationId,
                record: result.record,
            });
        } catch (error) {
            return promotionErrorResponse(error);
        }
    });
}

function parsePromotionRequest(value: unknown): IntegrationRegistryStablePromotionRequest {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(value, ["kind", "version", "currentReportRevisionId", "actor", "confirmation", "reason"])
    ) {
        throw new IntegrationRegistryStablePromotionValidationError("Stable promotion request is invalid");
    }
    if (!isRecord(value.confirmation) || !hasOnlyKeys(value.confirmation, ["version", "reportRevisionId"])) {
        throw new IntegrationRegistryStablePromotionConfirmationError();
    }
    if (
        value.confirmation.version !== value.version ||
        value.confirmation.reportRevisionId !== value.currentReportRevisionId
    ) {
        throw new IntegrationRegistryStablePromotionConfirmationError();
    }
    return {
        kind: requiredString(value.kind),
        version: requiredString(value.version),
        currentReportRevisionId: requiredString(value.currentReportRevisionId),
        actor: requiredString(value.actor),
        confirmation: {
            version: requiredString(value.confirmation.version),
            reportRevisionId: requiredString(value.confirmation.reportRevisionId),
        },
        ...(value.reason === undefined ? {} : { reason: requiredString(value.reason) }),
    };
}

function promotionErrorResponse(error: unknown): Response {
    if (error instanceof RepositoryManagementJsonBodyError) {
        return jsonResponse(error.status, {
            code: error.status === 413 ? "management_request_too_large" : "management_request_invalid",
            error: error.message,
        });
    }
    if (error instanceof IntegrationRegistryStablePromotionNotFoundError) {
        return jsonResponse(error.status, { code: error.code, error: "Integration version was not found" });
    }
    if (error instanceof IntegrationRegistryStablePromotionStaleReportError) {
        return jsonResponse(error.status, {
            code: error.code,
            error: "Release admission decision is stale",
            currentReportRevisionId: error.currentReportRevisionId,
        });
    }
    if (error instanceof IntegrationRegistryStablePromotionConflictError) {
        return jsonResponse(error.status, { code: error.code, error: "Integration version is already stable" });
    }
    if (error instanceof IntegrationRegistryStablePromotionIneligibleError) {
        return jsonResponse(error.status, {
            code: error.code,
            error: "Integration version is not eligible for stable promotion",
            reportRevisionId: error.reportRevisionId,
        });
    }
    if (
        error instanceof IntegrationRegistryStablePromotionConfirmationError ||
        error instanceof IntegrationRegistryStablePromotionValidationError
    ) {
        return jsonResponse(error.status, { code: error.code, error: error.message });
    }
    return jsonResponse(500, { code: "management_operation_failed", error: "Repository management operation failed" });
}

function requiredString(value: unknown): string {
    if (typeof value !== "string") {
        throw new IntegrationRegistryStablePromotionValidationError("Stable promotion request is invalid");
    }
    return value;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
    return Object.keys(value).every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function jsonResponse(status: number, body: Readonly<Record<string, unknown>>): Response {
    return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
