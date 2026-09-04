import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class PurchaseListEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Pagination",
                settings: [
                    { type: "text", label: "Page size", attribute: "page-size", defaultValue: "8" },
                    { type: "text", label: "Previous label", attribute: "previous-label", defaultValue: "Précédent" },
                    { type: "text", label: "Next label", attribute: "next-label", defaultValue: "Suivant" },
                ],
            },
            {
                kind: "self",
                label: "Appearance",
                settings: [
                    {
                        type: "color",
                        label: "Accent color",
                        attribute: "accent-color",
                        defaultValue: "var(--ulvia-secondary-base)",
                    },
                    {
                        type: "color",
                        label: "Surface color",
                        attribute: "background-color",
                        defaultValue: "var(--ulvia-surface-background)",
                    },
                    {
                        type: "color",
                        label: "Border color",
                        attribute: "border-color",
                        defaultValue: "var(--ulvia-surface-border)",
                    },
                    {
                        type: "color",
                        label: "Text color",
                        attribute: "text-color",
                        defaultValue: "var(--ulvia-surface-text)",
                    },
                    {
                        type: "color",
                        label: "Button text",
                        attribute: "button-text-color",
                        defaultValue: "var(--ulvia-primary-foreground)",
                    },
                    {
                        type: "color",
                        label: "Button background",
                        attribute: "button-background-color",
                        defaultValue: "var(--ulvia-primary-base)",
                    },
                    {
                        type: "color",
                        label: "Button border",
                        attribute: "button-border-color",
                        defaultValue: "var(--ulvia-primary-base)",
                    },
                ],
            },
        ];
    }
}

registerEditor({ editor: PurchaseListEditor });
