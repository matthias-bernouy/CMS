import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class CheckoutFlowEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Title", attribute: "title", defaultValue: "Finaliser ma commande" },
                    {
                        type: "text",
                        label: "Information step",
                        attribute: "information-label",
                        defaultValue: "Informations",
                    },
                    { type: "text", label: "Delivery step", attribute: "delivery-label", defaultValue: "Livraison" },
                    { type: "text", label: "Payment step", attribute: "payment-label", defaultValue: "Paiement" },
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

registerEditor({ editor: CheckoutFlowEditor });
