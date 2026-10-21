export const CMS_SVG_ATTRIBUTE = "cms-svg";

import { parseCollectionAssetReference } from "cms-content/blocs/core/markup/security/collectionAssetExpression";

const CONTROL_OR_SPACE = /[\u0000-\u0020\u007f]/u;
const CONTRACT_ID = /^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/u;

export type SvgCapabilityTarget = Readonly<{ contractId: string; bindingPath: string }>;

export function svgReferenceIssue(value: string): string | null {
    if (parseCollectionAssetReference(value)) {
        return null;
    }
    if (
        !value.startsWith("/") ||
        value.startsWith("//") ||
        CONTROL_OR_SPACE.test(value) ||
        value.includes("?") ||
        value.includes("#") ||
        !value.includes("/.cms/call/")
    ) {
        return "cms-svg must reference one immutable collection asset or canonical same-site capability URL";
    }
    try {
        const pathname = new URL(value, "https://cms.invalid").pathname;
        if (pathname !== value) {
            return "cms-svg URL must not contain ambiguous path segments";
        }
        const marker = "/.cms/call/";
        const markerIndex = pathname.indexOf(marker);
        if (markerIndex < 0 || pathname.indexOf(marker, markerIndex + marker.length) >= 0) {
            return "cms-svg must reference one immutable collection asset or canonical same-site capability URL";
        }
        const routeSegments = pathname.slice(markerIndex + marker.length).split("/");
        if (routeSegments.length < 2 || routeSegments.some((segment) => segment.length === 0)) {
            return "cms-svg capability URL must identify one contract and binding path";
        }
        const decoded = routeSegments.map(decodeURIComponent);
        if (
            decoded.some(
                (segment, index) =>
                    segment !== routeSegments[index] ||
                    segment === "." ||
                    segment === ".." ||
                    segment.includes("/") ||
                    segment.includes("\\") ||
                    CONTROL_OR_SPACE.test(segment),
            )
        ) {
            return "cms-svg URL must not contain ambiguous path segments";
        }
        if (decoded[0]!.length > 128 || !CONTRACT_ID.test(decoded[0]!)) {
            return "cms-svg capability URL contains an invalid contract identifier";
        }
    } catch {
        return "cms-svg URL is invalid";
    }
    return null;
}

/** Extracts the Provider-neutral HTTP target from an already valid cms-svg value. */
export function parseSvgCapabilityReference(value: string): SvgCapabilityTarget | null {
    if (parseCollectionAssetReference(value) || svgReferenceIssue(value)) {
        return null;
    }
    const pathname = new URL(value, "https://cms.invalid").pathname;
    const suffix = pathname.slice(pathname.indexOf("/.cms/call/") + "/.cms/call/".length);
    const separator = suffix.indexOf("/");
    return {
        contractId: suffix.slice(0, separator),
        bindingPath: suffix.slice(separator),
    };
}
