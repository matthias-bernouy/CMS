type Description = Readonly<{
    version: string;
    capabilities: readonly { id: string; access: "public" | "authenticated" | "admin" }[];
}>;
type Entry = { value: Description; bytes: number };

/** Rendering metadata only; never grants authority to invoke a capability. One cache per instance runtime. */
export function createDescriptionCache(readRevision: () => Promise<number>) {
    const entries = new Map<string, Entry>();
    const pending = new Map<string, { result: Promise<Description | null>; waiters: number }>();
    let bytes = 0;
    const remove = (key: string) => {
        const old = entries.get(key);
        if (old) {
            bytes -= old.bytes;
            entries.delete(key);
        }
    };
    return async (
        contractId: string,
        revision: number,
        load: () => Promise<Description | null>,
    ): Promise<Description | null> => {
        const key = `${revision}\0${contractId}`;
        const cached = entries.get(key);
        if (cached) {
            return cached.value;
        }
        remove(key);
        const active = pending.get(key);
        if (active) {
            if (active.waiters >= 256) {
                throw new Error("Page capability description waiter capacity exceeded");
            }
            active.waiters++;
            try {
                return await active.result;
            } finally {
                active.waiters--;
            }
        }
        if (pending.size >= 16) {
            throw new Error("Page capability description load capacity exceeded");
        }
        const task = Promise.resolve()
            .then(load)
            .then(async (value) => {
                if (!value) {
                    return null;
                }
                const snapshot = Object.freeze({
                    version: value.version,
                    capabilities: Object.freeze(
                        value.capabilities.map((capability) => Object.freeze({ ...capability })),
                    ),
                });
                const size = Buffer.byteLength(JSON.stringify(snapshot));
                // An oversized result may be used for this call but is never retained.
                if (size <= 64 * 1024 && (await readRevision()) === revision) {
                    while (entries.size >= 64 || bytes + size > 256 * 1024) {
                        remove(entries.keys().next().value!);
                    }
                    entries.set(key, { value: snapshot, bytes: size });
                    bytes += size;
                }
                return snapshot;
            })
            .finally(() => {
                pending.delete(key);
            });
        pending.set(key, { result: task, waiters: 1 });
        return task;
    };
}
