import { CMS_BINDING_ATTRIBUTES, Editor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class NativeSectionEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Accessibility",
                settings: [
                    {
                        type: "text",
                        label: "Accessible label",
                        attribute: "aria-label",
                        help: "Optional accessible name for this semantic region.",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Content", accepts: [{ kind: "any-component" }] }];
    }
}

export class NativeListEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Items", min: 1, accepts: [{ kind: "component", tag: "li" }] }];
    }
}

export class NativeFormEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Submission",
                settings: [
                    {
                        type: "endpoint-picker",
                        label: "Endpoint",
                        attribute: CMS_BINDING_ATTRIBUTES.source,
                        methodAttribute: CMS_BINDING_ATTRIBUTES.sourceMethod,
                        required: true,
                        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
                    },
                    {
                        type: "page-link",
                        label: "Redirect after success",
                        attribute: CMS_BINDING_ATTRIBUTES.sourceSuccessRedirect,
                        allowPage: true,
                        allowExternal: false,
                        allowMedia: false,
                    },
                    {
                        type: "segmented",
                        label: "Reset after success",
                        attribute: CMS_BINDING_ATTRIBUTES.sourceSuccessReset,
                        defaultValue: "true",
                        options: [
                            { label: "Yes", value: "true" },
                            { label: "No", value: "false" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Autocomplete",
                        attribute: "autocomplete",
                        defaultValue: "on",
                        options: [
                            { label: "On", value: "on" },
                            { label: "Off", value: "off" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Fields", accepts: [{ kind: "any-component" }] }];
    }
}
