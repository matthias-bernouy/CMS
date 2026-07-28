import {
    IntegrationRegistryVersionEligibilityConfirmationError,
    IntegrationRegistryVersionEligibilityConflictError,
    IntegrationRegistryVersionEligibilityIneligibleError,
    IntegrationRegistryVersionEligibilityNotFoundError,
    IntegrationRegistryVersionEligibilityStaleDecisionError,
    IntegrationRegistryVersionEligibilityValidationError,
    type IntegrationRegistryVersionBlockRequest,
    type IntegrationRegistryVersionEligibilityManager,
} from "@bernouy/cms-integration-registry";
import type { Runner } from "@bernouy/http-runner";
import {
    readRepositoryManagementJsonBody,
    RepositoryManagementJsonBodyError,
} from "cms-repository-management/operations/jsonBody";

export const REPOSITORY_VERSION_BLOCKS_PATH = "/api/integrations/version-blocks";

export type RepositoryVersionEligibilityRoutesConfig = Readonly<{
    manager: IntegrationRegistryVersionEligibilityManager;
    maxBodyBytes: number;
}>;

export function mountRepositoryVersionEligibilityRoutes(
    runner: Runner,
    config: RepositoryVersionEligibilityRoutesConfig,
): void {
    runner.post(REPOSITORY_VERSION_BLOCKS_PATH, async (request) => {
        try {
            const input = parseVersionBlockRequest(
                await readRepositoryManagementJsonBody(request, config.maxBodyBytes),
            );
            const result = await config.manager.blockVersion(input);
            return jsonResponse(201, { operationId: result.operationId, record: result.record });
        } catch (error) {
            return versionEligibilityErrorResponse(error);
        }
    });
}

function parseVersionBlockRequest(value: unknown): IntegrationRegistryVersionBlockRequest {
    if (
        !isRecord(value) ||
        !hasExactKeys(value, ["actor", "confirmation", "currentDecision", "kind", "reason", "version"]) ||
        !isRecord(value.currentDecision) ||
        !hasExactKeys(value.currentDecision, ["digest", "revisionId"]) ||
        !isRecord(value.confirmation) ||
        !hasExactKeys(value.confirmation, ["action", "decisionDigest", "decisionRevisionId", "kind", "version"])
    ) {
        throw new IntegrationRegistryVersionEligibilityValidationError("Version block request is invalid");
    }
    const kind = requiredString(value.kind);
    const version = requiredString(value.version);
    const currentDecision = {
        revisionId: requiredString(value.currentDecision.revisionId),
        digest: requiredString(value.currentDecision.digest),
    };
    const confirmation = {
        action: value.confirmation.action === "block" ? ("block" as const) : invalidConfirmation(),
        kind: requiredString(value.confirmation.kind),
        version: requiredString(value.confirmation.version),
        decisionRevisionId: requiredString(value.confirmation.decisionRevisionId),
        decisionDigest: requiredString(value.confirmation.decisionDigest),
    };
    if (
        confirmation.kind !== kind ||
        confirmation.version !== version ||
        confirmation.decisionRevisionId !== currentDecision.revisionId ||
        confirmation.decisionDigest !== currentDecision.digest
    ) {
        throw new IntegrationRegistryVersionEligibilityConfirmationError();
    }
    return {
        kind,
        version,
        currentDecision,
        actor: requiredString(value.actor),
        reason: requiredString(value.reason),
        confirmation,
    };
}

function versionEligibilityErrorResponse(error: unknown): Response {
    if (error instanceof RepositoryManagementJsonBodyError) {
        return jsonResponse(error.status, {
            code: error.status === 413 ? "management_request_too_large" : "management_request_invalid",
            error: error.message,
        });
    }
    if (error instanceof IntegrationRegistryVersionEligibilityNotFoundError) {
        return jsonResponse(error.status, { code: error.code, error: "Integration version was not found" });
    }
    if (error instanceof IntegrationRegistryVersionEligibilityStaleDecisionError) {
        return jsonResponse(error.status, { code: error.code, error: "Release decision is stale" });
    }
    if (error instanceof IntegrationRegistryVersionEligibilityConflictError) {
        return jsonResponse(error.status, { code: error.code, error: "Integration version is already blocked" });
    }
    if (error instanceof IntegrationRegistryVersionEligibilityIneligibleError) {
        return jsonResponse(error.status, { code: error.code, error: "Version eligibility mutation is not allowed" });
    }
    if (
        error instanceof IntegrationRegistryVersionEligibilityConfirmationError ||
        error instanceof IntegrationRegistryVersionEligibilityValidationError
    ) {
        return jsonResponse(error.status, { code: error.code, error: error.message });
    }
    return jsonResponse(500, { code: "management_operation_failed", error: "Repository management operation failed" });
}

function invalidConfirmation(): never {
    throw new IntegrationRegistryVersionEligibilityConfirmationError();
}

function requiredString(value: unknown): string {
    if (typeof value !== "string") {
        throw new IntegrationRegistryVersionEligibilityValidationError("Version block request is invalid");
    }
    return value;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function jsonResponse(status: number, body: Readonly<Record<string, unknown>>): Response {
    return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
