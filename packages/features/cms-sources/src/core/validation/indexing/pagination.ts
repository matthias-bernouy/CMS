import type { SourceEndpoint } from "cms-sources/interfaces/Source";
import { MAX_SOURCE_INDEXING_PAGE_SIZE, type SourceIndexingPagination } from "cms-sources/interfaces/SourceIndexing";
import { validateResponsePath } from "./paths";

export function validateIndexingPagination(
    endpoint: SourceEndpoint,
    pagination: SourceIndexingPagination | undefined,
    prefix: string,
    errors: string[],
): void {
    const allowed = new Set<string>();
    if (!pagination) {
        validateRequiredParams(endpoint, allowed, `${prefix}.discover`, errors);
        return;
    }
    if (pagination.type === "offset") {
        validateOffsetPagination(endpoint, pagination, prefix, allowed, errors);
    } else if (pagination.type === "cursor") {
        validateCursorPagination(endpoint, pagination, prefix, allowed, errors);
    } else {
        errors.push(`${prefix}.discover.pagination.type must be offset or cursor`);
        return;
    }
    const pageSize = pagination.pageSize;
    const requiresPageSize = pagination.type === "offset" || pageSize !== undefined;
    if (
        requiresPageSize &&
        (!Number.isInteger(pageSize) || pageSize! < 1 || pageSize! > MAX_SOURCE_INDEXING_PAGE_SIZE)
    ) {
        errors.push(
            `${prefix}.discover.pagination.pageSize must be an integer between 1 and ${MAX_SOURCE_INDEXING_PAGE_SIZE}`,
        );
    }
    validateRequiredParams(endpoint, allowed, `${prefix}.discover`, errors);
}

function validateOffsetPagination(
    endpoint: SourceEndpoint,
    pagination: Extract<SourceIndexingPagination, { type: "offset" }>,
    prefix: string,
    allowed: Set<string>,
    errors: string[],
): void {
    validateRequestParam(endpoint, pagination.limitParam, "number", `${prefix}.discover.pagination.limitParam`, errors);
    validateRequestParam(
        endpoint,
        pagination.offsetParam,
        "number",
        `${prefix}.discover.pagination.offsetParam`,
        errors,
    );
    allowed.add(pagination.limitParam).add(pagination.offsetParam);
    if (pagination.totalPath !== undefined) {
        validateResponsePath(
            endpoint,
            pagination.totalPath,
            "number",
            `${prefix}.discover.pagination.totalPath`,
            errors,
        );
    }
}

function validateCursorPagination(
    endpoint: SourceEndpoint,
    pagination: Extract<SourceIndexingPagination, { type: "cursor" }>,
    prefix: string,
    allowed: Set<string>,
    errors: string[],
): void {
    validateRequestParam(
        endpoint,
        pagination.cursorParam,
        "string",
        `${prefix}.discover.pagination.cursorParam`,
        errors,
    );
    validateResponsePath(
        endpoint,
        pagination.nextCursorPath,
        "string",
        `${prefix}.discover.pagination.nextCursorPath`,
        errors,
    );
    allowed.add(pagination.cursorParam);
    if (pagination.limitParam) {
        validateRequestParam(
            endpoint,
            pagination.limitParam,
            "number",
            `${prefix}.discover.pagination.limitParam`,
            errors,
        );
        allowed.add(pagination.limitParam);
    }
    if ((pagination.limitParam === undefined) !== (pagination.pageSize === undefined)) {
        errors.push(`${prefix}.discover.pagination limitParam and pageSize must be declared together`);
    }
}

function validateRequestParam(
    endpoint: SourceEndpoint,
    name: string,
    expected: "string" | "number",
    path: string,
    errors: string[],
): void {
    const param = endpoint.input?.params?.find((candidate) => candidate.name === name);
    if (!param || param.source?.from === "computed" || param.schema.type !== expected) {
        errors.push(`${path} must name a request ${expected} parameter`);
    }
}

function validateRequiredParams(endpoint: SourceEndpoint, allowed: Set<string>, path: string, errors: string[]): void {
    for (const param of endpoint.input?.params ?? []) {
        if (param.required && param.source?.from !== "computed" && !allowed.has(param.name)) {
            errors.push(`${path}.endpointUrn has unsupported required parameter "${param.name}"`);
        }
    }
}
