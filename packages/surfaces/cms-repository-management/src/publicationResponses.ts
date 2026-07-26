import {
    IntegrationCompatibilityAdmissionError,
    IntegrationRegistryVerificationRequiredError,
    IntegrationRegistryVersionConflictError,
    IntegrationRegistryVersionOrderError,
    type IntegrationRegistryPublicationResult,
} from "@bernouy/cms-integration-registry";
import {
    IntegrationPackageUploadError,
    integrationPackageUploadErrorResponse,
} from "cms-repository-management/packageUploadError";

const JSON_HEADERS = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
};

export function publicationCreatedResponse(result: IntegrationRegistryPublicationResult): Response {
    return jsonResponse(201, {
        operationId: result.operationId,
        kind: result.kind,
        version: result.version,
        digest: result.digest,
        report: result.report,
    });
}

export function publicationErrorResponse(error: unknown, existingDigest?: string): Response {
    if (error instanceof IntegrationPackageUploadError) {
        return integrationPackageUploadErrorResponse(error);
    }
    if (error instanceof IntegrationRegistryVersionConflictError) {
        return jsonResponse(409, {
            error: "Integration version already exists",
            code: error.code,
            kind: error.kind,
            version: error.version,
            ...(existingDigest ? { existingDigest } : {}),
        });
    }
    if (error instanceof IntegrationRegistryVersionOrderError) {
        return jsonResponse(409, {
            error: "Integration version must be newer than latest",
            code: error.code,
            kind: error.kind,
            version: error.version,
            latest: error.latest,
        });
    }
    if (error instanceof IntegrationCompatibilityAdmissionError) {
        return jsonResponse(422, {
            error: "Integration compatibility admission was rejected",
            code: error.code,
            report: error.report,
        });
    }
    if (error instanceof IntegrationRegistryVerificationRequiredError) {
        return jsonResponse(422, {
            error: "Integration verification is required before publication",
            code: error.code,
            kind: error.kind,
            version: error.version,
            packageDigest: error.packageDigest,
        });
    }
    return jsonResponse(500, {
        error: "Repository management operation failed",
        code: "management_operation_failed",
    });
}

function jsonResponse(status: number, body: Readonly<Record<string, unknown>>): Response {
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
