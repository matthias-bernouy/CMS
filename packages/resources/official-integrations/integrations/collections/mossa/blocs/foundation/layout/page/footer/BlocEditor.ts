import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class MossaFooterEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Style",
                settings: [
                    {
                        type: "select",
                        label: "Surface",
                        attribute: "surface",
                        defaultValue: "page",
                        options: [
                            { label: "Page", value: "page" },
                            { label: "Primary", value: "primary" },
                            { label: "Secondary", value: "secondary" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Navigation groups", slot: "navigation", accepts: [{ kind: "any-component" }] },
            { label: "Copyright", slot: "copyright", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Legal links", slot: "legal", accepts: [{ kind: "any-component" }], max: 1 },
        ];
    }
}

registerEditor({ editor: MossaFooterEditor });
