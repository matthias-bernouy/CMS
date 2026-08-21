import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { BASIC_COLOR_SCHEME_OPTIONS } from "./colorSchemes";

export class BasicFileInputEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Field",
                settings: [
                    { type: "text", label: "Label", attribute: "label" },
                    { type: "text", label: "Name", attribute: "name" },
                    {
                        type: "text",
                        label: "Accepted file types",
                        attribute: "accept",
                        placeholder: "image/*,.pdf",
                    },
                    {
                        type: "text",
                        label: "Picker label",
                        attribute: "picker-label",
                        defaultValue: "Choose file",
                    },
                    {
                        type: "text",
                        label: "Empty label",
                        attribute: "empty-label",
                        defaultValue: "No file selected",
                    },
                    { type: "text", label: "Hint", attribute: "hint" },
                ],
            },
            {
                kind: "self",
                label: "Behavior",
                settings: [
                    {
                        type: "select",
                        label: "Capture",
                        attribute: "capture",
                        defaultValue: "",
                        options: [
                            { label: "Do not request", value: "" },
                            { label: "User-facing camera", value: "user" },
                            { label: "Environment-facing camera", value: "environment" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Multiple files",
                        attribute: "multiple",
                        defaultValue: "",
                        options: [
                            { label: "No", value: "" },
                            { label: "Yes", value: "true" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Required",
                        attribute: "required",
                        defaultValue: "",
                        options: [
                            { label: "No", value: "" },
                            { label: "Yes", value: "true" },
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
                ],
            },
            {
                kind: "self",
                label: "Preview",
                settings: [
                    {
                        type: "segmented",
                        label: "Shape",
                        attribute: "preview-shape",
                        defaultValue: "rounded",
                        options: [
                            { label: "Rounded", value: "rounded" },
                            { label: "Circle", value: "circle" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Size",
                        attribute: "preview-size",
                        defaultValue: "medium",
                        options: [
                            { label: "Small", value: "small" },
                            { label: "Medium", value: "medium" },
                            { label: "Large", value: "large" },
                        ],
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
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Preview",
                slot: "preview",
                accepts: [{ kind: "any-component" }],
                max: 1,
            },
        ];
    }
}

registerEditor({ editor: BasicFileInputEditor });
