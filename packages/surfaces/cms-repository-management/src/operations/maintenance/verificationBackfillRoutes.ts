import {
    identifyIntegrationVerificationBackfillRequest,
    IntegrationVerificationBackfillError,
    type IntegrationVerificationBackfiller,
} from "@bernouy/cms-integration-registry";
import type { Runner } from "@bernouy/http-runner";
import {
    readRepositoryManagementJsonDocument,
    RepositoryManagementJsonBodyError,
} from "cms-repository-management/operations/jsonBody";

export const REPOSITORY_VERIFICATION_BACKFILL_PATH = "/api/integrations/verification-backfills";

export type RepositoryVerificationBackfillRoutesConfig = Readonly<{
    backfiller: IntegrationVerificationBackfiller;
    maxBodyBytes: number;
}>;

export function mountRepositoryVerificationBackfillRoutes(
    runner: Runner,
    config: RepositoryVerificationBackfillRoutesConfig,
): void {
    runner.post(REPOSITORY_VERIFICATION_BACKFILL_PATH, async (request) => {
        try {
            const document = await readRepositoryManagementJsonDocument(request, config.maxBodyBytes);
            const identified = await identifyIntegrationVerificationBackfillRequest(document.value);
            if (!equalBytes(document.bytes, identified.canonicalBytes)) {
                return errorResponse(400, "verification_backfill_invalid");
            }
            const result = await config.backfiller.backfill(identified.request);
            return Response.json(result, {
                status: result.outcome === "backfilled" ? 201 : 200,
                headers: { "cache-control": "no-store" },
            });
        } catch (error) {
            return mapError(error);
        }
    });
}

function mapError(error: unknown): Response {
    if (error instanceof RepositoryManagementJsonBodyError) {
        return errorResponse(
            error.status,
            error.status === 413 ? "verification_backfill_too_large" : "verification_backfill_invalid",
        );
    }
    if (error instanceof IntegrationVerificationBackfillError) {
        return errorResponse(error.status, error.code);
    }
    return errorResponse(500, "verification_backfill_failed");
}

function errorResponse(status: number, code: string): Response {
    const messages: Readonly<Record<string, string>> = {
        verification_backfill_invalid: "Integration verification backfill request is invalid",
        verification_backfill_too_large: "Integration verification backfill request is too large",
        verification_backfill_not_found: "Integration verification backfill target was not found",
        verification_backfill_unapproved: "Integration verification backfill request is not approved",
        verification_backfill_conflict: "Integration verification backfill conflicts with immutable evidence",
        verification_backfill_partial: "Integration verification backfill has partial unjournalled state",
        verification_backfill_recovery_required: "Integration verification backfill requires recovery",
        verification_backfill_failed: "Integration verification backfill failed",
    };
    return Response.json(
        { error: messages[code] ?? "Integration verification backfill failed", code },
        { status, headers: { "cache-control": "no-store" } },
    );
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
