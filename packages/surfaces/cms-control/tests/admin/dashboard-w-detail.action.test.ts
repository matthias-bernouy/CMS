import { afterEach, describe, expect, test } from "bun:test";
import { P9rInput, Button, Combobox } from "@bernouy/components";
import "../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";
import { WIDGET_ACTION_EVENT, type WidgetActionDetail } from "../../src/components/admin/Resources/Dashboards/widgets/shared";

if (!customElements.get("p9r-input")) customElements.define("p9r-input", P9rInput);
if (!customElements.get("p9r-button")) customElements.define("p9r-button", Button);
if (!customElements.get("p9r-combobox")) customElements.define("p9r-combobox", Combobox);

afterEach(() => {
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
});
