export type SourceContext = (data: unknown) => Record<string, unknown>;

const contexts = new WeakMap<Element, SourceContext>();
const refreshers = new WeakMap<Element, () => void>();

/** Add local scope variables; source aliases and status variables remain owned by binding. */
export function setSourceContext(source: Element, context: SourceContext): void {
    contexts.set(source, context);
    refreshSourceContext(source);
}

/** Reevaluate local state without a request, cancellation or source-status transition. */
export function refreshSourceContext(source: Element): void {
    refreshers.get(source)?.();
}

export function sourceContext(source: Element, data: unknown): Record<string, unknown> {
    return contexts.get(source)?.(data) ?? {};
}

export function connectSourceContext(source: Element, refresh: () => void): () => void {
    refreshers.set(source, refresh);
    return () => {
        if (refreshers.get(source) === refresh) {
            refreshers.delete(source);
        }
    };
}
