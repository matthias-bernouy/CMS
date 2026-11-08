import { parseHTML } from "linkedom";
import { isSafeStoredResourceUrl } from "./safeUrl";

const DANGEROUS_TAGS = new Set([
    "script",
    "noscript",
    "animate",
    "animatecolor",
    "animatemotion",
    "animatetransform",
    "discard",
    "foreignobject",
    "set",
]);
const URL_ATTRIBUTES = new Set(["href", "src", "xlink:href", "action", "formaction", "background", "poster"]);

/** Fail-closed authoring check; sanitization remains a later defense-in-depth layer. */
export function storedMarkupSecurityIssue(html: string): string | null {
    const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
    document.body.innerHTML = html;
    for (const element of Array.from(document.body.querySelectorAll("*"))) {
        const tag = element.localName.toLowerCase();
        if (DANGEROUS_TAGS.has(tag)) {
            return `element <${tag}> is forbidden in stored Page content`;
        }
        for (const name of element.getAttributeNames()) {
            const normalized = name.toLowerCase();
            if (normalized.startsWith("on") || normalized === "srcdoc") {
                return `attribute ${JSON.stringify(name)} is forbidden in stored Page content`;
            }
            const value = element.getAttribute(name);
            if (value && URL_ATTRIBUTES.has(normalized) && !isSafeStoredResourceUrl(value)) {
                return `attribute ${JSON.stringify(name)} uses a forbidden URL`;
            }
            if (
                tag === "svg" &&
                (normalized === "href" || normalized === "xlink:href") &&
                value
                    ?.replace(/[\u0000-\u0020]/gu, "")
                    .toLowerCase()
                    .startsWith("data:image/svg")
            ) {
                return `attribute ${JSON.stringify(name)} embeds an SVG document`;
            }
        }
    }
    return null;
}
