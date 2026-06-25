import { Editor, type SettingOption, type SettingSection } from "@bernouy/cms-content/editor";

const shapeOptions: SettingOption[] = [
    { label: "Text", value: "text" },
    { label: "Rectangle", value: "rect" },
    { label: "Circle", value: "circle" },
];

export class SkeletonEditor extends Editor {

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Skeleton",
                settings: [
                    {
                        type: "segmented",
                        label: "Shape",
                        attribute: "shape",
                        defaultValue: "text",
                        options: shapeOptions,
                    },
                    {
                        type: "text",
                        label: "Width",
                        attribute: "width",
                        defaultValue: "100%",
                    },
                    {
                        type: "text",
                        label: "Height",
                        attribute: "height",
                    },
                ],
            },
        ];
    }

}
