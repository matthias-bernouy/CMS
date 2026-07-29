import { afterEach, describe, expect, test } from "bun:test";
import { P9rInput, Button, Combobox, P9rSelect, TokenInput } from "@bernouy/components";
import "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";

if (!customElements.get("p9r-input")) {
    customElements.define("p9r-input", P9rInput);
}
if (!customElements.get("p9r-button")) {
    customElements.define("p9r-button", Button);
}
if (!customElements.get("p9r-combobox")) {
    customElements.define("p9r-combobox", Combobox);
}
if (!customElements.get("p9r-select")) {
    customElements.define("p9r-select", P9rSelect);
}
if (!customElements.get("p9r-token-input")) {
    customElements.define("p9r-token-input", TokenInput);
}

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard detail widget actions", () => {
    test("updates derived table fields from editable table input", async () => {
        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-detail",
                id: "productDetail",
                source: { endpoint: "product" },
                title: { path: "title", fallback: "Product" },
                main: [
                    {
                        id: "variants",
                        title: "Variants",
                        fields: [
                            {
                                id: "variantAxes",
                                label: "Axes",
                                path: "variantAxes",
                                type: "table",
                                editable: true,
                                columns: [
                                    { id: "label", label: "Label", path: "label", editable: true },
                                    { id: "values", label: "Values", path: "values", editable: true, type: "tokens" },
                                ],
                            },
                            {
                                id: "variantMatrix",
                                label: "Matrix",
                                path: "variantMatrix",
                                type: "table",
                                derive: {
                                    type: "cartesian",
                                    sourceField: "variantAxes",
                                    labelPath: "label",
                                    valuesPath: "values",
                                },
                                columns: [
                                    { id: "options", label: "Options", path: "options" },
                                    { id: "title", label: "Variant", path: "title" },
                                    { id: "status", label: "Status", path: "status" },
                                ],
                            },
                        ],
                    },
                ],
            }),
        );
        detail.setAttribute(
            "data-source-json",
            JSON.stringify({
                id: 2,
                title: "Product",
                variantAxes: [{ label: "Grip", values: ["L1"] }],
                variantMatrix: [{ options: "L1", title: "Grip: L1", status: "inactive" }],
            }),
        );

        document.body.append(detail);
        await Promise.resolve();

        const tokens = detail.shadowRoot!.querySelector("p9r-token-input") as HTMLElement & {
            shadowRoot: ShadowRoot;
        };
        const input = tokens.shadowRoot.querySelector("input")!;
        expect(tokens.hasAttribute("creatable")).toBe(true);
        expect(tokens.shadowRoot.querySelector<HTMLElement>(".label-row")?.hidden).toBe(true);
        input.value = "L2";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

        const matrix = detail.shadowRoot!.querySelectorAll("[data-field-control]")[1] as HTMLElement;
        const rows = Array.from(matrix.querySelectorAll("[data-table-row]"));
        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.textContent?.replace(/\s+/g, " ").trim())).toEqual([
            "L1Grip: L1inactive",
            "L2Grip: L2inactive",
        ]);
    });
});
