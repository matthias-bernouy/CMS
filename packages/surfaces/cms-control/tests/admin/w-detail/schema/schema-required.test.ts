import { afterEach, describe, expect, test } from "bun:test";
import {
    WIDGET_ACTION_EVENT,
    type WidgetActionDetail,
} from "../../../../src/components/admin/Resources/Dashboards/widgets/shared";
import { waitForDetail } from "../../dashboards/detail/detailTestHelpers";
import { schemaDetailElement } from "./schemaTestHelpers";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard dynamic schema requirements", () => {
    test("shows an empty enum choice and blocks submission until a required value is selected", async () => {
        globalThis.fetch = (async () =>
            Response.json({
                fields: [
                    {
                        fieldKey: "condition",
                        label: "Condition",
                        fieldType: "enum",
                        options: [
                            { value: "new", label: "New" },
                            { value: "used", label: "Used" },
                        ],
                        required: true,
                    },
                ],
            })) as unknown as typeof fetch;
        const detail = schemaDetailElement();
        detail.setAttribute(
            "data-source-json",
            JSON.stringify({ id: null, primaryCategoryId: 9, metadata: {}, variantAxes: [] }),
        );
        const actions: WidgetActionDetail[] = [];
        detail.addEventListener(WIDGET_ACTION_EVENT, (event) => {
            actions.push((event as CustomEvent<WidgetActionDetail>).detail);
        });
        document.body.append(detail);

        await waitForDetail(() => Boolean(detail.shadowRoot?.querySelector("[data-schema-key='condition']")));
        const condition = detail.shadowRoot!.querySelector<HTMLElement & { value: string }>(
            "[data-schema-key='condition']",
        )!;
        const placeholder = condition.querySelector<HTMLOptionElement>("option");
        let focused = false;
        condition.focus = () => {
            focused = true;
        };

        expect({
            value: condition.value,
            label: condition.getAttribute("label"),
            placeholder: placeholder?.textContent,
            placeholderDisabled: placeholder?.disabled,
        }).toEqual({
            value: "",
            label: "Condition",
            placeholder: "Select an option",
            placeholderDisabled: true,
        });

        detail.shadowRoot!.querySelector<HTMLElement>("[data-action='save']")!.click();

        expect(actions).toEqual([]);
        expect(focused).toBeTrue();
        expect(condition.hasAttribute("invalid")).toBeTrue();
        expect(condition.getAttribute("hint")).toBe("This field is required.");

        condition.value = "used";
        condition.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

        expect(condition.hasAttribute("invalid")).toBeFalse();
        expect(condition.hasAttribute("hint")).toBeFalse();
        detail.shadowRoot!.querySelector<HTMLElement>("[data-action='save']")!.click();
        expect(actions[0]?.fields).toMatchObject({ metadata: { condition: "used" } });
    });

    test("submits false as a present required boolean value without forcing the checkbox on", async () => {
        globalThis.fetch = (async () =>
            Response.json({
                fields: [{ fieldKey: "refurbished", label: "Refurbished", fieldType: "boolean", required: true }],
            })) as unknown as typeof fetch;
        const detail = schemaDetailElement();
        detail.setAttribute(
            "data-source-json",
            JSON.stringify({ id: null, primaryCategoryId: 9, metadata: {}, variantAxes: [] }),
        );
        const actions: WidgetActionDetail[] = [];
        detail.addEventListener(WIDGET_ACTION_EVENT, (event) => {
            actions.push((event as CustomEvent<WidgetActionDetail>).detail);
        });
        document.body.append(detail);

        await waitForDetail(() => Boolean(detail.shadowRoot?.querySelector("[data-schema-key='refurbished']")));
        const checkbox = detail.shadowRoot!.querySelector<HTMLInputElement>("[data-schema-key='refurbished']")!;
        expect(checkbox.closest("label")?.textContent).toBe("Refurbished");
        expect(checkbox.closest("label")?.hasAttribute("data-required")).toBeTrue();
        expect(checkbox.checked).toBeFalse();

        detail.shadowRoot!.querySelector<HTMLElement>("[data-action='save']")!.click();

        expect(actions[0]?.fields).toMatchObject({ metadata: { refurbished: false } });
    });
});
