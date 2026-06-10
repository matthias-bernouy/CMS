import type { NodeView, JSONSchema } from "./types";
import { normalize } from "./normalize";
import { renderObject } from "./renderObject";
import { renderArray } from "./renderArray";
import { renderPrimitive } from "./renderPrimitive";
import { renderVariant } from "./renderVariant";

/**
 * Schema-type dispatcher. The strict order matters:
 *   1. `oneOf` / `anyOf` win over plain types (they're always wrappers).
 *   2. `enum` short-circuits the primitive renderer with a `<select>`.
 *   3. `type === "object"` (or properties present) → object editor.
 *   4. `type === "array"` → array editor.
 *   5. Fallback to primitives.
 *
 * `nullable: true` is surfaced by `normalize` and handled at the leaf
 * level (empty input ↔ null) — wrapping every renderer with a null
 * toggle would add UI noise for a one-bit affordance.
 */
export function renderNode(schema: JSONSchema | null, value: unknown, onChange: () => void): NodeView {
    const s = normalize(schema);
    if (!s) return renderUnknown(value);

    if (s.oneOf?.length || s.anyOf?.length) return renderVariant(s, value, onChange, renderNode);
    if (Array.isArray(s.enum) && s.enum.length > 0) return renderEnum(s, value, onChange);
    if (s.type === "object" || s.properties) return renderObject(s, value, onChange, renderNode);
    if (s.type === "array")                  return renderArray (s, value, onChange, renderNode);
    return renderPrimitive(s, value, onChange);
}

function renderEnum(schema: JSONSchema, value: unknown, onChange: () => void): NodeView {
    const select = document.createElement("select");
    select.className = "json-input json-input--enum";
    for (const opt of schema.enum ?? []) {
        const option = document.createElement("option");
        option.value = JSON.stringify(opt);
        option.textContent = String(opt);
        select.appendChild(option);
    }
    select.value = JSON.stringify(value);
    if (select.selectedIndex < 0 && select.options.length > 0) select.selectedIndex = 0;
    select.addEventListener("change", onChange);
    return {
        el:   select,
        read: () => {
            try { return JSON.parse(select.value); }
            catch { return select.value; }
        },
    };
}

function renderUnknown(value: unknown): NodeView {
    const span = document.createElement("span");
    span.className = "json-empty";
    span.textContent = `(unsupported — ${typeof value})`;
    return { el: span, read: () => value };
}
