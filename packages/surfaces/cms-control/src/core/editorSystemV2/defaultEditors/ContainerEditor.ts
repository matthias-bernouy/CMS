import { Editor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { alignmentOptions, containerSizeOptions } from "./options";

export class ContainerEditor extends Editor {

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Content",
                accepts: [{ kind: "any-component" }],
            },
        ];
    }

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Container",
                settings: [
                    {
                        type: "select",
                        label: "Size",
                        attribute: "size",
                        defaultValue: "md",
                        options: containerSizeOptions,
                    },
                    {
                        type: "segmented",
                        label: "Align",
                        attribute: "align",
                        defaultValue: "start",
                        options: alignmentOptions,
                    },
                ],
            },
        ];
    }

}
