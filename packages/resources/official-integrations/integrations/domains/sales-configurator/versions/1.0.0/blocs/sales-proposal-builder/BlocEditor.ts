import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class SalesProposalBuilderEditor extends Editor {
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
                        label: "Proposal URL parameter",
                        attribute: "proposal-param",
                        defaultValue: "proposalId",
                    },
                    {
                        type: "text",
                        label: "Shared proposal path",
                        attribute: "share-path",
                        defaultValue: "/proposal",
                    },
                    {
                        type: "text",
                        label: "Share token URL parameter",
                        attribute: "share-token-param",
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
        return [{ label: "Configurator steps", accepts: [{ kind: "any-component" }], min: 1 }];
    }
}

registerEditor({ editor: SalesProposalBuilderEditor });
