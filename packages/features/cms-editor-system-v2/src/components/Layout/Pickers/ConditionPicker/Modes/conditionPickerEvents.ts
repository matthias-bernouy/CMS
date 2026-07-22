import type { ConditionPickerApplyDetail } from "./types";

export const CONDITION_PICKER_APPLY_EVENT = "editor-v2:condition-apply";
export const CONDITION_PICKER_REMOVE_EVENT = "editor-v2:condition-remove";

export function dispatchConditionApply(host: HTMLElement, detail: ConditionPickerApplyDetail): void {
    host.dispatchEvent(
        new CustomEvent<ConditionPickerApplyDetail>(CONDITION_PICKER_APPLY_EVENT, {
            bubbles: true,
            composed: true,
            detail,
        }),
    );
}

export function dispatchConditionRemove(host: HTMLElement): void {
    host.dispatchEvent(new CustomEvent(CONDITION_PICKER_REMOVE_EVENT, { bubbles: true, composed: true }));
}
