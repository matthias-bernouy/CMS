import type { NodeView, JSONSchema, RenderFn } from "./types";

/**
 * Render an object node: one row per declared property. Strict mode —
 * properties that exist on the value but not in `properties` are dropped
 * silently. Required properties are flagged with a `*`.
 *
 * The `dispatch` callback receives the renderer for sub-nodes so this
 * file stays free of cross-imports between sibling renderers.
 */
export function renderObject(
    schema:   JSONSchema,
    value:    unknown,
    onChange: () => void,
    dispatch: RenderFn,
): NodeView {
    const obj        = (typeof value === "object" && value !== null && !Array.isArray(value))
        ? value as Record<string, unknown>
        : {};
    const required   = new Set(schema.required ?? []);
    const properties = schema.properties ?? {};

    const container = document.createElement("div");
    container.className = "json-object";

    const childReads: Record<string, () => unknown> = {};

    for (const [key, subSchema] of Object.entries(properties)) {
        const row = document.createElement("div");
        row.className = "json-row";

        const label = document.createElement("label");
        label.className = "json-label";
        label.textContent = required.has(key) ? `${key} *` : key;
        if (subSchema.description) label.title = subSchema.description;
        row.appendChild(label);

        const child = dispatch(subSchema, obj[key], onChange);
        child.el.classList.add("json-row__value");
        row.appendChild(child.el);
        childReads[key] = child.read;

        container.appendChild(row);
    }

    if (Object.keys(properties).length === 0) {
        const note = document.createElement("p");
        note.className = "json-empty";
        note.textContent = "(no fields declared in schema)";
        container.appendChild(note);
    }

    return {
        el:   container,
        read: () => {
            const out: Record<string, unknown> = {};
            for (const [k, fn] of Object.entries(childReads)) out[k] = fn();
            return out;
        },
    };
}
