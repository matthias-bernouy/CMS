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

export class PhotoSiteHeaderEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Identity",
                settings: [text("Brand", "brand-label", "Stillroom"), link("Brand page", "brand-href")],
            },
            {
                kind: "self",
                label: "Navigation",
                settings: [
                    text("Albums label", "albums-label", "Albums"),
                    link("Albums page", "albums-href"),
                    text("About label", "about-label", "À propos"),
                    link("About page", "about-href"),
                    text("Contact label", "contact-label", "Contact"),
                    link("Contact page", "contact-href"),
                    text("Home label", "home-label", "Accueil"),
                    link("Home page", "home-href"),
                ],
            },
            {
                kind: "self",
                label: "Accessibility",
                settings: [
                    text("Skip link", "skip-label", "Aller au contenu"),
                    text("Main navigation", "navigation-label", "Navigation principale"),
                    text("Menu", "menu-label", "Menu"),
                    text("Mobile navigation", "menu-navigation-label", "Navigation mobile"),
                ],
            },
        ];
    }
}
