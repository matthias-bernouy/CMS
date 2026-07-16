import { Editor, registerEditor, type ColorSetting, type SettingSection } from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({ type: "color", label, attribute });
const visible = (label: string, attribute: string) => ({
    type: "segmented" as const,
    label,
    attribute,
    defaultValue: "true",
    options: [{ label: "Visible", value: "true" }, { label: "Hidden", value: "false" }],
});

export class CommerceNegotiationListEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Title", attribute: "title", defaultValue: "Mes offres de prix" },
                    { type: "textarea", label: "Description", attribute: "copy" },
                    { type: "text", label: "Received tab", attribute: "received-label", defaultValue: "Offres reçues" },
                    { type: "text", label: "Sent tab", attribute: "sent-label", defaultValue: "Offres envoyées" },
                    { type: "text", label: "Status accessible label", attribute: "status-label", defaultValue: "Filtrer par statut" },
                    { type: "text", label: "Proposed price", attribute: "proposed-label", defaultValue: "Prix proposé" },
                    { type: "text", label: "Reference price", attribute: "reference-label", defaultValue: "Prix initial" },
                    { type: "text", label: "Expiration", attribute: "expiration-label", defaultValue: "Expire le {date}" },
                    { type: "text", label: "Accept", attribute: "accept-label", defaultValue: "Accepter" },
                    { type: "text", label: "Reject", attribute: "reject-label", defaultValue: "Refuser" },
                    { type: "text", label: "Withdraw", attribute: "withdraw-label", defaultValue: "Retirer" },
                    { type: "text", label: "Empty title", attribute: "empty-title" },
                    { type: "textarea", label: "Empty message", attribute: "empty-message" },
                    { type: "text", label: "Filtered empty title", attribute: "empty-filtered-title", defaultValue: "Aucune offre avec ce statut" },
                    { type: "textarea", label: "Filtered empty message", attribute: "empty-filtered-message", defaultValue: "Essaie un autre statut pour retrouver tes offres." },
                    { type: "textarea", label: "Error message", attribute: "error-message" },
                    { type: "textarea", label: "Accepted message", attribute: "success-accept-message" },
                    { type: "textarea", label: "Rejected message", attribute: "success-reject-message" },
                    { type: "textarea", label: "Withdrawn message", attribute: "success-withdraw-message" },
                ],
            },
            {
                kind: "self",
                label: "Status labels",
                settings: [
                    ...Object.entries(defaultStatusLabels).map(([value, label]) => ({
                        type: "text" as const,
                        label,
                        attribute: `label-${value}`,
                        defaultValue: label,
                    })),
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
                    { type: "select", label: "Initial view", attribute: "initial-role", defaultValue: "seller", options: [{ label: "Received", value: "seller" }, { label: "Sent", value: "buyer" }] },
                    { type: "text", label: "Page size", attribute: "page-size", defaultValue: "12" },
                    { type: "select", label: "Minimum card width", attribute: "grid-min", defaultValue: "md", options: ["xs", "sm", "md", "lg", "xl"].map(value => ({ label: value, value })) },
                    { type: "select", label: "Maximum card width", attribute: "grid-max", defaultValue: "xl", options: ["none", "sm", "md", "lg", "xl", "2xl"].map(value => ({ label: value, value })) },
                    { type: "select", label: "Grid gap", attribute: "grid-gap", defaultValue: "md", options: ["none", "xs", "sm", "md", "lg", "xl"].map(value => ({ label: value, value })) },
                    { type: "select", label: "Card appearance", attribute: "card-appearance", defaultValue: "outlined", options: ["plain", "outlined", "elevated"].map(value => ({ label: value, value })) },
                    { type: "select", label: "Card density", attribute: "card-density", defaultValue: "compact", options: ["compact", "regular", "spacious"].map(value => ({ label: value, value })) },
                    visible("Header", "show-header"),
                    visible("Received/sent tabs", "show-role-tabs"),
                    visible("Reference price", "show-reference-price"),
                    visible("Buyer message", "show-message"),
                    visible("Expiration", "show-expiration"),
                ],
            },
            {
                kind: "self",
                label: "Data",
                settings: [
                    { type: "text", label: "Negotiation source", attribute: "source-id", defaultValue: "commerce-negotiation" },
                    { type: "text", label: "Source prefix", attribute: "source-prefix", defaultValue: "/.cms/sources" },
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "fr-FR" },
                    { type: "segmented", label: "Synchronize URL", attribute: "sync-url", defaultValue: "true", options: [{ label: "Yes", value: "true" }, { label: "No", value: "false" }] },
                    { type: "text", label: "Role URL parameter", attribute: "role-param", defaultValue: "role" },
                    { type: "text", label: "Status URL parameter", attribute: "status-param", defaultValue: "status" },
                    { type: "text", label: "Page URL parameter", attribute: "page-param", defaultValue: "page" },
                ],
            },
            {
                kind: "self",
                label: "Colors",
                settings: [
                    color("Text", "text-color"),
                    color("Card text", "card-text-color"),
                    color("Card muted text", "card-muted-text-color"),
                    color("Card background", "card-background-color"),
                    color("Card border", "card-border-color"),
                    color("Filters text", "field-text-color"),
                    color("Filters background", "field-background-color"),
                    color("Filters border", "field-border-color"),
                    color("Filters accent", "field-accent-color"),
                    color("Tabs text", "role-text-color"),
                    color("Tabs background", "role-background-color"),
                    color("Tabs border", "role-border-color"),
                    color("Tabs focus", "role-accent-color"),
                    color("Selected tab background", "role-selected-background-color"),
                    color("Selected tab text", "role-selected-text-color"),
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

registerEditor({ editor: CommerceNegotiationListEditor });

const defaultStatusLabels = {
    all: "Toutes",
    pending: "En attente",
    accepted: "Acceptées",
    rejected: "Refusées",
    withdrawn: "Retirées",
    expired: "Expirées",
    superseded: "Remplacées",
    canceled: "Annulées",
};
