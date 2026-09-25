export type ProviderInstallationValidationCode =
    | "invalid_installation"
    | "identity_mismatch"
    | "manifest_mismatch"
    | "body_limit_exceeded"
    | "duplicate_json_property"
    | "invalid_json"
    | "invalid_utf8"
    | "json_depth_limit_exceeded";

export class ProviderInstallationValidationError extends TypeError {
    readonly code: ProviderInstallationValidationCode;
    readonly path: string;

    constructor(code: ProviderInstallationValidationCode, message: string, path = "$") {
        super(`${path}: ${message}`);
        this.name = "ProviderInstallationValidationError";
        this.code = code;
        this.path = path;
    }
}
