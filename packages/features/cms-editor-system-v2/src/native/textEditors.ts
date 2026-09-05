import { Editor, type SettingSection, type TextCapability } from "@bernouy/cms-content/editor";

const RICH_TEXT_CAPABILITY: TextCapability = {
    format: "richtext",
    bold: true,
    italic: true,
    code: true,
    link: true,
    dynamic: true,
};

export class NativeRichTextEditor extends Editor {
    protected override textCapability(): TextCapability {
        return RICH_TEXT_CAPABILITY;
    }
}

export class NativeAnchorEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Link",
                settings: [
                    {
                        type: "page-link",
                        label: "Destination",
                        attribute: "href",
                        required: true,
                        allowPage: true,
                        allowExternal: true,
                        allowMedia: true,
                    },
                    {
                        type: "select",
                        label: "Open in",
                        attribute: "target",
                        defaultValue: "",
                        options: [
                            { label: "Same tab", value: "" },
                            { label: "New tab", value: "_blank" },
                        ],
                        attributesOnValue: [
                            { value: "", attributes: { rel: null } },
                            { value: "_blank", attributes: { rel: "noopener noreferrer" } },
                        ],
                    },
                    {
                        type: "select",
                        label: "Search engines",
                        attribute: "rel",
                        defaultValue: "",
                        visibleWhen: { attribute: "target", equals: "" },
                        options: seoRelationshipOptions(""),
                    },
                    {
                        type: "select",
                        label: "Search engines",
                        attribute: "rel",
                        defaultValue: "noopener noreferrer",
                        visibleWhen: { attribute: "target", equals: "_blank" },
                        options: seoRelationshipOptions("noopener noreferrer"),
                    },
                ],
            },
        ];
    }

    protected override textCapability(): TextCapability {
        return {
            format: "richtext",
            bold: true,
            italic: true,
            code: true,
            dynamic: true,
        };
    }
}

function seoRelationshipOptions(required: string): Array<{ label: string; value: string }> {
    const value = (relationship: string) => [required, relationship].filter(Boolean).join(" ");
    return [
        { label: "Follow", value: value("") },
        { label: "No follow", value: value("nofollow") },
        { label: "Sponsored", value: value("sponsored") },
        { label: "User-generated", value: value("ugc") },
    ];
}

export class NativeButtonEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Button",
                settings: [
                    {
                        type: "segmented",
                        label: "Type",
                        attribute: "type",
                        defaultValue: "button",
                        options: [
                            { label: "Button", value: "button" },
                            { label: "Submit", value: "submit" },
                        ],
                    },
                    { type: "toggle", label: "Disabled", attribute: "disabled", defaultValue: false },
                ],
            },
        ];
    }

    protected override textCapability(): TextCapability {
        return { format: "text", dynamic: true };
    }
}
