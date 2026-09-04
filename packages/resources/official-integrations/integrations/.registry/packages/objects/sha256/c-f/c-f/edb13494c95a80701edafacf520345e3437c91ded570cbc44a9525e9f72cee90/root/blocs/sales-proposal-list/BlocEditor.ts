import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class SalesProposalListEditor extends Editor {
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
                        label: "Items per request",
                        attribute: "page-size",
                        defaultValue: "20",
                    },
                ],
            },
            {
                kind: "self",
                label: "Page state",
                settings: [
                    {
                        type: "text",
                        label: "Search parameter",
                        attribute: "query-param",
                        defaultValue: "salesProposalQuery",
                    },
                    {
                        type: "text",
                        label: "Status parameter",
                        attribute: "status-param",
                        defaultValue: "salesProposalStatus",
                    },
                    {
                        type: "text",
                        label: "Cursor state",
                        attribute: "cursor-state",
                        defaultValue: "salesProposalCursor",
                    },
                ],
            },
            {
                kind: "self",
                label: "Navigation",
                settings: [
                    {
                        type: "text",
                        label: "New proposal path",
                        attribute: "new-path",
                        defaultValue: "/proposals/new",
                    },
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
        return [{ label: "Proposal list content", accepts: [{ kind: "any-component" }], min: 1 }];
    }
}

registerEditor({ editor: SalesProposalListEditor });
