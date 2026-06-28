import type { DataShape, SourceMeta, EndpointResponse, EndpointHeader, ParamValueSource } from "@bernouy/cms-sources";

/** Edit-mode prefill seeds, decoded from the `value` attribute JSON. */
export type ParamSeed = {
    name?: string;
    in?: string;
    type?: string;
    required?: boolean;
    source?: ParamValueSource;
    /** Round-tripped verbatim (not editable yet) — preserved on save (B1 fix). */
    description?: string;
};
export type EndpointSeed = {
    endpointId?: string;
    method?: string;
    targetUrl?: string;
    params?: ParamSeed[];
    /** Request-body shape (recursive) — drives the Body tree editor. */
    body?: DataShape;
    /** Response contract (per-status list) — drives the Out tab editor. */
    output?: EndpointResponse[];
    /** SourceEndpoint meta — no editor yet, round-tripped verbatim (B1 fix). */
    meta?: SourceMeta;
    /** Injected request headers (static value or secret ref) — drives the Headers tab editor. */
    headers?: EndpointHeader[];
};

/** V1 query/path param value types (scalars). */
export const PARAM_TYPES = ["string", "number", "boolean"] as const;
/** The five DataShape node types used by the Body tree editor. */
export const SHAPE_TYPES = ["string", "number", "boolean", "object", "array"] as const;

/** Read a control's value, preferring the live `.value` (when the element is an
 *  upgraded custom element) and falling back to the `value` attribute — so reads
 *  work both in the browser and under happy-dom tests (where p9r-* aren't upgraded). */
export const readControl = (el: Element): string => {
    const live = (el as unknown as { value?: string }).value;
    return typeof live === 'string' ? live : (el.getAttribute('value') ?? '');
};

/** A hidden form field carrying one structured value as a JSON blob — the single
 *  idiom behind every `endpoints.<i>.{params,body,output,meta}`. `sync(read)` reads
 *  the current value and serialises it (empty / null / `[]` → "" so the parser
 *  treats it as absent). Pass-through fields just `sync(() => seed)` once. */
export type JsonField = HTMLInputElement & { sync(read: () => unknown): void };
export function jsonField(name: string, role?: string): JsonField {
    const f = document.createElement('input') as JsonField;
    f.type = 'hidden';
    f.name = name;
    if (role) f.dataset.role = role;
    f.sync = (read) => {
        const v = read();
        f.value = (v == null || (Array.isArray(v) && v.length === 0)) ? '' : JSON.stringify(v);
    };
    return f;
}

/** Colour the method tag like a REST client (GET green, DELETE red, …). */
const METHOD_COLOR: Record<string, string> = {
    GET: 'success', POST: 'info', PUT: 'warning', PATCH: 'warning', DELETE: 'danger',
};
export const methodColor = (m: string): string => METHOD_COLOR[m] ?? 'primary';
