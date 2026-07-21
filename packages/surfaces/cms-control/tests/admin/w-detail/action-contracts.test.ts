import { afterEach, describe, expect, test } from "bun:test";
import { P9rInput, Button, Combobox, P9rSelect } from "@bernouy/components";
import "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";
import {
    WIDGET_ACTION_EVENT,
    type WidgetActionDetail,
} from "../../../src/components/admin/Resources/Dashboards/widgets/shared";

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

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard detail widget actions", () => {
    test("submits number fields as numbers", async () => {
        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-detail",
                id: "refundDetail",
                source: { endpoint: "refund" },
                actions: [{ id: "refund", label: "Refund", endpoint: { endpoint: "requestRefund" } }],
                main: [
                    {
                        id: "amounts",
                        title: "Amounts",
                        fields: [{ id: "amount", label: "Amount", path: "amount", type: "number", min: 0, step: 1 }],
                    },
                ],
            }),
        );
        detail.setAttribute("data-source-json", JSON.stringify({ amount: 1200 }));

        const actions: WidgetActionDetail[] = [];
        detail.addEventListener(WIDGET_ACTION_EVENT, (event) =>
            actions.push((event as CustomEvent<WidgetActionDetail>).detail),
        );
        document.body.append(detail);
        await Promise.resolve();

        const input = detail.shadowRoot!.querySelector("p9r-input") as HTMLElement & { shadowRoot: ShadowRoot };
        const nativeInput = input.shadowRoot.querySelector("input")!;
        nativeInput.value = "950";
        nativeInput.dispatchEvent(new Event("input", { bubbles: true }));
        (detail.shadowRoot!.querySelector("p9r-button") as HTMLElement).click();

        expect(input.getAttribute("type")).toBe("number");
        expect(input.getAttribute("min")).toBe("0");
        expect(input.getAttribute("step")).toBe("1");
        expect(actions[0]?.fields).toEqual({ amount: 950 });
    });

    test("does not emit a confirmed action when the confirmation is declined", async () => {
        const originalConfirm = window.confirm;
        window.confirm = () => false;
        try {
            const detail = document.createElement("cms-dashboard-w-detail");
            detail.setAttribute(
                "data-config-json",
                JSON.stringify({
                    widget: "w-detail",
                    id: "fieldDetail",
                    source: { endpoint: "field" },
                    actions: [
                        {
                            id: "deleteField",
                            label: "Delete field",
                            confirm: "Delete this field definition?",
                            endpoint: { endpoint: "deleteField" },
                        },
                    ],
                    main: [
                        {
                            id: "field",
                            title: "Field",
                            fields: [{ id: "id", label: "ID", path: "id", type: "readonly" }],
                        },
                    ],
                }),
            );
            detail.setAttribute("data-source-json", JSON.stringify({ id: "company" }));
            detail.setAttribute("data-row-key", "company");
            const actions: WidgetActionDetail[] = [];
            detail.addEventListener(WIDGET_ACTION_EVENT, (event) =>
                actions.push((event as CustomEvent<WidgetActionDetail>).detail),
            );

            document.body.append(detail);
            await Promise.resolve();
            (detail.shadowRoot!.querySelector("p9r-button") as HTMLElement).click();

            expect(actions).toEqual([]);
        } finally {
            window.confirm = originalConfirm;
        }
    });
});
