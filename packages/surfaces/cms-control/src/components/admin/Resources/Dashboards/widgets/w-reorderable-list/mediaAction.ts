import { valueAt } from "../../runtime/expressions";
import type { DashboardMediaActionDetail } from "../w-media-field/types";
import { updateItem, type ReorderableListData } from "./state";

export function scopeMediaAction(
    value: ReorderableListData,
    event: CustomEvent<DashboardMediaActionDetail>,
): DashboardMediaActionDetail | null {
    const control = event
        .composedPath()
        .find(
            (target): target is HTMLElement =>
                target instanceof HTMLElement && target.matches("[data-item-index][data-item-path]"),
        );
    if (!control?.dataset.itemField) {
        return null;
    }
    const itemIndex = Number(control.dataset.itemIndex);
    const itemPath = control.dataset.itemPath ?? "";
    if (!updateItem(value, itemIndex, itemPath, event.detail.value[0] ?? null)) {
        return null;
    }
    const parentItem = structuredClone(value.items[itemIndex] ?? {});
    return {
        ...event.detail,
        itemIndex,
        itemKey: String(valueAt(parentItem, value.itemKey) ?? itemIndex),
        itemField: control.dataset.itemField,
        itemPath,
        parentItem,
    };
}
