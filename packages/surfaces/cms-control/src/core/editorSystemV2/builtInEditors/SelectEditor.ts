import { Editor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class SelectEditor extends Editor {

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Options",
                min: 1,
                accepts: [{ kind: "component", tag: "option" }],
            },
        ];
    }

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Select",
                settings: [
                    {
                        type: "text",
                        label: "Name",
                        attribute: "name",
                    },
                    {
                        type: "toggle",
                        label: "Required",
                        attribute: "required",
                        defaultValue: false,
                    },
                    {
                        type: "toggle",
                        label: "Disabled",
                        attribute: "disabled",
                        defaultValue: false,
                    },
                ],
            },
        ];
    }

}
