import {
    CMS_BINDING_ATTRIBUTES,
    Editor,
    type ContentSlot,
    type EndpointPickerMethod,
    type SettingSection,
} from "@bernouy/cms-content/editor";

const FORM_METHODS: EndpointPickerMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export class FormEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Form",
                settings: [
                    {
                        type: "endpoint-picker",
                        label: "Submit source",
                        attribute: CMS_BINDING_ATTRIBUTES.source,
                        methodAttribute: CMS_BINDING_ATTRIBUTES.sourceMethod,
                        defaultMethod: this.currentMethod(),
                        methods: FORM_METHODS,
                    },
                    {
                        type: "text",
                        label: "Publish channel",
                        attribute: CMS_BINDING_ATTRIBUTES.sourcePublish,
                        defaultValue: this.target.getAttribute(CMS_BINDING_ATTRIBUTES.sourcePublish) ?? "",
                    },
                    {
                        type: "text",
                        label: "Success redirect",
                        attribute: CMS_BINDING_ATTRIBUTES.sourceSuccessRedirect,
                        defaultValue: this.target.getAttribute(CMS_BINDING_ATTRIBUTES.sourceSuccessRedirect) ?? "",
                    },
                    {
                        type: "select",
                        label: "Reset after success",
                        attribute: CMS_BINDING_ATTRIBUTES.sourceSuccessReset,
                        defaultValue: this.target.getAttribute(CMS_BINDING_ATTRIBUTES.sourceSuccessReset) ?? "",
                        options: [
                            { label: "Default", value: "" },
                            { label: "Always", value: "true" },
                            { label: "Never", value: "false" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Fields",
                accepts: [{ kind: "any-component" }],
                min: 1,
            },
        ];
    }

    private currentMethod(): EndpointPickerMethod {
        const method = this.target.getAttribute(CMS_BINDING_ATTRIBUTES.sourceMethod)?.toUpperCase();
        return method === "GET" || method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE"
            ? method
            : "POST";
    }
}
