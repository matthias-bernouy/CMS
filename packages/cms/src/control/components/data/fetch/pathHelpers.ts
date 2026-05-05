/**
 * Resolve a dotted path against an object (`a.b.c` → obj.a.b.c).
 * Returns undefined when any intermediate hop is null/undefined.
 */
export function resolve(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>(
        (acc, k) => (acc != null ? (acc as Record<string, unknown>)[k] : undefined),
        obj,
    );
}

export function escape(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
