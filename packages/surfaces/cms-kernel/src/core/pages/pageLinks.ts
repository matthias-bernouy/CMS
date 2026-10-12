import {
    createPageRouteReader,
    resolvePageLinkTarget,
    validatePageReference,
    type PageReference,
} from "@bernouy/cms-content/kernel";
import type KernelCms from "cms-kernel/KernelCms";

const MAX_PAGE_LINKS = 256;
const MAX_REFERENCE_LENGTH = 1024;

/** Resolves stable Page references through the single site route registry. */
export async function resolvePageLinks(root: Element, kernel: KernelCms): Promise<void> {
    const elements = [
        ...root.querySelectorAll<HTMLElement>("[data-cms-page-ref]"),
        ...root.querySelectorAll<HTMLElement>("[data-cms-success-page-ref]"),
    ];
    if (elements.length === 0) {
        return;
    }
    if (elements.length > MAX_PAGE_LINKS) {
        throw new Error("A Page contains too many stable Page references");
    }
    const configured = kernel.collections;
    if (!configured?.routes) {
        throw new Error("Page routes are unavailable");
    }
    const reader = createPageRouteReader(configured.routes, configured.siteId);
    for (const element of elements) {
        const success = element.hasAttribute("data-cms-success-page-ref");
        const referenceAttribute = success ? "data-cms-success-page-ref" : "data-cms-page-ref";
        const targetAttribute = success ? "cms-source-success-redirect" : "href";
        if ((!success && element.localName !== "a") || (success && element.localName !== "form")) {
            throw new Error("Stable Page references must target anchors or successful form redirects");
        }
        const reference = parseReference(element.getAttribute(referenceAttribute));
        const resolved = await resolvePageLinkTarget(reader, { kind: "page", page: reference });
        const suffix = element.getAttribute("data-cms-page-suffix") ?? "";
        if (suffix && !suffix.startsWith("?") && !suffix.startsWith("#")) {
            throw new Error("A stable Page link may only declare a query or fragment suffix");
        }
        element.setAttribute(targetAttribute, `${kernel.basePath}${resolved.href}${suffix}`);
        element.removeAttribute(referenceAttribute);
        element.removeAttribute("data-cms-page-suffix");
    }
}

function parseReference(value: string | null): PageReference {
    if (!value || value.length > MAX_REFERENCE_LENGTH) {
        throw new Error("Invalid stable Page reference");
    }
    try {
        return validatePageReference(JSON.parse(value) as PageReference);
    } catch {
        throw new Error("Invalid stable Page reference");
    }
}
