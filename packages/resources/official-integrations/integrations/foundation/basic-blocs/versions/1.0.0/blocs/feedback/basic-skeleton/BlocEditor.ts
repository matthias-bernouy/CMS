import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";
import { BASIC_COLOR_SCHEME_OPTIONS } from "./colorSchemes";

export class BasicSkeletonEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Shape",
                        attribute: "shape",
                        defaultValue: "rectangle",
                        options: [
                            { label: "Rectangle", value: "rectangle" },
                            { label: "Circle", value: "circle" },
                        ],
                    },
                    { type: "text", label: "Width", attribute: "width", placeholder: "100%" },
                    { type: "text", label: "Height", attribute: "height", placeholder: "1rem" },
                    { type: "text", label: "Radius", attribute: "radius", placeholder: "0.4rem" },
                ],
            },
            {
                kind: "self",
                label: "Motion",
                settings: [
                    {
                        type: "segmented",
                        label: "Animation",
                        attribute: "animation",
                        defaultValue: "wave",
                        options: [
                            { label: "Wave", value: "wave" },
                            { label: "Pulse", value: "pulse" },
                            { label: "None", value: "none" },
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
                        defaultValue: "soft",
                        options: [
                            { label: "Soft", value: "soft" },
                            { label: "Filled", value: "filled" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Accessibility",
                settings: [{ type: "text", label: "Loading label", attribute: "label" }],
            },
        ];
    }
}

registerEditor({ editor: BasicSkeletonEditor });
