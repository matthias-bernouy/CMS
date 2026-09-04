import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { BASIC_COLOR_SCHEME_OPTIONS } from "./internals/colorSchemes";

const option = (label: string, value: string) => ({ label, value });

export class BasicMenuEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Opening",
                settings: [
                    {
                        type: "select",
                        label: "Presentation",
                        attribute: "presentation",
                        defaultValue: "curtain",
                        options: [option("Curtain", "curtain"), option("Drawer", "drawer"), option("Panel", "panel")],
                    },
                    {
                        type: "segmented",
                        label: "Motion",
                        attribute: "motion",
                        defaultValue: "smooth",
                        options: [option("Smooth", "smooth"), option("Snappy", "snappy"), option("None", "none")],
                    },
                    {
                        type: "segmented",
                        label: "Backdrop",
                        attribute: "backdrop",
                        defaultValue: "dim",
                        options: [option("Dim", "dim"), option("Blur", "blur"), option("None", "none")],
                    },
                ],
            },
            {
                kind: "self",
                label: "Interior",
                settings: [
                    {
                        type: "segmented",
                        label: "Layout",
                        attribute: "layout",
                        defaultValue: "split",
                        options: [option("Split", "split"), option("Links", "links")],
                    },
                    {
                        type: "segmented",
                        label: "Media",
                        attribute: "media",
                        defaultValue: "show",
                        options: [option("Show", "show"), option("Hide", "hide")],
                    },
                    {
                        type: "select",
                        label: "Tone",
                        attribute: "tone",
                        defaultValue: "neutral",
                        options: BASIC_COLOR_SCHEME_OPTIONS,
                    },
                ],
            },
            {
                kind: "self",
                label: "Behavior",
                settings: [
                    {
                        type: "segmented",
                        label: "Close after navigation",
                        attribute: "close-on-navigation",
                        defaultValue: "on",
                        options: [option("On", "on"), option("Off", "off")],
                    },
                ],
            },
            {
                kind: "self",
                label: "Accessibility",
                settings: [
                    { type: "text", label: "Menu ID", attribute: "id", defaultValue: "site-menu" },
                    { type: "text", label: "Close label", attribute: "close-label", defaultValue: "Close" },
                    {
                        type: "text",
                        label: "Navigation label",
                        attribute: "navigation-label",
                        defaultValue: "Menu navigation",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Trigger",
                slot: "trigger",
                accepts: [
                    { kind: "component", tag: "basic-button" },
                    { kind: "component", tag: "button" },
                ],
                min: 1,
                max: 1,
            },
            { label: "Brand", slot: "brand", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Eyebrow", slot: "eyebrow", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Navigation", slot: "navigation", accepts: [{ kind: "component", tag: "a" }], min: 1, max: 8 },
            { label: "Secondary links", slot: "secondary", accepts: [{ kind: "component", tag: "a" }], max: 4 },
            { label: "Image", slot: "media", accepts: [{ kind: "component", tag: "img" }], max: 1 },
            { label: "Details", slot: "details", accepts: [{ kind: "any-component" }], max: 3 },
            { label: "Footer links", slot: "footer", accepts: [{ kind: "component", tag: "a" }], max: 4 },
        ];
    }
}

registerEditor({ editor: BasicMenuEditor });
