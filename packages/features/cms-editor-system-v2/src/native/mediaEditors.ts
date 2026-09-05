import { Editor, type PageLinkSetting, type SettingSection } from "@bernouy/cms-content/editor";

const IMAGE_SOURCE_SETTING: PageLinkSetting = {
    type: "page-link",
    label: "Image",
    attribute: "src",
    required: true,
    allowPage: false,
    allowExternal: false,
    allowMedia: true,
    mediaAccept: ["image"],
};

export class NativeImageEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Image",
                settings: [
                    IMAGE_SOURCE_SETTING,
                    {
                        type: "segmented",
                        label: "Purpose",
                        attribute: "role",
                        defaultValue: "",
                        options: [
                            { label: "Informative", value: "" },
                            { label: "Decorative", value: "presentation" },
                        ],
                        attributesOnValue: [
                            { value: "", attributes: { "aria-hidden": null } },
                            {
                                value: "presentation",
                                attributes: { "aria-hidden": "true", alt: "" },
                            },
                        ],
                    },
                    {
                        type: "text",
                        label: "Alternative text",
                        attribute: "alt",
                        required: true,
                        help: "Required for informative images. While decorative, this is kept as a draft.",
                    },
                    {
                        type: "select",
                        label: "Loading",
                        attribute: "loading",
                        defaultValue: "lazy",
                        options: [
                            { label: "Lazy", value: "lazy" },
                            { label: "Eager", value: "eager" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Fetch priority",
                        attribute: "fetchpriority",
                        defaultValue: "auto",
                        options: [
                            { label: "Automatic", value: "auto" },
                            { label: "High", value: "high" },
                            { label: "Low", value: "low" },
                        ],
                    },
                ],
            },
        ];
    }
}

export class NativeSvgEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "SVG",
                settings: [
                    {
                        type: "segmented",
                        label: "Purpose",
                        attribute: "role",
                        defaultValue: "img",
                        options: [
                            { label: "Informative", value: "img" },
                            { label: "Decorative", value: "" },
                        ],
                        attributesOnValue: [
                            { value: "img", attributes: { "aria-hidden": null } },
                            { value: "", attributes: { "aria-hidden": "true", "aria-label": null } },
                        ],
                    },
                    {
                        type: "text",
                        label: "Accessible label",
                        attribute: "aria-label",
                        required: true,
                        help: "Required for informative SVGs. While decorative, this is kept as a draft.",
                    },
                ],
            },
        ];
    }
}
