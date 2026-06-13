import { Editor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class ListEditor extends Editor {

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Items",
                min: 1,
                accepts: [{ kind: "component", tag: "li" }],
            },
        ];
    }

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "List",
                settings: [],
            },
        ];
    }

}
