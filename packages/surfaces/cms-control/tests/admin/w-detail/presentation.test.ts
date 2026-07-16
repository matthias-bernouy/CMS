import { afterEach, describe, expect, test } from "bun:test";
import { P9rInput, Button, Combobox, P9rSelect, TokenInput } from "@bernouy/components";
import "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";

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
    test("renders readonly arrays as compact lists", async () => {
        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute("data-config-json", JSON.stringify({
            widget: "w-detail",
            id: "connectAccountDetail",
            source: { endpoint: "getConnectAccount" },
            title: { path: "userId", fallback: "Connected account" },
            main: [
                {
                    id: "requirements",
                    title: "Requirements",
                    fields: [
                        { id: "currentlyDue", label: "Currently due", path: "currentlyDue", type: "readonly" },
                        { id: "pendingVerification", label: "Pending verification", path: "pendingVerification", type: "readonly" },
                    ],
                },
            ],
        }));
        detail.setAttribute("data-source-json", JSON.stringify({
            userId: "seller-1",
            currentlyDue: ["business_profile.mcc", "individual.address.line1"],
            pendingVerification: [],
        }));
        detail.setAttribute("data-row-key", "seller-1");

        document.body.append(detail);
        await Promise.resolve();

        const lists = detail.shadowRoot!.querySelectorAll(".readonly-list");
        expect(lists).toHaveLength(1);
        expect(Array.from(lists[0]!.querySelectorAll("li")).map(item => item.textContent)).toEqual([
            "business_profile.mcc",
            "individual.address.line1",
        ]);
        expect(detail.shadowRoot!.querySelector(".readonly-empty")?.textContent).toBe("None");
    });

    test("keeps readonly table rows when lookup options rerender current fields", async () => {
        globalThis.fetch = (async (_input, _init) => Response.json({
            items: [{ id: "brand-1", name: "Acme", slug: "acme" }],
        })) as typeof fetch;

        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute("data-config-json", JSON.stringify({
            widget: "w-detail",
            id: "productDetail",
            source: { endpoint: "product", params: { id: "$selection.id" } },
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
                        {
                            id: "brandId",
                            label: "Brand",
                            path: "brandId",
                            type: "combobox",
                            lookup: {
                                endpoint: "brands",
                                params: { q: "$search", limit: "20" },
                                itemsPath: "items",
                                valuePath: "id",
                                labelPath: "name",
                            },
                        },
                    ],
                },
            ],
        }));
        detail.setAttribute("data-source-json", JSON.stringify({
            id: 2,
            title: "Racket",
            brandId: "brand-1",
            variantAxes: [{ label: "Grip size", values: ["L1", "L2"] }],
            variantMatrix: [
                { options: "L1", title: "Grip size: L1", status: "inactive" },
                { options: "L2", title: "Grip size: L2", status: "inactive" },
            ],
        }));
        detail.setAttribute("data-row-key", "2");
        detail.setAttribute("data-source-id", "products");

        document.body.append(detail);
        await waitFor(() => Boolean(detail.shadowRoot!.querySelector("p9r-combobox option[value='brand-1']")));

        const matrix = detail.shadowRoot!.querySelectorAll("[data-field-control]")[1] as HTMLElement;
        const rows = Array.from(matrix.querySelectorAll("[data-table-row]"));
        expect(rows).toHaveLength(2);
        expect(rows.map(row => row.textContent?.replace(/\s+/g, " ").trim())).toEqual([
            "L1Grip size: L1inactive",
            "L2Grip size: L2inactive",
        ]);
    });

    test("renders readonly image fields as an image preview", async () => {
        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute("data-config-json", JSON.stringify({
            widget: "w-detail",
            id: "userDetail",
            source: { endpoint: "user" },
            main: [{
                id: "avatar",
                title: "Avatar",
                fields: [{ id: "avatarPreview", label: "Avatar", path: "avatarUrl", type: "readonly", format: "image" }],
            }],
        }));
        detail.setAttribute("data-source-json", JSON.stringify({ avatarUrl: "https://cdn.example.test/avatar.jpg" }));
        document.body.append(detail);
        await Promise.resolve();

        const image = detail.shadowRoot!.querySelector<HTMLImageElement>("img.detail-image");
        expect(image?.src).toBe("https://cdn.example.test/avatar.jpg");
        expect(image?.alt).toBe("Avatar");
    });

});

async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let i = 0; i < tries; i += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(predicate()).toBe(true);
}
