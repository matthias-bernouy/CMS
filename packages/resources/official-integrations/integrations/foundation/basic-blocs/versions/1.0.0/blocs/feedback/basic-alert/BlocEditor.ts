import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class BasicAlertEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Message",
                settings: [
                    {
                        type: "select",
                        label: "Type",
                        attribute: "type",
                        defaultValue: "info",
                        options: [
                            { label: "Information", value: "info" },
                            { label: "Success", value: "success" },
                            { label: "Warning", value: "warning" },
                            { label: "Danger", value: "danger" },
                        ],
                    },
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
