import { AsyncLocalStorage } from "node:async_hooks";
const context = new AsyncLocalStorage<readonly string[]>();
/** Causality only: this context carries no actor, credential or authorization. */
export function withAccountEventCausation<T>(causation: readonly string[] | undefined, action: () => T): T {
    const ancestry = [...(causation ?? [])];
    if (ancestry.length > 32 || ancestry.some((id) => !/^[a-f0-9]{64}$/u.test(id))) {
        throw new TypeError("Invalid account Event causation");
    }
    return context.run(Object.freeze(ancestry), action);
}
export function accountEventCausation(): readonly string[] {
    return context.getStore() ?? [];
}
