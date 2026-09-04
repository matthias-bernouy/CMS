import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "State",
                settings: [
                    {
                        type: "select",
                        label: "Mark as current when",
                        attribute: "match",
                        options: [
                            { label: "URL matches exactly", value: "exact" },
                            { label: "URL matches or is a sub-page", value: "prefix" },
                        ],
                        defaultValue: "exact",
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
