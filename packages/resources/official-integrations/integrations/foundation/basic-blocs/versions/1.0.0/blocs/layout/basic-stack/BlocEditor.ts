import {
    Editor,
    registerEditor,
    type ColorSetting,
    type ContentSlot,
    type SettingSection,
} from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({
    type: "color",
    label,
    attribute,
});

export class BasicStackEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Direction",
                        attribute: "direction",
                        defaultValue: "column",
                        options: [
                            { label: "Column", value: "column" },
                            { label: "Row", value: "row" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Gap",
                        attribute: "gap",
                        defaultValue: "md",
                        options: [
                            { label: "None", value: "none" },
                            { label: "XS", value: "xs" },
                            { label: "S", value: "sm" },
                            { label: "M", value: "md" },
                            { label: "L", value: "lg" },
                            { label: "XL", value: "xl" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Item alignment",
                        attribute: "align-items",
                        defaultValue: "stretch",
                        options: [
                            { label: "Start", value: "start" },
                            { label: "Center", value: "center" },
                            { label: "End", value: "end" },
                            { label: "Stretch", value: "stretch" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Content distribution",
                        attribute: "justify-content",
                        defaultValue: "start",
                        options: [
                            { label: "Start", value: "start" },
                            { label: "Center", value: "center" },
                            { label: "End", value: "end" },
                            { label: "Space between", value: "space-between" },
                            { label: "Space around", value: "space-around" },
                            { label: "Space evenly", value: "space-evenly" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Wrap items",
                        attribute: "wrap",
                        defaultValue: "false",
                        options: [
                            { label: "No", value: "false" },
                            { label: "Yes", value: "true" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Colors",
                settings: [color("Text", "text-color"), color("Background", "background-color")],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Items", accepts: [{ kind: "any-component" }] }];
    }
}

registerEditor({ editor: BasicStackEditor });
