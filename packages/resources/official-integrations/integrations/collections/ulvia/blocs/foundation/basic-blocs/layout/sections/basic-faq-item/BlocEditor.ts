import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class BasicFaqItemEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Disclosure",
                settings: [
                    {
                        type: "segmented",
                        label: "Initially open",
                        attribute: "open",
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
            { label: "Question", slot: "question", accepts: [{ kind: "any-component" }], min: 1, max: 1 },
            { label: "Answer", accepts: [{ kind: "any-component" }], min: 1 },
        ];
    }
}

registerEditor({ editor: BasicFaqItemEditor });
