type Description = Readonly<{
    version: string;
    capabilities: readonly { id: string; access: "public" | "authenticated" | "admin" }[];
}>;
type Entry = { value: Description; expires: number; bytes: number };

/** Rendering metadata only; never grants authority to invoke a capability. One cache per instance runtime. */
export function createDescriptionCache(now = () => performance.now()) {
    const entries = new Map<string, Entry>();
    const pending = new Map<string, Promise<Description | null>>();
    let bytes = 0;
    const remove = (key: string) => {
        const old = entries.get(key);
        if (old) {
            bytes -= old.bytes;
            entries.delete(key);
        }
    };
    return async (key: string, load: () => Promise<Description | null>): Promise<Description | null> => {
        const cached = entries.get(key);
        if (cached && cached.expires > now()) {
            return cached.value;
        }
        remove(key);
        const active = pending.get(key);
        if (active) {
            return active;
        }
        if (pending.size >= 16) {
            throw new Error("Page capability description load capacity exceeded");
        }
        const task = Promise.resolve()
            .then(load)
            .then((value) => {
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
                if (size <= 64 * 1024) {
                    while (entries.size >= 64 || bytes + size > 256 * 1024) {
                        remove(entries.keys().next().value!);
                    }
                    entries.set(key, { value: snapshot, expires: now() + 5_000, bytes: size });
                    bytes += size;
                }
                return snapshot;
            })
            .finally(() => {
                pending.delete(key);
            });
        pending.set(key, task);
        return task;
    };
}
