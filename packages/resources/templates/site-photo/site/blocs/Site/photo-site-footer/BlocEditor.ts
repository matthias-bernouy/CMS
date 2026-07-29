import { Editor, type Setting, type SettingSection } from "@bernouy/cms-content/editor";

const link = (label: string, attribute: string): Setting => ({
    type: "page-link",
    label,
    attribute,
    allowPage: true,
    allowExternal: true,
});

const text = (label: string, attribute: string, defaultValue: string): Setting => ({
    type: "text",
    label,
    attribute,
    defaultValue,
});

export class PhotoSiteFooterEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Identity",
                settings: [
                    text("Brand", "brand-label", "Stillroom"),
                    link("Brand page", "brand-href"),
                    text("Description", "description", "Studio photographique indépendant"),
                    text("Location", "location", "Brest, Bretagne"),
                    text("Copyright", "copyright", "© 2026 Stillroom"),
                ],
            },
            {
                kind: "self",
                label: "Main navigation",
                settings: [
                    text("Albums label", "albums-label", "Albums"),
                    link("Albums page", "albums-href"),
                    text("About label", "about-label", "À propos"),
                    link("About page", "about-href"),
                    text("Contact label", "contact-label", "Contact"),
                    link("Contact page", "contact-href"),
                    text("Accessible label", "main-navigation-label", "Navigation du pied de page"),
                ],
            },
            {
                kind: "self",
                label: "Legal navigation",
                settings: [
                    text("Legal notice label", "mentions-label", "Mentions légales"),
                    link("Legal notice page", "mentions-href"),
                    text("Privacy label", "privacy-label", "Confidentialité"),
                    link("Privacy page", "privacy-href"),
                    text("Cookies label", "cookies-label", "Cookies"),
                    link("Cookies page", "cookies-href"),
                    text("Accessible label", "legal-navigation-label", "Informations légales"),
                ],
            },
        ];
    }
}
