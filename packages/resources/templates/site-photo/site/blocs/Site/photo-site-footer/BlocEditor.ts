import { Editor, type ContentSlot, type Setting, type SettingSection } from "@bernouy/cms-content/editor";

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
                label: "Content",
                settings: [
                    text("Description", "description", "Studio photographique indépendant"),
                    text("Location", "location", "Brest, Bretagne"),
                    text("Copyright", "copyright", "© 2026 Stillroom"),
                    text("Main navigation label", "main-navigation-label", "Navigation du pied de page"),
                    text("Legal navigation label", "legal-navigation-label", "Informations légales"),
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            anchorSlot("Brand", "brand", 1),
            anchorSlot("Main navigation", "main-navigation"),
            anchorSlot("Legal navigation", "legal-navigation"),
        ];
    }
}

function anchorSlot(label: string, slot: string, max?: number): ContentSlot {
    return { label, slot, max, accepts: [{ kind: "component", tag: "a" }] };
}
