import {
    Editor,
    registerEditor,
    type SettingSection,
    type ContentSlot,
    type EditableState,
} from "@bernouy/cms-content/editor";

const editorCSS = `
:host { position: relative; }

.wrap.is-pinned-open .input {
    border-color: var(--sel-border-focus);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--sel-border-focus) 18%, transparent);
}
.wrap.is-pinned-open .caret {
    transform: translateY(-50%) rotate(180deg);
}

.wrap.is-pinned-open ~ .sr-only {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 100;
    width: auto;
    height: auto;
    overflow-y: auto;
    clip: auto;
    white-space: normal;
    padding: 0.4rem;
    background: var(--sel-bg);
    border: 1px solid var(--sel-border);
    border-radius: var(--sel-radius);
    box-shadow: 0 12px 32px -12px rgba(15, 23, 42, 0.25);
    max-height: 280px;
}
.wrap.is-pinned-open ~ .sr-only ::slotted(base-select-option) {
    display: block;
    margin: 0;
    border: 1px solid transparent;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    background: transparent;
}
.wrap.is-pinned-open ~ .sr-only ::slotted(base-select-option:hover) {
    background: color-mix(in srgb, var(--sel-border-focus) 8%, transparent);
}
`;

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Field",
                "settings": [
                    {
                        "type": "text",
                        "label": "Name",
                        "attribute": "name",
                        "placeholder": "choice",
                    },
                ],
            },
            {
                "kind": "self",
                "label": "State",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Required",
                        "attribute": "required",
                        "options": [
                            {
                                "label": "No",
                                "value": "",
                            },
                            {
                                "label": "Yes",
                                "value": "true",
                            },
                        ],
                        "defaultValue": "",
                    },
                    {
                        "type": "segmented",
                        "label": "Disabled",
                        "attribute": "disabled",
                        "options": [
                            {
                                "label": "No",
                                "value": "",
                            },
                            {
                                "label": "Yes",
                                "value": "true",
                            },
                        ],
                        "defaultValue": "",
                    },
                    {
                        "type": "segmented",
                        "label": "Multiple",
                        "attribute": "multiple",
                        "options": [
                            {
                                "label": "No",
                                "value": "",
                            },
                            {
                                "label": "Yes",
                                "value": "true",
                            },
                        ],
                        "defaultValue": "",
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Style",
                "settings": [
                    {
                        "type": "select",
                        "label": "Variant",
                        "attribute": "variant",
                        "options": [
                            {
                                "label": "Default",
                                "value": "",
                            },
                            {
                                "label": "Ghost",
                                "value": "ghost",
                            },
                        ],
                        "defaultValue": "",
                    },
                    {
                        "type": "select",
                        "label": "Size",
                        "attribute": "size",
                        "options": [
                            {
                                "label": "Small",
                                "value": "sm",
                            },
                            {
                                "label": "Medium",
                                "value": "",
                            },
                            {
                                "label": "Large",
                                "value": "lg",
                            },
                        ],
                        "defaultValue": "",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Options",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "min": 1,
            },
        ];
    }

    protected override states(): EditableState[] {
        return [
            {
                id: "legacy-state-0",
                label: "Open dropdown",
                isActive: () => {
                    const target = this._legacyStateTarget(".wrap");
                    if (!target) {
                        return false;
                    }
                    return "class" === "class"
                        ? target.classList.contains("is-pinned-open")
                        : target.getAttribute("class") === "is-pinned-open";
                },
                enter: () => {
                    const target = this._legacyStateTarget(".wrap");
                    if (!target) {
                        return { exit() {} };
                    }
                    if ("class" === "class") {
                        const wasActive = target.classList.contains("is-pinned-open");
                        target.classList.add("is-pinned-open");
                        return {
                            exit: () => {
                                if (!wasActive) {
                                    target.classList.remove("is-pinned-open");
                                }
                            },
                        };
                    }
                    const previous = target.getAttribute("class");
                    target.setAttribute("class", "is-pinned-open");
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

    private _legacyStateTarget(selector: string): HTMLElement | null {
        if (selector === ":host") {
            return this.target;
        }
        return (
            this.target.shadowRoot?.querySelector<HTMLElement>(selector) ??
            this.target.querySelector<HTMLElement>(selector)
        );
    }
    // -- End generated legacy editor metadata --

    private readonly _legacyEditorStyle = document.createElement("style");
    constructor(target: HTMLElement) {
        super(target);
    }
    override mountEditor(): void {
        this._legacyEditorStyle.textContent = editorCSS;
        this.target.shadowRoot?.append(this._legacyEditorStyle);
    }
    override unmountEditor(): void {
        this._legacyEditorStyle.remove();
    }
}

registerEditor({ editor: BlocEditor });
