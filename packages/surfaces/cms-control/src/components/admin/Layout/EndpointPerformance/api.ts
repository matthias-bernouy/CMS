import type {
    EndpointPerformanceDashboard,
    EndpointPerformanceMetadata,
    EndpointPerformanceMethod,
    EndpointPerformanceQuery,
    EndpointPerformanceRange,
    EndpointPerformanceSort,
    EndpointPerformanceStatusClass,
    EndpointPerformanceSurface,
    EndpointPerformanceTimelinePoint,
} from "@bernouy/cms-analytics";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

const RANGES = ["1h", "24h", "7d"] as const satisfies readonly EndpointPerformanceRange[];
const SURFACES = ["control", "delivery"] as const satisfies readonly EndpointPerformanceSurface[];
const METHODS = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
    "OTHER",
] as const satisfies readonly EndpointPerformanceMethod[];
const STATUSES = ["1xx", "2xx", "3xx", "4xx", "5xx"] as const satisfies readonly EndpointPerformanceStatusClass[];
const SORTS = [
    "requests",
    "errorRate",
    "p50",
    "p95",
    "p99",
    "max",
] as const satisfies readonly EndpointPerformanceSort[];
type TimelinePointView = Omit<EndpointPerformanceTimelinePoint, "bucket"> & { bucket: string };
type MetadataView = Omit<
    EndpointPerformanceMetadata,
    "generatedAt" | "from" | "to" | "lastObservationAt" | "lastFlushAt"
> & {
    generatedAt: string;
    from: string;
    to: string;
    lastObservationAt: string | null;
    lastFlushAt: string | null;
};

export type EndpointPerformanceDashboardView = Omit<EndpointPerformanceDashboard, "timeline" | "meta"> & {
    timeline: TimelinePointView[];
    meta: MetadataView;
};

export class EndpointPerformanceUnavailableError extends Error {
    constructor(readonly status: number) {
        super(`Endpoint performance request failed with status ${status}`);
    }
}

export function readEndpointPerformanceQuery(search = window.location.search): EndpointPerformanceQuery {
    const params = new URLSearchParams(search);
    const endpointUrn = params.get("endpoint")?.trim();
    return {
        range: member(RANGES, params.get("range")) ?? "24h",
        sort: member(SORTS, params.get("sort")) ?? "p95",
        order: params.get("order") === "asc" ? "asc" : "desc",
        limit: validLimit(params.get("limit")),
        ...optional("surface", member(SURFACES, params.get("surface"))),
        ...optional("endpointUrn", endpointUrn && isSafeEndpointFilter(endpointUrn) ? endpointUrn : undefined),
        ...optional("method", member(METHODS, params.get("method"))),
        ...optional("statusClass", member(STATUSES, params.get("status"))),
    };
}

export async function fetchEndpointPerformance(
    query: EndpointPerformanceQuery,
    signal?: AbortSignal,
): Promise<EndpointPerformanceDashboardView> {
    const response = await fetch(endpointPerformanceApiUrl(query), {
        headers: { Accept: "application/json" },
        signal,
    });
    if (!response.ok) {
        throw new EndpointPerformanceUnavailableError(response.status);
    }
    return (await response.json()) as EndpointPerformanceDashboardView;
}

export function replaceEndpointPerformanceQuery(query: EndpointPerformanceQuery): void {
    const url = new URL(window.location.href);
    url.search = queryParams(query).toString();
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function isSafeEndpointFilter(value: string): boolean {
    if (value === "__unresolved__") {
        return true;
    }
    const parts = value.split(":");
    return value.length <= 256 && parts.length === 3 && parts[0] === "urn" && Boolean(parts[1]) && Boolean(parts[2]);
}

function endpointPerformanceApiUrl(query: EndpointPerformanceQuery): string {
    return `${getMetaBasePath()}/api/analytics/endpoints?${queryParams(query)}`;
}

function queryParams(query: EndpointPerformanceQuery): URLSearchParams {
    const params = new URLSearchParams({
        range: query.range,
        sort: query.sort,
        order: query.order,
        limit: String(query.limit),
    });
    if (query.surface) {
        params.set("surface", query.surface);
    }
    if (query.endpointUrn) {
        params.set("endpoint", query.endpointUrn);
    }
    if (query.method) {
        params.set("method", query.method);
    }
    if (query.statusClass) {
        params.set("status", query.statusClass);
    }
    return params;
}

function member<const Values extends readonly string[]>(
    values: Values,
    value: string | null,
): Values[number] | undefined {
    return value !== null && values.includes(value) ? (value as Values[number]) : undefined;
}

function optional<Key extends string, Value>(key: Key, value: Value | undefined): Partial<Record<Key, Value>> {
    return value === undefined ? {} : ({ [key]: value } as Record<Key, Value>);
}

function validLimit(value: string | null): number {
    const parsed = Number(value ?? 50);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 50;
}
