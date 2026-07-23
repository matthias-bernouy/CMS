import type {
    EndpointPerformanceMethod,
    EndpointPerformanceQuery,
    EndpointPerformanceStatusClass,
    EndpointPerformanceSurface,
} from "@bernouy/cms-analytics";
import { isSafeEndpointFilter } from "./api";

export function readEndpointPerformanceFilters(
    form: HTMLFormElement,
    current: EndpointPerformanceQuery,
): EndpointPerformanceQuery | null {
    const endpoint = field<HTMLInputElement>(form, "endpoint");
    const endpointUrn = endpoint.value.trim();
    endpoint.setCustomValidity(
        endpointUrn && !isSafeEndpointFilter(endpointUrn)
            ? "Use a normalized endpoint URN such as urn:source:endpoint."
            : "",
    );
    if (!form.reportValidity()) {
        return null;
    }
    return {
        range: current.range,
        sort: current.sort,
        order: current.order,
        limit: current.limit,
        ...optional("surface", value<EndpointPerformanceSurface>(form, "surface")),
        ...optional("endpointUrn", endpointUrn || undefined),
        ...optional("method", value<EndpointPerformanceMethod>(form, "method")),
        ...optional("statusClass", value<EndpointPerformanceStatusClass>(form, "status")),
    };
}

export function syncEndpointPerformanceFilters(form: HTMLFormElement, queryState: EndpointPerformanceQuery): void {
    field<HTMLSelectElement>(form, "surface").value = queryState.surface ?? "";
    field<HTMLInputElement>(form, "endpoint").value = queryState.endpointUrn ?? "";
    field<HTMLSelectElement>(form, "method").value = queryState.method ?? "";
    field<HTMLSelectElement>(form, "status").value = queryState.statusClass ?? "";
}

function field<T extends HTMLInputElement | HTMLSelectElement>(form: HTMLFormElement, name: string): T {
    const element = form.elements.namedItem(name);
    if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLSelectElement)) {
        throw new Error(`Missing endpoint performance filter: ${name}`);
    }
    return element as T;
}

function value<T extends string>(form: HTMLFormElement, name: string): T | undefined {
    const item = field<HTMLInputElement | HTMLSelectElement>(form, name).value.trim();
    return item ? (item as T) : undefined;
}

function optional<Key extends string, Value>(key: Key, item: Value | undefined): Partial<Record<Key, Value>> {
    return item ? ({ [key]: item } as Record<Key, Value>) : {};
}
