import { parseSyncAttribute, writeSyncValue } from "../../state/SyncState";
import type { MutationState } from "./mutationState";

export function publishFormSync(form: HTMLFormElement, state: MutationState, input: unknown, dirty: boolean): void {
    const target = parseSyncAttribute(form);
    if (!target) {
        return;
    }
    try {
        const synchronizedState =
            state.data && typeof state.data === "object" && "form" in state.data
                ? { ...state, data: serializableResult(state.data as Record<string, unknown>) }
                : state;
        writeSyncValue(
            target,
            { ...synchronizedState, ...(input === undefined ? {} : { input }), dirty },
            form.ownerDocument,
        );
    } catch (error) {
        console.warn("cms-sync could not publish form state", error);
    }
}

function serializableResult(result: Record<string, unknown>): Record<string, unknown> {
    const { form: _form, ...serializable } = result;
    return serializable;
}
