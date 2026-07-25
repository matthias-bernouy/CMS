import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class SalesClientDirectoryEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Data",
                settings: [
                    {
                        type: "text",
                        label: "Source id",
                        attribute: "source-id",
                        defaultValue: "sales-configurator",
                    },
                    {
                        type: "number",
                        label: "Maximum clients",
                        attribute: "client-limit",
                        defaultValue: "100",
                        min: 1,
                        max: 100,
                        step: 1,
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Client directory content", accepts: [{ kind: "any-component" }], min: 1 }];
    }
}

registerEditor({ editor: SalesClientDirectoryEditor });
