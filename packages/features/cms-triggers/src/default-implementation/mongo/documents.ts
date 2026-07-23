import type { TriggerRecord } from "../../interfaces/TriggerDefinition";

export type TriggerDoc = Omit<TriggerRecord, "id"> & {
    _id: string;
    _claimToken?: string;
    _claimOwner?: string;
};

export function toDoc(trigger: TriggerRecord): TriggerDoc {
    const { id, ...rest } = trigger;
    return { _id: id, ...rest };
}

export function fromDoc(doc: TriggerDoc | null): TriggerRecord | null {
    if (!doc) {
        return null;
    }
    const { _id, _claimToken, _claimOwner, ...rest } = doc;
    return { id: _id, ...rest } as TriggerRecord;
}
