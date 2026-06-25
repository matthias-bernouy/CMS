import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Search input",
                settings: [
                    {
                        type: "text",
                        label: "Name",
                        attribute: "name",
                    },
                    {
                        type: "text",
                        label: "Placeholder",
                        attribute: "placeholder",
                    },
                    {
                        type: "text",
                        label: "Value",
                        attribute: "value",
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

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Options",
                accepts: [{ kind: "component", tag: "option" }],
            },
        ];
    }

}

registerEditor({ editor: BlocEditor });
