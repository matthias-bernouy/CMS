import {
    IntegrationCompatibilityReevaluationConflictError,
    IntegrationCompatibilityReevaluationIntegrityError,
    IntegrationCompatibilityReevaluationNotFoundError,
    IntegrationCompatibilityReevaluationStaleDecisionError,
    IntegrationCompatibilityReevaluationStaleReportError,
    IntegrationCompatibilityReevaluationValidationError,
    type IntegrationCompatibilityReevaluationRequest,
    type IntegrationCompatibilityReevaluator,
} from "@bernouy/cms-integration-registry";
import type { Runner } from "@bernouy/http-runner";
import {
    readRepositoryManagementJsonBody,
    RepositoryManagementJsonBodyError,
} from "cms-repository-management/operations/jsonBody";

export const REPOSITORY_COMPATIBILITY_REEVALUATIONS_PATH = "/api/integrations/compatibility/reevaluations";

export type RepositoryCompatibilityReevaluationRoutesConfig = Readonly<{
    reevaluator: IntegrationCompatibilityReevaluator;
    maxBodyBytes: number;
}>;

export function mountRepositoryCompatibilityReevaluationRoutes(
    runner: Runner,
    config: RepositoryCompatibilityReevaluationRoutesConfig,
): void {
    runner.post(REPOSITORY_COMPATIBILITY_REEVALUATIONS_PATH, async (request) => {
        try {
            const input = parseReevaluationRequest(
                await readRepositoryManagementJsonBody(request, config.maxBodyBytes),
            );
            const result = await config.reevaluator.reevaluate(input);
            return jsonResponse(201, {
                revision: result.revision,
                currentReportRevisionId: result.history.current.id,
                ...(result.release ? { release: result.release } : {}),
            });
        } catch (error) {
            return reevaluationErrorResponse(error);
        }
    });
}

function parseReevaluationRequest(value: unknown): IntegrationCompatibilityReevaluationRequest {
    const required = ["actor", "currentDecision", "currentReportRevisionId", "kind", "reason", "version"];
    const optional = ["evidenceIds"];
    if (!isRecord(value) || !hasAllowedKeys(value, required, optional)) {
        throw invalidRequest();
    }
    return {
        kind: requiredString(value.kind),
        version: requiredString(value.version),
        currentReportRevisionId: requiredString(value.currentReportRevisionId),
        currentDecision: decisionReference(value.currentDecision),
        actor: requiredString(value.actor),
        reason: requiredString(value.reason),
        ...(value.evidenceIds === undefined ? {} : { evidenceIds: stringArray(value.evidenceIds) }),
    };
}

function reevaluationErrorResponse(error: unknown): Response {
    if (error instanceof RepositoryManagementJsonBodyError) {
        return jsonResponse(error.status, {
            code: error.status === 413 ? "management_request_too_large" : "management_request_invalid",
            error: error.message,
        });
    }
    if (error instanceof IntegrationCompatibilityReevaluationNotFoundError) {
        return jsonResponse(error.status, {
            code: error.code,
            error: "Integration compatibility history was not found",
        });
    }
    if (error instanceof IntegrationCompatibilityReevaluationStaleReportError) {
        return jsonResponse(error.status, {
            code: error.code,
            error: "Compatibility report revision is stale",
            currentReportRevisionId: error.currentReportRevisionId,
        });
    }
    if (error instanceof IntegrationCompatibilityReevaluationStaleDecisionError) {
        return jsonResponse(error.status, {
            code: error.code,
            error: "Release admission decision is stale",
            currentDecision: {
                revisionId: error.currentDecisionRevisionId,
                digest: error.currentDecisionDigest,
            },
        });
    }
    if (
        error instanceof IntegrationCompatibilityReevaluationConflictError ||
        error instanceof IntegrationCompatibilityReevaluationIntegrityError
    ) {
        return jsonResponse(error.status, {
            code: error.code,
            error: "Compatibility reevaluation conflicts with immutable report history",
        });
    }
    if (error instanceof IntegrationCompatibilityReevaluationValidationError) {
        return jsonResponse(error.status, {
            code: error.code,
            error: "Compatibility reevaluation request is invalid",
        });
    }
    return jsonResponse(500, {
        code: "management_operation_failed",
        error: "Repository management operation failed",
    });
}

function decisionReference(value: unknown): Readonly<{ revisionId: string; digest: string }> {
    if (!isRecord(value) || !hasAllowedKeys(value, ["digest", "revisionId"], [])) {
        throw invalidRequest();
    }
    const digest = requiredString(value.digest);
    if (!/^[a-f0-9]{64}$/u.test(digest)) {
        throw invalidRequest();
    }
    return { revisionId: requiredString(value.revisionId), digest };
}

function requiredString(value: unknown): string {
    if (typeof value !== "string") {
        throw invalidRequest();
    }
    return value;
}

function stringArray(value: unknown): readonly string[] {
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
        throw invalidRequest();
    }
    return value;
}

function invalidRequest(): IntegrationCompatibilityReevaluationValidationError {
    return new IntegrationCompatibilityReevaluationValidationError("Compatibility reevaluation request is invalid");
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

function jsonResponse(status: number, body: Readonly<Record<string, unknown>>): Response {
    return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
