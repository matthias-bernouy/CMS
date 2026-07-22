import { Editor, registerEditor, type ColorSetting, type SettingSection } from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({ type: "color", label, attribute });

export class CommerceOfferPriceFormEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Title", attribute: "title", defaultValue: "Définir mon prix" },
                    {
                        type: "textarea",
                        label: "Description",
                        attribute: "description",
                        defaultValue: "Choisis ton prix de vente dans la plage proposée.",
                    },
                    { type: "text", label: "Offer label", attribute: "offer-label", defaultValue: "Annonce" },
                    {
                        type: "text",
                        label: "Range label",
                        attribute: "range-label",
                        defaultValue: "Plage de prix proposée",
                    },
                    {
                        type: "textarea",
                        label: "Range message",
                        attribute: "range-message",
                        defaultValue: "Ton prix doit être compris dans cette plage.",
                    },
                    { type: "text", label: "Input label", attribute: "input-label", defaultValue: "Ton prix" },
                    { type: "text", label: "Input hint", attribute: "input-hint", defaultValue: "Montant en euros" },
                    {
                        type: "text",
                        label: "Submit label",
                        attribute: "submit-label",
                        defaultValue: "Envoyer mon prix",
                    },
                    { type: "text", label: "Submitting label", attribute: "submitting-label", defaultValue: "Envoi…" },
                ],
            },
            {
                kind: "self",
                label: "Seller activation",
                settings: [
                    {
                        type: "text",
                        label: "Activation title",
                        attribute: "activation-title",
                        defaultValue: "Active ton compte vendeur",
                    },
                    {
                        type: "textarea",
                        label: "Activation copy",
                        attribute: "activation-copy",
                        defaultValue:
                            "Ces informations sont nécessaires pour publier ton annonce et recevoir le produit de tes ventes plus tard. Aucun compte bancaire n’est demandé ici.",
                    },
                    {
                        type: "text",
                        label: "Terms update title",
                        attribute: "terms-update-title",
                        defaultValue: "Accepte les nouvelles conditions vendeur",
                    },
                    {
                        type: "textarea",
                        label: "Terms update copy",
                        attribute: "terms-update-copy",
                        defaultValue:
                            "Lis et accepte la version actuelle des conditions vendeur pour envoyer ton prix.",
                    },
                    {
                        type: "textarea",
                        label: "Profile summary",
                        attribute: "profile-summary",
                        defaultValue:
                            "Seules les informations manquantes sont demandées ici. Les autres sont reprises depuis ton profil.",
                    },
                    { type: "text", label: "First name label", attribute: "first-name-label", defaultValue: "Prénom" },
                    { type: "text", label: "Last name label", attribute: "last-name-label", defaultValue: "Nom" },
                    {
                        type: "text",
                        label: "Birth date label",
                        attribute: "birth-date-label",
                        defaultValue: "Date de naissance",
                    },
                    {
                        type: "text",
                        label: "Invalid birth date",
                        attribute: "birth-date-invalid-message",
                        defaultValue: "Indique une date au format JJ/MM/AAAA.",
                    },
                    { type: "text", label: "Email label", attribute: "email-label", defaultValue: "Adresse e-mail" },
                    { type: "text", label: "Phone label", attribute: "phone-label", defaultValue: "Téléphone" },
                    { type: "text", label: "Address label", attribute: "address-label", defaultValue: "Adresse" },
                    {
                        type: "text",
                        label: "Postal code label",
                        attribute: "postal-code-label",
                        defaultValue: "Code postal",
                    },
                    { type: "text", label: "City label", attribute: "city-label", defaultValue: "Ville" },
                    { type: "text", label: "Country label", attribute: "country-label", defaultValue: "Pays" },
                    {
                        type: "text",
                        label: "Consent prefix",
                        attribute: "consent-prefix",
                        defaultValue: "J’accepte les",
                    },
                    {
                        type: "text",
                        label: "Seller terms label",
                        attribute: "seller-terms-label",
                        defaultValue: "conditions vendeur Courtside",
                    },
                    {
                        type: "text",
                        label: "Stripe consent prefix",
                        attribute: "stripe-consent-prefix",
                        defaultValue: "et l’",
                    },
                    {
                        type: "text",
                        label: "Stripe terms label",
                        attribute: "stripe-terms-label",
                        defaultValue: "accord de compte connecté Stripe",
                    },
                    {
                        type: "textarea",
                        label: "Privacy notice",
                        attribute: "privacy-notice",
                        defaultValue:
                            "Les informations renseignées sont traitées pour activer ton compte vendeur et sécuriser les paiements.",
                    },
                    {
                        type: "text",
                        label: "Privacy link label",
                        attribute: "privacy-link-label",
                        defaultValue: "Consulter l’avis de confidentialité",
                    },
                    {
                        type: "textarea",
                        label: "Required profile fields",
                        attribute: "field-required-message",
                        defaultValue: "Complète tous les champs obligatoires pour continuer.",
                    },
                    {
                        type: "textarea",
                        label: "Invalid profile",
                        attribute: "profile-error-message",
                        defaultValue: "Vérifie les informations de ton profil.",
                    },
                    {
                        type: "textarea",
                        label: "Required first-enrollment consent",
                        attribute: "first-enrollment-consent-required-message",
                        defaultValue:
                            "Tu dois accepter les conditions vendeur Courtside et l’accord Stripe pour continuer.",
                    },
                    {
                        type: "textarea",
                        label: "Required seller-terms consent",
                        attribute: "seller-terms-consent-required-message",
                        defaultValue: "Tu dois accepter les conditions vendeur Courtside pour continuer.",
                    },
                ],
            },
            {
                kind: "self",
                label: "States",
                settings: [
                    { type: "text", label: "Success title", attribute: "success-title", defaultValue: "Prix envoyé" },
                    {
                        type: "textarea",
                        label: "Success message",
                        attribute: "success-message",
                        defaultValue: "Ta proposition a bien été transmise et va maintenant être vérifiée.",
                    },
                    {
                        type: "text",
                        label: "Success link label",
                        attribute: "success-label",
                        defaultValue: "Retour à mes annonces",
                    },
                    {
                        type: "text",
                        label: "Unavailable title",
                        attribute: "unavailable-title",
                        defaultValue: "Cette action n’est pas disponible",
                    },
                    {
                        type: "textarea",
                        label: "Unavailable message",
                        attribute: "unavailable-message",
                        defaultValue: "Cette annonce ne nécessite plus de proposition de prix.",
                    },
                    {
                        type: "text",
                        label: "Technical error title",
                        attribute: "technical-title",
                        defaultValue: "Impossible de charger le prix",
                    },
                    {
                        type: "textarea",
                        label: "Technical error message",
                        attribute: "technical-message",
                        defaultValue:
                            "Impossible de charger cette annonce pour le moment. Réessaie dans quelques instants.",
                    },
                    {
                        type: "text",
                        label: "Technical error retry",
                        attribute: "technical-retry-label",
                        defaultValue: "Réessayer",
                    },
                    {
                        type: "text",
                        label: "Back label",
                        attribute: "back-label",
                        defaultValue: "Retour à mes annonces",
                    },
                    {
                        type: "textarea",
                        label: "Submission error",
                        attribute: "submit-error-message",
                        defaultValue:
                            "Impossible d’envoyer ton prix pour le moment. Vérifie tes informations puis réessaie.",
                    },
                    {
                        type: "text",
                        label: "Required price",
                        attribute: "required-message",
                        defaultValue: "Indique un prix.",
                    },
                    {
                        type: "text",
                        label: "Invalid price",
                        attribute: "invalid-message",
                        defaultValue: "Indique un montant valide.",
                    },
                    { type: "textarea", label: "Out-of-range price", attribute: "range-error-message" },
                ],
            },
            {
                kind: "self",
                label: "Data",
                settings: [
                    { type: "text", label: "Commerce source", attribute: "source-id", defaultValue: "commerce" },
                    {
                        type: "text",
                        label: "Account source",
                        attribute: "account-source-id",
                        defaultValue: "user-account",
                    },
                    {
                        type: "text",
                        label: "Authentication source",
                        attribute: "auth-source-id",
                        defaultValue: "system-auth",
                    },
                    {
                        type: "text",
                        label: "Stripe source",
                        attribute: "stripe-source-id",
                        defaultValue: "stripe-connect",
                    },
                    { type: "text", label: "Source prefix", attribute: "source-prefix", defaultValue: "/.cms/sources" },
                    { type: "text", label: "Offer URL parameter", attribute: "offer-param", defaultValue: "id" },
                    { type: "text", label: "Fixed offer ID", attribute: "offer-id" },
                    {
                        type: "text",
                        label: "Enrollment function",
                        attribute: "enrollment-function-id",
                        defaultValue: "getSellerSaleEnrollment",
                    },
                    {
                        type: "text",
                        label: "Submission function",
                        attribute: "submit-function-id",
                        defaultValue: "submitSellerOfferPrice",
                    },
                    { type: "page-link", label: "Seller terms page", attribute: "seller-terms-url" },
                    {
                        type: "text",
                        label: "Stripe terms URL",
                        attribute: "stripe-terms-url",
                        defaultValue: "https://stripe.com/connect-account/legal",
                    },
                    {
                        type: "page-link",
                        label: "Privacy notice page (replace placeholder before production)",
                        attribute: "privacy-url",
                    },
                    { type: "page-link", label: "Success page", attribute: "success-url" },
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "fr-FR" },
                ],
            },
            {
                kind: "self",
                label: "Colors",
                settings: [
                    color("Card text", "card-text-color"),
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
                ],
            },
        ];
    }
}

registerEditor({ editor: CommerceOfferPriceFormEditor });
