/**
 * Evaluate the `x-visible-if` clause of a property (base.md §11.7). UI-only:
 * the SDK ships the evaluator so the hub stays a generic JSON-Schema
 * renderer; the server never gates validation on visibility.
 *
 * Operator vocabulary (v1) — AND across keys, 4 forms per key:
 *   - bare value           : strict equality
 *   - { contains: x }      : array.includes(x) OR string.includes(x)
 *   - { in: [...] }        : enum membership of the field value
 *   - { truthy: true|false}: presence/absence (Boolean(field))
 *
 * Unknown operators or malformed clauses → `false` (fail-closed: hide rather
 * than mis-show — safer default for sensitive fields).
 */
type Predicate =
    | string | number | boolean | null
    | { contains: unknown }
    | { in: unknown[] }
    | { truthy: boolean };

export type VisibleIfClause = Record<string, Predicate>;

function evalOne(value: unknown, pred: Predicate): boolean {
    if (pred === null || typeof pred !== "object") {
        return value === pred;
    }
    if ("contains" in pred) {
        if (Array.isArray(value)) return value.includes(pred.contains);
        if (typeof value === "string" && typeof pred.contains === "string") {
            return value.includes(pred.contains);
        }
        return false;
    }
    if ("in" in pred) {
        return Array.isArray(pred.in) && pred.in.includes(value);
    }
    if ("truthy" in pred) {
        return Boolean(value) === pred.truthy;
    }
    return false;       // unknown operator → fail closed
}

/**
 * Returns `true` if the field is visible given the current full config (or
 * `true` when the property has no `x-visible-if` — visible by default).
 */
export function isVisible(
    fieldName: string,
    currentValues: Record<string, unknown>,
    schema: Record<string, unknown>,
): boolean {
    const props = (schema["properties"] ?? {}) as Record<string, Record<string, unknown>>;
    const clause = props[fieldName]?.["x-visible-if"] as VisibleIfClause | undefined;
    if (!clause || typeof clause !== "object") return true;

    for (const [otherField, pred] of Object.entries(clause)) {
        if (!evalOne(currentValues[otherField], pred)) return false;
    }
    return true;
}
