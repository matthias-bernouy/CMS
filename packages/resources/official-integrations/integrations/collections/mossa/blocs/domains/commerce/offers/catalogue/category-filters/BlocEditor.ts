import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Categories",
                settings: [
                    { type: "text", label: "URL parameter", attribute: "category-param", defaultValue: "category" },
                    {
                        type: "text",
                        label: "First category",
                        attribute: "first-category-value",
                        defaultValue: "category-a",
                    },
                    {
                        type: "text",
                        label: "Second category",
                        attribute: "second-category-value",
                        defaultValue: "category-b",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Category selector",
                slot: "selector",
                accepts: [{ kind: "component", tag: "mossa-button" }],
                min: 2,
                max: 2,
            },
            { label: "Common filters", slot: "common", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "First category filters", slot: "first-category", accepts: [{ kind: "any-component" }], max: 1 },
            {
                label: "Second category filters",
                slot: "second-category",
                accepts: [{ kind: "any-component" }],
                max: 1,
            },
        ];
    }
}

registerEditor({ editor: BlocEditor });
