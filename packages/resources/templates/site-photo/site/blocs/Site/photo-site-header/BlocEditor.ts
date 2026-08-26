import { Editor, type ContentSlot, type Setting, type SettingSection } from "@bernouy/cms-content/editor";

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
                label: "Accessibility",
                settings: [
                    text("Main navigation", "navigation-label", "Navigation principale"),
                    text("Menu", "menu-label", "Menu"),
                    text("Mobile navigation", "menu-navigation-label", "Navigation mobile"),
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            anchorSlot("Skip link", "skip", 1),
            anchorSlot("Brand", "brand", 1),
            anchorSlot("Desktop navigation", "navigation"),
            anchorSlot("Mobile navigation", "mobile-navigation"),
        ];
    }
}

function anchorSlot(label: string, slot: string, max?: number): ContentSlot {
    return { label, slot, max, accepts: [{ kind: "component", tag: "a" }] };
}
