import { Editor, registerEditor, type SettingSection, type TextCapability } from "@bernouy/cms-content/editor";

export class BasicBadgeEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Appearance",
                settings: [
                    {
                        type: "select",
                        label: "Color",
                        attribute: "color",
                        defaultValue: "neutral",
                        options: [
                            { label: "Neutral", value: "neutral" },
                            { label: "Primary", value: "primary" },
                            { label: "Information", value: "info" },
                            { label: "Success", value: "success" },
                            { label: "Warning", value: "warning" },
                            { label: "Danger", value: "danger" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Variant",
                        attribute: "variant",
                        defaultValue: "soft",
                        options: [
                            { label: "Soft", value: "soft" },
                            { label: "Filled", value: "filled" },
                            { label: "Outlined", value: "outlined" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Size",
                        attribute: "size",
                        defaultValue: "md",
                        options: [
                            { label: "S", value: "sm" },
                            { label: "M", value: "md" },
                            { label: "L", value: "lg" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Status dot",
                        attribute: "dot",
                        defaultValue: "",
                        options: [
                            { label: "No", value: "" },
                            { label: "Yes", value: "true" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override textCapability(): TextCapability {
        return { format: "text", dynamic: true };
    }
}

registerEditor({ editor: BasicBadgeEditor });
