import { showToast } from "@bernouy/components";
import { detailKey } from "../../domain";
import { setValueAt, valueAt } from "../../runtime/expressions";
import { executeDashboardMediaAction } from "../../runtime/actions";
import type { WidgetMediaActionDetail } from "../../widgets/shared";
import type { DashboardMediaItem } from "../../widgets/w-media-field/types";
import type { DashboardViewActionContext } from "./context";

export async function runDashboardMediaAction(
    context: DashboardViewActionContext,
    media: WidgetMediaActionDetail,
    widget?: HTMLElement,
): Promise<void> {
    const { group, dashboard, detail } = context;
    if (!group || !dashboard || !detail) {
        return;
    }
    const key = detailKey(detail.collection, detail.row);
    try {
        const result = await executeDashboardMediaAction(
            group,
            dashboard,
            detail,
            media,
            context.drafts.get(key) ?? {},
            context.groups ?? [group],
        );
        if (result.nested) {
            if (result.handled && (media.action === "upload" || media.action === "replace") && !result.item) {
                throw new Error("The media endpoint returned no usable media item");
            }
            const items = updateNestedDraft(context.drafts, key, media, result.item);
            showToast(`Media ${media.action} completed`, { type: "success" });
            if (!syncNestedMediaControl(widget, media.field, items)) {
                context.render();
            }
            return;
        }
        removeDraftField(context.drafts, key, media.field);
        showToast(`Media ${media.action} completed`, { type: "success" });
        context.reload(detail.collection, detail.row);
    } catch (error) {
        if (media.itemField) {
            const items = restoreNestedDraft(context.drafts, detailKey(detail.collection, detail.row), media);
            if (!syncNestedMediaControl(widget, media.field, items)) {
                context.render();
            }
        }
        showToast(error instanceof Error ? error.message : "Dashboard media action failed", { type: "error" });
    }
}

function updateNestedDraft(
    drafts: Map<string, Record<string, unknown>>,
    key: string,
    media: WidgetMediaActionDetail,
    item: DashboardMediaItem | undefined,
): Record<string, unknown>[] {
    const draft = { ...(drafts.get(key) ?? {}) };
    const items = cloneItems(draft[media.field]);
    const parent = nestedMediaParent(items, media);
    if (!parent || !media.itemPath) {
        throw new Error("The media choice no longer exists");
    }
    if (media.action === "upload" || media.action === "replace") {
        const local = media.value[0];
        setValueAt(parent, media.itemPath, item ? { ...item, ...(local?.alt ? { alt: local.alt } : {}) } : null);
    }
    draft[media.field] = items;
    drafts.set(key, draft);
    return items;
}

function restoreNestedDraft(
    drafts: Map<string, Record<string, unknown>>,
    key: string,
    media: WidgetMediaActionDetail,
): Record<string, unknown>[] {
    const draft = { ...(drafts.get(key) ?? {}) };
    const items = cloneItems(draft[media.field]);
    const parent = nestedMediaParent(items, media);
    if (!parent || !media.itemPath) {
        return items;
    }
    const restored = media.action === "replace" ? media.previousItem : media.action === "remove" ? media.item : null;
    setValueAt(parent, media.itemPath, restored ?? null);
    draft[media.field] = items;
    drafts.set(key, draft);
    return items;
}

function syncNestedMediaControl(
    widget: HTMLElement | undefined,
    field: string,
    items: Record<string, unknown>[],
): boolean {
    const control = Array.from(widget?.shadowRoot?.querySelectorAll<HTMLElement>("[data-field-control]") ?? []).find(
        (candidate) => candidate.dataset.fieldControl === field,
    ) as (HTMLElement & { data?: { items?: Record<string, unknown>[] } }) | undefined;
    if (!control?.data) {
        return false;
    }
    control.data = { ...control.data, items: structuredClone(items) };
    return true;
}

function cloneItems(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
        ? structuredClone(
              value.filter(
                  (item): item is Record<string, unknown> =>
                      item !== null && typeof item === "object" && !Array.isArray(item),
              ),
          )
        : [];
}

function nestedMediaParent(
    items: Record<string, unknown>[],
    media: WidgetMediaActionDetail,
): Record<string, unknown> | undefined {
    const pendingId = media.value[0]?.id;
    if (pendingId && media.itemPath) {
        const pending = items.find((item) => mediaItemId(valueAt(item, media.itemPath)) === pendingId);
        if (pending) {
            return pending;
        }
    }
    return items[media.itemIndex ?? -1];
}

function mediaItemId(value: unknown): string | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    return typeof (value as Record<string, unknown>).id === "string"
        ? ((value as Record<string, unknown>).id as string)
        : undefined;
}

function removeDraftField(drafts: Map<string, Record<string, unknown>>, key: string, field: string): void {
    const draft = { ...(drafts.get(key) ?? {}) };
    delete draft[field];
    Object.keys(draft).length ? drafts.set(key, draft) : drafts.delete(key);
}
