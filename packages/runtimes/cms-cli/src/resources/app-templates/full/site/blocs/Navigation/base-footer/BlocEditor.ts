import {
    Editor,
    registerEditor,
    type ContentSlot,
    type SettingSection,
} from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Footer",
                settings: [
                    {
                        type: "select",
                        label: "Variant",
                        attribute: "variant",
                        defaultValue: "background",
                        options: [
                            { label: "Background", value: "background" },
                            { label: "Surface", value: "surface" },
                            { label: "Primary", value: "primary" },
                            { label: "Secondary", value: "secondary" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Max width",
                        attribute: "width",
                        defaultValue: "xl",
                        options: [
                            { label: "Medium", value: "md" },
                            { label: "Large", value: "lg" },
                            { label: "Extra large", value: "xl" },
                            { label: "Full width", value: "full" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Columns",
                min: 1,
                accepts: [{ kind: "component", tag: "base-footer-column" }],
            },
            {
                label: "Copyright",
                slot: "copyright",
                max: 1,
                accepts: [{ kind: "any-component" }],
            },
            {
                label: "Legal",
                slot: "legal",
                accepts: [{ kind: "any-component" }],
            },
        ];
    }
}

registerEditor({ editor: BlocEditor });
