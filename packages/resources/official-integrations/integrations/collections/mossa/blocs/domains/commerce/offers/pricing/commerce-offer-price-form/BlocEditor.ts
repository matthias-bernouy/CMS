import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class CommerceOfferPriceFormEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Title", attribute: "title", defaultValue: "Set my price" },
                    {
                        type: "textarea",
                        label: "Description",
                        attribute: "description",
                        defaultValue: "Choose a selling price within the proposed range.",
                    },
                    { type: "text", label: "Offer label", attribute: "offer-label", defaultValue: "Offer" },
                    {
                        type: "text",
                        label: "Range label",
                        attribute: "range-label",
                        defaultValue: "Proposed price range",
                    },
                    {
                        type: "textarea",
                        label: "Range message",
                        attribute: "range-message",
                        defaultValue: "Your price must be within this range.",
                    },
                    { type: "text", label: "Input label", attribute: "input-label", defaultValue: "Your price" },
                    {
                        type: "text",
                        label: "Input hint",
                        attribute: "input-hint",
                        defaultValue: "Amount in the offer currency",
                    },
                    {
                        type: "text",
                        label: "Submit label",
                        attribute: "submit-label",
                        defaultValue: "Submit my price",
                    },
                    {
                        type: "text",
                        label: "Submitting label",
                        attribute: "submitting-label",
                        defaultValue: "Submitting…",
                    },
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
                        defaultValue: "Activate your seller account",
                    },
                    {
                        type: "textarea",
                        label: "Activation copy",
                        attribute: "activation-copy",
                        defaultValue:
                            "This information is required to publish your offer and receive future sale proceeds. No bank account is requested here.",
                    },
                    {
                        type: "text",
                        label: "Terms update title",
                        attribute: "terms-update-title",
                        defaultValue: "Accept the new seller terms",
                    },
                    {
                        type: "textarea",
                        label: "Terms update copy",
                        attribute: "terms-update-copy",
                        defaultValue: "Review and accept the current seller terms to submit your price.",
                    },
                    {
                        type: "textarea",
                        label: "Profile summary",
                        attribute: "profile-summary",
                        defaultValue:
                            "Only missing information is requested here. Existing values come from your profile.",
                    },
                    {
                        type: "text",
                        label: "First name label",
                        attribute: "first-name-label",
                        defaultValue: "First name",
                    },
                    { type: "text", label: "Last name label", attribute: "last-name-label", defaultValue: "Name" },
                    {
                        type: "text",
                        label: "Birth date label",
                        attribute: "birth-date-label",
                        defaultValue: "Birth date",
                    },
                    {
                        type: "text",
                        label: "Invalid birth date",
                        attribute: "birth-date-invalid-message",
                        defaultValue: "Enter a date in DD/MM/YYYY format.",
                    },
                    { type: "text", label: "Email label", attribute: "email-label", defaultValue: "Email address" },
                    { type: "text", label: "Phone label", attribute: "phone-label", defaultValue: "Phone" },
                    { type: "text", label: "Address label", attribute: "address-label", defaultValue: "Address" },
                    {
                        type: "text",
                        label: "Postal code label",
                        attribute: "postal-code-label",
                        defaultValue: "Postal code",
                    },
                    { type: "text", label: "City label", attribute: "city-label", defaultValue: "City" },
                    { type: "text", label: "Country label", attribute: "country-label", defaultValue: "Country" },
                    {
                        type: "text",
                        label: "Consent prefix",
                        attribute: "consent-prefix",
                        defaultValue: "I accept the",
                    },
                    {
                        type: "text",
                        label: "Seller terms label",
                        attribute: "seller-terms-label",
                        defaultValue: "platform seller terms",
                    },
                    {
                        type: "text",
                        label: "Stripe consent prefix",
                        attribute: "stripe-consent-prefix",
                        defaultValue: "and the",
                    },
                    {
                        type: "text",
                        label: "Stripe terms label",
                        attribute: "stripe-terms-label",
                        defaultValue: "payment service account agreement",
                    },
                    {
                        type: "textarea",
                        label: "Privacy notice",
                        attribute: "privacy-notice",
                        defaultValue:
                            "The information provided is processed to activate your seller account and secure payments.",
                    },
                    {
                        type: "text",
                        label: "Privacy link label",
                        attribute: "privacy-link-label",
                        defaultValue: "Read the privacy notice",
                    },
                    {
                        type: "textarea",
                        label: "Required profile fields",
                        attribute: "field-required-message",
                        defaultValue: "Complete all required fields to continue.",
                    },
                    {
                        type: "textarea",
                        label: "Invalid profile",
                        attribute: "profile-error-message",
                        defaultValue: "Check your profile information.",
                    },
                    {
                        type: "textarea",
                        label: "Required first-enrollment consent",
                        attribute: "first-enrollment-consent-required-message",
                        defaultValue: "Accept the platform seller terms and payment service agreement to continue.",
                    },
                    {
                        type: "textarea",
                        label: "Required seller-terms consent",
                        attribute: "seller-terms-consent-required-message",
                        defaultValue: "Accept the platform seller terms to continue.",
                    },
                ],
            },
            {
                kind: "self",
                label: "States",
                settings: [
                    {
                        type: "text",
                        label: "Success title",
                        attribute: "success-title",
                        defaultValue: "Price submitted",
                    },
                    {
                        type: "textarea",
                        label: "Success message",
                        attribute: "success-message",
                        defaultValue: "Your proposal was submitted and will now be reviewed.",
                    },
                    {
                        type: "text",
                        label: "Success link label",
                        attribute: "success-label",
                        defaultValue: "Back to my offers",
                    },
                    {
                        type: "text",
                        label: "Unavailable title",
                        attribute: "unavailable-title",
                        defaultValue: "This action is unavailable",
                    },
                    {
                        type: "textarea",
                        label: "Unavailable message",
                        attribute: "unavailable-message",
                        defaultValue: "This offer no longer requires a price proposal.",
                    },
                    {
                        type: "text",
                        label: "Technical error title",
                        attribute: "technical-title",
                        defaultValue: "Price could not be loaded",
                    },
                    {
                        type: "textarea",
                        label: "Technical error message",
                        attribute: "technical-message",
                        defaultValue: "This offer cannot be loaded right now. Try again shortly.",
                    },
                    {
                        type: "text",
                        label: "Technical error retry",
                        attribute: "technical-retry-label",
                        defaultValue: "Try again",
                    },
                    {
                        type: "text",
                        label: "Back label",
                        attribute: "back-label",
                        defaultValue: "Back to my offers",
                    },
                    {
                        type: "textarea",
                        label: "Submission error",
                        attribute: "submit-error-message",
                        defaultValue: "Your price cannot be submitted right now. Check your information and try again.",
                    },
                    {
                        type: "text",
                        label: "Required price",
                        attribute: "required-message",
                        defaultValue: "Enter a price.",
                    },
                    {
                        type: "text",
                        label: "Invalid price",
                        attribute: "invalid-message",
                        defaultValue: "Enter a valid amount.",
                    },
                    {
                        type: "text",
                        label: "Whole-unit price required",
                        attribute: "whole-unit-message",
                        defaultValue: "Enter a whole-unit price.",
                    },
                    { type: "textarea", label: "Out-of-range price", attribute: "range-error-message" },
                ],
            },
            {
                kind: "self",
                label: "Data",
                settings: [
                    { type: "text", label: "Offer URL parameter", attribute: "offer-param", defaultValue: "id" },
                    { type: "text", label: "Fixed offer ID", attribute: "offer-id" },
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
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "en-US" },
                ],
            },
        ];
    }
}

registerEditor({ editor: CommerceOfferPriceFormEditor });
