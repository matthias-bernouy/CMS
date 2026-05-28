import type { NodeView, JSONSchema, RenderFn } from "./types";
import { initFromSchema } from "./initFromSchema";

/**
 * Render an array node: one row per item, each removable, plus a
 * trailing "+ Add" button that appends a fresh value built from the
 * `items` schema. The DOM is mutated in place (no full re-render) so
 * inputs in unaffected siblings keep their focus and selection.
 */
export function renderArray(
    schema:   JSONSchema,
    value:    unknown,
    onChange: () => void,
    dispatch: RenderFn,
): NodeView {
    const items      = Array.isArray(value) ? value : [];
    const itemSchema = schema.items ?? { type: "string" } as JSONSchema;

    const container = document.createElement("div");
    container.className = "json-array";

    const list = document.createElement("div");
    list.className = "json-array__list";
    container.appendChild(list);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "json-btn json-btn--add";
    addBtn.textContent = "+ Add item";
    container.appendChild(addBtn);

    const childReads: (() => unknown)[] = [];

    function addItem(initial: unknown): void {
        const row = document.createElement("details");
        row.className = "json-array__row";
        row.open = true;

        const summary = document.createElement("summary");
        summary.className = "json-array__summary";

        const index = document.createElement("span");
        index.className = "json-array__index";
        summary.appendChild(index);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "json-btn json-btn--remove";
        removeBtn.setAttribute("aria-label", "Remove item");
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", e => {
            // Stop the click from toggling the parent <details>.
            e.preventDefault();
            e.stopPropagation();
            const idx = Array.from(list.children).indexOf(row);
            if (idx < 0) return;
            childReads.splice(idx, 1);
            row.remove();
            renumber();
            onChange();
        });
        summary.appendChild(removeBtn);
        row.appendChild(summary);

        const child = dispatch(itemSchema, initial, onChange);
        child.el.classList.add("json-array__value");
        row.appendChild(child.el);

        list.appendChild(row);
        childReads.push(child.read);
        renumber();
    }

    function renumber(): void {
        const rows = list.querySelectorAll(".json-array__index");
        rows.forEach((el, i) => { el.textContent = String(i + 1); });
    }

    for (const v of items) addItem(v);

    addBtn.addEventListener("click", () => {
        addItem(initFromSchema(itemSchema));
        onChange();
    });

    return {
        el:   container,
        read: () => childReads.map(fn => fn()),
    };
}
