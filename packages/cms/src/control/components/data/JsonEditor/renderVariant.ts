import type { NodeView, JSONSchema, RenderFn } from "./types";
import { initFromSchema } from "./initFromSchema";

/**
 * Render a `oneOf` / `anyOf` node: a select picks the active variant,
 * the slot below mounts the matching sub-editor. Switching variant
 * resets the value to the freshly-initialized shape of the new variant
 * — keeping the previous value would force the renderer to invent
 * mappings between heterogeneous shapes.
 */
export function renderVariant(
    schema:   JSONSchema,
    value:    unknown,
    onChange: () => void,
    dispatch: RenderFn,
): NodeView {
    const variants = (schema.oneOf ?? schema.anyOf ?? []) as JSONSchema[];
    if (variants.length === 0) {
        const span = document.createElement("span");
        span.className = "json-empty";
        span.textContent = "(empty oneOf / anyOf)";
        return { el: span, read: () => null };
    }

    const container = document.createElement("div");
    container.className = "json-variant";

    const select = document.createElement("select");
    select.className = "json-input json-input--variant";
    for (let i = 0; i < variants.length; i++) {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = variantLabel(variants[i]!, i);
        select.appendChild(option);
    }
    container.appendChild(select);

    const slot = document.createElement("div");
    slot.className = "json-variant__slot";
    container.appendChild(slot);

    let activeIndex = pickInitialVariant(variants, value);
    let activeRead: () => unknown = () => null;

    function mount(idx: number, initialValue: unknown): void {
        slot.innerHTML = "";
        const child = dispatch(variants[idx]!, initialValue, onChange);
        slot.appendChild(child.el);
        activeRead = child.read;
    }

    select.value = String(activeIndex);
    mount(activeIndex, value);

    select.addEventListener("change", () => {
        activeIndex = Number(select.value);
        mount(activeIndex, initFromSchema(variants[activeIndex]!));
        onChange();
    });

    return {
        el:   container,
        read: () => activeRead(),
    };
}

function variantLabel(s: JSONSchema, idx: number): string {
    if (s.type) return `${idx + 1}. ${s.type}`;
    if (s.enum?.length) return `${idx + 1}. enum`;
    return `Variant ${idx + 1}`;
}

/**
 * Pick the variant whose `type` matches the existing value's runtime
 * type — keeps the editor on the same branch when re-mounting with a
 * preset value (e.g. opening an edit modal).
 */
function pickInitialVariant(variants: JSONSchema[], value: unknown): number {
    if (value === null) {
        const idx = variants.findIndex(v => v.type === "null");
        return idx >= 0 ? idx : 0;
    }
    const runtime = Array.isArray(value) ? "array"
                  : typeof value === "object" ? "object"
                  : typeof value;
    const idx = variants.findIndex(v => v.type === runtime);
    return idx >= 0 ? idx : 0;
}
