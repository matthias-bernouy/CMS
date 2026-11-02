import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { diagnosticLocation, dynamicValue } from "cms-content/blocs/core/markup/validation/documents/expanded/context";
import type { ContentDiagnostic } from "cms-content/application/interfaces/diagnostics";

export interface PageDocumentLink {
    readonly element: Element;
    readonly attribute: string;
    readonly path?: string;
    readonly fragment?: string;
    readonly location?: ContentDiagnostic["location"];
}

export function collectDocumentLinks(root: HTMLElement, path: string, host: string, location = diagnosticLocation) {
    const links: PageDocumentLink[] = [];
    const diagnostics: ContentDiagnostic[] = [];
    const base = new URL(path, `https://${host || "ulvia.invalid"}`);
    const elements = root.querySelectorAll("a[href], form[cms-mutation-redirect], iframe[src]");
    if (elements.length > 256) {
        const diagnostic: ContentDiagnostic = {
            code: "page.links_budget",
            severity: "error",
            message: "The expanded Page exceeds the limit of 256 effective links.",
            location: location(elements[256]!),
            suggestion: "Reduce repeated navigation or split the content across Pages before retrying.",
        };
        throw new ContentValidationError("content", diagnostic.message, { code: diagnostic.code }, [diagnostic]);
    }
    for (const element of Array.from(elements)) {
        const attribute =
            element.localName === "a" ? "href" : element.localName === "form" ? "cms-mutation-redirect" : "src";
        const value = element.getAttribute(attribute) ?? "";
        const link = { element, attribute, location: location(element, attribute) };
        if (dynamicValue(value)) {
            diagnostics.push(
                linkIssue(
                    link,
                    "page.link_dynamic",
                    "warning",
                    "This destination depends on runtime values and was not verified.",
                ),
            );
            continue;
        }
        if (value.length > 4096) {
            diagnostics.push(
                linkIssue(link, "page.link_invalid", "error", "The destination exceeds the supported URL length."),
            );
            continue;
        }
        let url: URL;
        try {
            url = new URL(value || "#", base);
        } catch {
            diagnostics.push(linkIssue(link, "page.link_invalid", "error", "The destination is not a valid URL."));
            continue;
        }
        if (!["https:", "http:", "mailto:", "tel:"].includes(url.protocol)) {
            diagnostics.push(
                linkIssue(link, "page.link_unsafe", "error", "The destination uses a forbidden navigation scheme."),
            );
            continue;
        }
        if (url.origin !== base.origin || url.pathname.startsWith("/.cms/") || url.pathname.startsWith("/_content/")) {
            continue;
        }
        let fragment: string;
        try {
            fragment = decodeURIComponent(url.hash.slice(1));
        } catch {
            diagnostics.push(
                linkIssue(link, "page.fragment_invalid", "error", "The destination has an invalid fragment encoding."),
            );
            continue;
        }
        links.push({ ...link, path: url.pathname, ...(fragment ? { fragment } : {}) });
    }
    return { links, diagnostics };
}

export function linkIssue(
    link: PageDocumentLink,
    code: string,
    severity: ContentDiagnostic["severity"],
    message: string,
): ContentDiagnostic {
    return {
        code,
        severity,
        message,
        location: link.location ?? diagnosticLocation(link.element, link.attribute),
        suggestion: "Correct the destination in the Page or Bloc template, or finish the target Page.",
    };
}
