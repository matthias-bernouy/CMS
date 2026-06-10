import type { JSONSchema } from "@bernouy/cms-gateway";

export type { JSONSchema };

/**
 * One node in the rendered editor tree.
 *
 * `el` is the DOM element to mount under the parent container; `read`
 * returns the current value at this node by polling its inputs (or by
 * combining its children's reads for containers). The component never
 * teardown-and-remounts a node on input change — it just calls the root
 * `read()` and pushes the new JSON to the form value.
 */
export type NodeView = {
    el:   HTMLElement;
    read: () => unknown;
};

/** Shared signature for sub-renderers (object / array / primitive / variant). */
export type RenderFn = (schema: JSONSchema, value: unknown, onChange: () => void) => NodeView;
