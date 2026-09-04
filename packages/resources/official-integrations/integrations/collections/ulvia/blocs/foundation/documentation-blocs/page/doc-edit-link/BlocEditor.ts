import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Presentation",
                settings: [
                    {
                        type: "select",
                        label: "Provider",
                        attribute: "provider",
                        options: [
                            { label: "GitHub", value: "github" },
                            { label: "GitLab", value: "gitlab" },
                            { label: "Bitbucket", value: "bitbucket" },
                            { label: "Generic", value: "generic" },
                        ],
                        defaultValue: "github",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Edit link",
                accepts: [{ kind: "component", tag: "a" }],
                min: 1,
                max: 1,
            },
        ];
    }

    constructor(target: HTMLElement) {
        super(target);
    }
    override mountEditor(): void {}
    override unmountEditor(): void {}
}

registerEditor({ editor: BlocEditor });
