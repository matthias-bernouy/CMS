import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class MossaPageShellEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Page layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Sticky header",
                        attribute: "sticky-header",
                        defaultValue: "false",
                        options: [
                            { label: "No", value: "false" },
                            { label: "Yes", value: "true" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Document content", accepts: [{ kind: "any-component" }], min: 1 }];
    }
}

registerEditor({ editor: MossaPageShellEditor });
