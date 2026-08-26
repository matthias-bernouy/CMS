import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class WorkspaceShellEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "text",
                        label: "Primary navigation width",
                        attribute: "sidebar-width",
                        defaultValue: "224px",
                    },
                    {
                        type: "text",
                        label: "Secondary navigation width",
                        attribute: "secondary-sidebar-width",
                        defaultValue: "248px",
                    },
                    { type: "text", label: "Content padding", attribute: "content-padding", defaultValue: "30px" },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Skip link",
                slot: "skip-link",
                accepts: [{ kind: "component", tag: "a" }],
                max: 1,
            },
            {
                label: "Main content target",
                slot: "main-target",
                accepts: [{ kind: "component", tag: "span" }],
                min: 1,
                max: 1,
            },
            {
                label: "Primary navigation",
                slot: "sidebar",
                accepts: [{ kind: "component", tag: "workspace-lateral-menu" }],
                min: 1,
                max: 1,
            },
            {
                label: "Secondary navigation",
                slot: "secondary-sidebar",
                accepts: [{ kind: "component", tag: "workspace-lateral-menu" }],
                max: 1,
            },
            {
                label: "Content",
                accepts: [{ kind: "any-component" }],
                min: 1,
            },
        ];
    }
}

registerEditor({ editor: WorkspaceShellEditor });
