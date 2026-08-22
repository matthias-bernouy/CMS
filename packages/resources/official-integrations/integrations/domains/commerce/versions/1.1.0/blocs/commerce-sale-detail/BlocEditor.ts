import {
    Editor,
    registerEditor,
    type ColorSetting,
    type ContentSlot,
    type SettingSection,
} from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({ type: "color", label, attribute });

export class CommerceSaleDetailEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Eyebrow", attribute: "eyebrow", defaultValue: "VENTE" },
                    { type: "text", label: "Date prefix", attribute: "date-prefix", defaultValue: "Vendue le" },
                    {
                        type: "text",
                        label: "Articles title",
                        attribute: "articles-title",
                        defaultValue: "Articles vendus",
                    },
                    { type: "text", label: "Summary title", attribute: "summary-title", defaultValue: "Récapitulatif" },
                    {
                        type: "text",
                        label: "Sale price label",
                        attribute: "subtotal-label",
                        defaultValue: "Prix de vente",
                    },
                    {
                        type: "text",
                        label: "Commission label",
                        attribute: "commission-label",
                        defaultValue: "Commission Courtside",
                    },
                    { type: "text", label: "Shipping label", attribute: "shipping-label", defaultValue: "Livraison" },
                    {
                        type: "text",
                        label: "Platform shipping label",
                        attribute: "platform-shipping-label",
                        defaultValue: "Prise en charge par Courtside",
                    },
                    {
                        type: "text",
                        label: "Net proceeds label",
                        attribute: "total-label",
                        defaultValue: "Montant net à recevoir",
                    },
                    { type: "text", label: "Quantity label", attribute: "quantity-label", defaultValue: "Quantité" },
                    {
                        type: "text",
                        label: "Fallback article label",
                        attribute: "fallback-article-label",
                        defaultValue: "Article",
                    },
                    { type: "text", label: "Back label", attribute: "back-label", defaultValue: "Retour aux ventes" },
                    { type: "page-link", label: "Back page", attribute: "back-url" },
                    { type: "text", label: "Error title", attribute: "error-title", defaultValue: "Vente introuvable" },
                    {
                        type: "textarea",
                        label: "Error message",
                        attribute: "error-message",
                        defaultValue: "Impossible de charger cette vente.",
                    },
                ],
            },
            {
                kind: "self",
                label: "Status labels",
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
                    {
                        type: "text",
                        label: "Seller handoff declared",
                        attribute: "label-seller_handoff_declared",
                        defaultValue: "Dépôt déclaré",
                    },
                    {
                        type: "text",
                        label: "Carrier accepted",
                        attribute: "label-carrier_accepted",
                        defaultValue: "Pris en charge",
                    },
                    { type: "text", label: "In transit", attribute: "label-in_transit", defaultValue: "En transit" },
                    {
                        type: "text",
                        label: "Available for pickup",
                        attribute: "label-available_for_pickup",
                        defaultValue: "Disponible au point relais",
                    },
                    {
                        type: "text",
                        label: "Delivered",
                        attribute: "label-collected_by_recipient",
                        defaultValue: "Livrée",
                    },
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
                label: "Layout",
                settings: [
                    {
                        type: "select",
                        label: "Card appearance",
                        attribute: "card-appearance",
                        defaultValue: "outlined",
                        options: ["plain", "outlined", "elevated"].map((value) => ({ label: value, value })),
                    },
                ],
            },
            {
                kind: "self",
                label: "Data",
                settings: [
                    { type: "text", label: "Commerce source", attribute: "source-id", defaultValue: "commerce" },
                    { type: "text", label: "Source prefix", attribute: "source-prefix", defaultValue: "/.cms/sources" },
                    { type: "text", label: "Sale endpoint", attribute: "sale-endpoint", defaultValue: "mySale" },
                    {
                        type: "text",
                        label: "Endpoint identifier parameter",
                        attribute: "sale-endpoint-param",
                        defaultValue: "id",
                    },
                    {
                        type: "text",
                        label: "Page identifier parameter",
                        attribute: "order-param",
                        defaultValue: "orderId",
                    },
                    { type: "text", label: "Fixed sale identifier", attribute: "sale-id" },
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "fr-FR" },
                ],
            },
            {
                kind: "self",
                label: "Colors",
                settings: [
                    color("Text", "text-color"),
                    color("Muted text", "muted-text-color"),
                    color("Accent", "accent-color"),
                    color("Separators", "border-color"),
                    color("Card text", "card-text-color"),
                    color("Card background", "card-background-color"),
                    color("Card border", "card-border-color"),
                    color("Button text", "button-text-color"),
                    color("Button background", "button-background-color"),
                    color("Button border", "button-border-color"),
                    color("Button focus", "button-accent-color"),
                    color("Status text", "status-text-color"),
                    color("Status background", "status-background-color"),
                    color("Success status", "success-color"),
                    color("Danger status", "danger-color"),
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Fulfillment", slot: "fulfillment", max: 1, accepts: [{ kind: "any-component" }] }];
    }
}

registerEditor({ editor: CommerceSaleDetailEditor });
