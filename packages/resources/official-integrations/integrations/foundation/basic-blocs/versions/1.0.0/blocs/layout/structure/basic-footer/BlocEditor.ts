import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class BasicFooterEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Accessibility",
                settings: [
                    {
                        type: "text",
                        label: "Accessible label",
                        attribute: "aria-label",
                        help: "Optional accessible name for this structural region.",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Content", accepts: [{ kind: "any-component" }] }];
    }
}

registerEditor({ editor: BasicFooterEditor });
