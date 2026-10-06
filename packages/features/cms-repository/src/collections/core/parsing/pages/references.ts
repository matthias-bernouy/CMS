import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { invalid } from "../../errors";

const COLLECTION_IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const SITE_PAGE_ID = /^[0-9A-Za-z][0-9A-Za-z._:-]{0,199}$/u;

export function validateStablePageLink(tag: string, attributes: Readonly<Record<string, string>>, path: string): void {
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
    if (reference !== undefined) {
        validateStablePageReference(reference, path);
    }
    const suffix = attributes["data-cms-page-suffix"];
    if (suffix !== undefined && (reference === undefined || suffix.length > 2048 || !/^[?#]/u.test(suffix))) {
        invalid("data-cms-page-suffix requires a stable Page reference and must be a query or fragment", path);
    }
}

function validateStablePageReference(value: string, path: string): void {
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
        return;
    }
    for (const key of expected.filter((entry) => entry !== "kind")) {
        const item = reference[key];
        if (typeof item !== "string" || item.length > 96 || !COLLECTION_IDENTIFIER.test(item)) {
            invalid(`stable Page reference ${key} must be a lowercase identifier`, path);
        }
    }
}
