import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class OrderDetailEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Delivery",
                settings: [
                    {
                        type: "text",
                        label: "Usual delivery time",
                        attribute: "delivery-estimate-label",
                        defaultValue: "Délai habituel : 3 à 5 jours ouvrés après l’expédition.",
                    },
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
                ],
            },
        ];
    }
}

registerEditor({ editor: OrderDetailEditor });
