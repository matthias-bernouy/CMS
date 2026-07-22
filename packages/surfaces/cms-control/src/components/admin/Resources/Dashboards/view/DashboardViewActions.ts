import { showToast } from "@bernouy/components";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import { detailKey, type DetailSelection } from "../domain";
import { executeDashboardAction, executeDashboardMediaAction, executeDashboardTableAction } from "../runtime/actions";
import type { DashboardSourceGroup } from "../types";
import type { WidgetActionDetail, WidgetMediaActionDetail } from "../widgets/shared";
import { afterTarget, createdId, downloadBlob } from "./controller/actionResult";

export type DashboardViewActionContext = {
    group: DashboardSourceGroup | null;
    groups?: DashboardSourceGroup[];
    dashboard: DashboardDto | null | undefined;
    detail: DetailSelection | null;
    drafts: Map<string, Record<string, unknown>>;
    render: () => void;
    reloadDefinitions?: () => Promise<void>;
    reload: (collection: string, row: string) => void;
    clearDetail: () => void;
    openDetail: (collection: string, row: string) => void;
};

export async function runDashboardWidgetAction(
    context: DashboardViewActionContext,
    action: WidgetActionDetail,
): Promise<void> {
    const { group, dashboard, detail } = context;
    if (!group || !dashboard) {
        return;
    }
    const actionDetail =
        detail ?? (action.detail && action.widget ? { collection: action.widget, row: action.row ?? "" } : null);
    const key = actionDetail ? detailKey(actionDetail.collection, actionDetail.row) : "";
    try {
        const result = actionDetail
            ? await executeDashboardAction(
                  group,
                  dashboard,
                  actionDetail,
                  action.action,
                  {
                      ...(context.drafts.get(key) ?? {}),
                      ...(action.fields ?? {}),
                  },
                  action.resource,
                  context.groups ?? [group],
              )
            : await executeDashboardTableAction(
                  group,
                  dashboard,
                  action.action,
                  action.widget,
                  action.value,
                  context.groups ?? [group],
              );
        if (actionDetail) {
            context.drafts.delete(key);
        }
        if (result.invalidatesSchema && context.reloadDefinitions) {
            try {
                await context.reloadDefinitions();
            } catch {
                showToast(`${action.action} completed, but CMS definitions could not be reloaded`, { type: "warning" });
            }
        }
        if (result.kind === "download") {
            downloadBlob(result.blob, result.filename);
            showToast(`${action.action} downloaded`, { type: "success" });
            return;
        }
        showToast(`${action.action} completed`, { type: "success" });
        const after = result.kind === "value" ? afterTarget(result.after, result.value, actionDetail) : null;
        if (after) {
            context.openDetail(after.collection, after.row);
        } else if (!detail) {
            context.render();
        } else if (action.action.startsWith("delete")) {
            context.clearDetail();
        } else if (detail.row === "__new__" && createdId(result.value)) {
            context.openDetail(detail.collection, createdId(result.value)!);
        } else {
            context.reload(detail.collection, detail.row);
        }
    } catch (error) {
        showToast(error instanceof Error ? error.message : "Dashboard action failed", { type: "error" });
    }
}

export async function runDashboardMediaAction(
    context: DashboardViewActionContext,
    media: WidgetMediaActionDetail,
): Promise<void> {
    const { group, dashboard, detail } = context;
    if (!group || !dashboard || !detail) {
        return;
    }
    const key = detailKey(detail.collection, detail.row);
    try {
        await executeDashboardMediaAction(
            group,
            dashboard,
            detail,
            media,
            context.drafts.get(key) ?? {},
            context.groups ?? [group],
        );
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
