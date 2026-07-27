import type { SiteBlocPublicationGuard } from "cms-content/interfaces/CmsRepository";

const HELD_GUARD: SiteBlocPublicationGuard = {
    assertHeld: async () => {},
};

/** Serializes publication graph reads and writes for non-distributed repositories. */
export class SiteBlocPublicationQueue {
    private tail: Promise<void> = Promise.resolve();

    async run<T>(operation: (guard: SiteBlocPublicationGuard) => Promise<T>): Promise<T> {
        const previous = this.tail;
        let release!: () => void;
        this.tail = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await operation(HELD_GUARD);
        } finally {
            release();
        }
    }
}
