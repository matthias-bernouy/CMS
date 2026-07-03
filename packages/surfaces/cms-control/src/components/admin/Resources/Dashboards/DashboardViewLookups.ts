import { showToast } from "@bernouy/components";
import { detailKey } from "./domain";
import { executeLookupCreate } from "./runtime/lookupCreate";
import type { DashboardViewActionContext } from "./DashboardViewActions";
import type { WidgetFieldChangeDetail } from "./widgets/shared";

export async function runDashboardLookupCreate(
    context: DashboardViewActionContext,
    change: WidgetFieldChangeDetail,
    previousDraft: Record<string, unknown>,
): Promise<void> {
    const { group, dashboard, detail } = context;
    if (!change.created || !group || !dashboard || !detail) return;
    const key = detailKey(detail.collection, change.rowKey);
    const nextDraft = context.drafts.get(key) ?? {};
    try {
        const value = await executeLookupCreate(group, dashboard, detail, change.field, previousDraft, nextDraft);
        if (value === undefined) return;
        context.drafts.set(key, { ...nextDraft, [change.field]: value });
        showToast("Item created", { type: "success" });
        context.render();
    } catch (error) {
        showToast(error instanceof Error ? error.message : "Lookup creation failed", { type: "error" });
    }
}
