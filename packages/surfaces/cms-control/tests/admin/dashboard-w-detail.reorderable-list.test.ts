import { afterEach, describe, expect, test } from "bun:test";
import { Combobox, P9rSelect } from "@bernouy/components";
import "../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";
import { WIDGET_FIELD_CHANGE_EVENT } from "../../src/components/admin/Resources/Dashboards/widgets/shared";

if (!customElements.get("p9r-combobox")) customElements.define("p9r-combobox", Combobox);
if (!customElements.get("p9r-select")) customElements.define("p9r-select", P9rSelect);

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard detail reorderable list", () => {
    test("keeps the edited input focused while its value changes", async () => {
        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute("data-config-json", JSON.stringify({
            widget: "w-detail",
            id: "fieldDetail",
            source: { endpoint: "field" },
            main: [{
                id: "options",
                title: "Allowed values",
                fields: [{
                    id: "options",
                    label: "Allowed values",
                    path: "options",
                    type: "reorderable-list",
                    itemKey: "id",
                    positionPath: "order.position",
                    fields: [
                        { id: "value", label: "Value", path: "value", required: true },
                        { id: "label", label: "Label", path: "metadata.label", required: true },
                        { id: "required", label: "Required", path: "required", type: "checkbox" },
                    ],
                }],
            }],
        }));
        detail.setAttribute("data-source-json", JSON.stringify({
            options: [{ id: "agency", value: "agency", metadata: { label: "Agency" }, required: false, order: { position: 0 } }],
        }));
        document.body.append(detail);
        await Promise.resolve();

        const changes: Array<{ rowKey: string; field: string; value: unknown }> = [];
        detail.addEventListener(WIDGET_FIELD_CHANGE_EVENT, event => {
            changes.push((event as CustomEvent<{ rowKey: string; field: string; value: unknown }>).detail);
        });
        const list = detail.shadowRoot!.querySelector<HTMLElement>("cms-dashboard-w-reorderable-list")!;
        const initialSnapshot = (list as HTMLElement & { data: { items: Array<Record<string, unknown>> } }).data;
        const input = list.shadowRoot!.querySelector<HTMLInputElement>("[data-item-path='metadata.label']")!;
        input.focus();
        input.value = "Agency updated";
        input.dispatchEvent(new Event("input", { bubbles: true }));

        const renderedList = detail.shadowRoot!.querySelector<HTMLElement>("cms-dashboard-w-reorderable-list")!;
        expect(renderedList).toBe(list);
        expect(renderedList.shadowRoot!.querySelector("[data-item-path='metadata.label']")).toBe(input);
        expect(renderedList.shadowRoot!.activeElement).toBe(input);
        expect(initialSnapshot.items[0]).toEqual({
            id: "agency", value: "agency", metadata: { label: "Agency" }, required: false, order: { position: 0 },
        });
        expect(changes.at(-1)).toEqual({
            rowKey: "",
            field: "options",
            value: [{ id: "agency", value: "agency", metadata: { label: "Agency updated" }, required: false, order: { position: 0 } }],
        });

        const checkbox = list.shadowRoot!.querySelector<HTMLInputElement>("input[type='checkbox']")!;
        checkbox.click();
        expect(changes.at(-1)?.value).toEqual([
            { id: "agency", value: "agency", metadata: { label: "Agency updated" }, required: true, order: { position: 0 } },
        ]);
    });

    test("loads lookup options for an item combobox without enabling creation", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return Response.json({
                items: [
                    { key: "grip", label: "Grip", fieldType: "enum" },
                    { key: "weight", label: "Weight", fieldType: "number" },
                ],
            });
        }) as typeof fetch;

        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute("data-config-json", JSON.stringify({
            widget: "w-detail",
            id: "categoryDetail",
            source: { endpoint: "category" },
            main: [{
                id: "metadata",
                title: "Product metadata",
                fields: [{
                    id: "categoryFields",
                    label: "Product metadata",
                    path: "categoryFields",
                    type: "reorderable-list",
                    itemKey: "fieldKey",
                    fields: [
                        {
                            id: "fieldKey",
                            label: "Product metadata",
                            path: "fieldKey",
                            type: "combobox",
                            lookup: {
                                endpoint: "entityCustomFields",
                                params: { entityType: "product" },
                                itemsPath: "items",
                                valuePath: "key",
                                labelPath: "label",
                            },
                        },
                        {
                            id: "operator",
                            label: "Operator",
                            path: "operator",
                            type: "select",
                            options: [{ value: "eq", label: "Equals" }, { value: "in", label: "Contains" }],
                        },
                    ],
                }],
            }],
        }));
        detail.setAttribute("data-source-json", JSON.stringify({
            id: 2,
            categoryFields: [{ fieldKey: "grip", operator: "eq" }],
        }));
        detail.setAttribute("data-source-id", "commerce");
        const changes: Array<{ value: unknown }> = [];
        detail.addEventListener(WIDGET_FIELD_CHANGE_EVENT, event => {
            changes.push((event as CustomEvent<{ value: unknown }>).detail);
        });

        document.body.append(detail);
        await waitFor(() => Boolean(
            detail.shadowRoot!.querySelector<HTMLElement>("cms-dashboard-w-reorderable-list")
                ?.shadowRoot?.querySelector("p9r-combobox option[value='weight']"),
        ));

        const list = detail.shadowRoot!.querySelector("cms-dashboard-w-reorderable-list")!;
        const combobox = list.shadowRoot!.querySelector<HTMLElement & { value: string }>("p9r-combobox")!;
        const select = list.shadowRoot!.querySelector<HTMLElement & { value: string }>("p9r-select")!;
        expect(requests[0]?.url).toContain("/.cms/sources/commerce/entityCustomFields?entityType=product");
        expect(combobox.hasAttribute("creatable")).toBeFalse();
        expect(combobox.querySelector("option[value='grip']")?.textContent).toBe("Grip");
        expect(select.querySelector("option[value='eq']")?.textContent).toBe("Equals");

        combobox.value = "weight";
        combobox.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        expect(changes.at(-1)?.value).toEqual([{ fieldKey: "weight", operator: "eq", position: 0 }]);
    });
});

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error("condition was not met");
}
