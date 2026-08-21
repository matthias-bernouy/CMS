import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { BASIC_COLOR_SCHEME_OPTIONS } from "./colorSchemes";

export class BasicAlertEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Style",
                settings: [
                    {
                        type: "select",
                        label: "Tone",
                        attribute: "tone",
                        defaultValue: "info",
                        options: BASIC_COLOR_SCHEME_OPTIONS,
                    },
                    {
                        type: "segmented",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "soft",
                        options: [
                            { label: "Soft", value: "soft" },
                            { label: "Filled", value: "filled" },
                            { label: "Outlined", value: "outlined" },
                            { label: "Ghost", value: "ghost" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Message",
                settings: [
                    {
                        type: "select",
                        label: "Announcement",
                        attribute: "role",
                        defaultValue: "status",
                        options: [
                            { label: "Polite status", value: "status" },
                            { label: "Urgent alert", value: "alert" },
                            { label: "None", value: "" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Dismissible",
                        attribute: "dismissible",
                        defaultValue: "",
                        options: [
                            { label: "No", value: "" },
                            { label: "Yes", value: "true" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Close button label",
                        attribute: "close-label",
                        defaultValue: "Dismiss alert",
                        visibleWhen: { attribute: "dismissible", equals: "true" },
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Icon",
                slot: "icon",
                accepts: [{ kind: "media", accept: ["svg"] }],
                max: 1,
            },
            {
                label: "Title",
                slot: "title",
                accepts: [{ kind: "any-component" }],
                max: 1,
            },
            {
                label: "Message",
                accepts: [{ kind: "any-component" }],
            },
        ];
    }
}

registerEditor({ editor: BasicAlertEditor });
