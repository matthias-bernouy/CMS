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
                        label: "Tennis category",
                        attribute: "tennis-value",
                        defaultValue: "sport-de-raquette/raquette-de-tennis",
                    },
                    {
                        type: "text",
                        label: "Padel category",
                        attribute: "padel-value",
                        defaultValue: "sport-de-raquette/raquette-de-padel",
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
                accepts: [{ kind: "component", tag: "basic-button" }],
                min: 2,
                max: 2,
            },
            { label: "Common filters", slot: "common", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Tennis filters", slot: "tennis", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Padel filters", slot: "padel", accepts: [{ kind: "any-component" }], max: 1 },
        ];
    }
}

registerEditor({ editor: BlocEditor });
