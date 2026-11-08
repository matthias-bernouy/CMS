import { AsyncLocalStorage } from "node:async_hooks";

const collection = new AsyncLocalStorage<boolean>();

/** Transport diagnostics must never feed the transport itself. */
export function withoutLogCollection<T>(operation: () => T): T {
    return collection.run(false, operation);
}

export function collectionEnabled(): boolean {
    return collection.getStore() !== false;
}
