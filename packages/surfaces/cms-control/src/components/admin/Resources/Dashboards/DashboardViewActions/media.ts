import { showToast } from "@bernouy/components";
import { detailKey } from "../domain";
import { executeDashboardMediaAction } from "../runtime/actions";
import type { WidgetMediaActionDetail } from "../widgets/shared";
import type { DashboardViewActionContext } from "./context";

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
