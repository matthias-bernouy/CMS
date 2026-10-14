/** Values belong to live query and form binding instances. */
const values = new WeakMap<Element, unknown>();

export function readSourceData(source: Element): unknown {
    return values.get(source);
}

export function rememberSourceData(source: Element, value: unknown): void {
    values.set(source, value);
}

export function disconnectSourceData(source: Element): void {
    values.delete(source);
}
