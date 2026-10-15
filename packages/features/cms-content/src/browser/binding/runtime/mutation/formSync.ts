import { parseSyncAttribute, parseSyncSelectionAttribute, writeSyncValue } from "../../state/SyncState";
import { projectSyncValue } from "../../state/selectSyncValue";
import type { MutationState } from "./mutationState";

export function publishFormSync(form: HTMLFormElement, state: MutationState, input: unknown, dirty: boolean): void {
    const target = parseSyncAttribute(form);
    if (!target) {
        return;
    }
    try {
        const snapshot = { ...state, ...(input === undefined ? {} : { input }), dirty };
        writeSyncValue(target, projectSyncValue(snapshot, parseSyncSelectionAttribute(form)), form.ownerDocument, {
            source: form,
        });
    } catch (error) {
        console.warn("cms-sync could not publish form state", error);
    }
}
