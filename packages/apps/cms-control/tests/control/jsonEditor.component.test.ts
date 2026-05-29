import { describe, test, expect, beforeAll } from "bun:test";
import "cms-control/components/data/JsonEditor/JsonEditor";
import type { JsonEditor } from "cms-control/components/data/JsonEditor/JsonEditor";
import type { JSONSchema } from "cms-control/core/data/types";

beforeAll(() => {
    // happy-dom defines `customElements`; the import above defines the tag.
    expect(customElements.get("cms-json-editor")).toBeTruthy();
});

function mount(): JsonEditor {
    const el = document.createElement("cms-json-editor") as JsonEditor;
    document.body.appendChild(el);
    return el;
}

describe("<cms-json-editor>", () => {
    test("falls back to raw mode when no schema is set", () => {
        const el = mount();
        el.value = JSON.stringify({ a: 1 });
        // No schema → renders the raw textarea.
        expect(el.querySelector("textarea")).toBeTruthy();
        expect(el.querySelector(".json-row")).toBeNull();
    });

    test("structured mode renders one input per declared property", () => {
        const el = mount();
        const schema: JSONSchema = {
            type: "object",
            properties: {
                name:   { type: "string" },
                count:  { type: "integer" },
                active: { type: "boolean" },
            },
        };
        el.schema = schema;
        el.value  = JSON.stringify({ name: "Alice", count: 7, active: true });

        const rows = el.querySelectorAll(".json-row");
        expect(rows.length).toBe(3);

        const labels = Array.from(el.querySelectorAll(".json-label")).map(l => l.textContent);
        expect(labels).toEqual(["name", "count", "active"]);

        const stringInput = el.querySelector('.json-row .json-input--str') as HTMLInputElement;
        expect(stringInput.value).toBe("Alice");

        const numInput = el.querySelector('.json-row .json-input--num') as HTMLInputElement;
        expect(numInput.value).toBe("7");

        const boolInput = el.querySelector('.json-row .json-input--bool') as HTMLInputElement;
        expect(boolInput.checked).toBe(true);
    });

    test("editing an input flows through to the serialized value", () => {
        const el = mount();
        el.schema = { type: "object", properties: { name: { type: "string" } } };
        el.value  = JSON.stringify({ name: "Alice" });

        const input = el.querySelector(".json-input--str") as HTMLInputElement;
        input.value = "Bob";
        input.dispatchEvent(new Event("input", { bubbles: true }));

        expect(JSON.parse(el.value)).toEqual({ name: "Bob" });
    });

    test("strict mode drops properties not declared in the schema", () => {
        const el = mount();
        el.schema = { type: "object", properties: { a: { type: "string" } } };
        el.value  = JSON.stringify({ a: "kept", b: "dropped" });

        // Re-read structured value via the form-flow path: forcing a write
        // by toggling the value triggers `_publishFromTree`. Here the
        // serialized output should already reflect the strict drop.
        const input = el.querySelector(".json-input--str") as HTMLInputElement;
        input.dispatchEvent(new Event("input", { bubbles: true }));

        const out = JSON.parse(el.value) as Record<string, unknown>;
        expect(out).toEqual({ a: "kept" });
    });

    test("array editor: + Add appends an item, × removes it", () => {
        const el = mount();
        el.schema = { type: "array", items: { type: "string" } };
        el.value  = JSON.stringify(["one", "two"]);

        const beforeRows = el.querySelectorAll(".json-array__row");
        expect(beforeRows.length).toBe(2);

        const addBtn = el.querySelector(".json-btn--add") as HTMLButtonElement;
        addBtn.click();
        expect(el.querySelectorAll(".json-array__row").length).toBe(3);

        const firstRemove = el.querySelector(".json-btn--remove") as HTMLButtonElement;
        firstRemove.click();
        expect(el.querySelectorAll(".json-array__row").length).toBe(2);
    });

    test("array items render as collapsible <details> with renumbered badges", () => {
        const el = mount();
        el.schema = { type: "array", items: { type: "string" } };
        el.value  = JSON.stringify(["a", "b", "c"]);

        const rows = el.querySelectorAll(".json-array__row");
        expect(rows.length).toBe(3);
        for (const row of Array.from(rows)) {
            expect(row.tagName.toLowerCase()).toBe("details");
            expect((row as HTMLDetailsElement).open).toBe(true);
        }

        const indexes = Array.from(el.querySelectorAll(".json-array__index")).map(e => e.textContent);
        expect(indexes).toEqual(["1", "2", "3"]);

        // Removing the first item renumbers the rest.
        const firstRemove = el.querySelector(".json-btn--remove") as HTMLButtonElement;
        firstRemove.click();
        const after = Array.from(el.querySelectorAll(".json-array__index")).map(e => e.textContent);
        expect(after).toEqual(["1", "2"]);
    });

    test("toggling raw mode preserves the value", () => {
        const el = mount();
        el.schema = { type: "object", properties: { name: { type: "string" } } };
        el.value  = JSON.stringify({ name: "Alice" });

        const toggle = el.querySelector(".json-btn--mode") as HTMLButtonElement;
        toggle.click();

        const textarea = el.querySelector("textarea") as HTMLTextAreaElement;
        expect(textarea).toBeTruthy();
        expect(JSON.parse(textarea.value)).toEqual({ name: "Alice" });
    });

    test("schema attribute is parsed as JSON", () => {
        const schema: JSONSchema = { type: "object", properties: { x: { type: "string" } } };
        const el = document.createElement("cms-json-editor") as JsonEditor;
        el.setAttribute("schema", JSON.stringify(schema));
        el.setAttribute("value",  JSON.stringify({ x: "hi" }));
        document.body.appendChild(el);

        expect(el.querySelector(".json-row")).toBeTruthy();
        const input = el.querySelector(".json-input--str") as HTMLInputElement;
        expect(input.value).toBe("hi");
    });

    test("empty schema attribute leaves the editor in raw mode", () => {
        const el = document.createElement("cms-json-editor") as JsonEditor;
        el.setAttribute("schema", "");
        el.setAttribute("value",  JSON.stringify({ a: 1 }));
        document.body.appendChild(el);

        expect(el.querySelector("textarea")).toBeTruthy();
    });
});
