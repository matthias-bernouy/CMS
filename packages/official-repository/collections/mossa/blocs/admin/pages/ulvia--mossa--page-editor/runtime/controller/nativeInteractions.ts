import type { PageEditingState } from "./editing";

type NativeControl = HTMLInputElement | HTMLSelectElement;

export function updateNativeTextControl(target: EventTarget | null, editing: PageEditingState): boolean {
    return target instanceof HTMLInputElement && target.type !== "checkbox" && updateNativeControl(target, editing);
}

export function updateNativeControl(target: EventTarget | null, editing: PageEditingState): boolean {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
        return false;
    }
    const { nativeAttribute, nativeKind, nativeSlot } = target.dataset;
    if (nativeAttribute === undefined || nativeSlot === undefined) {
        return false;
    }
    const value = nativeKind === "boolean" && target instanceof HTMLInputElement ? target.checked : target.value;
    editing.updateNativeAttribute(nativeSlot, nativeAttribute, value);
    return true;
}
