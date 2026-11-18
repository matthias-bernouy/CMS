import type { SiteBlocPublicationGuard } from "content/application/interfaces/ContentRepository";
import { AsyncLocalStorage } from "node:async_hooks";
import { ContentConflictError } from "content/application/core/validation/errors";

const HELD_GUARD: SiteBlocPublicationGuard = {
    assertHeld: async () => {},
};

/** Serializes publication graph reads and writes for non-distributed repositories. */
export class SiteBlocPublicationQueue {
    private tail: Promise<void> = Promise.resolve();
    private readonly active = new AsyncLocalStorage<{ held: boolean }>();

    async run<T>(operation: (guard: SiteBlocPublicationGuard) => Promise<T>): Promise<T> {
        if (this.active.getStore()?.held) {
            throw new ContentConflictError("Nested content reference/publication operations are not supported");
        }
        const previous = this.tail;
        let release!: () => void;
        this.tail = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        const context = { held: true };
        try {
            return await this.active.run(context, () => operation(HELD_GUARD));
        } finally {
            context.held = false;
            release();
        }
    }
}
