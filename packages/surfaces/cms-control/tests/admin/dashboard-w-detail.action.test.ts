import { afterEach, describe, expect, test } from "bun:test";
import { P9rInput, Button } from "@bernouy/components";
import "../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";
import { WIDGET_ACTION_EVENT, type WidgetActionDetail } from "../../src/components/admin/Resources/Dashboards/widgets/shared";

if (!customElements.get("p9r-input")) customElements.define("p9r-input", P9rInput);
if (!customElements.get("p9r-button")) customElements.define("p9r-button", Button);

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
});
