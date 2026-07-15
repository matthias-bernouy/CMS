import { afterEach, describe, expect, test } from "bun:test";
import { P9rInput, Button, Combobox, P9rSelect, TokenInput } from "@bernouy/components";
import "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";
import {
    createFieldControl,
    readFieldControlValue,
} from "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/controls";
import { WIDGET_ACTION_EVENT, type WidgetActionDetail } from "../../../src/components/admin/Resources/Dashboards/widgets/shared";
import type { WDetailField } from "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/types";

if (!customElements.get("p9r-input")) customElements.define("p9r-input", P9rInput);
if (!customElements.get("p9r-button")) customElements.define("p9r-button", Button);
if (!customElements.get("p9r-combobox")) customElements.define("p9r-combobox", Combobox);
if (!customElements.get("p9r-select")) customElements.define("p9r-select", P9rSelect);
if (!customElements.get("p9r-token-input")) customElements.define("p9r-token-input", TokenInput);

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard detail widget actions", () => {
    test("preserves the right row and nested values after deletion", async () => {
        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute("data-config-json", JSON.stringify({
            widget: "w-detail",
            id: "productDetail",
            source: { endpoint: "product" },
            title: { path: "title", fallback: "Product" },
            actions: [
                {
                    id: "saveProduct",
                    label: "Save product",
                    tone: "primary",
                    endpoint: { endpoint: "upsertProduct", body: { variantAxes: "$field.variantAxes" } },
                },
            ],
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
                                { id: "label", label: "Label", path: "details.label", editable: true },
                                { id: "values", label: "Values", path: "details.values", editable: true, type: "tokens" },
                            ],
                        },
                    ],
                },
            ],
        }));
        detail.setAttribute("data-source-json", JSON.stringify({
            id: 2,
            title: "Product",
            variantAxes: [
                { id: "grip", details: { label: "Grip size", values: ["L1", "L2"] }, audit: { owner: "first" } },
                { id: "weight", details: { label: "Weight", values: ["250"] }, audit: { owner: "second" } },
            ],
        }));

        const actions: WidgetActionDetail[] = [];
        detail.addEventListener(WIDGET_ACTION_EVENT, (event) => {
            actions.push((event as CustomEvent<WidgetActionDetail>).detail);
        });

        document.body.append(detail);
        await Promise.resolve();

        detail.shadowRoot!.querySelector<HTMLButtonElement>("[data-table-remove]")!.click();
        const input = detail.shadowRoot!.querySelector("p9r-input") as HTMLElement & { value: string };
        const tokens = detail.shadowRoot!.querySelector("p9r-token-input") as HTMLElement & { value: string };
        input.value = "Weight updated";
        tokens.value = "285,300";

        const save = detail.shadowRoot!.querySelector("p9r-button") as HTMLElement & { shadowRoot: ShadowRoot };
        save.shadowRoot.querySelector("button")!.click();

        expect(actions[0]?.fields).toEqual({
            variantAxes: [{
                id: "weight",
                details: { label: "Weight updated", values: ["285", "300"] },
                audit: { owner: "second" },
            }],
        });
    });

    test("returns deep snapshots for readonly table values", () => {
        const source = [{ id: "axis", details: { label: "Size" } }];
        const field: WDetailField = {
            id: "axes",
            label: "Axes",
            input: "table",
            value: source,
            columns: [{ key: "label", label: "Label", path: "details.label" }],
        };
        const value = readFieldControlValue(field, createFieldControl(field)) as Array<Record<string, unknown>>;

        (value[0]!.details as Record<string, unknown>).label = "Changed";

        expect(source).toEqual([{ id: "axis", details: { label: "Size" } }]);
    });

    test("updates derived table fields from editable table input", async () => {
        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute("data-config-json", JSON.stringify({
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
        }));
        detail.setAttribute("data-source-json", JSON.stringify({
            id: 2,
            title: "Product",
            variantAxes: [{ label: "Grip", values: ["L1"] }],
            variantMatrix: [{ options: "L1", title: "Grip: L1", status: "inactive" }],
        }));

        document.body.append(detail);
        await Promise.resolve();

        const tokens = detail.shadowRoot!.querySelector("p9r-token-input") as HTMLElement & { value: string };
        tokens.value = "L1,L2";
        tokens.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

        const matrix = detail.shadowRoot!.querySelectorAll("[data-field-control]")[1] as HTMLElement;
        const rows = Array.from(matrix.querySelectorAll("[data-table-row]"));
        expect(rows).toHaveLength(2);
        expect(rows.map(row => row.textContent?.replace(/\s+/g, " ").trim())).toEqual([
            "L1Grip: L1inactive",
            "L2Grip: L2inactive",
        ]);
    });
});
