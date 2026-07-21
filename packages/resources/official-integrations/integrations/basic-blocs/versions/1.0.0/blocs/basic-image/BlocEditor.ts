import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class BasicImageEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Image",
                settings: [
                    {
                        type: "page-link",
                        label: "Source",
                        attribute: "src",
                        defaultValue: "",
                        allowPage: false,
                        allowExternal: true,
                        allowMedia: true,
                    },
                    { type: "text", label: "Alternative text", attribute: "alt", defaultValue: "" },
                    { type: "text", label: "Width", attribute: "width" },
                    { type: "text", label: "Height", attribute: "height" },
                ],
            },
            {
                kind: "self",
                label: "Loading",
                settings: [
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
                        label: "Decoding",
                        attribute: "decoding",
                        defaultValue: "async",
                        options: [
                            { label: "Asynchronous", value: "async" },
                            { label: "Synchronous", value: "sync" },
                            { label: "Automatic", value: "auto" },
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

registerEditor({ editor: BasicImageEditor });
