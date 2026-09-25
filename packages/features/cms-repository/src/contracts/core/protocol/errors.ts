export type ReleaseValidationCode =
    | "body_limit_exceeded"
    | "duplicate_json_property"
    | "invalid_binding"
    | "invalid_contract"
    | "invalid_json"
    | "invalid_schema"
    | "invalid_utf8"
    | "json_depth_limit_exceeded";

export class ReleaseValidationError extends TypeError {
    readonly code: ReleaseValidationCode;
    readonly path: string;

    constructor(code: ReleaseValidationCode, message: string, path = "$") {
        super(`${path}: ${message}`);
        this.name = "ReleaseValidationError";
        this.code = code;
        this.path = path;
    }
}
