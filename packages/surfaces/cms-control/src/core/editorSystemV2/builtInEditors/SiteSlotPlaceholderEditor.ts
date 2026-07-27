import { Editor, type SettingSection } from "@bernouy/cms-content/editor";

const SITE_SLOT_PLACEHOLDER_TAG = "cms-site-slot-placeholder";

export class SiteSlotPlaceholderEditor extends Editor {
    protected override settings(): SettingSection[] {
        const published = this.target.hasAttribute("data-published-slot");
        return [
            {
                kind: "self",
                label: "Slot contract",
                settings: [
                    {
                        type: "text",
                        label: "Label",
                        attribute: "data-slot-label",
                        required: true,
                        placeholder: "Main content",
                    },
                    {
                        type: "text",
                        label: "Public name",
                        attribute: "data-slot-name",
                        placeholder: "Leave empty for the default slot",
                        disabled: published,
                        help: published ? "Published slot names are immutable in V1." : "Use lowercase kebab-case.",
                    },
                    {
                        type: "select",
                        label: "Accepts",
                        attribute: "data-slot-kind",
                        defaultValue: "any-component",
                        options: [
                            { label: "Any bloc", value: "any-component" },
                            { label: "Selected blocs", value: "components" },
                            { label: "Media", value: "media" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Accepted bloc tags",
                        attribute: "data-slot-tags",
                        placeholder: "basic-heading, basic-button",
                        help: "Comma-separated; used when Accepts is Selected blocs.",
                    },
                    {
                        type: "text",
                        label: "Accepted media",
                        attribute: "data-slot-media",
                        placeholder: "image, svg, video",
                        help: "image, bitmap, svg, video, audio or document.",
                    },
                    {
                        type: "text",
                        label: "Minimum items",
                        attribute: "data-slot-min",
                        placeholder: "0",
                    },
                    {
                        type: "text",
                        label: "Maximum items",
                        attribute: "data-slot-max",
                        placeholder: "No limit",
                    },
                ],
            },
        ];
    }
}

export function siteSlotPlaceholderCatalogEntry() {
    return {
        tag: SITE_SLOT_PLACEHOLDER_TAG,
        label: "Slot",
        description: "Editable Light DOM content exposed by each bloc instance.",
        icon: "add",
        category: "Builder",
        subCategory: "Projection",
        defaultContent: `<${SITE_SLOT_PLACEHOLDER_TAG} data-slot-label="New slot" data-slot-kind="any-component"></${SITE_SLOT_PLACEHOLDER_TAG}>`,
        bloc: HTMLElement,
        editor: SiteSlotPlaceholderEditor,
    };
}
