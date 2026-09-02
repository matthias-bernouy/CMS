import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class WorkspaceShellDetailEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Columns",
                settings: [
                    { type: "text", label: "Main width", attribute: "main-width", defaultValue: "600px" },
                    { type: "text", label: "Aside width", attribute: "aside-width", defaultValue: "285px" },
                    { type: "text", label: "Gap", attribute: "gap", defaultValue: "16px" },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Back", slot: "back", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Title", slot: "title", accepts: [{ kind: "any-component" }], min: 1, max: 1 },
            { label: "Actions", slot: "actions", accepts: [{ kind: "any-component" }] },
            { label: "Main", slot: "main", accepts: [{ kind: "any-component" }], min: 1 },
            { label: "Aside", slot: "aside", accepts: [{ kind: "any-component" }] },
        ];
    }
}

registerEditor({ editor: WorkspaceShellDetailEditor });
