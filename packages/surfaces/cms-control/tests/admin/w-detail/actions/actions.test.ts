import { afterEach, describe, expect, test } from "bun:test";
import {
    WIDGET_ACTION_EVENT,
    type WidgetActionDetail,
} from "../../../../src/components/admin/Resources/Dashboards/widgets/shared";
import { resetActionTest } from "./actionTestSetup";

afterEach(resetActionTest);

describe("dashboard detail widget actions", () => {
    test("keeps required blank fields in the form instead of submitting an invalid request", async () => {
        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-detail",
                id: "partnerDetail",
                source: { endpoint: "partner" },
                actions: [{ id: "savePartner", label: "Save partner", endpoint: { endpoint: "savePartner" } }],
                main: [
                    {
                        id: "identity",
                        title: "Identity",
                        fields: [
                            {
                                id: "displayName",
                                label: "Display name",
                                path: "displayName",
                                type: "text",
                                required: true,
                            },
                        ],
                    },
                ],
            }),
        );
        detail.setAttribute("data-source-json", JSON.stringify({ displayName: "" }));
        detail.setAttribute("data-row-key", "__new__");
        const actions: WidgetActionDetail[] = [];
        detail.addEventListener(WIDGET_ACTION_EVENT, (event) =>
            actions.push((event as CustomEvent<WidgetActionDetail>).detail),
        );
        document.body.append(detail);
        await Promise.resolve();

        const input = detail.shadowRoot!.querySelector("p9r-input") as HTMLElement & {
            value: string;
            shadowRoot: ShadowRoot;
        };
        const save = detail.shadowRoot!.querySelector("p9r-button") as HTMLElement;
        expect(input.getAttribute("label")).toBe("Display name");
        expect(input.hasAttribute("required")).toBeTrue();
        input.value = "   ";
        save.click();

        expect(actions).toEqual([]);
        expect(input.hasAttribute("invalid")).toBe(true);
        expect(input.getAttribute("hint")).toBe("This field is required.");

        input.value = "Partner browser";
        input.shadowRoot.querySelector("input")!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        expect(input.hasAttribute("invalid")).toBe(false);
        save.click();

        expect(actions[0]?.fields).toEqual({ displayName: "Partner browser" });
    });

    test("snapshots current field values when an action is clicked", async () => {
        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-detail",
                id: "productDetail",
                source: { endpoint: "product" },
                title: { path: "title", fallback: "Product" },
                actions: [
                    {
                        id: "saveProduct",
                        label: "Save product",
                        tone: "primary",
                        endpoint: {
                            endpoint: "upsertProduct",
                            params: { id: "$resource.id" },
                            body: { title: "$field.title" },
                        },
                    },
                ],
                main: [
                    {
                        id: "details",
                        title: "Details",
                        fields: [{ id: "title", label: "Title", path: "title", type: "text" }],
                    },
                ],
            }),
        );
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
        expect(save.shadowRoot.querySelector("button")?.getAttribute("aria-label")).toBe("Save product");
        expect(save.getAttribute("color")).toBe("primary");
        expect(save.hasAttribute("tone")).toBeFalse();
        save.shadowRoot.querySelector("button")!.click();

        expect(actions).toHaveLength(1);
        expect(actions[0]?.resource).toEqual({ id: 2, title: "Initial title" });
        expect(actions[0]?.fields).toEqual({ title: "Edited title" });
    });

    test("blocks actions for invalid whole-unit money and submits valid amounts as minor units", async () => {
        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-detail",
                id: "offerDetail",
                source: { endpoint: "offer" },
                actions: [{ id: "saveOffer", label: "Save", endpoint: { endpoint: "saveOffer" } }],
                main: [
                    {
                        id: "pricing",
                        title: "Pricing",
                        fields: [
                            {
                                id: "amount",
                                label: "Amount",
                                path: "amount",
                                type: "money",
                                currencyPath: "currency",
                                allowDecimals: { value: "$resource.wholeUnitPrices", equals: false },
                            },
                        ],
                    },
                ],
            }),
        );
        detail.setAttribute(
            "data-source-json",
            JSON.stringify({ id: 1, amount: 1500, currency: "EUR", wholeUnitPrices: true }),
        );
        detail.setAttribute("data-row-key", "1");
        const actions: WidgetActionDetail[] = [];
        detail.addEventListener(WIDGET_ACTION_EVENT, (event) =>
            actions.push((event as CustomEvent<WidgetActionDetail>).detail),
        );
        document.body.append(detail);
        await Promise.resolve();

        const input = detail.shadowRoot!.querySelector("p9r-input") as HTMLElement & {
            value: string;
            shadowRoot: ShadowRoot;
        };
        const save = detail.shadowRoot!.querySelector("p9r-button") as HTMLElement;
        input.value = "15,26";
        input.shadowRoot.querySelector("input")!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        save.click();
        expect(actions).toHaveLength(0);
        expect(input.hasAttribute("invalid")).toBe(true);

        input.value = "16";
        input.shadowRoot.querySelector("input")!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        save.click();
        expect(actions[0]?.fields).toEqual({ amount: 1600 });
    });

    test("includes a reordered list in the field draft submitted by an action", async () => {
        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-detail",
                id: "fieldDetail",
                source: { endpoint: "field" },
                actions: [{ id: "saveField", label: "Save field", endpoint: { endpoint: "saveField" } }],
                main: [
                    {
                        id: "options",
                        title: "Allowed values",
                        fields: [
                            {
                                id: "options",
                                label: "Allowed values",
                                path: "options",
                                type: "reorderable-list",
                                itemKey: "id",
                                positionPath: "position",
                                fields: [
                                    { id: "value", label: "Value", path: "value", required: true },
                                    { id: "label", label: "Label", path: "label", required: true },
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
                options: [
                    { id: "agency", value: "agency", label: "Agency", position: 0 },
                    { id: "club", value: "club", label: "Club", position: 1 },
                ],
            }),
        );
        detail.setAttribute("data-row-key", "company");
        const actions: WidgetActionDetail[] = [];
        detail.addEventListener(WIDGET_ACTION_EVENT, (event) =>
            actions.push((event as CustomEvent<WidgetActionDetail>).detail),
        );

        document.body.append(detail);
        await Promise.resolve();
        const list = detail.shadowRoot!.querySelector<HTMLElement>("cms-dashboard-w-reorderable-list")!;
        const rows = list.shadowRoot!.querySelectorAll<HTMLElement>(".row");
        rows[0]!.querySelector<HTMLElement>(".handle")!.dispatchEvent(new Event("dragstart", { bubbles: true }));
        rows[1]!.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
        (detail.shadowRoot!.querySelector("p9r-button") as HTMLElement).click();

        expect(actions[0]?.fields?.options).toEqual([
            { id: "club", value: "club", label: "Club", position: 0 },
            { id: "agency", value: "agency", label: "Agency", position: 1 },
        ]);
    });

    test("applies inline-created lookup options without rerendering", async () => {
        const detail = document.createElement("cms-dashboard-w-detail") as HTMLElement & {
            applyLookupCreate: (fieldId: string, value: unknown, option: { value: string; label: string }) => void;
        };
        detail.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-detail",
                id: "productDetail",
                source: { endpoint: "product" },
                title: { path: "title", fallback: "Product" },
                main: [
                    {
                        id: "organization",
                        title: "Organization",
                        fields: [{ id: "brandId", label: "Brand", path: "brandId", type: "combobox" }],
                    },
                ],
            }),
        );
        detail.setAttribute("data-source-json", JSON.stringify({ id: 2, title: "Product", brandId: "" }));
        detail.setAttribute("data-row-key", "2");

        document.body.append(detail);
        await Promise.resolve();

        const combobox = detail.shadowRoot!.querySelector("p9r-combobox") as HTMLElement & {
            value: string;
            shadowRoot: ShadowRoot;
        };
        combobox.value = "Wilson";

        detail.applyLookupCreate("brandId", "42", { value: "42", label: "Wilson" });
        await Promise.resolve();

        expect(combobox.value).toBe("42");
        expect(combobox.shadowRoot.querySelector("input")?.value).toBe("Wilson");
        expect(combobox.querySelector("option[value='42']")?.textContent).toBe("Wilson");
    });
});
