import { afterEach, describe, expect, test } from "bun:test";
import { P9rInput, Button, Combobox, P9rSelect } from "@bernouy/components";
import "../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";
import { WIDGET_ACTION_EVENT, type WidgetActionDetail } from "../../src/components/admin/Resources/Dashboards/widgets/shared";

if (!customElements.get("p9r-input")) customElements.define("p9r-input", P9rInput);
if (!customElements.get("p9r-button")) customElements.define("p9r-button", Button);
if (!customElements.get("p9r-combobox")) customElements.define("p9r-combobox", Combobox);
if (!customElements.get("p9r-select")) customElements.define("p9r-select", P9rSelect);

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard detail widget actions", () => {
    test("snapshots current field values when an action is clicked", async () => {
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
                    endpoint: { endpoint: "upsertProduct", params: { id: "$resource.id" }, body: { title: "$field.title" } },
                },
            ],
            main: [
                {
                    id: "details",
                    title: "Details",
                    fields: [
                        { id: "title", label: "Title", path: "title", type: "text" },
                    ],
                },
            ],
        }));
        detail.setAttribute("data-source-json", JSON.stringify({ id: 2, title: "Initial title" }));
        detail.setAttribute("data-row-key", "2");

        const actions: WidgetActionDetail[] = [];
        detail.addEventListener(WIDGET_ACTION_EVENT, (event) => {
            actions.push((event as CustomEvent<WidgetActionDetail>).detail);
        });

        document.body.append(detail);
        await Promise.resolve();

        const input = detail.shadowRoot!.querySelector("p9r-input") as HTMLElement & { shadowRoot: ShadowRoot };
        const nativeInput = input.shadowRoot.querySelector("input")!;
        nativeInput.value = "Edited title";
        nativeInput.dispatchEvent(new Event("input", { bubbles: true }));

        const save = detail.shadowRoot!.querySelector("p9r-button") as HTMLElement & { shadowRoot: ShadowRoot };
        save.shadowRoot.querySelector("button")!.click();

        expect(actions).toHaveLength(1);
        expect(actions[0]?.resource).toEqual({ id: 2, title: "Initial title" });
        expect(actions[0]?.fields).toEqual({ title: "Edited title" });
    });

    test("applies inline-created lookup options without rerendering", async () => {
        const detail = document.createElement("cms-dashboard-w-detail") as HTMLElement & {
            applyLookupCreate: (fieldId: string, value: unknown, option: { value: string; label: string }) => void;
        };
        detail.setAttribute("data-config-json", JSON.stringify({
            widget: "w-detail",
            id: "productDetail",
            source: { endpoint: "product" },
            title: { path: "title", fallback: "Product" },
            main: [
                {
                    id: "organization",
                    title: "Organization",
                    fields: [
                        { id: "brandId", label: "Brand", path: "brandId", type: "combobox" },
                    ],
                },
            ],
        }));
        detail.setAttribute("data-source-json", JSON.stringify({ id: 2, title: "Product", brandId: "" }));
        detail.setAttribute("data-row-key", "2");

        document.body.append(detail);
        await Promise.resolve();

        const combobox = detail.shadowRoot!.querySelector("p9r-combobox") as HTMLElement & { value: string; shadowRoot: ShadowRoot };
        combobox.value = "Wilson";

        detail.applyLookupCreate("brandId", "42", { value: "42", label: "Wilson" });
        await Promise.resolve();

        expect(combobox.value).toBe("42");
        expect(combobox.shadowRoot.querySelector("input")?.value).toBe("Wilson");
        expect(combobox.querySelector("option[value='42']")?.textContent).toBe("Wilson");
    });

    test("reloads lookup options from current field values", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            const url = new URL(request.url);
            const postalCode = url.searchParams.get("postalCode");
            return Response.json({
                items: postalCode
                    ? [{ location: "FR-024474", label: `Relay ${postalCode}`, addressLine1: "85 BIS RUE REAUMUR" }]
                    : [],
            });
        }) as typeof fetch;

        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute("data-config-json", JSON.stringify({
            widget: "w-detail",
            id: "createShipmentForm",
            source: { endpoint: "setting", params: { id: "default" } },
            title: { path: "externalOrderId", fallback: "Create shipment" },
            main: [
                {
                    id: "recipient",
                    title: "Recipient",
                    fields: [
                        { id: "recipientCountry", label: "Country", path: "recipientCountry", type: "select", options: [{ value: "FR", label: "France" }] },
                        { id: "recipientPostalCode", label: "Postal code", path: "recipientPostalCode", type: "text" },
                        {
                            id: "deliveryRelayLocation",
                            label: "Pickup point",
                            path: "deliveryRelayLocation",
                            type: "combobox",
                            lookup: {
                                endpoint: "relayPoints",
                                params: {
                                    country: "$field.recipientCountry",
                                    postalCode: "$field.recipientPostalCode",
                                    limit: "10",
                                },
                                itemsPath: "items",
                                valuePath: "location",
                                labelPath: "label",
                            },
                        },
                    ],
                },
            ],
        }));
        detail.setAttribute("data-source-json", JSON.stringify({ recipientCountry: "FR", recipientPostalCode: "" }));
        detail.setAttribute("data-row-key", "__new__");
        detail.setAttribute("data-source-id", "delivery");

        document.body.append(detail);
        await Promise.resolve();

        const inputEvents: string[] = [];
        detail.shadowRoot!.addEventListener("input", (event) => {
            inputEvents.push(((event.target as Element | null)?.closest<HTMLElement>("[data-field-control]"))?.dataset.fieldControl ?? "");
        });
        const postalCode = detail.shadowRoot!.querySelector<HTMLElement & { value: string; shadowRoot: ShadowRoot }>("[data-field-control='recipientPostalCode']")!;
        const nativePostalCode = postalCode.shadowRoot.querySelector("input")!;
        nativePostalCode.value = "75001";
        nativePostalCode.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        await new Promise(resolve => setTimeout(resolve, 300));

        expect(inputEvents).toContain("recipientPostalCode");
        expect(requests.at(-1)?.url).toContain("postalCode=75001");
        const combobox = detail.shadowRoot!.querySelector("p9r-combobox")!;
        expect(combobox.querySelector("option[value='FR-024474']")?.textContent).toBe("Relay 75001");
        expect((detail.shadowRoot!.querySelector<HTMLElement & { value: string }>("[data-field-control='recipientPostalCode']")!).value).toBe("75001");
    });

    test("snapshots editable table field values", async () => {
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
                                { id: "label", label: "Label", path: "label", editable: true },
                                { id: "values", label: "Values", path: "values", editable: true, value: "list" },
                            ],
                        },
                    ],
                },
            ],
        }));
        detail.setAttribute("data-source-json", JSON.stringify({
            id: 2,
            title: "Product",
            variantAxes: [{ label: "Grip size", values: ["L1", "L2"] }],
        }));

        const actions: WidgetActionDetail[] = [];
        detail.addEventListener(WIDGET_ACTION_EVENT, (event) => {
            actions.push((event as CustomEvent<WidgetActionDetail>).detail);
        });

        document.body.append(detail);
        await Promise.resolve();

        const inputs = Array.from(detail.shadowRoot!.querySelectorAll("p9r-input")) as Array<HTMLElement & { value: string }>;
        inputs[0]!.value = "Weight";
        inputs[1]!.value = "285, 300";

        const save = detail.shadowRoot!.querySelector("p9r-button") as HTMLElement & { shadowRoot: ShadowRoot };
        save.shadowRoot.querySelector("button")!.click();

        expect(actions[0]?.fields).toEqual({
            variantAxes: [{ label: "Weight", values: ["285", "300"] }],
        });
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
                                { id: "values", label: "Values", path: "values", editable: true, value: "list" },
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

        const inputs = Array.from(detail.shadowRoot!.querySelectorAll("p9r-input")) as Array<HTMLElement & { value: string }>;
        inputs[1]!.value = "L1, L2";
        inputs[1]!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));

        const matrix = detail.shadowRoot!.querySelectorAll("[data-field-control]")[1] as HTMLElement;
        const rows = Array.from(matrix.querySelectorAll("[data-table-row]"));
        expect(rows).toHaveLength(2);
        expect(rows.map(row => row.textContent?.replace(/\s+/g, " ").trim())).toEqual([
            "L1Grip: L1inactive",
            "L2Grip: L2inactive",
        ]);
    });
});
