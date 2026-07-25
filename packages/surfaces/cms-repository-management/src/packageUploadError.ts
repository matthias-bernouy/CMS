import {
    managementPackageUploadInvalid,
    managementPackageUploadTooLarge,
} from "cms-repository-management/managementResponses";

export type IntegrationPackageUploadErrorCode =
    | "management_package_upload_invalid"
    | "management_package_upload_too_large";

export class IntegrationPackageUploadError extends Error {
    readonly code: IntegrationPackageUploadErrorCode;
    readonly status: 400 | 413;

    constructor(code: IntegrationPackageUploadErrorCode) {
        const tooLarge = code === "management_package_upload_too_large";
        super(tooLarge ? "Integration package upload is too large" : "Integration package upload is invalid");
        this.name = "IntegrationPackageUploadError";
        this.code = code;
        this.status = tooLarge ? 413 : 400;
    }
}

export function integrationPackageUploadErrorResponse(error: unknown): Response {
    if (!(error instanceof IntegrationPackageUploadError)) {
        throw error;
    }
    return error.status === 413 ? managementPackageUploadTooLarge() : managementPackageUploadInvalid();
}

export function uploadInvalid(): IntegrationPackageUploadError {
    return new IntegrationPackageUploadError("management_package_upload_invalid");
}

export function uploadTooLarge(): IntegrationPackageUploadError {
    return new IntegrationPackageUploadError("management_package_upload_too_large");
}
