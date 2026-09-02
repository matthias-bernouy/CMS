import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class WorkspaceDetailSectionEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Section",
                settings: [
                    { type: "text", label: "Heading", attribute: "heading" },
                    { type: "text", label: "Description", attribute: "description" },
                    {
                        type: "segmented",
                        label: "Density",
                        attribute: "density",
                        defaultValue: "regular",
                        options: [
                            { label: "Compact", value: "compact" },
                            { label: "Regular", value: "regular" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Actions", slot: "actions", accepts: [{ kind: "any-component" }] },
            { label: "Content", accepts: [{ kind: "any-component" }], min: 1 },
        ];
    }
}

registerEditor({ editor: WorkspaceDetailSectionEditor });
