import {
    Editor,
    registerEditor,
    type ColorSetting,
    type ContentSlot,
    type SettingSection,
    type TextCapability,
} from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({
    type: "color",
    label,
    attribute,
});

export class BasicButtonEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Action",
                settings: [
                    {
                        type: "segmented",
                        label: "Behavior",
                        attribute: "action",
                        defaultValue: "button",
                        options: [
                            { label: "Button", value: "button" },
                            { label: "Link", value: "link" },
                        ],
                        attributesOnValue: [
                            {
                                value: "button",
                                attributes: {
                                    href: null,
                                    target: null,
                                    rel: null,
                                },
                            },
                            {
                                value: "link",
                                attributes: { type: null },
                            },
                        ],
                    },
                    {
                        type: "select",
                        label: "Type",
                        attribute: "type",
                        defaultValue: "button",
                        visibleWhen: { attribute: "action", equals: "button" },
                        options: [
                            { label: "Button", value: "button" },
                            { label: "Submit", value: "submit" },
                            { label: "Reset", value: "reset" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Link",
                        attribute: "href",
                        visibleWhen: { attribute: "action", equals: "link" },
                    },
                    {
                        type: "select",
                        label: "Open in",
                        attribute: "target",
                        defaultValue: "",
                        visibleWhen: { attribute: "action", equals: "link" },
                        options: [
                            { label: "Same tab", value: "" },
                            { label: "New tab", value: "_blank" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Disabled",
                        attribute: "disabled",
                        defaultValue: "",
                        options: [
                            { label: "No", value: "" },
                            { label: "Yes", value: "true" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Name",
                        attribute: "name",
                        visibleWhen: { attribute: "type", equals: "submit" },
                    },
                    {
                        type: "text",
                        label: "Value",
                        attribute: "value",
                        visibleWhen: { attribute: "type", equals: "submit" },
                    },
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "select",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "filled",
                        options: [
                            { label: "Filled", value: "filled" },
                            { label: "Outlined", value: "outlined" },
                            { label: "Ghost", value: "ghost" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Size",
                        attribute: "size",
                        defaultValue: "md",
                        options: [
                            { label: "Extra small", value: "xs" },
                            { label: "Small", value: "sm" },
                            { label: "Medium", value: "md" },
                            { label: "Large", value: "lg" },
                            { label: "Extra large", value: "xl" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Width",
                        attribute: "width",
                        defaultValue: "auto",
                        options: [
                            { label: "Automatic", value: "auto" },
                            { label: "Full", value: "full" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Alignment",
                        attribute: "align",
                        defaultValue: "center",
                        options: [
                            { label: "Left", value: "left" },
                            { label: "Center", value: "center" },
                            { label: "Right", value: "right" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Colors",
                settings: [
                    color("Text", "text-color"),
                    color("Background", "background-color"),
                    color("Border", "border-color"),
                    color("Focus", "accent-color"),
                ],
            },
        ];
    }

    protected override textCapability(): TextCapability {
        return { format: "text", dynamic: true };
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Left icon",
                slot: "icon-left",
                accepts: [{ kind: "media", accept: ["svg"] }],
                max: 1,
            },
            {
                label: "Right icon",
                slot: "icon-right",
                accepts: [{ kind: "media", accept: ["svg"] }],
                max: 1,
            },
        ];
    }
}

registerEditor({ editor: BasicButtonEditor });
