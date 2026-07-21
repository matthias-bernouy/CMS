import { afterEach, describe, expect, test } from "bun:test";
import { Combobox, P9rInput, P9rSelect, TokenInput } from "@bernouy/components";
import {
    createFieldControl,
    readFieldControlValue,
} from "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/controls";
import { detailData } from "../../../src/components/admin/Resources/Dashboards/runtime/mapping";
import type { WDetailField } from "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/types";

if (!customElements.get("p9r-input")) {
    customElements.define("p9r-input", P9rInput);
}
if (!customElements.get("p9r-select")) {
    customElements.define("p9r-select", P9rSelect);
}
if (!customElements.get("p9r-combobox")) {
    customElements.define("p9r-combobox", Combobox);
}
if (!customElements.get("p9r-token-input")) {
    customElements.define("p9r-token-input", TokenInput);
}

afterEach(() => document.body.replaceChildren());

describe("typed dashboard detail controls", () => {
    test("reads number and checkbox controls as their declared types", () => {
        const number = createFieldControl({
            id: "quantity",
            label: "Quantity",
            input: "number",
            value: 2.5,
            min: 0,
            max: 10,
            step: 0.5,
            required: true,
        });
        const checkbox = createFieldControl({ id: "enabled", label: "Enabled", input: "checkbox", value: false });
        document.body.append(number, checkbox);

        expect({
            type: number.getAttribute("type"),
            min: number.getAttribute("min"),
            max: number.getAttribute("max"),
            step: number.getAttribute("step"),
            required: number.hasAttribute("required"),
        }).toEqual({ type: "number", min: "0", max: "10", step: "0.5", required: true });
        (number as HTMLElement & { value: string }).value = "3.5";
        (checkbox as HTMLInputElement).checked = true;
        expect(readFieldControlValue(numberField(), number)).toBe(3.5);
        expect(readFieldControlValue(checkboxField(), checkbox)).toBe(true);

        (number as HTMLElement & { value: string }).value = "";
        expect(readFieldControlValue(numberField(), number)).toBe("");
    });

    test("maps readonly image fields to lazy previews", () => {
        const data = detailData(
            {
                widget: "w-detail",
                id: "userDetail",
                source: { endpoint: "user" },
                main: [
                    {
                        id: "avatar",
                        title: "Avatar",
                        fields: [
                            {
                                id: "avatarPreview",
                                label: "Avatar",
                                path: "avatarUrl",
                                type: "readonly",
                                format: "image",
                            },
                        ],
                    },
                ],
            } as never,
            { avatarUrl: "https://cdn.example.test/avatar.jpg" },
            "user-1",
        );
        const field = data.main[0]!.fields[0]!;
        const control = createFieldControl(field) as HTMLImageElement;

        expect(field.input).toBe("image");
        expect({ tag: control.tagName, src: control.src, alt: control.alt, loading: control.loading }).toEqual({
            tag: "IMG",
            src: "https://cdn.example.test/avatar.jpg",
            alt: "Avatar",
            loading: "lazy",
        });
    });

    test("uses declared table editors and preserves hidden row metadata", () => {
        const field: WDetailField = {
            id: "variants",
            label: "Variants",
            input: "table",
            editable: true,
            addLabel: "Add variant",
            value: [
                {
                    id: "variant-1",
                    audit: { owner: "system" },
                    name: "Old",
                    status: "draft",
                    productId: "product-1",
                    tags: "legacy,csv",
                },
            ],
            columns: [
                { key: "name", label: "Name", path: "name", editable: true, type: "text" },
                {
                    key: "status",
                    label: "Status",
                    path: "status",
                    editable: true,
                    type: "select",
                    options: [
                        { value: "draft", label: "Draft" },
                        { value: "active", label: "Active" },
                    ],
                },
                {
                    key: "product",
                    label: "Product",
                    path: "productId",
                    editable: true,
                    type: "combobox",
                    options: [
                        { value: "product-1", label: "Racket" },
                        { value: "product-2", label: "Shoes" },
                    ],
                },
                { key: "tags", label: "Tags", path: "tags", editable: true, type: "tokens" },
            ],
        };
        const control = createFieldControl(field);
        document.body.append(control);

        expect(control.querySelector<HTMLButtonElement>("[data-table-add]")?.textContent).toBe("Add variant");
        expect((control.querySelector("p9r-token-input") as HTMLElement & { values: string[] }).values).toEqual([]);
        (control.querySelector("p9r-input") as HTMLElement & { value: string }).value = "Updated";
        (control.querySelector("p9r-select") as HTMLElement & { value: string }).value = "active";
        (control.querySelector("p9r-combobox") as HTMLElement & { value: string }).value = "product-2";
        (control.querySelector("p9r-token-input") as HTMLElement & { value: string }).value = "new,sale";

        expect(readFieldControlValue(field, control)).toEqual([
            {
                id: "variant-1",
                audit: { owner: "system" },
                name: "Updated",
                status: "active",
                productId: "product-2",
                tags: ["new", "sale"],
            },
        ]);
    });
});

function numberField(): WDetailField {
    return { id: "quantity", label: "Quantity", input: "number", value: 2.5 };
}

function checkboxField(): WDetailField {
    return { id: "enabled", label: "Enabled", input: "checkbox", value: false };
}
