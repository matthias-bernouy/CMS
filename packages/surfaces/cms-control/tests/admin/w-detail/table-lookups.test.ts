import { afterEach, describe, expect, test } from "bun:test";
import { P9rInput, Button, Combobox, P9rSelect, TokenInput } from "@bernouy/components";
import "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";
import { WIDGET_ACTION_EVENT, type WidgetActionDetail } from "../../../src/components/admin/Resources/Dashboards/widgets/shared";

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
    test("loads lookup options for an editable table combobox", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return Response.json({
                fields: [
                    { fieldKey: "grip", label: "Grip", fieldType: "enum" },
                    { fieldKey: "weight", label: "Weight", fieldType: "number" },
                ],
            });
        }) as typeof fetch;

        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute("data-config-json", JSON.stringify({
            widget: "w-detail",
            id: "productDetail",
            source: { endpoint: "product" },
            actions: [{ id: "saveProduct", label: "Save product", endpoint: { endpoint: "upsertProduct" } }],
            main: [{
                id: "variants",
                title: "Variants",
                fields: [{
                    id: "variantAxes",
                    label: "Axes",
                    path: "variantAxes",
                    type: "table",
                    editable: true,
                    columns: [
                        {
                            id: "fieldKey",
                            label: "Product metadata",
                            path: "fieldKey",
                            editable: true,
                            type: "combobox",
                            lookup: {
                                endpoint: "categoryProductFields",
                                params: { categoryId: "$field.primaryCategoryId" },
                                itemsPath: "fields",
                                valuePath: "fieldKey",
                                labelPath: "label",
                            },
                        },
                        { id: "values", label: "Values", path: "values", editable: true, type: "tokens" },
                    ],
                }],
            }],
            aside: [{
                id: "classification",
                title: "Classification",
                fields: [{ id: "primaryCategoryId", label: "Primary category", path: "primaryCategoryId", type: "text" }],
            }],
        }));
        detail.setAttribute("data-source-json", JSON.stringify({
            primaryCategoryId: 2,
            variantAxes: [{ fieldKey: "grip", label: "Grip", values: ["L1", "L2"] }],
        }));
        detail.setAttribute("data-source-id", "commerce");
        const actions: WidgetActionDetail[] = [];
        detail.addEventListener(WIDGET_ACTION_EVENT, event => actions.push((event as CustomEvent<WidgetActionDetail>).detail));

        document.body.append(detail);
        await waitFor(() => Boolean(detail.shadowRoot!.querySelector("p9r-combobox option[value='weight']")));

        const combobox = detail.shadowRoot!.querySelector<HTMLElement & { value: string }>("p9r-combobox")!;
        expect(requests[0]?.url).toContain("categoryProductFields?categoryId=2");
        expect(combobox.hasAttribute("creatable")).toBeFalse();
        combobox.value = "weight";
        combobox.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        (detail.shadowRoot!.querySelector("p9r-button") as HTMLElement).click();

        expect(actions[0]?.fields?.variantAxes).toEqual([
            { fieldKey: "weight", label: "Grip", values: ["L1", "L2"] },
        ]);
    });

});

async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let i = 0; i < tries; i += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(predicate()).toBe(true);
}
