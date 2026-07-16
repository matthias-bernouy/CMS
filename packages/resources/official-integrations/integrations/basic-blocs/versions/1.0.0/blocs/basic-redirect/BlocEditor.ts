import {
    Editor,
    registerEditor,
    type SettingSection,
} from "@bernouy/cms-content/editor";

export class BasicRedirectEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [{
            kind: "self",
            label: "Redirect",
            settings: [{
                type: "page-link",
                label: "Page",
                attribute: "page",
                defaultValue: "",
                allowPage: true,
                allowExternal: false,
                allowMedia: false,
                required: true,
            }],
        }];
    }
}

registerEditor({ editor: BasicRedirectEditor });
