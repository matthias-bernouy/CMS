import { Editor, registerEditor, type ColorSetting, type SettingSection } from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({
    type: "color",
    label,
    attribute,
});

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
                label: "Colors",
                settings: [color("Base", "base-color"), color("Highlight", "highlight-color")],
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
