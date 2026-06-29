import { Editor, type SettingSection } from "@bernouy/cms-content/editor";

export class ImageEditor extends Editor {

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
                        allowPage: false,
                        allowExternal: false,
                        allowMedia: true,
                    },
                    {
                        type: "text",
                        label: "Alt text",
                        attribute: "alt",
                    },
                    {
                        type: "text",
                        label: "Width",
                        attribute: "width",
                    },
                    {
                        type: "text",
                        label: "Height",
                        attribute: "height",
                    },
                ],
            },
        ];
    }

}
