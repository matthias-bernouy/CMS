import type { PendingProviderConnection } from "./connectionTypes";

export interface ProviderConnectionDraftStore {
    get(ticket: string): Promise<PendingProviderConnection | undefined>;
    set(ticket: string, value: PendingProviderConnection): Promise<void>;
    delete(ticket: string): Promise<void>;
}

export function memoryConnectionDrafts(now: () => number): ProviderConnectionDraftStore {
    const pending = new Map<string, PendingProviderConnection>();
    return {
        get: async (ticket) => pending.get(ticket),
        set: async (ticket, value) => {
            for (const [id, draft] of pending) {
                if (now() - draft.createdAt > 300_000) {
                    pending.delete(id);
                }
            }
            if (pending.size >= 100 && !pending.has(ticket)) {
                throw new Error("Too many pending Provider connections");
            }
            pending.set(ticket, structuredClone(value));
        },
        delete: async (ticket) => {
            pending.delete(ticket);
        },
    };
}
