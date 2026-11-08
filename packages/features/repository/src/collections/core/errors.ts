import { ReleaseValidationError } from "@bernouy/ulvia-contracts";

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

export const COLLECTION_PUBLICATION_ISSUES = {
    immutable_conflict:
        "This exact collection version already has different content. Publish a new version; immutable releases cannot be replaced.",
    identity_changed:
        "Collection publication lineage cannot change identity or publisher. Publish under the correct identity.",
    version_order: "Collection publication version must increase within its release target. Choose a newer version.",
    stable_resource:
        "Incompatible stable resource requires a new resource identity. Retain the stable resource contract or introduce a new ID.",
    major_required: "Resource removals and incompatible collection configuration require a major publication.",
    minor_required:
        "Patch collection publications may change implementations only. Publish a minor version for interface additions.",
} as const;
export type CollectionPublicationCode = keyof typeof COLLECTION_PUBLICATION_ISSUES;
export type CollectionPublicationResource = Readonly<{
    kind: "bloc" | "theme-token" | "configuration" | "text" | "asset" | "state";
    id: string;
}>;

/** Expected evolution refusal, safe to identify across publication transports. */
export class CollectionPublicationError extends CollectionValidationError {
    readonly publicationResource?: CollectionPublicationResource;
    constructor(
        readonly publicationCode: CollectionPublicationCode,
        detail?: string,
        publicationResource?: CollectionPublicationResource,
    ) {
        super(
            "invalid_collection",
            detail
                ? `${detail}. ${COLLECTION_PUBLICATION_ISSUES[publicationCode]}`
                : COLLECTION_PUBLICATION_ISSUES[publicationCode],
            "$.version",
        );
        this.publicationResource = publicationResource
            ? Object.freeze({ kind: publicationResource.kind, id: publicationResource.id })
            : undefined;
        this.name = "CollectionPublicationError";
    }
}
