import { Editor, registerEditor, type ColorSetting, type SettingSection } from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({ type: "color", label, attribute });

export class CommerceAccountSalesEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Detail button", attribute: "detail-label", defaultValue: "Voir la vente" },
                    { type: "page-link", label: "Sale detail page", attribute: "detail-url" },
                    { type: "text", label: "Date prefix", attribute: "date-prefix", defaultValue: "Vendue le" },
                    {
                        type: "text",
                        label: "Empty title",
                        attribute: "empty-title",
                        defaultValue: "Aucune vente pour le moment",
                    },
                    {
                        type: "textarea",
                        label: "Empty message",
                        attribute: "empty-message",
                        defaultValue: "Les commandes de vos acheteurs apparaîtront ici.",
                    },
                    {
                        type: "textarea",
                        label: "Error message",
                        attribute: "error-message",
                        defaultValue: "Réessayez dans quelques instants.",
                    },
                    {
                        type: "text",
                        label: "Status filter accessible label",
                        attribute: "status-label",
                        defaultValue: "Filtrer les ventes par statut",
                    },
                    { type: "text", label: "Previous page", attribute: "previous-label", defaultValue: "Précédent" },
                    { type: "text", label: "Next page", attribute: "next-label", defaultValue: "Suivant" },
                    {
                        type: "text",
                        label: "Pagination summary",
                        attribute: "summary-template",
                        defaultValue: "Page {page} sur {pages}",
                    },
                ],
            },
            {
                kind: "self",
                label: "Sale status labels",
                settings: [
                    {
                        type: "text",
                        label: "Awaiting quote",
                        attribute: "label-awaiting_quote",
                        defaultValue: "Livraison à finaliser",
                    },
                    {
                        type: "text",
                        label: "Awaiting payment",
                        attribute: "label-awaiting_payment",
                        defaultValue: "Paiement en attente",
                    },
                    { type: "text", label: "Active", attribute: "label-active", defaultValue: "À expédier" },
                    { type: "text", label: "Completed", attribute: "label-completed", defaultValue: "Terminée" },
                    {
                        type: "text",
                        label: "Cancellation pending",
                        attribute: "label-cancellation_pending",
                        defaultValue: "Annulation en cours",
                    },
                    { type: "text", label: "Cancelled", attribute: "label-cancelled", defaultValue: "Annulée" },
                    { type: "text", label: "Expired", attribute: "label-expired", defaultValue: "Expirée" },
                ],
            },
            {
                kind: "self",
                label: "Filter labels",
                settings: [
                    { type: "text", label: "All", attribute: "filter-label-all", defaultValue: "Toutes" },
                    {
                        type: "text",
                        label: "Awaiting quote",
                        attribute: "filter-label-awaiting_quote",
                        defaultValue: "Livraison à finaliser",
                    },
                    {
                        type: "text",
                        label: "Awaiting payment",
                        attribute: "filter-label-awaiting_payment",
                        defaultValue: "Paiement en attente",
                    },
                    { type: "text", label: "Active", attribute: "filter-label-active", defaultValue: "À expédier" },
                    {
                        type: "text",
                        label: "Completed",
                        attribute: "filter-label-completed",
                        defaultValue: "Terminées",
                    },
                    {
                        type: "text",
                        label: "Cancellation pending",
                        attribute: "filter-label-cancellation_pending",
                        defaultValue: "Annulation en cours",
                    },
                    { type: "text", label: "Cancelled", attribute: "filter-label-cancelled", defaultValue: "Annulées" },
                    { type: "text", label: "Expired", attribute: "filter-label-expired", defaultValue: "Expirées" },
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
                    { type: "text", label: "Page size", attribute: "page-size", defaultValue: "10" },
                    {
                        type: "select",
                        label: "Card appearance",
                        attribute: "card-appearance",
                        defaultValue: "outlined",
                        options: ["plain", "outlined", "elevated"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Button appearance",
                        attribute: "button-appearance",
                        defaultValue: "outlined",
                        options: ["filled", "outlined", "ghost"].map((value) => ({ label: value, value })),
                    },
                ],
            },
            {
                kind: "self",
                label: "Data",
                settings: [
                    { type: "text", label: "Commerce source", attribute: "source-id", defaultValue: "commerce" },
                    { type: "text", label: "Source prefix", attribute: "source-prefix", defaultValue: "/.cms/sources" },
                    { type: "text", label: "Sales endpoint", attribute: "sales-endpoint", defaultValue: "mySales" },
                    {
                        type: "text",
                        label: "Detail identifier parameter",
                        attribute: "detail-param",
                        defaultValue: "orderId",
                    },
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "fr-FR" },
                    {
                        type: "segmented",
                        label: "Synchronize URL",
                        attribute: "sync-url",
                        defaultValue: "true",
                        options: [
                            { label: "Yes", value: "true" },
                            { label: "No", value: "false" },
                        ],
                    },
                    { type: "text", label: "Status URL parameter", attribute: "status-param", defaultValue: "status" },
                    { type: "text", label: "Page URL parameter", attribute: "page-param", defaultValue: "page" },
                ],
            },
            {
                kind: "self",
                label: "Colors",
                settings: [
                    color("Text", "text-color"),
                    color("Muted text", "muted-text-color"),
                    color("Card text", "card-text-color"),
                    color("Card background", "card-background-color"),
                    color("Card border", "card-border-color"),
                    color("Button text", "button-text-color"),
                    color("Button background", "button-background-color"),
                    color("Button border", "button-border-color"),
                    color("Button focus", "button-accent-color"),
                    color("Field text", "field-text-color"),
                    color("Field background", "field-background-color"),
                    color("Field border", "field-border-color"),
                    color("Field focus", "field-accent-color"),
                    color("Status text", "status-text-color"),
                    color("Status background", "status-background-color"),
                    color("Success status", "success-color"),
                    color("Danger status", "danger-color"),
                ],
            },
        ];
    }
}

registerEditor({ editor: CommerceAccountSalesEditor });
