import { AsyncLocalStorage } from "node:async_hooks";
import type { Collection, Db } from "mongodb";
import type { SiteBlocPublicationGuard } from "content/application/interfaces/ContentRepository";
import type { SiteBlocPublicationLockDoc } from "content/application/default-implementation/mongo/repositories/documents";
import { MONGO_PUBLICATION_GUARDS } from "../state";

class UncertainReferenceWrite extends Error {
    status = 503;
    constructor(cause: unknown) {
        super(cause instanceof Error ? cause.message : "Uncertain Content storage write", { cause });
        this.name = "UncertainReferenceWrite";
    }
}

export const referenceWrites = new AsyncLocalStorage<{
    db: Db;
    locks: Collection<SiteBlocPublicationLockDoc>;
    guard: SiteBlocPublicationGuard;
    unresolved: Set<Error>;
}>();

export function uncertainReferenceWrite(cause: unknown): Error {
    const error = new UncertainReferenceWrite(cause);
    const context = referenceWrites.getStore()!;
    context.unresolved.add(error);
    MONGO_PUBLICATION_GUARDS.get(context.guard)!.retainFence = true;
    return error;
}

/** Call only after the owning repository proves that this exact write was applied. */
export function acknowledgeReconciledReferenceWrite(error: unknown): void {
    const context = referenceWrites.getStore();
    if (context && error instanceof UncertainReferenceWrite && context.unresolved.delete(error)) {
        MONGO_PUBLICATION_GUARDS.get(context.guard)!.retainFence = context.unresolved.size > 0;
    }
}
