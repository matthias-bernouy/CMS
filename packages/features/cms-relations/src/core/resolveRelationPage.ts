import {
    executeEndpoint,
    makeEndpointUrn,
    sourceEndpointAccessAllows,
    sourceEndpointAccessMode,
    type ExecutorDeps,
    type SourceEndpointAccessMode,
    type SourceRepository,
} from "@bernouy/cms-sources";
import { RelationResolutionError } from "./errors";
import { arrayAt, textAt, valueAt } from "./paths";
import { normalizedPageRequest, relationRequestParams, requestUrl } from "./runtime/request";
import type { RelationPageRequest, RelationPageResult } from "./runtime/types";
import type { CmsRelation } from "../interfaces/Relation";

export type { RelationPageRequest, RelationPageResult } from "./runtime/types";

export type RelationRuntimeDeps = ExecutorDeps & {
    sources: SourceRepository;
    callerAccessMode?: SourceEndpointAccessMode;
};

export async function resolveRelationPage(
    relation: CmsRelation,
    fromItem: unknown,
    pageRequest: RelationPageRequest,
    deps: RelationRuntimeDeps,
): Promise<RelationPageResult> {
    if (relation.cardinality !== "many") {
        throw new RelationResolutionError("resolveRelationPage only supports many relations", 400);
    }
    if (!relation.page) {
        throw new RelationResolutionError(`relation "${relation.id}" does not declare pagination`, 500);
    }
    if (relation.binding.kind !== "reference") {
        throw new RelationResolutionError("linkTable relation runtime is not implemented yet", 501);
    }

    const endpoint = await deps.sources.getEndpoint(
        makeEndpointUrn(relation.binding.endpoint.sourceId, relation.binding.endpoint.endpointId),
    );
    if (!endpoint) {
        throw new RelationResolutionError(
            `relation endpoint not found: ${relation.binding.endpoint.sourceId}.${relation.binding.endpoint.endpointId}`,
            404,
        );
    }
    if (
        deps.callerAccessMode &&
        !sourceEndpointAccessAllows(sourceEndpointAccessMode(endpoint), deps.callerAccessMode)
    ) {
        throw new RelationResolutionError("relation endpoint is not accessible to caller", 403);
    }

    const page = normalizedPageRequest(relation, relation.binding, pageRequest);
    const params = relationRequestParams(relation, relation.binding, fromItem, page);
    const request = new Request(requestUrl(params));
    const response = await executeEndpoint(endpoint, request, deps);
    if (!response.ok) {
        throw new RelationResolutionError(
            (await response.text()) || `relation endpoint failed (${response.status})`,
            response.status,
        );
    }

    const data = await response.json().catch(() => {
        throw new RelationResolutionError("relation endpoint returned invalid JSON", 502);
    });
    const items = arrayAt(data, relation.page.itemsPath);
    const total = relation.page.totalPath ? numberValue(valueAt(data, relation.page.totalPath)) : undefined;
    const nextCursor = relation.page.nextCursorPath
        ? textAt(data, relation.page.nextCursorPath) || undefined
        : undefined;
    const result: RelationPageResult = {
        items,
        limit: page.limit,
    };
    if (total !== undefined) {
        result.total = total;
    }
    if (page.offsetApplied && page.offset !== undefined) {
        result.offset = page.offset;
    }
    if (nextCursor !== undefined) {
        result.nextCursor = nextCursor;
    }
    return result;
}

function numberValue(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
}
