import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Style",
                settings: [
                    {
                        type: "select",
                        label: "Variant",
                        attribute: "variant",
                        options: [
                            { label: "Default", value: "default" },
                            { label: "Danger", value: "danger" },
                        ],
                        defaultValue: "default",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Link",
                accepts: [{ kind: "component", tag: "a" }],
                min: 1,
                max: 1,
            },
        ];
    }
}

registerEditor({ editor: BlocEditor });
