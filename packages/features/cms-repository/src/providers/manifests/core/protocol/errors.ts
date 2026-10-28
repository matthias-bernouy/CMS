export type ProviderManifestValidationCode =
    | "body_limit_exceeded"
    | "duplicate_json_property"
    | "invalid_json"
    | "invalid_manifest"
    | "invalid_schema"
    | "invalid_utf8"
    | "json_depth_limit_exceeded"
    | "resolution_failed";

export class ProviderManifestValidationError extends TypeError {
    readonly code: ProviderManifestValidationCode;
    readonly path: string;

    constructor(code: ProviderManifestValidationCode, message: string, path = "$") {
        super(`${path}: ${message}`);
        this.name = "ProviderManifestValidationError";
        this.code = code;
        this.path = path;
    }
}
