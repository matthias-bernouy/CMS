import { valueAt } from "../paths";
import type { CmsRelation, ReferenceRelationBinding } from "../../interfaces/Relation";
import type { NormalizedPageRequest, RelationPageRequest } from "./types";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export function relationRequestParams(
    relation: CmsRelation,
    binding: ReferenceRelationBinding,
    fromItem: unknown,
    pageRequest: NormalizedPageRequest,
): Record<string, string> {
    const params: Record<string, string> = {};
    for (const [name, expression] of Object.entries(binding.params)) {
        const value = resolveRelationExpression(expression, fromItem, pageRequest);
        if (value !== undefined && value !== null && value !== "") {
            params[name] = String(value);
        }
    }

    const page = relation.page;
    if (page?.limitParam) {
        params[page.limitParam] = String(pageRequest.limit);
    }
    if (page?.offsetParam && pageRequest.offset !== undefined) {
        params[page.offsetParam] = String(pageRequest.offset);
    }
    if (page?.cursorParam && pageRequest.cursor) {
        params[page.cursorParam] = pageRequest.cursor;
    }
    return params;
}

export function normalizedPageRequest(
    relation: CmsRelation,
    binding: ReferenceRelationBinding,
    request: RelationPageRequest,
): NormalizedPageRequest {
    const offset = boundedOffset(request.offset);
    return {
        limit: boundedLimit(relation, request.limit),
        ...(offset !== undefined ? { offset } : {}),
        ...(request.cursor ? { cursor: request.cursor } : {}),
        offsetApplied:
            offset !== undefined &&
            (Boolean(relation.page?.offsetParam) || Object.values(binding.params).includes("$page.offset")),
    };
}

export function requestUrl(params: Record<string, string>): string {
    const url = new URL("https://cms.local/.cms/relation");
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return url.toString();
}

function resolveRelationExpression(expression: string, fromItem: unknown, pageRequest: NormalizedPageRequest): unknown {
    if (!expression.startsWith("$")) {
        return expression;
    }
    if (expression === "$from") {
        return fromItem;
    }
    if (expression.startsWith("$from.")) {
        return valueAt(fromItem, expression.slice("$from.".length));
    }
    if (expression === "$page.limit") {
        return pageRequest.limit;
    }
    if (expression === "$page.offset") {
        return pageRequest.offset;
    }
    if (expression === "$page.cursor") {
        return pageRequest.cursor;
    }
    return undefined;
}

function boundedLimit(relation: CmsRelation, requested: number | undefined): number {
    const max = relation.page?.maxLimit ?? MAX_LIMIT;
    const fallback = relation.page?.defaultLimit ?? Math.min(DEFAULT_LIMIT, max);
    const value = requested ?? fallback;
    if (!Number.isInteger(value) || value < 1) {
        return fallback;
    }
    return Math.min(value, max);
}

function boundedOffset(requested: number | undefined): number | undefined {
    if (requested === undefined) {
        return undefined;
    }
    if (!Number.isInteger(requested) || requested < 0) {
        return 0;
    }
    return requested;
}
