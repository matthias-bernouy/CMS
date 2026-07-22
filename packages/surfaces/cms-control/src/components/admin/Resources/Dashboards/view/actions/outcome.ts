import type { DashboardActionCompletion, DetailSelection } from "../../domain";
import { resolveExpression } from "../../runtime/expressions";
import type { DashboardViewActionContext } from "./context";

export type ResolvedResource = { found: true; value: unknown } | { found: false };

export function once(finish: (() => DashboardActionCompletion) | undefined): () => DashboardActionCompletion {
    let completion: DashboardActionCompletion | undefined;
    return () => (completion ??= finish?.() ?? "reuse");
}

export function postActionResource(after: { resource?: string } | undefined, result: unknown): ResolvedResource {
    if (!after?.resource) {
        return { found: false };
    }
    const value = resolveExpression(after.resource, { result });
    return value === undefined ? { found: false } : { found: true, value };
}

export function postActionResourceTarget(
    declaredAfter: { opens?: string } | undefined,
    after: DetailSelection | null,
    actionDetail: DetailSelection | null,
    detail: DetailSelection | null,
    actionId: string,
    result: unknown,
    resource: ResolvedResource,
): DetailSelection | null {
    if (declaredAfter?.opens) {
        return after;
    }
    if (!actionDetail || actionId.startsWith("delete")) {
        return null;
    }
    if (detail?.row !== "__new__") {
        return actionDetail;
    }
    const row = postActionCreatedId(result, resource);
    return row ? { collection: detail.collection, row } : null;
}

export function renderResourceTarget(
    context: DashboardViewActionContext,
    target: DetailSelection,
    after: DetailSelection | null,
    detail: DetailSelection | null,
): void {
    if (after || detail?.row === "__new__") {
        context.openDetail(target.collection, target.row);
        return;
    }
    context.render();
}

export function runPostActionFallback(
    context: DashboardViewActionContext,
    after: DetailSelection | null,
    detail: DetailSelection | null,
    actionId: string,
    result: unknown,
    resource: ResolvedResource,
): void {
    const created = postActionCreatedId(result, resource);
    if (after) {
        context.openDetail(after.collection, after.row);
    } else if (!detail) {
        context.render();
    } else if (actionId.startsWith("delete")) {
        context.clearDetail();
    } else if (detail.row === "__new__" && created) {
        context.openDetail(detail.collection, created);
    } else {
        context.reload(detail.collection, detail.row);
    }
}

export function changesPostActionSelection(
    after: DetailSelection | null,
    detail: DetailSelection | null,
    actionId: string,
    result: unknown,
    resource: ResolvedResource,
): boolean {
    if (after) {
        return !detail || after.collection !== detail.collection || after.row !== detail.row;
    }
    return Boolean(
        detail &&
            (actionId.startsWith("delete") ||
                (detail.row === "__new__" && postActionCreatedId(result, resource) !== null)),
    );
}

export function afterTarget(
    after: { opens?: string; row?: string } | undefined,
    result: unknown,
    detail: DetailSelection | null,
): DetailSelection | null {
    if (!after?.opens) {
        return null;
    }
    const rowValue =
        after.row === undefined
            ? createdId(result)
            : resolveExpression(after.row, {
                  result,
                  ...(detail ? { selection: { id: detail.row } } : {}),
              });
    const row = stringValue(rowValue);
    return row ? { collection: after.opens, row } : null;
}

function createdId(value: unknown): string | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const id = (value as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim()) {
        return id;
    }
    if (typeof id === "number" && Number.isFinite(id)) {
        return String(id);
    }
    return null;
}

function postActionCreatedId(result: unknown, resource: ResolvedResource): string | null {
    return createdId(result) ?? (resource.found ? createdId(resource.value) : null);
}

function stringValue(value: unknown): string {
    if (value === null || value === undefined) {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return "";
}
