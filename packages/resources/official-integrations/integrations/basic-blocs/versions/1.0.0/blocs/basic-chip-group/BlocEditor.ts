import {
    Editor,
    registerEditor,
    type ColorSetting,
    type ContentSlot,
    type SettingSection,
} from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({
    type: "color",
    label,
    attribute,
});

export class BasicChipGroupEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [{
            kind: "self",
            label: "Field",
            settings: [
                { type: "text", label: "Label", attribute: "label" },
                {
                    type: "text",
                    label: "Accessible label",
                    attribute: "accessible-label",
                    placeholder: "Choose an option",
                },
                { type: "text", label: "Name", attribute: "name" },
                { type: "text", label: "Default value", attribute: "value" },
            ],
        }, {
            kind: "self",
            label: "Behavior",
            settings: [{
                type: "segmented",
                label: "Selection",
                attribute: "mode",
                defaultValue: "single",
                options: [
                    { label: "Single", value: "single" },
                    { label: "Multiple", value: "multiple" },
                ],
            }, {
                type: "segmented",
                label: "Required",
                attribute: "required",
                defaultValue: "",
                options: [{ label: "No", value: "" }, { label: "Yes", value: "true" }],
            }, {
                type: "segmented",
                label: "Disabled",
                attribute: "disabled",
                defaultValue: "",
                options: [{ label: "No", value: "" }, { label: "Yes", value: "true" }],
            }],
        }, {
            kind: "self",
            label: "Colors",
            settings: [
                color("Text", "text-color"),
                color("Background", "background-color"),
                color("Border", "border-color"),
                color("Selected text", "selected-text-color"),
                color("Selected background", "selected-background-color"),
                color("Focus", "accent-color"),
            ],
        }];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{
            label: "Choices",
            accepts: [{ kind: "component", tag: "basic-chip" }],
            min: 1,
        }];
    }
}

registerEditor({ editor: BasicChipGroupEditor });
