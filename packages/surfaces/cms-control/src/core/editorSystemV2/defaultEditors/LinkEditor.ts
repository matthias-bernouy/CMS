import { Editor, type SettingSection, type TextCapability } from "@bernouy/cms-content/editor";

export class LinkEditor extends Editor {

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Link",
                settings: [
                    {
                        type: "page-link",
                        label: "Target",
                        attribute: "href",
                    },
                    {
                        type: "select",
                        label: "Open in",
                        attribute: "target",
                        defaultValue: "_self",
                        options: [
                            { label: "Same tab", value: "_self" },
                            { label: "New tab", value: "_blank" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Relationship",
                        attribute: "rel",
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
            underline: true,
            dynamic: true,
        };
    }

}
