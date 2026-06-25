import { Editor, type ContentSlot, type EditableState, type SettingOption, type SettingSection } from "@bernouy/cms-content/editor";

const spacingOptions: SettingOption[] = [
    { label: "None", value: "none" },
    { label: "Extra small", value: "xs" },
    { label: "Small", value: "sm" },
    { label: "Medium", value: "md" },
    { label: "Large", value: "lg" },
    { label: "Extra large", value: "xl" },
];

export class CardEditor extends Editor {

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Header",
                slot: "header",
                max: 1,
                accepts: [{ kind: "any-component" }],
            },
            {
                label: "Content",
                accepts: [{ kind: "any-component" }],
            },
            {
                label: "Footer",
                slot: "footer",
                accepts: [{ kind: "any-component" }],
            },
        ];
    }

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Card",
                settings: [
                    {
                        type: "select",
                        label: "Variant",
                        attribute: "variant",
                        defaultValue: "outlined",
                        options: [
                            { label: "Outlined", value: "outlined" },
                            { label: "Elevated", value: "elevated" },
                            { label: "Filled", value: "filled" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Padding",
                        attribute: "padding",
                        defaultValue: "md",
                        options: spacingOptions.filter(option => option.value !== "xs" && option.value !== "xl"),
                    },
                    {
                        type: "toggle",
                        label: "Interactive",
                        attribute: "interactive",
                        defaultValue: false,
                    },
                    {
                        type: "toggle",
                        label: "Fill height",
                        attribute: "fill-height",
                        defaultValue: false,
                    },
                ],
            },
        ];
    }

    protected override states(): EditableState[] {
        return [
            {
                id: "preview-emphasis",
                label: "Preview emphasis",
                description: "Temporarily shows this card in an emphasized editing state.",
                group: "card-preview",
                isActive: () => this.target.getAttribute("data-editor-state") === "emphasis",
                enter: () => {
                    const previous = this.target.getAttribute("data-editor-state");
                    this.target.setAttribute("data-editor-state", "emphasis");

                    return {
                        exit: () => {
                            if (previous === null) {
                                this.target.removeAttribute("data-editor-state");
                            } else {
                                this.target.setAttribute("data-editor-state", previous);
                            }
                        },
                    };
                },
            },
        ];
    }

}
