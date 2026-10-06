import {
    createPageRouteReader,
    resolvePageLinkTarget,
    validatePageReference,
    type PageReference,
} from "@bernouy/cms-content";
import type { ControlCmsState } from "cms-control/core/admin/control/types";
import { controlAssetPath } from "./paths";

const MAX_PAGE_LINKS = 256;
const MAX_REFERENCE_LENGTH = 1024;

/** Resolves authored stable Page references only after the site's route snapshot is known. */
export async function resolveControlPageLinks(document: Document, state: ControlCmsState): Promise<void> {
    const registry = state.configuration.collections?.routes;
    if (!registry) {
        throw new Error("Control Page routes are unavailable");
    }
    const links = [
        ...document.querySelectorAll<HTMLElement>("[data-cms-page-ref]"),
        ...document.querySelectorAll<HTMLElement>("[data-cms-success-page-ref]"),
    ];
    if (links.length > MAX_PAGE_LINKS) {
        throw new Error("A Control Page contains too many Page links");
    }
    const reader = createPageRouteReader(state.repository, registry);
    for (const element of links) {
        const success = element.hasAttribute("data-cms-success-page-ref");
        const referenceAttribute = success ? "data-cms-success-page-ref" : "data-cms-page-ref";
        const targetAttribute = success ? "cms-source-success-redirect" : "href";
        if ((!success && element.localName !== "a") || (success && element.localName !== "form")) {
            throw new Error("Stable Page references must target anchors or successful form redirects");
        }
        const reference = parseReference(element.getAttribute(referenceAttribute));
        const resolved = await resolvePageLinkTarget(reader, "control", { kind: "page", page: reference });
        const suffix = element.getAttribute("data-cms-page-suffix") ?? "";
        if (suffix && !suffix.startsWith("?") && !suffix.startsWith("#")) {
            throw new Error("A stable Page link may only declare a query or fragment suffix");
        }
        const path =
            resolved.surface === "control"
                ? controlAssetPath(state.runner.basePath, resolved.href)
                : deliveryHref(state.configuration.deliveryUrl, resolved.href);
        element.setAttribute(targetAttribute, `${path}${suffix}`);
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

function deliveryHref(deliveryUrl: string | undefined, path: string): string {
    if (!deliveryUrl) {
        throw new Error("Delivery URL is required for a Control-to-Delivery Page link");
    }
    return `${deliveryUrl.replace(/\/$/u, "")}${path}`;
}
