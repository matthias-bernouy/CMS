import {
    Editor,
    registerEditor,
    type ContentSlot,
    type SettingSection,
    type TextCapability,
} from "@bernouy/cms-content/editor";

export class BasicTableCellEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Appearance",
                settings: [
                    {
                        type: "select",
                        label: "Semantic color",
                        attribute: "variant",
                        defaultValue: "default",
                        options: [
                            { label: "Default", value: "default" },
                            { label: "Primary", value: "primary" },
                            { label: "Information", value: "info" },
                            { label: "Success", value: "success" },
                            { label: "Danger", value: "danger" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Content", accepts: [{ kind: "any-component" }] }];
    }

    protected override textCapability(): TextCapability {
        return { format: "text", dynamic: true };
    }
}

registerEditor({ editor: BasicTableCellEditor });
