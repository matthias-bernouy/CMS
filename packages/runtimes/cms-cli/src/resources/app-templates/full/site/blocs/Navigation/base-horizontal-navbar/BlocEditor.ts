import {
    Editor,
    registerEditor,
    type ContentSlot,
    type EditableState,
    type SettingSection,
} from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Navbar",
                settings: [
                    {
                        type: "select",
                        label: "Variant",
                        attribute: "variant",
                        defaultValue: "background",
                        options: [
                            { label: "Background", value: "background" },
                            { label: "Surface", value: "surface" },
                            { label: "Primary", value: "primary" },
                            { label: "Secondary", value: "secondary" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Max width",
                        attribute: "width",
                        defaultValue: "xl",
                        options: [
                            { label: "Medium", value: "md" },
                            { label: "Large", value: "lg" },
                            { label: "Extra large", value: "xl" },
                            { label: "Full width", value: "full" },
                        ],
                    },
                    {
                        type: "toggle",
                        label: "Sticky",
                        attribute: "sticky",
                        defaultValue: false,
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Brand",
                slot: "brand",
                max: 1,
                accepts: [{ kind: "any-component" }],
            },
            {
                label: "Links",
                accepts: [{ kind: "component", tag: "base-nav-item" }],
            },
            {
                label: "Actions",
                slot: "actions",
                accepts: [{ kind: "any-component" }],
            },
        ];
    }

    protected override states(): EditableState[] {
        return [
            {
                id: "open",
                label: "Open menu",
                isActive: () => this.target.hasAttribute("open"),
                enter: () => {
                    const wasOpen = this.target.hasAttribute("open");
                    this.target.setAttribute("open", "");
                    return {
                        exit: () => {
                            if (!wasOpen) this.target.removeAttribute("open");
                        },
                    };
                },
            },
        ];
    }
}

registerEditor({ editor: BlocEditor });
