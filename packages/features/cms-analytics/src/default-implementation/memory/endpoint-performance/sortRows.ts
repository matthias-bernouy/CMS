import type { EndpointPerformanceQuery } from "../../../interfaces/EndpointPerformance";
import type { EndpointPerformanceRow } from "../../../interfaces/EndpointPerformanceDashboard";

const utf8 = new TextEncoder();

export function compareEndpointPerformanceRows(
    left: EndpointPerformanceRow,
    right: EndpointPerformanceRow,
    query: EndpointPerformanceQuery,
): number {
    const field = {
        requests: "requests",
        errorRate: "errorRate",
        p50: "p50Ms",
        p95: "p95Ms",
        p99: "p99Ms",
        max: "maxMs",
    }[query.sort] as keyof EndpointPerformanceRow;
    const primary = (numeric(left[field]) - numeric(right[field])) * (query.order === "asc" ? 1 : -1);
    return (
        primary ||
        compareUtf8(left.endpointUrn, right.endpointUrn) ||
        compareUtf8(left.surface, right.surface) ||
        compareUtf8(left.method, right.method)
    );
}

function numeric(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function compareUtf8(left: string, right: string): number {
    const leftBytes = utf8.encode(left);
    const rightBytes = utf8.encode(right);
    for (let index = 0; index < Math.min(leftBytes.length, rightBytes.length); index++) {
        const difference = leftBytes[index]! - rightBytes[index]!;
        if (difference !== 0) {
            return difference;
        }
    }
    return leftBytes.length - rightBytes.length;
}
