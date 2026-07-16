import { dataShapeAtPath, type DataShape, type SourceEndpoint } from "@bernouy/cms-sources";

export function endpointOutputShape(endpoint: SourceEndpoint): DataShape | null {
    return endpoint.output?.find(response => response.status.startsWith("2") && response.body)?.body ?? null;
}

export function shapeHasPath(shape: DataShape, parts: string[]): boolean {
    return dataShapeAtPath(shape, parts, { implicitArrayItems: true }) !== undefined;
}
