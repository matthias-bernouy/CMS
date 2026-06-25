import { Editor, type ContentSlot, type SettingOption, type SettingSection } from "@bernouy/cms-content/editor";

const containerSizeOptions: SettingOption[] = [
    { label: "Extra small", value: "xs" },
    { label: "Small", value: "sm" },
    { label: "Medium", value: "md" },
    { label: "Large", value: "lg" },
    { label: "Extra large", value: "xl" },
    { label: "Full width", value: "full" },
];

const alignmentOptions: SettingOption[] = [
    { label: "Start", value: "start" },
    { label: "Center", value: "center" },
    { label: "End", value: "end" },
];

const verticalAlignmentOptions: SettingOption[] = [
    { label: "Top", value: "start" },
    { label: "Center", value: "center" },
    { label: "Bottom", value: "end" },
];

const spacingOptions: SettingOption[] = [
    { label: "None", value: "none" },
    { label: "Small", value: "sm" },
    { label: "Medium", value: "md" },
    { label: "Large", value: "lg" },
    { label: "Extra large", value: "xl" },
];

export class ContainerEditor extends Editor {

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Content",
                accepts: [{ kind: "any-component" }],
            },
        ];
    }

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Container",
                settings: [
                    {
                        type: "select",
                        label: "Size",
                        attribute: "size",
                        defaultValue: "md",
                        options: containerSizeOptions,
                        visibleWhen: { attribute: "bleed", notEquals: true },
                    },
                    {
                        type: "segmented",
                        label: "Align",
                        attribute: "align",
                        defaultValue: "center",
                        options: alignmentOptions,
                        visibleWhen: { attribute: "bleed", notEquals: true },
                    },
                    {
                        type: "select",
                        label: "Horizontal padding",
                        attribute: "padding-inline",
                        defaultValue: "md",
                        options: spacingOptions,
                    },
                    {
                        type: "select",
                        label: "Vertical padding",
                        attribute: "padding-block",
                        defaultValue: "none",
                        options: spacingOptions,
                    },
                    {
                        type: "select",
                        label: "Background",
                        attribute: "background",
                        defaultValue: "none",
                        options: [
                            { label: "None", value: "none" },
                            { label: "Surface", value: "surface" },
                            { label: "Muted", value: "muted" },
                            { label: "Accent", value: "accent" },
                            { label: "Dark", value: "dark" },
                        ],
                        attributesOnValue: [
                            { value: "none", attributes: { radius: null } },
                        ],
                    },
                    {
                        type: "select",
                        label: "Radius",
                        attribute: "radius",
                        defaultValue: "none",
                        options: [
                            { label: "None", value: "none" },
                            { label: "Small", value: "sm" },
                            { label: "Medium", value: "md" },
                            { label: "Large", value: "lg" },
                        ],
                        visibleWhen: { attribute: "background", notEquals: "none" },
                    },
                    {
                        type: "select",
                        label: "Minimum height",
                        attribute: "min-height",
                        defaultValue: "none",
                        options: [
                            { label: "None", value: "none" },
                            { label: "Half screen", value: "half" },
                            { label: "Full screen", value: "screen" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Vertical align",
                        attribute: "vertical-align",
                        defaultValue: "center",
                        options: verticalAlignmentOptions,
                        visibleWhen: { attribute: "min-height", notEquals: "none" },
                    },
                    {
                        type: "toggle",
                        label: "Bleed content",
                        attribute: "bleed",
                        defaultValue: false,
                        attributesOnValue: [
                            { value: true, attributes: { size: null, align: null } },
                        ],
                    },
                ],
            },
        ];
    }

}
