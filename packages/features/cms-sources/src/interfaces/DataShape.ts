/**
 * DataShape — minimal description of the SHAPE of a piece of data (input/output of an
 * endpoint, see `Source.ts`). Intentionally kept small: just the type + the structure.
 *
 * The fields reuse JSON Schema vocabulary (`type`/`properties`/`items`/`required`),
 * so it is familiar AND directly assignable to the editor (`flattenScalars`).
 * `nullable` explicitly admits JSON null without widening the declared base type.
 * We will add `enum`/`format`/`description` when validation or the editor
 * needs them.
 */
export type DataShape = {
    type: "string" | "number" | "boolean" | "object" | "array";
    nullable?: boolean;                       // `true` when JSON null is an explicitly valid value
    /** Human-readable field name, following JSON Schema's `title` vocabulary. */
    title?: string;
    /** Domain meaning independent from the JSON representation. The importer
     * fills `authority` when omitted; shared identities such as CMS subjects
     * declare their authority explicitly. */
    semantic?: {
        kind: "user-id";
        authority?: string;
    };
    properties?: Record<string, DataShape>;   // when type === "object"
    required?: string[];                        // when type === "object": names of required properties
    items?: DataShape;                          // when type === "array"
};
