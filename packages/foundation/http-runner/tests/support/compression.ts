import type { Cache, CacheEntry } from "@bernouy/http-runner";

export class MemCache implements Cache {
    store = new Map<string, CacheEntry>();
    getCalls = 0;
    setCalls = 0;

    get(key: string) {
        this.getCalls++;
        return this.store.get(key) ?? null;
    }

    set(key: string, value: CacheEntry) {
        this.setCalls++;
        this.store.set(key, value);
    }

    delete(key: string) {
        this.store.delete(key);
    }

    deleteMatching(predicate: (key: string) => boolean) {
        for (const key of this.store.keys()) {
            if (predicate(key)) {
                this.store.delete(key);
            }
        }
    }
}

export function reqWithAccept(encoding: string | null) {
    return new Request("http://localhost/", {
        headers: encoding ? { "accept-encoding": encoding } : {},
    });
}

export function bytesEqual(buffer: ArrayBuffer, bytes: Uint8Array): boolean {
    const actual = new Uint8Array(buffer);
    return actual.length === bytes.length && actual.every((value, index) => value === bytes[index]);
}
