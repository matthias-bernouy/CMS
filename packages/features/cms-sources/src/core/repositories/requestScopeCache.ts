export function memoizeRequestPromise<Key, Value>(
    cache: Map<Key, Promise<Value>>,
    key: Key,
    load: () => Value | Promise<Value>,
): Promise<Value> {
    const cached = cache.get(key);
    if (cached) {
        return cached;
    }
    const pending = Promise.resolve().then(load);
    cache.set(key, pending);
    void pending.catch(() => {
        if (cache.get(key) === pending) {
            cache.delete(key);
        }
    });
    return pending;
}

export function memoizeWeakRequestPromise<Key extends WeakKey, Value>(
    cache: WeakMap<Key, Promise<Value>>,
    key: Key,
    load: () => Value | Promise<Value>,
): Promise<Value> {
    const cached = cache.get(key);
    if (cached) {
        return cached;
    }
    const pending = Promise.resolve().then(load);
    cache.set(key, pending);
    void pending.catch(() => {
        if (cache.get(key) === pending) {
            cache.delete(key);
        }
    });
    return pending;
}
