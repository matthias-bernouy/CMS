import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class SalesProposalStarterEditor extends Editor {
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
            {
                kind: "self",
                label: "Navigation",
                settings: [
                    {
                        type: "text",
                        label: "Proposal editor path",
                        attribute: "edit-path",
                        defaultValue: "/proposals/edit",
                    },
                    {
                        type: "text",
                        label: "Proposal id parameter",
                        attribute: "proposal-param",
                        defaultValue: "proposalId",
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
        return [{ label: "Creation steps", accepts: [{ kind: "any-component" }], min: 1 }];
    }
}

registerEditor({ editor: SalesProposalStarterEditor });
