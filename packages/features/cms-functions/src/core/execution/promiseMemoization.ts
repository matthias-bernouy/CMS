export function memoizePromise<Key, Value>(
    cache: Map<Key, Promise<Value>>,
    key: Key,
    load: () => Value | Promise<Value>,
): Promise<Value> {
    const existing = cache.get(key);
    if (existing) return existing;

    const pending = Promise.resolve().then(load);
    cache.set(key, pending);
    void pending.catch(() => {
        if (cache.get(key) === pending) cache.delete(key);
    });
    return pending;
}
