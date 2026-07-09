import {
    makeEndpointUrn,
    systemSourceUrnOf,
    type SourceEndpoint,
    type SourceRepository,
} from "@bernouy/cms-sources";
import type { CmsFunction, FunctionCall, FunctionValue } from "../../interfaces/FunctionDefinition";
import { SYSTEM_FUNCTIONS_SOURCE_ID } from "../projection";
import { isId } from "./ids";

export async function validateCall(
    fn: CmsFunction,
    call: FunctionCall,
    path: string,
    sources: SourceRepository | null,
    errors: string[],
): Promise<SourceEndpoint | null> {
    if (!isId(call.source)) errors.push(`${path}.source must be a simple source id`);
    if (!isId(call.endpoint)) errors.push(`${path}.endpoint must be a simple endpoint id`);
    if (call.source === SYSTEM_FUNCTIONS_SOURCE_ID || call.source.startsWith("system-")) {
        errors.push(`${path}.source must not reference a system source`);
        return null;
    }
    if (!sources) return null;
    const endpoint = await sources.getEndpoint(makeEndpointUrn(call.source, call.endpoint));
    if (!endpoint) {
        errors.push(`${path} references unknown endpoint "urn:${call.source}:${call.endpoint}"`);
        return null;
    }
    if (systemSourceUrnOf(endpoint.urn)) errors.push(`${path} must not reference a system endpoint`);
    if (endpoint.responseKind && endpoint.responseKind !== "json") errors.push(`${path} must reference a JSON endpoint`);
    if (fn.method === "GET" && endpoint.method !== "GET") errors.push(`${path} cannot call ${endpoint.method} from a GET function`);
    validateCallParams(call, endpoint, path, errors);
    return endpoint;
}

function validateCallParams(call: FunctionCall, endpoint: SourceEndpoint, path: string, errors: string[]): void {
    const params = endpoint.input?.params ?? [];
    const declared = new Set(params.map(param => param.name));
    for (const key of Object.keys(call.params ?? {})) {
        if (!declared.has(key)) errors.push(`${path}.params.${key} is not declared by endpoint "${endpoint.urn}"`);
    }
    for (const param of params) {
        if (param.required && param.source?.from !== "computed" && call.params?.[param.name] === undefined) {
            errors.push(`${path}.params.${param.name} is required by endpoint "${endpoint.urn}"`);
        }
    }
    const body = endpoint.input?.body;
    if (body && body.type === "object" && isPlainObject(call.body)) {
        for (const key of body.required ?? []) {
            if (!Object.hasOwn(call.body, key)) errors.push(`${path}.body.${key} is required by endpoint "${endpoint.urn}"`);
        }
    }
}

function isPlainObject(value: FunctionValue | undefined): value is Record<string, FunctionValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
