import {
    Editor,
    registerEditor,
    type ContentSlot,
    type SettingSection,
    type TextCapability,
} from "@bernouy/cms-content/editor";
import { BASIC_COLOR_SCHEME_OPTIONS } from "./colorSchemes";

export class BasicButtonEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Action",
                settings: [
                    {
                        type: "segmented",
                        label: "Action",
                        attribute: "action",
                        defaultValue: "button",
                        options: [
                            { label: "Button", value: "button" },
                            { label: "Submit", value: "submit" },
                            { label: "Reset", value: "reset" },
                            { label: "Link", value: "link" },
                        ],
                        attributesOnValue: [
                            {
                                value: "button",
                                attributes: {
                                    type: null,
                                    href: null,
                                    target: null,
                                    rel: null,
                                    name: null,
                                    value: null,
                                },
                            },
                            {
                                value: "submit",
                                attributes: { type: null, href: null, target: null, rel: null },
                            },
                            {
                                value: "reset",
                                attributes: {
                                    type: null,
                                    href: null,
                                    target: null,
                                    rel: null,
                                    name: null,
                                    value: null,
                                },
                            },
                            {
                                value: "link",
                                attributes: { type: null, name: null, value: null },
                            },
                        ],
                    },
                    {
                        type: "page-link",
                        label: "Target",
                        attribute: "href",
                        allowPage: true,
                        allowExternal: true,
                        allowMedia: true,
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
                        visibleWhen: { attribute: "action", equals: "submit" },
                    },
                    {
                        type: "text",
                        label: "Value",
                        attribute: "value",
                        visibleWhen: { attribute: "action", equals: "submit" },
                    },
                ],
            },
            {
                kind: "self",
                label: "Style",
                settings: [
                    {
                        type: "select",
                        label: "Tone",
                        attribute: "tone",
                        defaultValue: "primary",
                        options: BASIC_COLOR_SCHEME_OPTIONS,
                    },
                    {
                        type: "select",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "filled",
                        options: [
                            { label: "Filled", value: "filled" },
                            { label: "Soft", value: "soft" },
                            { label: "Outlined", value: "outlined" },
                            { label: "Ghost", value: "ghost" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
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
