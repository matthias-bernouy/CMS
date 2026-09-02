import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class SalesProposalViewEditor extends Editor {
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
                        type: "text",
                        label: "Share token URL parameter",
                        attribute: "token-param",
                        defaultValue: "proposalToken",
                    },
                ],
            },
            {
                kind: "self",
                label: "Formatting",
                settings: [{ type: "text", label: "Locale", attribute: "locale", defaultValue: "en" }],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Shared proposal content", accepts: [{ kind: "any-component" }], min: 1 }];
    }
}

registerEditor({ editor: SalesProposalViewEditor });
