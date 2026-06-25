import {
    Editor,
    registerEditor,
    type ContentSlot,
    type EndpointPickerMethod,
    type SettingSection,
} from "@bernouy/cms-content/editor";

const submitMethods: EndpointPickerMethod[] = ["POST", "PUT", "PATCH", "DELETE"];

export class BlocEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Form",
                settings: [
                    {
                        type: "endpoint-picker",
                        label: "Submit endpoint",
                        attribute: "endpoint",
                        methodAttribute: "method",
                        defaultMethod: "POST",
                        methods: submitMethods,
                    },
                    {
                        type: "page-link",
                        label: "Redirect after submit",
                        attribute: "redirect",
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
}

registerEditor({ editor: BlocEditor });
