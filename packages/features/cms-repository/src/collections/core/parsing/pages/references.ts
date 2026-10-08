import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { DomUtils, parseDocument } from "htmlparser2";
import { invalid } from "../../errors";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";

const COLLECTION_IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const SITE_PAGE_ID = /^[0-9A-Za-z][0-9A-Za-z._:-]{0,199}$/u;

export type StablePageReference =
    | { readonly kind: "site"; readonly pageId: string }
    | {
          readonly kind: "collection";
          readonly publisherId: string;
          readonly collectionId: string;
          readonly pageId: string;
      };

export function validateStablePageLink(
    tag: string,
    attributes: Readonly<Record<string, string>>,
    path: string,
): StablePageReference | null {
    const pageReference = attributes["data-cms-page-ref"];
    const successReference = attributes["data-cms-success-page-ref"];
    if (pageReference !== undefined && tag !== "a") {
        invalid("data-cms-page-ref is only allowed on anchors", path);
    }
    if (successReference !== undefined && tag !== "form") {
        invalid("data-cms-success-page-ref is only allowed on forms", path);
    }
    if (successReference !== undefined && attributes["cms-source"] === undefined) {
        invalid("data-cms-success-page-ref requires a capability form", path);
    }
    if (pageReference !== undefined && successReference !== undefined) {
        invalid("a Page link cannot be both a navigation and a success redirect", path);
    }
    const reference = pageReference ?? successReference;
    let parsed: StablePageReference | null = null;
    if (reference !== undefined) {
        parsed = parseStablePageReference(reference, path);
    }
    const suffix = attributes["data-cms-page-suffix"];
    if (suffix !== undefined && (reference === undefined || suffix.length > 2048 || !/^[?#]/u.test(suffix))) {
        invalid("data-cms-page-suffix requires a stable Page reference and must be a query or fragment", path);
    }
    return parsed;
}

function parseStablePageReference(value: string, path: string): StablePageReference {
    let parsed: unknown;
    try {
        parsed = parseStrictJson(value, 1024, 4);
    } catch {
        invalid("stable Page reference must be bounded JSON", path);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        invalid("stable Page reference must be an object", path);
    }
    const reference = parsed as Record<string, unknown>;
    const keys = Object.keys(reference).sort();
    const expected = reference.kind === "site" ? ["kind", "pageId"] : ["collectionId", "kind", "pageId", "publisherId"];
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
        invalid("stable Page reference has an invalid shape", path);
    }
    if (reference.kind !== "site" && reference.kind !== "collection") {
        invalid("stable Page reference kind must be site or collection", path);
    }
    if (reference.kind === "site") {
        if (typeof reference.pageId !== "string" || !SITE_PAGE_ID.test(reference.pageId)) {
            invalid("stable site Page reference pageId is invalid", path);
        }
        return { kind: "site", pageId: reference.pageId };
    }
    for (const key of expected.filter((entry) => entry !== "kind")) {
        const item = reference[key];
        if (typeof item !== "string" || item.length > 96 || !COLLECTION_IDENTIFIER.test(item)) {
            invalid(`stable Page reference ${key} must be a lowercase identifier`, path);
        }
    }
    return {
        kind: "collection",
        publisherId: reference.publisherId as string,
        collectionId: reference.collectionId as string,
        pageId: reference.pageId as string,
    };
}

/** Validates references that can be proven from one immutable release alone. */
export function validateDeclaredPageReferences(
    release: Pick<CollectionRelease, "collectionId" | "publisherId" | "dependencies" | "pages">,
): void {
    const pages = new Map((release.pages ?? []).map((page) => [page.id, page]));
    for (const page of release.pages ?? []) {
        for (const reference of pageReferences(page.document.html)) {
            if (reference.kind === "site") {
                continue;
            }
            if (reference.publisherId === release.publisherId && reference.collectionId === release.collectionId) {
                const target = pages.get(reference.pageId);
                if (!target) {
                    invalid(`references unknown Page ${reference.pageId}`, `$.pages.${page.id}.document.html`);
                }
                assertCompatibleSurface(page.surface, target.surface, release.collectionId, page.id, reference.pageId);
                continue;
            }
            const dependency = release.dependencies?.find(
                (item) => item.publisherId === reference.publisherId && item.collectionId === reference.collectionId,
            );
            if (!dependency?.imports.pages?.some((item) => item.id === reference.pageId)) {
                invalid(
                    `references Page ${reference.collectionId}.${reference.pageId} without importing it`,
                    `$.pages.${page.id}.document.html`,
                );
            }
        }
    }
}

export function pageReferences(html: string): readonly StablePageReference[] {
    const document = parseDocument(html, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
    const references: StablePageReference[] = [];
    const pending = [...document.children];
    while (pending.length > 0) {
        const node = pending.pop()!;
        if (!DomUtils.isTag(node)) {
            continue;
        }
        const reference = validateStablePageLink(node.name, node.attribs, "Page document");
        if (reference) {
            references.push(reference);
        }
        pending.push(...node.children);
    }
    return references;
}

export function assertCompatibleSurface(
    source: "control" | "delivery",
    target: "control" | "delivery",
    collectionId: string,
    pageId: string,
    targetId: string,
): void {
    if (source === "delivery" && target === "control") {
        invalid(
            `Delivery Page ${collectionId}.${pageId} cannot link to Control Page ${targetId}`,
            `$.pages.${pageId}.document.html`,
        );
    }
}
