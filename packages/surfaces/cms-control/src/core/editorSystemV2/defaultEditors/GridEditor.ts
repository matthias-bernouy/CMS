import { Editor, type ContentSlot, type SettingOption, type SettingSection } from "@bernouy/cms-content/editor";

const spacingOptions: SettingOption[] = [
    { label: "None", value: "none" },
    { label: "Extra small", value: "xs" },
    { label: "Small", value: "sm" },
    { label: "Medium", value: "md" },
    { label: "Large", value: "lg" },
    { label: "Extra large", value: "xl" },
];

const gridGapOptions: SettingOption[] = [
    ...spacingOptions,
    { label: "Custom", value: "custom" },
];

const minWidthOptions: SettingOption[] = [
    { label: "Extra small", value: "xs" },
    { label: "Small", value: "sm" },
    { label: "Medium", value: "md" },
    { label: "Large", value: "lg" },
    { label: "Extra large", value: "xl" },
];

const maxWidthOptions: SettingOption[] = [
    { label: "None", value: "none" },
    { label: "Extra small", value: "xs" },
    { label: "Small", value: "sm" },
    { label: "Medium", value: "md" },
    { label: "Large", value: "lg" },
    { label: "Extra large", value: "xl" },
];

const itemAlignmentOptions: SettingOption[] = [
    { label: "Stretch", value: "stretch" },
    { label: "Top", value: "start" },
    { label: "Center", value: "center" },
    { label: "Bottom", value: "end" },
];

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
                        label: "Minimum item width",
                        attribute: "min",
                        defaultValue: "md",
                        options: minWidthOptions,
                    },
                    {
                        type: "select",
                        label: "Maximum item width",
                        attribute: "max",
                        defaultValue: "none",
                        options: maxWidthOptions,
                        attributesOnValue: [
                            { value: "none", attributes: { max: null } },
                        ],
                    },
                    {
                        type: "select",
                        label: "Gap",
                        attribute: "gap",
                        defaultValue: "md",
                        options: gridGapOptions,
                        attributesOnValue: [
                            {
                                value: ["none", "xs", "sm", "md", "lg", "xl"],
                                attributes: { "column-gap": null, "row-gap": null },
                            },
                        ],
                    },
                    {
                        type: "select",
                        label: "Column gap",
                        attribute: "column-gap",
                        defaultValue: "md",
                        options: spacingOptions,
                        visibleWhen: { attribute: "gap", equals: "custom" },
                    },
                    {
                        type: "select",
                        label: "Row gap",
                        attribute: "row-gap",
                        defaultValue: "md",
                        options: spacingOptions,
                        visibleWhen: { attribute: "gap", equals: "custom" },
                    },
                    {
                        type: "select",
                        label: "Item align",
                        attribute: "item-align",
                        defaultValue: "stretch",
                        options: itemAlignmentOptions,
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
                        { label: "4 columns", value: "span 4" },
                        { label: "Full row", value: "1 / -1" },
                    ],
                    attributesOnValue: [
                        { value: "auto", attributes: { "grid-column": null } },
                    ],
                },
            ],
        };

        for (const child of this.getChildren()) {
            child.addSettings(gridItemSettings);
        }
    }

}
