import { Editor, registerEditor, type ColorSetting, type SettingSection } from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({ type: "color", label, attribute });

export class CommerceNegotiationFormEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Title", attribute: "title", defaultValue: "Faire une offre" },
                    { type: "textarea", label: "Description", attribute: "copy" },
                    { type: "text", label: "Current price label", attribute: "current-label", defaultValue: "Prix actuel" },
                    { type: "text", label: "Range label", attribute: "range-label", defaultValue: "Proposition autorisée" },
                    { type: "text", label: "Amount label", attribute: "amount-label", defaultValue: "Ton prix (€)" },
                    { type: "textarea", label: "Amount hint", attribute: "amount-hint" },
                    { type: "text", label: "Message label", attribute: "message-label", defaultValue: "Message au vendeur (facultatif)" },
                    { type: "text", label: "Message placeholder", attribute: "message-placeholder" },
                    { type: "text", label: "Button label", attribute: "button-label", defaultValue: "Envoyer mon offre" },
                    { type: "textarea", label: "Success message", attribute: "success-message" },
                    { type: "textarea", label: "Existing proposal message", attribute: "existing-message", defaultValue: "Vous avez déjà fait une offre de {amount} pour cette annonce." },
                    { type: "textarea", label: "Error message", attribute: "error-message" },
                    { type: "textarea", label: "Unavailable message", attribute: "unavailable-message" },
                    { type: "textarea", label: "Own offer message", attribute: "own-offer-message", defaultValue: "Vous ne pouvez pas faire une offre sur votre propre annonce." },
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
                    { type: "select", label: "Appearance", attribute: "appearance", defaultValue: "plain", options: ["plain", "outlined", "elevated"].map(value => ({ label: value, value })) },
                    { type: "select", label: "Density", attribute: "density", defaultValue: "regular", options: ["compact", "regular", "spacious"].map(value => ({ label: value, value })) },
                ],
            },
            {
                kind: "self",
                label: "Data",
                settings: [
                    { type: "text", label: "Offer id", attribute: "offer-id" },
                    { type: "text", label: "Negotiation source", attribute: "source-id", defaultValue: "commerce-negotiation" },
                    { type: "text", label: "Source prefix", attribute: "source-prefix", defaultValue: "/.cms/sources" },
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "fr-FR" },
                ],
            },
            {
                kind: "self",
                label: "Colors",
                settings: [
                    color("Card text", "card-text-color"),
                    color("Card muted text", "card-muted-text-color"),
                    color("Card background", "card-background-color"),
                    color("Card border", "card-border-color"),
                    color("Field text", "field-text-color"),
                    color("Field background", "field-background-color"),
                    color("Field border", "field-border-color"),
                    color("Field focus", "field-accent-color"),
                    color("Button text", "button-text-color"),
                    color("Button background", "button-background-color"),
                    color("Button border", "button-border-color"),
                    color("Button focus", "button-accent-color"),
                    color("Success text", "toast-text-color"),
                    color("Success background", "toast-background-color"),
                    color("Success border", "toast-border-color"),
                    color("Error text", "toast-error-text-color"),
                    color("Error background", "toast-error-background-color"),
                    color("Error border", "toast-error-border-color"),
                    color("Skeleton", "skeleton-base-color"),
                    color("Skeleton highlight", "skeleton-highlight-color"),
                ],
            },
        ];
    }
}

registerEditor({ editor: CommerceNegotiationFormEditor });
