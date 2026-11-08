import type { SiteWriteFence } from "./interfaces";

export function withSiteWriteFence<T extends object>(
    target: T,
    fence: Pick<SiteWriteFence, "withWrite">,
    siteId: string | ((method: string, args: readonly unknown[]) => string),
    methods: readonly string[],
): T {
    const guarded = new Set(methods);
    return new Proxy(target, {
        get(current, property) {
            const value = Reflect.get(current, property, current);
            if (typeof property !== "string" || typeof value !== "function" || !guarded.has(property)) {
                return typeof value === "function" ? value.bind(current) : value;
            }
            return (...args: unknown[]) =>
                fence.withWrite(typeof siteId === "string" ? siteId : siteId(property, args), () =>
                    Reflect.apply(value, current, args),
                );
        },
    });
}
