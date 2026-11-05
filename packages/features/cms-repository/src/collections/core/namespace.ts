import { isResourceId, resourceName, resourceRuntimeNamespace } from "cms-repository/exports/contracts/protocol";
import { invalid } from "./errors";
import { string } from "./values";

const COLLECTION_NAMESPACE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const BLOC_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:--[a-z][a-z0-9]*(?:-[a-z0-9]+)*--[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$/u;
const LOCAL_THEME_TOKEN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const RESERVED_COLLECTION_ROOTS = ["be5", "cms", "p9r", "site", "w13c"] as const;
const RESERVED_BLOC_IDS = new Set([
    "annotation-xml",
    "color-profile",
    "font-face",
    "font-face-src",
    "font-face-uri",
    "font-face-format",
    "font-face-name",
    "missing-glyph",
]);

export function collectionBlocTagIssue(value: unknown): string | null {
    if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > 512 ||
        !value.includes("-") ||
        !BLOC_ID.test(value)
    ) {
        return "must be a valid lowercase namespaced Bloc identifier";
    }
    if (RESERVED_BLOC_IDS.has(value)) {
        return "uses a platform-reserved Bloc identifier";
    }
    const reserved = value.includes("--")
        ? undefined
        : RESERVED_COLLECTION_ROOTS.find((root) => value === root || value.startsWith(`${root}-`));
    return reserved ? `must not use the reserved ${reserved}- namespace` : null;
}

export function isCollectionBlocTag(value: unknown): value is string {
    return collectionBlocTagIssue(value) === null;
}

export function isCollectionNamespace(value: unknown): value is string {
    return (
        isResourceId(value) &&
        COLLECTION_NAMESPACE.test(resourceName(value)) &&
        !RESERVED_COLLECTION_ROOTS.some(
            (root) => resourceName(value) === root || resourceName(value).startsWith(`${root}-`),
        )
    );
}

export function parseCollectionNamespace(value: unknown, path: string): string {
    if (!isCollectionNamespace(value)) {
        invalid("must be a namespace/name collection identity with a nonreserved kebab-case name", path);
    }
    return value;
}

export function parseCollectionBlocTag(value: unknown, collectionId: string, path: string): string {
    const tag = string(value, 512, path);
    const issue = collectionBlocTagIssue(tag);
    if (issue) {
        invalid(issue, path);
    }
    const prefix = resourceRuntimeNamespace(collectionId);
    if (!tag.startsWith(`${prefix}--`) || tag.length === prefix.length + 2) {
        invalid(`must use the ${prefix}-- collection namespace`, path);
    }
    return tag;
}

export function collectionThemeSourceId(collectionId: string): string {
    assertCollectionNamespace(collectionId);
    return `contribution-${resourceRuntimeNamespace(collectionId)}`;
}

export function collectionThemeTokenId(collectionId: string, tokenId: string): string {
    assertCollectionNamespace(collectionId);
    if (!LOCAL_THEME_TOKEN.test(tokenId) || tokenId.length > 96) {
        throw new TypeError(`Invalid local collection theme token: ${tokenId}`);
    }
    return `${resourceRuntimeNamespace(collectionId)}--${tokenId}`;
}

function assertCollectionNamespace(value: string): void {
    if (!isCollectionNamespace(value)) {
        throw new TypeError(`Invalid collection namespace: ${value}`);
    }
}
