import type { CollectionMigrationStorage } from "../interfaces";

export function withCollectionMigrationWriteFence<T extends object>(
    target: T,
    fence: Pick<CollectionMigrationStorage, "withWrite">,
    siteId: string | ((method: string, args: readonly unknown[]) => string),
    methods: readonly string[],
): T {
    const guarded = new Set(methods);
    return new Proxy(target, {
        get(current, property, receiver) {
            const value = Reflect.get(current, property, receiver);
            if (typeof property !== "string" || typeof value !== "function" || !guarded.has(property)) {
                return value;
            }
            return (...args: unknown[]) =>
                fence.withWrite(typeof siteId === "string" ? siteId : siteId(property, args), () =>
                    Reflect.apply(value, current, args),
                );
        },
    });
}
