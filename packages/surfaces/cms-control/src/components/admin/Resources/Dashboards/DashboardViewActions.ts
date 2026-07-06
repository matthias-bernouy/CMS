import { showToast } from "@bernouy/components";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import { detailKey, type DetailSelection } from "./domain";
import { executeDashboardAction, executeDashboardMediaAction, executeDashboardTableAction } from "./runtime/actions";
import { resolveExpression } from "./runtime/expressions";
import type { DashboardSourceGroup } from "./types";
import type { WidgetActionDetail, WidgetMediaActionDetail } from "./widgets/shared";

export type DashboardViewActionContext = {
    group: DashboardSourceGroup | null;
    dashboard: DashboardDto | null | undefined;
    detail: DetailSelection | null;
    drafts: Map<string, Record<string, unknown>>;
    render: () => void;
    reload: (collection: string, row: string) => void;
    clearDetail: () => void;
    openDetail: (collection: string, row: string) => void;
};

export async function runDashboardWidgetAction(context: DashboardViewActionContext, action: WidgetActionDetail): Promise<void> {
    const { group, dashboard, detail } = context;
    if (!group || !dashboard) return;
    const key = detail ? detailKey(detail.collection, detail.row) : "";
    try {
        const result = detail
            ? await executeDashboardAction(group, dashboard, detail, action.action, {
                ...(context.drafts.get(key) ?? {}),
                ...(action.fields ?? {}),
            }, action.resource)
            : await executeDashboardTableAction(group, dashboard, action.action, action.widget);
        if (detail) context.drafts.delete(key);
        if (result.kind === "download") {
            downloadBlob(result.blob, result.filename);
            showToast(`${action.action} downloaded`, { type: "success" });
            return;
        }
        showToast(`${action.action} completed`, { type: "success" });
        const after = result.kind === "value" ? afterTarget(result.after, result.value, detail) : null;
        if (after) context.openDetail(after.collection, after.row);
        else if (!detail) context.render();
        else if (action.action.startsWith("delete")) context.clearDetail();
        else if (detail.row === "__new__" && createdId(result.value)) context.openDetail(detail.collection, createdId(result.value)!);
        else context.reload(detail.collection, detail.row);
    } catch (error) {
        showToast(error instanceof Error ? error.message : "Dashboard action failed", { type: "error" });
    }
}

function downloadBlob(blob: Blob, filename: string): void {
    if (typeof URL.createObjectURL !== "function") throw new Error("Downloads are not supported in this browser");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    if (typeof URL.revokeObjectURL === "function") window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function createdId(value: unknown): string | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const id = (value as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim()) return id;
    if (typeof id === "number" && Number.isFinite(id)) return String(id);
    return null;
}

function afterTarget(
    after: { opens: string; row?: string } | undefined,
    result: unknown,
    detail: DetailSelection | null,
): DetailSelection | null {
    if (!after?.opens) return null;
    const rowValue = after.row === undefined
        ? createdId(result)
        : resolveExpression(after.row, {
            result,
            ...(detail ? { selection: { id: detail.row } } : {}),
        });
    const row = stringValue(rowValue);
    return row ? { collection: after.opens, row } : null;
}

function stringValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
}

export async function runDashboardMediaAction(context: DashboardViewActionContext, media: WidgetMediaActionDetail): Promise<void> {
    const { group, dashboard, detail } = context;
    if (!group || !dashboard || !detail) return;
    const key = detailKey(detail.collection, detail.row);
    try {
        await executeDashboardMediaAction(group, dashboard, detail, media, context.drafts.get(key) ?? {});
        removeDraftField(context.drafts, key, media.field);
        showToast(`Media ${media.action} completed`, { type: "success" });
        context.reload(detail.collection, detail.row);
    } catch (error) {
        showToast(error instanceof Error ? error.message : "Dashboard media action failed", { type: "error" });
    }
}

function removeDraftField(drafts: Map<string, Record<string, unknown>>, key: string, field: string): void {
    const draft = { ...(drafts.get(key) ?? {}) };
    delete draft[field];
    Object.keys(draft).length ? drafts.set(key, draft) : drafts.delete(key);
}
