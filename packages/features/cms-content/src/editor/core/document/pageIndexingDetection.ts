import { collectCmsSourceBindings } from "cms-content/editor/core/document/sourceBindings";
import { isCmsQueryParamName } from "cms-content/editor/core/bindings";

const DETECTION_BASE_URL = new URL("https://cms.invalid");

export type PageIndexingCandidate = {
    contractId: string;
    capabilityId: string;
    inputParam: string;
    pageQueryParam: string;
};

export type PageIndexingDetectionStatus = "none" | "detected" | "ambiguous";
export type PageIndexingDetection = { status: PageIndexingDetectionStatus; candidates: PageIndexingCandidate[] };
export type PageIndexingDetectionOptions = { gatewayPrefix?: string };

/** Finds gateway calls whose typed JSON input binds one field to a public page parameter. */
export function detectPageIndexingCandidates(
    html: string,
    options: PageIndexingDetectionOptions = {},
): PageIndexingDetection {
    const prefix = `${(options.gatewayPrefix?.trim() || "/.cms/call").replace(/\/+$/, "")}/`;
    const candidates = new Map<string, PageIndexingCandidate>();
    for (const binding of collectCmsSourceBindings(html)) {
        if (binding.method !== "POST" || binding.trigger !== "auto" || !binding.body) {
            continue;
        }
        const reference = parseGatewayReference(binding.url, prefix);
        if (!reference) {
            continue;
        }
        for (const [inputParam, value] of Object.entries(binding.body)) {
            if (value?.from !== "queryParam" || !isCmsQueryParamName(value.name)) {
                continue;
            }
            const candidate = { ...reference, inputParam, pageQueryParam: value.name };
            candidates.set(JSON.stringify(candidate), candidate);
        }
    }
    const detected = [...candidates.values()];
    return {
        status: detected.length === 0 ? "none" : detected.length === 1 ? "detected" : "ambiguous",
        candidates: detected,
    };
}

function parseGatewayReference(
    raw: string,
    prefix: string,
): Pick<PageIndexingCandidate, "contractId" | "capabilityId"> | null {
    try {
        const url = new URL(raw, DETECTION_BASE_URL);
        if (url.origin !== DETECTION_BASE_URL.origin || !url.pathname.startsWith(prefix) || url.search) {
            return null;
        }
        const segments = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent);
        if (segments.length !== 2 || segments.some((part) => !/^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/u.test(part))) {
            return null;
        }
        return { contractId: segments[0]!, capabilityId: segments[1]! };
    } catch {
        return null;
    }
}
