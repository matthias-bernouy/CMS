import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class WorkspaceLateralMenuItemEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Presentation",
                settings: [
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
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Navigation link",
                accepts: [{ kind: "component", tag: "a" }],
                min: 1,
                max: 1,
            },
        ];
    }
}

registerEditor({ editor: WorkspaceLateralMenuItemEditor });
