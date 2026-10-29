/** One rendering operation's resource metadata. Never retain Pages, settings, actors or secret values. */
export class RenderingResourceReads {
    #pending = new WeakMap<object, Map<string, Promise<unknown>>>();
    #closed = false;
    #revisions = new WeakMap<object, Map<string, number | string>>();

    rememberRevision(owner: object, key: string, revision: number | string): void {
        this.assertOpen();
        let entries = this.#revisions.get(owner);
        if (!entries) {
            entries = new Map();
            this.#revisions.set(owner, entries);
        }
        entries.set(key, revision);
    }

    revision(owner: object, key: string): number | string | undefined {
        this.assertOpen();
        return this.#revisions.get(owner)?.get(key);
    }

    async resource<T>(owner: object, key: string, load: () => Promise<T>): Promise<T> {
        this.assertOpen();
        let entries = this.#pending.get(owner);
        if (!entries) {
            entries = new Map();
            this.#pending.set(owner, entries);
        }
        let pending = entries.get(key);
        if (!pending) {
            pending = Promise.resolve().then(() => {
                this.assertOpen();
                return load();
            });
            entries.set(key, pending);
            const current = pending;
            pending.catch(() => {
                if (entries.get(key) === current) {
                    entries.delete(key);
                }
            });
        }
        const result = await pending;
        this.assertOpen();
        return result as T;
    }

    close(): void {
        this.#closed = true;
        this.#pending = new WeakMap();
        this.#revisions = new WeakMap();
    }

    private assertOpen(): void {
        if (this.#closed) {
            throw new TypeError("Rendering resource reads are closed");
        }
    }
}
