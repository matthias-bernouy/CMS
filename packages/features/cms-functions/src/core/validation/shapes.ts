import type { DataShape, SourceEndpoint } from "@bernouy/cms-sources";

export function endpointOutputShape(endpoint: SourceEndpoint): DataShape | null {
    return endpoint.output?.find(response => response.status.startsWith("2") && response.body)?.body ?? null;
}

export function shapeHasPath(shape: DataShape, parts: string[]): boolean {
    let current: DataShape | undefined = shape;
    for (const part of parts) {
        if (!current) return false;
        if (current.type === "array") current = current.items;
        if (!current) return false;
        if (current.type !== "object") return false;
        current = current.properties?.[part];
    }
    return current !== undefined;
}
