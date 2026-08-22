import { CMS_SOURCES_ROUTE, makeEndpointUrn, makeSourceUrn, type Source } from "@bernouy/cms-sources";
import { collectCmsSourceBindings } from "cms-content/core/editor/sourceBindings";
import { parseQueryParamToken } from "cms-content/interfaces/Editor/BindingSyntax";

const DETECTION_BASE_URL = new URL("https://cms.invalid");

export type PageIndexingCandidate = {
    sourceUrn: string;
    endpointUrn: string;
    entityId: string;
    identity: {
        key: string;
        inputParam: string;
        pageQueryParam: string;
    };
};

export type PageIndexingDetectionStatus = "none" | "detected" | "ambiguous";

export type PageIndexingDetection = {
    status: PageIndexingDetectionStatus;
    candidates: PageIndexingCandidate[];
};

export type PageIndexingDetectionOptions = {
    /** Base-path-aware source proxy prefix, for example `/cms/.cms/sources/`. */
    sourcePrefix?: string;
};

type InternalSourceReference = {
    sourceUrn: string;
    endpointUrn: string;
    searchParams: URLSearchParams;
};

/**
 * Detects indexable entity bindings authored in a page without choosing one for
 * the page. Only automatic GET bindings whose resolve identity comes from a
 * public page query parameter are candidates.
 */
export function detectPageIndexingCandidates(
    html: string,
    sources: readonly Source[],
    options: PageIndexingDetectionOptions = {},
): PageIndexingDetection {
    const sourcePrefix = normalizeSourcePrefix(options.sourcePrefix);
    const candidates = new Map<string, PageIndexingCandidate>();

    for (const binding of collectCmsSourceBindings(html)) {
        if (binding.method !== "GET" || binding.trigger !== "auto") {
            continue;
        }

        const reference = parseInternalSourceReference(binding.url, sourcePrefix);
        const source = sources.find((candidate) => candidate.urn === reference?.sourceUrn);
        if (!reference || !source?.indexing) {
            continue;
        }

        for (const entity of source.indexing.entities) {
            if (entity.resolve.endpointUrn !== reference.endpointUrn) {
                continue;
            }

            for (const value of reference.searchParams.getAll(entity.resolve.identity.inputParam)) {
                const pageQueryParam = parseQueryParamToken(value);
                if (!pageQueryParam) {
                    continue;
                }

                const candidate: PageIndexingCandidate = {
                    sourceUrn: source.urn,
                    endpointUrn: reference.endpointUrn,
                    entityId: entity.id,
                    identity: {
                        key: entity.resolve.identity.key,
                        inputParam: entity.resolve.identity.inputParam,
                        pageQueryParam,
                    },
                };
                candidates.set(candidateKey(candidate), candidate);
            }
        }
    }

    const detected = [...candidates.values()];
    return {
        status: detected.length === 0 ? "none" : detected.length === 1 ? "detected" : "ambiguous",
        candidates: detected,
    };
}

function normalizeSourcePrefix(value: string | undefined): string {
    const prefix = value?.trim() || `${CMS_SOURCES_ROUTE}/`;
    return `${prefix.replace(/\/+$/, "")}/`;
}

function parseInternalSourceReference(urlValue: string, sourcePrefix: string): InternalSourceReference | null {
    try {
        const url = new URL(escapeQueryParamTokens(urlValue), DETECTION_BASE_URL);
        if (url.origin !== DETECTION_BASE_URL.origin || !url.pathname.startsWith(sourcePrefix)) {
            return null;
        }

        const segments = url.pathname.slice(sourcePrefix.length).split("/").filter(Boolean).map(decodeURIComponent);
        const sourceId = segments[0];
        const endpointId = segments[1];
        if (segments.length !== 2 || !sourceId || !endpointId) {
            return null;
        }

        return {
            sourceUrn: makeSourceUrn(sourceId),
            endpointUrn: makeEndpointUrn(sourceId, endpointId),
            searchParams: url.searchParams,
        };
    } catch {
        return null;
    }
}

function escapeQueryParamTokens(urlValue: string): string {
    return urlValue.replace(/#\{[^}]*\}/g, (token) => encodeURIComponent(token));
}

function candidateKey(candidate: PageIndexingCandidate): string {
    return [
        candidate.sourceUrn,
        candidate.endpointUrn,
        candidate.entityId,
        candidate.identity.key,
        candidate.identity.inputParam,
        candidate.identity.pageQueryParam,
    ].join("\u0000");
}
