import {
    Editor,
    registerEditor,
    type ContentSlot,
    type SettingSection,
    type TextCapability,
} from "@bernouy/cms-content/editor";

export class WorkspaceLateralMenuItemEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Link",
                settings: [
                    { type: "page-link", label: "Page", attribute: "href" },
                    { type: "text", label: "Badge", attribute: "badge" },
                    {
                        type: "segmented",
                        label: "Exact path",
                        attribute: "exact",
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
        ];
    }

    protected override textCapability(): TextCapability {
        return { format: "text", dynamic: true };
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Icon",
                slot: "icon",
                accepts: [{ kind: "media", accept: ["svg"] }],
                max: 1,
            },
        ];
    }
}

registerEditor({ editor: WorkspaceLateralMenuItemEditor });
