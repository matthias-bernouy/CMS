import { makeEndpointUrn, type DataShape, type Source, type SourceEndpoint } from "@bernouy/cms-sources";
import type {
    DashboardDataRef,
    DashboardDto,
    DashboardEmbeddedLookupRef,
    DashboardEndpointRef,
} from "../../interfaces/Dashboard";
import {
    isRecord,
    validateExpressionMap,
    validateId,
    validatePath,
    validateResourceExpression,
    validateRequiredId,
    validateRequiredPath,
} from "./shared";

export function validateDataRef(
    dashboard: DashboardDto,
    ref: DashboardDataRef,
    path: string,
    source: Source | null,
    errors: string[],
): void {
    if (!isRecord(ref)) {
        errors.push(`${path} must be an object`);
        return;
    }
    validateEndpointRef(dashboard, ref, path, source, errors);
    validatePath("itemsPath", ref.itemsPath, path, errors);
    validatePath("itemPath", ref.itemPath, path, errors);
    validatePath("totalPath", ref.totalPath, path, errors);
}

export function validateEmbeddedLookupRef(
    dashboard: DashboardDto,
    ref: DashboardEmbeddedLookupRef,
    path: string,
    source: Source | null,
    errors: string[],
): void {
    validateDataRef(dashboard, ref, path, source, errors);
    if (!isRecord(ref)) {
        return;
    }
    validateRequiredPath("valuePath", ref.valuePath, path, errors);
    validateRequiredPath("labelPath", ref.labelPath, path, errors);
    validatePath("subtitlePath", ref.subtitlePath, path, errors);
    validatePath("mediaPath", ref.mediaPath, path, errors);
    if (ref.selected !== undefined) {
        validateResourceExpression(ref.selected, `${path}.selected`, errors);
    }
}

export function validateEndpointRef(
    dashboard: DashboardDto,
    ref: DashboardEndpointRef,
    path: string,
    source: Source | null,
    errors: string[],
): void {
    if (!isRecord(ref)) {
        errors.push(`${path} must be an object`);
        return;
    }
    validateRequiredId(`${path}.endpoint`, ref.endpoint, errors);
    validateId(`${path}.sourceId`, ref.sourceId, errors);
    const endpoint =
        source && (!ref.sourceId || ref.sourceId === dashboard.source)
            ? endpointFor(ref.sourceId ?? dashboard.source, ref.endpoint, source)
            : null;
    if (source && (!ref.sourceId || ref.sourceId === dashboard.source) && !endpoint) {
        errors.push(`${path}.endpoint references unknown endpoint "${ref.endpoint}"`);
    }
    validateExpressionMap(ref.params, `${path}.params`, errors);
    validateExpressionMap(ref.body, `${path}.body`, errors);
    for (const key of Object.keys(ref.body ?? {})) {
        validatePath(key, key, `${path}.body`, errors);
    }
    if (endpoint && ref.params) {
        validateEndpointParams(endpoint, ref.params, `${path}.params`, errors);
    }
    if (endpoint && ref.body && endpoint.input?.body) {
        validateEndpointBody(endpoint, ref.body, `${path}.body`, errors);
    }
}

function validateEndpointParams(
    endpoint: SourceEndpoint,
    params: Record<string, string>,
    path: string,
    errors: string[],
): void {
    const declared = new Set((endpoint.input?.params ?? []).map((param) => param.name));
    for (const key of Object.keys(params)) {
        if (!declared.has(key)) {
            errors.push(`${path}.${key} is not declared by endpoint "${endpoint.urn}"`);
        }
    }
}

function validateEndpointBody(
    endpoint: SourceEndpoint,
    body: Record<string, string>,
    path: string,
    errors: string[],
): void {
    const shape = endpoint.input?.body;
    if (!shape) {
        return;
    }
    for (const key of Object.keys(body)) {
        if (!shapeHasPath(shape, key)) {
            errors.push(`${path}.${key} is not declared by endpoint "${endpoint.urn}"`);
        }
    }
}

function shapeHasPath(shape: DataShape, path: string): boolean {
    let current: DataShape | undefined = shape;
    for (const part of path.split(".").filter(Boolean)) {
        if (current?.type !== "object") {
            return false;
        }
        current = current.properties?.[part];
    }
    return current !== undefined;
}

function endpointFor(sourceId: string, endpointId: string, source: Source): SourceEndpoint | null {
    const urn = makeEndpointUrn(sourceId, endpointId);
    return source.endpoints.find((endpoint) => endpoint.urn === urn) ?? null;
}
