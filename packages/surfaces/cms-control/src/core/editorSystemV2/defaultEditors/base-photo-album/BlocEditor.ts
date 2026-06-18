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

const spacingOptions: SettingOption[] = [
    { label: "None", value: "none" },
    { label: "Extra small", value: "xs" },
    { label: "Small", value: "sm" },
    { label: "Medium", value: "md" },
    { label: "Large", value: "lg" },
    { label: "Extra large", value: "xl" },
];

export class PhotoAlbumEditor extends Editor {

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Images",
                slot: "images",
                accepts: [{ kind: "media", accept: ["image"] }],
            },
        ];
    }

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Photo album",
                settings: [
                    {
                        type: "select",
                        label: "Layout",
                        attribute: "layout",
                        defaultValue: "grid",
                        options: [
                            { label: "Grid", value: "grid" },
                            { label: "Masonry", value: "masonry" },
                            { label: "Strip", value: "strip" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Size",
                        attribute: "size",
                        defaultValue: "full",
                        options: containerSizeOptions.filter(option => option.value !== "xs"),
                    },
                    {
                        type: "select",
                        label: "Minimum image width",
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
                        type: "select",
                        label: "Ratio",
                        attribute: "ratio",
                        defaultValue: "landscape",
                        options: [
                            { label: "Square", value: "square" },
                            { label: "Landscape", value: "landscape" },
                            { label: "Wide", value: "wide" },
                            { label: "Portrait", value: "portrait" },
                            { label: "Natural", value: "natural" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Fit",
                        attribute: "fit",
                        defaultValue: "cover",
                        options: [
                            { label: "Cover", value: "cover" },
                            { label: "Contain", value: "contain" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Radius",
                        attribute: "radius",
                        defaultValue: "md",
                        options: [
                            { label: "None", value: "none" },
                            { label: "Small", value: "sm" },
                            { label: "Medium", value: "md" },
                            { label: "Large", value: "lg" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Chrome",
                        attribute: "chrome",
                        defaultValue: "framed",
                        options: [
                            { label: "None", value: "none" },
                            { label: "Framed", value: "framed" },
                        ],
                    },
                    {
                        type: "toggle",
                        label: "View legend",
                        attribute: "view-legend",
                        defaultValue: false,
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

}
