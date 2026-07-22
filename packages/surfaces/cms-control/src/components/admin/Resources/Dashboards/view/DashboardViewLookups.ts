import { showToast } from "@bernouy/components";
import { detailKey } from "../domain";
import { executeLookupCreate } from "../runtime/lookups/create";
import type { DashboardViewActionContext } from "./actions";
import type { WidgetFieldChangeDetail } from "../widgets/shared";

type LookupCreateTarget = (EventTarget | null) & {
    applyLookupCreate?: (fieldId: string, value: unknown, option: { value: string; label: string }) => void;
};

export async function runDashboardLookupCreate(
    context: DashboardViewActionContext,
    change: WidgetFieldChangeDetail,
    previousDraft: Record<string, unknown>,
    target?: EventTarget | null,
): Promise<void> {
    const { group, dashboard, detail } = context;
    if (!change.created || !group || !dashboard || !detail) {
        return;
    }
    const key = detailKey(detail.collection, change.rowKey);
    const nextDraft = context.drafts.get(key) ?? {};
    try {
        const result = await executeLookupCreate(
            group,
            dashboard,
            detail,
            change.field,
            previousDraft,
            nextDraft,
            context.groups ?? [group],
        );
        if (result === undefined) {
            return;
        }
        context.drafts.set(key, { ...nextDraft, [change.field]: result.value });
        applyLookupCreate(target, change.field, result.value, result.option);
        showToast("Item created", { type: "success" });
    } catch (error) {
        showToast(error instanceof Error ? error.message : "Lookup creation failed", { type: "error" });
    }
}

function applyLookupCreate(
    target: EventTarget | null | undefined,
    field: string,
    value: unknown,
    option: { value: string; label: string },
): void {
    const detail = target as LookupCreateTarget;
    detail?.applyLookupCreate?.(field, value, option);
}
