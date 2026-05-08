import type { NodeView, JSONSchema } from "./types";

/**
 * Render a leaf input for primitive schema types. The HTML widget is
 * picked from `type` (and `format` for strings: date, date-time).
 *
 * `read` always returns a JSON-compatible value — the empty input on
 * a number field reads as null, not NaN.
 */
export function renderPrimitive(schema: JSONSchema, value: unknown, onChange: () => void): NodeView {
    const type = schema.type;

    if (type === "boolean") {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = value === true;
        input.className = "json-input json-input--bool";
        input.addEventListener("change", onChange);
        return { el: input, read: () => input.checked };
    }

    if (type === "integer" || type === "number") {
        const input = document.createElement("input");
        input.type = "number";
        if (type === "integer") input.step = "1";
        input.value = value === null || value === undefined || value === "" ? "" : String(value);
        input.className = "json-input json-input--num";
        input.addEventListener("input", onChange);
        return {
            el: input,
            read: () => {
                const v = input.value.trim();
                if (v === "") return null;
                const n = Number(v);
                return Number.isFinite(n) ? n : null;
            },
        };
    }

    if (type === "null") {
        const span = document.createElement("span");
        span.textContent = "null";
        span.className = "json-input json-input--null";
        return { el: span, read: () => null };
    }

    // string + everything else
    const input = document.createElement("input");
    input.type = schema.format === "date" ? "date"
              : schema.format === "date-time" ? "datetime-local"
              : "text";
    input.value = value === null || value === undefined ? "" : String(value);
    input.className = "json-input json-input--str";
    input.addEventListener("input", onChange);
    return { el: input, read: () => input.value };
}
