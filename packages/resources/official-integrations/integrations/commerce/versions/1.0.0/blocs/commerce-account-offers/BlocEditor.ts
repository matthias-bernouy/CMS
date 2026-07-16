import {
    Editor,
    registerEditor,
    type ColorSetting,
    type SettingSection,
} from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({ type: "color", label, attribute });

const visible = (label: string, attribute: string) => ({
    type: "segmented" as const,
    label,
    attribute,
    defaultValue: "true",
    options: [
        { label: "Visible", value: "true" },
        { label: "Hidden", value: "false" },
    ],
});

export class CommerceAccountOffersEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Status accessible label", attribute: "status-label", defaultValue: "Filtrer par statut" },
                    { type: "text", label: "Create label", attribute: "create-label", defaultValue: "Déposer une annonce" },
                    { type: "page-link", label: "Create page", attribute: "create-url" },
                    { type: "text", label: "Edit label", attribute: "edit-label", defaultValue: "Modifier" },
                    { type: "page-link", label: "Edit page", attribute: "edit-url" },
                    { type: "text", label: "Define price label", attribute: "price-label", defaultValue: "Définir mon prix" },
                    { type: "page-link", label: "Define price page", attribute: "price-url" },
                    { type: "text", label: "View label", attribute: "view-label", defaultValue: "Voir" },
                    { type: "page-link", label: "View page", attribute: "view-url" },
                    { type: "text", label: "Empty title", attribute: "empty-title", defaultValue: "Aucune annonce pour le moment" },
                    { type: "textarea", label: "Empty message", attribute: "empty-message", defaultValue: "Créez votre première annonce pour commencer à vendre." },
                    { type: "text", label: "Filtered empty title", attribute: "empty-filtered-title", defaultValue: "Aucune annonce avec ce statut" },
                    { type: "textarea", label: "Filtered empty message", attribute: "empty-filtered-message", defaultValue: "Essayez un autre statut pour retrouver vos annonces." },
                    { type: "textarea", label: "Error message", attribute: "error-message" },
                ],
            },
            {
                kind: "self",
                label: "Status labels",
                settings: [
                    { type: "text", label: "All", attribute: "label-all", defaultValue: "Toutes" },
                    { type: "text", label: "Draft", attribute: "label-draft", defaultValue: "Brouillons" },
                    { type: "text", label: "Action required", attribute: "label-action-required", defaultValue: "Action requise" },
                    { type: "text", label: "Under review", attribute: "label-under-review", defaultValue: "En validation" },
                    { type: "text", label: "Online", attribute: "label-online", defaultValue: "En ligne" },
                    { type: "text", label: "Paused", attribute: "label-paused", defaultValue: "En pause" },
                    { type: "text", label: "Rejected", attribute: "label-rejected", defaultValue: "Refusées" },
                    { type: "text", label: "Archived", attribute: "label-archived", defaultValue: "Archivées" },
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
                    { type: "text", label: "Page size", attribute: "page-size", defaultValue: "12" },
                    { type: "select", label: "Minimum card width", attribute: "grid-min", defaultValue: "md", options: ["xs", "sm", "md", "lg", "xl"].map(value => ({ label: value, value })) },
                    { type: "select", label: "Maximum card width", attribute: "grid-max", defaultValue: "xl", options: ["none", "sm", "md", "lg", "xl", "2xl"].map(value => ({ label: value, value })) },
                    {
                        type: "segmented", label: "Column packing", attribute: "grid-packing", defaultValue: "fit",
                        options: [{ label: "Fill", value: "fill" }, { label: "Fit content", value: "fit" }],
                    },
                    { type: "select", label: "Grid gap", attribute: "grid-gap", defaultValue: "md", options: ["none", "xs", "sm", "md", "lg", "xl"].map(value => ({ label: value, value })) },
                    {
                        type: "segmented", label: "Card height", attribute: "card-stretch", defaultValue: "true",
                        options: [{ label: "Content", value: "false" }, { label: "Stretch", value: "true" }],
                    },
                    { type: "text", label: "Image height", attribute: "image-height", defaultValue: "12rem" },
                    {
                        type: "segmented", label: "Image fit", attribute: "image-fit", defaultValue: "cover",
                        options: [
                            { label: "Cover", value: "cover" },
                            { label: "Contain", value: "contain" },
                            { label: "Fill", value: "fill" },
                        ],
                    },
                    visible("Images", "show-image"),
                    visible("Prices", "show-price"),
                    visible("Statuses", "show-status"),
                    visible("Update dates", "show-updated-at"),
                ],
            },
            {
                kind: "self",
                label: "Data",
                settings: [
                    { type: "text", label: "Commerce source", attribute: "source-id", defaultValue: "commerce" },
                    { type: "text", label: "Source prefix", attribute: "source-prefix", defaultValue: "/.cms/sources" },
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "fr-FR" },
                    { type: "segmented", label: "Synchronize URL", attribute: "sync-url", defaultValue: "true", options: [{ label: "Yes", value: "true" }, { label: "No", value: "false" }] },
                    { type: "text", label: "Status URL parameter", attribute: "status-param", defaultValue: "status" },
                    { type: "text", label: "Page URL parameter", attribute: "page-param", defaultValue: "page" },
                ],
            },
            {
                kind: "self",
                label: "Colors",
                settings: [
                    color("Text", "text-color"),
                    color("Field text", "field-text-color"),
                    color("Field background", "field-background-color"),
                    color("Field border", "field-border-color"),
                    color("Card text", "card-text-color"),
                    color("Card background", "card-background-color"),
                    color("Card border", "card-border-color"),
                    color("Button text", "button-text-color"),
                    color("Button background", "button-background-color"),
                    color("Button border", "button-border-color"),
                    color("Focus", "button-accent-color"),
                ],
            },
        ];
    }
}

registerEditor({ editor: CommerceAccountOffersEditor });
