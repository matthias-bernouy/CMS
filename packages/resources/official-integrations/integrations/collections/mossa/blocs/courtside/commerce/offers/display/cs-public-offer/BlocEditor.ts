import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class PublicOfferEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Price label", attribute: "price-label", defaultValue: "Prix vendeur" },
                    {
                        type: "text",
                        label: "Valuation label",
                        attribute: "valuation-label",
                        defaultValue: "Cote Courtside",
                    },
                    {
                        type: "text",
                        label: "Shipping message",
                        attribute: "shipping-message",
                        defaultValue: "Livraison disponible en point relais",
                    },
                    { type: "text", label: "Buy label", attribute: "buy-label", defaultValue: "Acheter" },
                    {
                        type: "text",
                        label: "Negotiation label",
                        attribute: "negotiate-label",
                        defaultValue: "Proposer un prix",
                    },
                    {
                        type: "text",
                        label: "Error title",
                        attribute: "error-title",
                        defaultValue: "Annonce introuvable",
                    },
                    {
                        type: "textarea",
                        label: "Error message",
                        attribute: "error-message",
                        defaultValue: "Cette annonce n’est plus disponible ou n’existe pas.",
                    },
                    { type: "text", label: "Back label", attribute: "back-label", defaultValue: "Retour aux annonces" },
                ],
            },
            {
                kind: "self",
                label: "Appearance",
                settings: [
                    {
                        type: "color",
                        label: "Buy button text",
                        attribute: "button-text-color",
                        defaultValue: "var(--ulvia-primary-foreground)",
                    },
                    {
                        type: "color",
                        label: "Buy button background",
                        attribute: "button-background-color",
                        defaultValue: "var(--ulvia-primary-base)",
                    },
                    {
                        type: "color",
                        label: "Buy button border",
                        attribute: "button-border-color",
                        defaultValue: "var(--ulvia-primary-base)",
                    },
                    {
                        type: "color",
                        label: "Buy button focus",
                        attribute: "button-accent-color",
                        defaultValue: "var(--ulvia-primary-contrasted)",
                    },
                ],
            },
            {
                kind: "self",
                label: "Links and data",
                settings: [
                    { type: "text", label: "Commerce source", attribute: "source-id", defaultValue: "commerce" },
                    { type: "text", label: "Source prefix", attribute: "source-prefix", defaultValue: "/.cms/sources" },
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "fr-FR" },
                    {
                        type: "segmented",
                        label: "Main image fit",
                        attribute: "image-fit",
                        defaultValue: "contain",
                        options: [
                            { label: "Contain", value: "contain" },
                            { label: "Cover", value: "cover" },
                            { label: "Fill", value: "fill" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Buy URL pattern",
                        attribute: "buy-url",
                        defaultValue: "/checkout?offerId={id}",
                    },
                    {
                        type: "text",
                        label: "Negotiation URL pattern",
                        attribute: "negotiate-url",
                        defaultValue: "/make-offer?slug={slug}",
                    },
                ],
            },
        ];
    }
}
registerEditor({ editor: PublicOfferEditor });
