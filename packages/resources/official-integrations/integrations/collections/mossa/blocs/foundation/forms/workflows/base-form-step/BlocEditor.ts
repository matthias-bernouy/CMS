import {
    Editor,
    registerEditor,
    type SettingSection,
    type ContentSlot,
    type EditableState,
} from "@bernouy/cms-content/editor";

/**
 * Editor for `<base-form-step>`. Provides a parallel CSS path so that
 * editor preview states pin `data-pinned-state="active|complete"` on
 * `.step` and reveal the slot the author wants to edit. Production CSS
 * still keys off `:host([state="active|complete"])` — these two paths
 * are deliberately independent (rule 11).
 *
 * The editor path also overrides `:host([state="pending"]) { display: none }`
 * so a freshly-added step (default pending) stays visible while editing.
 */
const editorCSS = `
:host { display: block !important; }

.step .step-content-active,
.step .step-content-summary {
    display: none;
}

.step[data-pinned-state="active"] .step-content-active {
    display: block;
}

.step[data-pinned-state="complete"] .step-content-summary {
    display: block;
}

.step[data-pinned-state="complete"] .step-edit-btn {
    display: inline-flex;
}
`;

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Validation",
                "settings": [
                    {
                        "type": "select",
                        "label": "Validation trigger",
                        "attribute": "validate-on",
                        "options": [
                            {
                                "label": "On change (auto)",
                                "value": "change",
                            },
                            {
                                "label": "On button click",
                                "value": "button",
                            },
                            {
                                "label": "Manual (programmatic)",
                                "value": "manual",
                            },
                        ],
                        "defaultValue": "change",
                    },
                    {
                        "type": "segmented",
                        "label": "Collapse when validated",
                        "attribute": "collapse-on-complete",
                        "options": [
                            {
                                "label": "Yes — show summary",
                                "value": "",
                            },
                            {
                                "label": "No — keep inputs visible",
                                "value": "no",
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
                "label": "Title",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "title",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Active",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "active",
                "min": 1,
            },
            {
                "label": "Summary",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "summary",
            },
            {
                "label": "Edit Label",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "edit-label",
                "min": 1,
                "max": 1,
            },
        ];
    }

    protected override states(): EditableState[] {
        return [
            {
                id: "legacy-state-0",
                label: "Active",
                isActive: () => {
                    const target = this._legacyStateTarget(".step");
                    if (!target) {
                        return false;
                    }
                    return "data-pinned-state" === "class"
                        ? target.classList.contains("active")
                        : target.getAttribute("data-pinned-state") === "active";
                },
                enter: () => {
                    const target = this._legacyStateTarget(".step");
                    if (!target) {
                        return { exit() {} };
                    }
                    if ("data-pinned-state" === "class") {
                        const wasActive = target.classList.contains("active");
                        target.classList.add("active");
                        return {
                            exit: () => {
                                if (!wasActive) {
                                    target.classList.remove("active");
                                }
                            },
                        };
                    }
                    const previous = target.getAttribute("data-pinned-state");
                    target.setAttribute("data-pinned-state", "active");
                    return {
                        exit: () => {
                            if (previous === null) {
                                target.removeAttribute("data-pinned-state");
                            } else {
                                target.setAttribute("data-pinned-state", previous);
                            }
                        },
                    };
                },
            },
            {
                id: "legacy-state-1",
                label: "Summary",
                isActive: () => {
                    const target = this._legacyStateTarget(".step");
                    if (!target) {
                        return false;
                    }
                    return "data-pinned-state" === "class"
                        ? target.classList.contains("complete")
                        : target.getAttribute("data-pinned-state") === "complete";
                },
                enter: () => {
                    const target = this._legacyStateTarget(".step");
                    if (!target) {
                        return { exit() {} };
                    }
                    if ("data-pinned-state" === "class") {
                        const wasActive = target.classList.contains("complete");
                        target.classList.add("complete");
                        return {
                            exit: () => {
                                if (!wasActive) {
                                    target.classList.remove("complete");
                                }
                            },
                        };
                    }
                    const previous = target.getAttribute("data-pinned-state");
                    target.setAttribute("data-pinned-state", "complete");
                    return {
                        exit: () => {
                            if (previous === null) {
                                target.removeAttribute("data-pinned-state");
                            } else {
                                target.setAttribute("data-pinned-state", previous);
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
