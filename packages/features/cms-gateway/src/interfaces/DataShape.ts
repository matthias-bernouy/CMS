/**
 * DataShape — minimal description of the SHAPE of a piece of data (input/output of an
 * endpoint, see `Gateway.ts`). Intentionally kept small: just the type + the structure.
 *
 * The fields reuse JSON Schema vocabulary (`type`/`properties`/`items`/`required`),
 * so it is familiar AND directly assignable to the editor (`flattenScalars`,
 * `JsonEditor`). We will add `enum`/`format`/`description` when validation or the
 * editor needs them.
 */
export type DataShape = {
    type: "string" | "number" | "boolean" | "object" | "array";
    properties?: Record<string, DataShape>;   // when type === "object"
    required?: string[];                        // when type === "object": names of required properties
    items?: DataShape;                          // when type === "array"
};
