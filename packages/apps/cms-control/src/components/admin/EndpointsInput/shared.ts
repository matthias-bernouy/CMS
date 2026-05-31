/** Edit-mode prefill seeds, decoded from the `value` attribute JSON. */
export type ParamSeed = { name?: string; in?: string; type?: string; required?: boolean };
export type EndpointSeed = { endpointId?: string; method?: string; targetUrl?: string; params?: ParamSeed[] };

/** V1 param value types (scalars). Full recursive DataShape is reserved for the body. */
export const PARAM_TYPES = ["string", "number", "boolean"] as const;

/** Read the current value of a p9r-input / p9r-select host (both expose `.value`). */
export const liveValue = (el: Element): string => (el as unknown as { value?: string }).value ?? '';

/** Colour the method tag like a REST client (GET green, DELETE red, …). */
const METHOD_COLOR: Record<string, string> = {
    GET: 'success', POST: 'info', PUT: 'warning', PATCH: 'warning', DELETE: 'danger',
};
export const methodColor = (m: string): string => METHOD_COLOR[m] ?? 'primary';
