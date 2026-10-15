import { parseSyncAttribute, writeSyncValue } from "../../state/SyncState";
import type { MutationState } from "./mutationState";

export function publishFormSync(form: HTMLFormElement, state: MutationState, input: unknown, dirty: boolean): void {
    const target = parseSyncAttribute(form);
    if (!target) {
        return;
    }
    try {
        writeSyncValue(target, { ...state, ...(input === undefined ? {} : { input }), dirty }, form.ownerDocument, {
            source: form,
        });
    } catch (error) {
        console.warn("cms-sync could not publish form state", error);
    }
}
