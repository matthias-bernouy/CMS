import {
    ENDPOINT_PERFORMANCE_METHODS,
    ENDPOINT_PERFORMANCE_RANGES,
    ENDPOINT_PERFORMANCE_SORTS,
    ENDPOINT_PERFORMANCE_STATUS_CLASSES,
    ENDPOINT_PERFORMANCE_SURFACES,
    type EndpointPerformanceQuery,
    type EndpointPerformanceReports,
} from "../interfaces/EndpointPerformance";
import { isSafeEndpointPerformanceUrn } from "../core/rollups/endpoint-performance/normalization";

export const ENDPOINT_PERFORMANCE_ROUTE = "/analytics/endpoints";

const PARAMETERS = new Set(["range", "surface", "endpoint", "method", "status", "sort", "order", "limit"]);

export async function endpointPerformanceHandler(
    reports: EndpointPerformanceReports,
    request: Request,
): Promise<Response> {
    const query = parseEndpointPerformanceQuery(new URL(request.url).searchParams);
    if (query instanceof Response) {
        return query;
    }
    try {
        return Response.json(await reports.dashboard(query));
    } catch {
        return Response.json({ error: "endpoint performance unavailable" }, { status: 503 });
    }
}

export function parseEndpointPerformanceQuery(params: URLSearchParams): EndpointPerformanceQuery | Response {
    if ([...params.keys()].some((name) => !PARAMETERS.has(name) || params.getAll(name).length !== 1)) {
        return invalidQuery("query parameters are unknown or duplicated");
    }
    const range = params.get("range") ?? "24h";
    const surface = params.get("surface");
    const endpointUrn = params.get("endpoint");
    const method = params.get("method");
    const statusClass = params.get("status");
    const sort = params.get("sort") ?? "p95";
    const order = params.get("order") ?? "desc";
    const limit = params.get("limit") ?? "50";
    if (!includes(ENDPOINT_PERFORMANCE_RANGES, range)) {
        return invalidQuery("range must be 1h|24h|7d");
    }
    if (surface !== null && !includes(ENDPOINT_PERFORMANCE_SURFACES, surface)) {
        return invalidQuery("surface must be control|delivery");
    }
    if (endpointUrn !== null && !isSafeEndpointPerformanceUrn(endpointUrn)) {
        return invalidQuery("endpoint must be a normalized endpoint URN");
    }
    if (method !== null && !includes(ENDPOINT_PERFORMANCE_METHODS, method)) {
        return invalidQuery("method is not supported");
    }
    if (statusClass !== null && !includes(ENDPOINT_PERFORMANCE_STATUS_CLASSES, statusClass)) {
        return invalidQuery("status must be 1xx|2xx|3xx|4xx|5xx");
    }
    if (!includes(ENDPOINT_PERFORMANCE_SORTS, sort) || (order !== "asc" && order !== "desc")) {
        return invalidQuery("sort or order is not supported");
    }
    if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100) {
        return invalidQuery("limit must be an integer between 1 and 100");
    }
    return {
        range,
        sort,
        order,
        limit: Number(limit),
        ...(surface ? { surface } : {}),
        ...(endpointUrn ? { endpointUrn } : {}),
        ...(method ? { method } : {}),
        ...(statusClass ? { statusClass } : {}),
    };
}

function includes<const T extends readonly string[]>(values: T, value: string): value is T[number] {
    return values.includes(value as T[number]);
}

function invalidQuery(message: string): Response {
    return Response.json({ error: message }, { status: 400 });
}
