import { Editor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { alignmentOptions, containerSizeOptions, spacingOptions } from "./options";

export class GridEditor extends Editor {

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Items",
                min: 1,
                accepts: [{ kind: "any-component" }],
            },
        ];
    }

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Grid",
                settings: [
                    {
                        type: "select",
                        label: "Size",
                        attribute: "size",
                        defaultValue: "full",
                        options: containerSizeOptions.filter(option => option.value !== "xs"),
                    },
                    {
                        type: "select",
                        label: "Minimum item width",
                        attribute: "min",
                        defaultValue: "md",
                        options: [
                            { label: "Small", value: "sm" },
                            { label: "Medium", value: "md" },
                            { label: "Large", value: "lg" },
                            { label: "Extra large", value: "xl" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Gap",
                        attribute: "gap",
                        defaultValue: "md",
                        options: spacingOptions,
                    },
                    {
                        type: "segmented",
                        label: "Align self",
                        attribute: "align-self",
                        defaultValue: "start",
                        options: alignmentOptions,
                    },
                ],
            },
        ];
    }

    override mountEditor(): void {
        const gridItemSettings: SettingSection = {
            kind: "surcharge",
            label: "Grid item",
            settings: [
                {
                    type: "select",
                    label: "Column span",
                    attribute: "grid-column",
                    defaultValue: "auto",
                    options: [
                        { label: "Auto", value: "auto" },
                        { label: "1 column", value: "span 1" },
                        { label: "2 columns", value: "span 2" },
                        { label: "3 columns", value: "span 3" },
                        { label: "Full row", value: "1 / -1" },
                    ],
                },
            ],
        };

        for (const child of this.getChildren()) {
            child.addSettings(gridItemSettings);
        }
    }

}
