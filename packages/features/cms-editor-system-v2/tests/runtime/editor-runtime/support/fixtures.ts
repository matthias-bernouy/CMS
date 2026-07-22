import { parseHTML } from "linkedom";
import type { ContentSlot, DataScope, SettingSection } from "@bernouy/cms-content/editor";

export function createDocument() {
    return parseHTML(`
        <!DOCTYPE html>
        <html>
            <body>
                <x-data id="runtime-root">
                    <main id="content-root">
                        <x-parent id="parent">
                            <x-child id="child"></x-child>
                        </x-parent>
                    </main>
                </x-data>
            </body>
        </html>
    `);
}

export function blocConstructor(HTMLElementCtor: typeof HTMLElement): CustomElementConstructor {
    return class TestBloc extends HTMLElementCtor {} as unknown as CustomElementConstructor;
}

export const dataScope: DataScope = {
    name: "plans",
    label: "Plans",
    source: "urn:test:plans",
    fields: [{ path: "name", type: "string" }],
};

export const childOverride: SettingSection = {
    kind: "surcharge",
    label: "Parent override",
    settings: [
        {
            type: "select",
            label: "Column span",
            attribute: "column-span",
            options: [
                { label: "Auto", value: "auto" },
                { label: "Full", value: "full" },
            ],
        },
    ],
};

export const childContentSlot: ContentSlot = {
    label: "Child actions",
    min: 1,
    max: 1,
    accepts: [{ kind: "component", tag: "button" }],
};

export const parentContentOverride: ContentSlot = {
    label: "Parent slot override",
    slot: "actions",
    max: 2,
    accepts: [{ kind: "component", tag: "button" }],
};
