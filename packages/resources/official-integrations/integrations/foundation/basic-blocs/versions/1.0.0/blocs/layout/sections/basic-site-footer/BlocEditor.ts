import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { BASIC_COLOR_SCHEME_OPTIONS } from "./colorSchemes";

export class BasicSiteFooterEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "select",
                        label: "Content width",
                        attribute: "width",
                        defaultValue: "wide",
                        options: [
                            { label: "Content", value: "content" },
                            { label: "Wide", value: "wide" },
                            { label: "Full", value: "full" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Alignment",
                        attribute: "align",
                        defaultValue: "start",
                        options: [
                            { label: "Start", value: "start" },
                            { label: "Center", value: "center" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Spacing",
                        attribute: "density",
                        defaultValue: "regular",
                        options: [
                            { label: "Compact", value: "compact" },
                            { label: "Regular", value: "regular" },
                            { label: "Spacious", value: "spacious" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Style",
                settings: [
                    {
                        type: "select",
                        label: "Tone",
                        attribute: "tone",
                        defaultValue: "neutral",
                        options: BASIC_COLOR_SCHEME_OPTIONS,
                    },
                    {
                        type: "segmented",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "plain",
                        options: [
                            { label: "Plain", value: "plain" },
                            { label: "Soft", value: "soft" },
                            { label: "Filled", value: "filled" },
                            { label: "Outlined", value: "outlined" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Accessibility",
                settings: [
                    {
                        type: "text",
                        label: "Navigation label",
                        attribute: "navigation-label",
                        defaultValue: "Footer navigation",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Brand", slot: "brand", accepts: [{ kind: "any-component" }], max: 1 },
            {
                label: "Description",
                slot: "description",
                accepts: [{ kind: "component", tag: "p" }],
                max: 1,
            },
            {
                label: "Navigation",
                slot: "navigation",
                accepts: [{ kind: "component", tag: "a" }],
                min: 1,
            },
            { label: "Actions", slot: "actions", accepts: [{ kind: "any-component" }], max: 2 },
            { label: "Legal", slot: "legal", accepts: [{ kind: "any-component" }], max: 1 },
        ];
    }
}

registerEditor({ editor: BasicSiteFooterEditor });
