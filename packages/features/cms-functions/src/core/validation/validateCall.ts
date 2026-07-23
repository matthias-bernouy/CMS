import { makeEndpointUrn, systemSourceUrnOf, type SourceEndpoint, type SourceRepository } from "@bernouy/cms-sources";
import type { CmsFunction, FunctionCall, FunctionValue } from "../../interfaces/FunctionDefinition";
import { PROPAGATABLE_FUNCTION_CALL_STATUSES } from "../model/errors";
import { SYSTEM_FUNCTIONS_SOURCE_ID } from "../repositories/projection";
import { isId } from "./ids";

export async function validateCall(
    fn: CmsFunction,
    call: FunctionCall,
    path: string,
    sources: SourceRepository | null,
    errors: string[],
): Promise<SourceEndpoint | null> {
    if (!isId(call.source)) {
        errors.push(`${path}.source must be a simple source id`);
    }
    if (!isId(call.endpoint)) {
        errors.push(`${path}.endpoint must be a simple endpoint id`);
    }
    if (call.source === SYSTEM_FUNCTIONS_SOURCE_ID || call.source.startsWith("system-")) {
        errors.push(`${path}.source must not reference a system source`);
        return null;
    }
    const mappings = validateCallErrorMappings(fn, call, path, errors);
    if (!sources) {
        return null;
    }
    const endpoint = await sources.getEndpoint(makeEndpointUrn(call.source, call.endpoint));
    if (!endpoint) {
        errors.push(`${path} references unknown endpoint "urn:${call.source}:${call.endpoint}"`);
        return null;
    }
    if (systemSourceUrnOf(endpoint.urn)) {
        errors.push(`${path} must not reference a system endpoint`);
    }
    if (endpoint.responseKind && endpoint.responseKind !== "json") {
        errors.push(`${path} must reference a JSON endpoint`);
    }
    if (fn.method === "GET" && endpoint.method !== "GET") {
        errors.push(`${path} cannot call ${endpoint.method} from a GET function`);
    }
    validateCallParams(call, endpoint, path, errors);
    validateSourceErrorMappings(endpoint, mappings, path, errors);
    return endpoint;
}

type ValidErrorMapping = { index: number; sourceStatus: number; status: number };

function validateCallErrorMappings(
    fn: CmsFunction,
    call: FunctionCall,
    path: string,
    errors: string[],
): ValidErrorMapping[] {
    if (call.onError === undefined) {
        return [];
    }
    if (!isRecord(call.onError)) {
        errors.push(`${path}.onError must be an object`);
        return [];
    }
    const propagate = call.onError.propagate;
    if (!Array.isArray(propagate) || !propagate.length) {
        errors.push(`${path}.onError.propagate must be a non-empty array`);
        return [];
    }
    if (propagate.length > PROPAGATABLE_FUNCTION_CALL_STATUSES.length) {
        errors.push(
            `${path}.onError.propagate must contain at most ${PROPAGATABLE_FUNCTION_CALL_STATUSES.length} mappings`,
        );
    }
    const mappings: ValidErrorMapping[] = [];
    const seenSourceStatuses = new Set<number>();
    for (const [index, value] of propagate.entries()) {
        const mappingPath = `${path}.onError.propagate.${index}`;
        if (!isRecord(value)) {
            errors.push(`${mappingPath} must be an object`);
            continue;
        }
        const sourceStatus = validPropagatableStatus(value.sourceStatus, `${mappingPath}.sourceStatus`, errors);
        const status = validPropagatableStatus(value.status, `${mappingPath}.status`, errors);
        if (sourceStatus === null || status === null) {
            continue;
        }
        if (seenSourceStatuses.has(sourceStatus)) {
            errors.push(`${mappingPath}.sourceStatus duplicates ${sourceStatus}`);
            continue;
        }
        seenSourceStatuses.add(sourceStatus);
        if (!fn.output?.some((output) => output.status === String(status))) {
            errors.push(`${mappingPath}.status ${status} must be explicitly declared by function.output`);
        }
        mappings.push({ index, sourceStatus, status });
    }
    return mappings;
}

function validateSourceErrorMappings(
    endpoint: SourceEndpoint,
    mappings: ValidErrorMapping[],
    path: string,
    errors: string[],
): void {
    for (const mapping of mappings) {
        if (!endpoint.output?.some((output) => output.status === String(mapping.sourceStatus))) {
            errors.push(
                `${path}.onError.propagate.${mapping.index}.sourceStatus ${mapping.sourceStatus} must be explicitly declared by endpoint "${endpoint.urn}"`,
            );
        }
    }
}

function validPropagatableStatus(value: unknown, path: string, errors: string[]): number | null {
    if (
        !Number.isInteger(value) ||
        !PROPAGATABLE_FUNCTION_CALL_STATUSES.includes(value as (typeof PROPAGATABLE_FUNCTION_CALL_STATUSES)[number])
    ) {
        errors.push(`${path} must be one of ${PROPAGATABLE_FUNCTION_CALL_STATUSES.join(", ")}`);
        return null;
    }
    return value as number;
}

function validateCallParams(call: FunctionCall, endpoint: SourceEndpoint, path: string, errors: string[]): void {
    const params = endpoint.input?.params ?? [];
    const declared = new Set(params.map((param) => param.name));
    for (const key of Object.keys(call.params ?? {})) {
        if (!declared.has(key)) {
            errors.push(`${path}.params.${key} is not declared by endpoint "${endpoint.urn}"`);
        }
    }
    for (const param of params) {
        if (param.required && param.source?.from !== "computed" && call.params?.[param.name] === undefined) {
            errors.push(`${path}.params.${param.name} is required by endpoint "${endpoint.urn}"`);
        }
    }
    const body = endpoint.input?.body;
    if (body && body.type === "object" && isPlainObject(call.body)) {
        for (const key of body.required ?? []) {
            if (!Object.hasOwn(call.body, key)) {
                errors.push(`${path}.body.${key} is required by endpoint "${endpoint.urn}"`);
            }
        }
    }
}

function isPlainObject(value: FunctionValue | undefined): value is Record<string, FunctionValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
