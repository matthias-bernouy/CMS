import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class WorkspaceLateralMenuEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Navigation",
                settings: [
                    {
                        type: "text",
                        label: "Accessible label",
                        attribute: "aria-label",
                        defaultValue: "Workspace navigation",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Header",
                slot: "header",
                accepts: [{ kind: "any-component" }],
                max: 1,
            },
            {
                label: "Navigation items",
                accepts: [{ kind: "component", tag: "workspace-lateral-menu-item" }],
                min: 1,
            },
            {
                label: "Footer",
                slot: "footer",
                accepts: [{ kind: "any-component" }],
            },
        ];
    }
}

registerEditor({ editor: WorkspaceLateralMenuEditor });
