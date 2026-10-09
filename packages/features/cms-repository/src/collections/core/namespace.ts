import { invalid } from "./errors";
import { string } from "./values";

const COLLECTION_NAMESPACE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const CUSTOM_ELEMENT_TAG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/u;
const LOCAL_THEME_TOKEN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const RESERVED_COLLECTION_ROOTS = ["be5", "cms", "p9r", "site", "w13c"] as const;
const RESERVED_CUSTOM_ELEMENT_TAGS = new Set([
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
    if (typeof value !== "string" || value.length === 0 || value.length > 96 || !CUSTOM_ELEMENT_TAG.test(value)) {
        return "must be a valid lowercase custom-element tag";
    }
    if (RESERVED_CUSTOM_ELEMENT_TAGS.has(value)) {
        return "uses a platform-reserved custom-element name";
    }
    const reserved = RESERVED_COLLECTION_ROOTS.find((root) => value === root || value.startsWith(`${root}-`));
    return reserved ? `must not use the reserved ${reserved}- namespace` : null;
}

export function isCollectionBlocTag(value: unknown): value is string {
    return collectionBlocTagIssue(value) === null;
}

export function isCollectionNamespace(value: unknown): value is string {
    return (
        typeof value === "string" &&
        value.length > 0 &&
        value.length <= 96 &&
        COLLECTION_NAMESPACE.test(value) &&
        !RESERVED_COLLECTION_ROOTS.some((root) => value === root || value.startsWith(`${root}-`))
    );
}

export function parseCollectionNamespace(value: unknown, path: string): string {
    const namespace = string(value, 96, path);
    if (!COLLECTION_NAMESPACE.test(namespace)) {
        invalid("must be a lowercase kebab-case namespace", path);
    }
    const reserved = RESERVED_COLLECTION_ROOTS.find((root) => namespace === root || namespace.startsWith(`${root}-`));
    if (reserved) {
        invalid(`must not use the reserved ${reserved}- namespace`, path);
    }
    return namespace;
}

export function parseCollectionBlocTag(value: unknown, collectionId: string, path: string): string {
    const tag = string(value, 96, path);
    const issue = collectionBlocTagIssue(tag);
    if (issue) {
        invalid(issue, path);
    }
    if (!tag.startsWith(`${collectionId}-`) || tag.length === collectionId.length + 1) {
        invalid(`must use the ${collectionId}- collection namespace`, path);
    }
    return tag;
}

export function collectionThemeSourceId(collectionId: string): string {
    assertCollectionNamespace(collectionId);
    return `contribution-${collectionId}`;
}

export function collectionThemeTokenId(collectionId: string, tokenId: string): string {
    assertCollectionNamespace(collectionId);
    if (!LOCAL_THEME_TOKEN.test(tokenId) || tokenId.length > 96) {
        throw new TypeError(`Invalid local collection theme token: ${tokenId}`);
    }
    return `${collectionId}-${tokenId}`;
}

function assertCollectionNamespace(value: string): void {
    if (!isCollectionNamespace(value)) {
        throw new TypeError(`Invalid collection namespace: ${value}`);
    }
}
