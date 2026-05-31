import type { DataShape, GatewayMeta } from "@bernouy/cms-gateway";

/** Edit-mode prefill seeds, decoded from the `value` attribute JSON. */
export type ParamSeed = {
    name?: string;
    in?: string;
    type?: string;
    required?: boolean;
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
    /** Response shape — no editor yet, round-tripped verbatim (B1 fix). */
    output?: DataShape;
    /** Endpoint meta — no editor yet, round-tripped verbatim (B1 fix). */
    meta?: GatewayMeta;
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

/** Colour the method tag like a REST client (GET green, DELETE red, …). */
const METHOD_COLOR: Record<string, string> = {
    GET: 'success', POST: 'info', PUT: 'warning', PATCH: 'warning', DELETE: 'danger',
};
export const methodColor = (m: string): string => METHOD_COLOR[m] ?? 'primary';
