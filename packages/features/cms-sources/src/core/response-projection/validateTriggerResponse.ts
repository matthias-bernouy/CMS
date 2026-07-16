import type { DataShape } from "../../interfaces/DataShape";
import type { EndpointResponse, SourceEndpoint } from "../../interfaces/Source";

export function validateTriggerResponse(
    endpoint: SourceEndpoint,
    response: EndpointResponse,
    errors: string[],
): void {
    const triggerBody = response.triggerBody;
    if (!triggerBody) return;
    if (!response.body) {
        errors.push(`trigger response body requires a public JSON body for "${endpoint.urn}": "${response.status}"`);
        return;
    }
    if (endpoint.responseKind === "file") {
        errors.push(`trigger response body is not supported for file endpoint "${endpoint.urn}": "${response.status}"`);
    }
    if (!isStructuredObject(response.body)) {
        errors.push(`public response body must be a structured non-null object when trigger fields exist for "${endpoint.urn}": "${response.status}"`);
    }
    if (!isStructuredTriggerBody(triggerBody)) {
        errors.push(`trigger response body must contain only structured object fields for "${endpoint.urn}": "${response.status}"`);
        return;
    }
    const publicProperties = new Set(Object.keys(response.body.properties ?? {}));
    const overlap = Object.keys(triggerBody.properties ?? {}).find(property => publicProperties.has(property));
    if (overlap) {
        errors.push(`trigger response property duplicates public field for "${endpoint.urn}": "${overlap}"`);
    }
}

export function isStructuredTriggerBody(shape: DataShape): boolean {
    return isStructuredObject(shape) && !hasOpaqueContainer(shape);
}

function isStructuredObject(shape: DataShape): boolean {
    return shape.type === "object"
        && shape.nullable !== true
        && !!shape.properties
        && Object.keys(shape.properties).length > 0;
}

function hasOpaqueContainer(shape: DataShape): boolean {
    if (shape.type === "object") {
        if (!shape.properties || Object.keys(shape.properties).length === 0) return true;
        return Object.values(shape.properties).some(hasOpaqueContainer);
    }
    return shape.type === "array" && (!shape.items || hasOpaqueContainer(shape.items));
}
