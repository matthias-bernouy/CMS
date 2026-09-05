import { Editor, registerEditor, type ContentSlot, type EditableState } from "@bernouy/cms-content/editor";

const editorCSS = `
.wrap.is-open .caret { transform: rotate(180deg); }
.wrap.is-open .panel {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
}
`;

export class BlocEditor extends Editor {
    // -- Generated editor metadata --

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Initials",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "initials",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Name",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "name",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Caption",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "caption",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Display Name",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "display-name",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Role",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "role",
                "max": 1,
            },
            {
                "label": "Items",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "items",
                "min": 1,
            },
            {
                "label": "Logout",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "logout",
                "max": 1,
            },
        ];
    }

    protected override states(): EditableState[] {
        return [
            {
                id: "preview-state-0",
                label: "Pin open",
                isActive: () => {
                    const target = this._previewStateTarget(".wrap");
                    if (!target) {
                        return false;
                    }
                    return "class" === "class"
                        ? target.classList.contains("is-open")
                        : target.getAttribute("class") === "is-open";
                },
                enter: () => {
                    const target = this._previewStateTarget(".wrap");
                    if (!target) {
                        return { exit() {} };
                    }
                    if ("class" === "class") {
                        const wasActive = target.classList.contains("is-open");
                        target.classList.add("is-open");
                        return {
                            exit: () => {
                                if (!wasActive) {
                                    target.classList.remove("is-open");
                                }
                            },
                        };
                    }
                    const previous = target.getAttribute("class");
                    target.setAttribute("class", "is-open");
                    return {
                        exit: () => {
                            if (previous === null) {
                                target.removeAttribute("class");
                            } else {
                                target.setAttribute("class", previous);
                            }
                        },
                    };
                },
            },
        ];
    }

    private _previewStateTarget(selector: string): HTMLElement | null {
        if (selector === ":host") {
            return this.target;
        }
        return (
            this.target.shadowRoot?.querySelector<HTMLElement>(selector) ??
            this.target.querySelector<HTMLElement>(selector)
        );
    }
    // -- End generated editor metadata --

    private readonly _previewEditorStyle = document.createElement("style");
    constructor(target: HTMLElement) {
        super(target);
    }
    override mountEditor(): void {
        this._previewEditorStyle.textContent = editorCSS;
        this.target.shadowRoot?.append(this._previewEditorStyle);
    }
    override unmountEditor(): void {
        this._previewEditorStyle.remove();
    }
}

registerEditor({ editor: BlocEditor });
