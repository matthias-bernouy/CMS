import { showToast } from "@bernouy/components";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import { detailKey, type DetailSelection } from "./domain";
import { executeDashboardAction, executeDashboardMediaAction } from "./runtime/actions";
import type { DashboardSourceGroup } from "./types";
import type { WidgetMediaActionDetail } from "./widgets/shared";

export type DashboardViewActionContext = {
    group: DashboardSourceGroup | null;
    dashboard: DashboardDto | null | undefined;
    detail: DetailSelection | null;
    drafts: Map<string, Record<string, unknown>>;
    render: () => void;
    reload: (collection: string, row: string) => void;
};

export async function runDashboardWidgetAction(context: DashboardViewActionContext, action: string): Promise<void> {
    const { group, dashboard, detail } = context;
    if (!group || !dashboard || !detail) return;
    const key = detailKey(detail.collection, detail.row);
    try {
        await executeDashboardAction(group, dashboard, detail, action, context.drafts.get(key) ?? {});
        context.drafts.delete(key);
        showToast(`${action} completed`, { type: "success" });
        context.reload(detail.collection, detail.row);
    } catch (error) {
        showToast(error instanceof Error ? error.message : "Dashboard action failed", { type: "error" });
    }
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
