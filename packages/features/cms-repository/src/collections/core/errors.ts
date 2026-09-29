import { ReleaseValidationError } from "cms-repository/exports/contracts/index";

export type CollectionValidationCode =
    | "invalid_collection"
    | "body_limit_exceeded"
    | "json_depth_limit_exceeded"
    | "duplicate_json_property"
    | "invalid_json"
    | "invalid_utf8"
    | "resolution_failed"
    | "asset_mismatch";

export class CollectionValidationError extends TypeError {
    constructor(
        readonly code: CollectionValidationCode,
        message: string,
        readonly path = "$",
    ) {
        super(`${path}: ${message}`);
        this.name = "CollectionValidationError";
    }
}

export function invalid(message: string, path: string): never {
    throw new CollectionValidationError("invalid_collection", message, path);
}

export function translateCollectionError(error: unknown, root?: string): never {
    if (error instanceof ReleaseValidationError) {
        const preserved: readonly string[] = [
            "body_limit_exceeded",
            "json_depth_limit_exceeded",
            "duplicate_json_property",
            "invalid_json",
            "invalid_utf8",
        ];
        throw new CollectionValidationError(
            preserved.includes(error.code) ? (error.code as CollectionValidationCode) : "invalid_collection",
            error.message.startsWith(`${error.path}: `) ? error.message.slice(error.path.length + 2) : error.message,
            root === undefined ? error.path : `${root}${error.path.slice(1)}`,
        );
    }
    throw error;
}
