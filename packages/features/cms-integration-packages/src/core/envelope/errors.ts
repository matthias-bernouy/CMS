export type IntegrationPackageValidationErrorCode =
    | "body_limit_exceeded"
    | "decoded_bytes_limit_exceeded"
    | "duplicate_json_property"
    | "file_limit_exceeded"
    | "invalid_base64"
    | "invalid_encoding"
    | "invalid_envelope"
    | "invalid_json"
    | "invalid_path"
    | "invalid_schema"
    | "invalid_unicode"
    | "invalid_utf8"
    | "invalid_version"
    | "json_depth_limit_exceeded"
    | "missing_file";

export class IntegrationPackageValidationError extends Error {
    readonly code: IntegrationPackageValidationErrorCode;
    readonly field?: string;

    constructor(code: IntegrationPackageValidationErrorCode, message: string, field?: string) {
        super(`Invalid integration package: ${message}`);
        this.name = "IntegrationPackageValidationError";
        this.code = code;
        this.field = field;
    }
}
