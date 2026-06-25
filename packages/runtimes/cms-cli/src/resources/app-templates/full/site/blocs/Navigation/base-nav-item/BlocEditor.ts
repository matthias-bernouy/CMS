import {
    Editor,
    registerEditor,
    type ContentSlot,
    type EditableState,
    type SettingSection,
    type TextCapability,
} from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Link",
                settings: [
                    {
                        type: "page-link",
                        label: "Target",
                        attribute: "href",
                    },
                    {
                        type: "select",
                        label: "Open in",
                        attribute: "target",
                        defaultValue: "_self",
                        options: [
                            { label: "Same tab", value: "_self" },
                            { label: "New tab", value: "_blank" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Dropdown",
                slot: "items",
                accepts: [{ kind: "any-component" }],
            },
        ];
    }

    protected override textCapability(): TextCapability {
        return {
            format: "richtext",
            bold: true,
            italic: true,
            underline: true,
            dynamic: true,
        };
    }

    protected override states(): EditableState[] {
        return [
            {
                id: "open",
                label: "Open dropdown",
                isActive: () => this._item()?.classList.contains("is-open") ?? false,
                enter: () => {
                    const item = this._item();
                    if (!item) return { exit() {} };

                    const wasOpen = item.classList.contains("is-open");
                    item.classList.add("is-open");

                    return {
                        exit: () => {
                            if (!wasOpen) item.classList.remove("is-open");
                        },
                    };
                },
            },
        ];
    }

    private _item(): HTMLElement | null {
        return this.target.shadowRoot?.querySelector<HTMLElement>(".item") ?? null;
    }
}

registerEditor({ editor: BlocEditor });
