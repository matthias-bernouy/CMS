import {
    identifyReviewedSchemaBaselineImportRequest,
    ReviewedSchemaBaselineImportError,
    type ReviewedSchemaBaselineImporter,
} from "@bernouy/cms-integration-registry";
import type { Runner } from "@bernouy/http-runner";
import {
    readRepositoryManagementJsonDocument,
    RepositoryManagementJsonBodyError,
} from "cms-repository-management/operations/jsonBody";

export const REPOSITORY_SCHEMA_BASELINE_IMPORT_PATH = "/api/integrations/schema-baselines";

export type RepositorySchemaBaselineImportRoutesConfig = Readonly<{
    importer: ReviewedSchemaBaselineImporter;
    maxBodyBytes: number;
}>;

export function mountRepositorySchemaBaselineImportRoutes(
    runner: Runner,
    config: RepositorySchemaBaselineImportRoutesConfig,
): void {
    runner.post(REPOSITORY_SCHEMA_BASELINE_IMPORT_PATH, async (request) => {
        try {
            const document = await readRepositoryManagementJsonDocument(request, config.maxBodyBytes);
            let identified;
            try {
                identified = await identifyReviewedSchemaBaselineImportRequest(document.value);
            } catch {
                return importErrorResponse(400, "reviewed_schema_baseline_import_invalid");
            }
            if (!equalBytes(document.bytes, identified.canonicalBytes)) {
                return importErrorResponse(400, "reviewed_schema_baseline_import_invalid");
            }
            const result = await config.importer.importBaseline(identified.request);
            return Response.json(result, {
                status: result.outcome === "imported" ? 201 : 200,
                headers: { "cache-control": "no-store" },
            });
        } catch (error) {
            return mapImportError(error);
        }
    });
}

function mapImportError(error: unknown): Response {
    if (error instanceof RepositoryManagementJsonBodyError) {
        return importErrorResponse(
            error.status,
            error.status === 413
                ? "reviewed_schema_baseline_import_too_large"
                : "reviewed_schema_baseline_import_invalid",
        );
    }
    if (error instanceof ReviewedSchemaBaselineImportError) {
        return importErrorResponse(error.status, error.code);
    }
    return importErrorResponse(500, "reviewed_schema_baseline_import_failed");
}

function importErrorResponse(status: number, code: string): Response {
    const messages: Readonly<Record<string, string>> = {
        reviewed_schema_baseline_import_invalid: "Reviewed schema baseline import request is invalid",
        reviewed_schema_baseline_import_too_large: "Reviewed schema baseline import request is too large",
        reviewed_schema_baseline_import_not_found: "Reviewed schema baseline package was not found",
        reviewed_schema_baseline_import_conflict: "Reviewed schema baseline import conflicts with current state",
        reviewed_schema_baseline_import_unapproved: "Reviewed schema baseline import is not approved",
        reviewed_schema_baseline_import_recovery_required: "Reviewed schema baseline import requires recovery",
        reviewed_schema_baseline_import_failed: "Reviewed schema baseline import failed",
    };
    return Response.json(
        { error: messages[code] ?? "Reviewed schema baseline import failed", code },
        { status, headers: { "cache-control": "no-store" } },
    );
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
