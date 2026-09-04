import {
    Editor,
    registerEditor,
    type SettingSection,
    type ContentSlot,
    type EditableState,
} from "@bernouy/cms-content/editor";

/**
 * Editor for `<base-form-stepper>`. Provides an editor-only path to
 * preview the final slot reveal: the editor preview state sets
 * `.stepper.preview-all-complete`, and this CSS mirrors what the
 * production `:host([all-complete])` rule does at runtime (rule 11).
 */
const editorCSS = `
.stepper.preview-all-complete .final {
    display: block;
}
`;

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Behaviour",
                "settings": [
                    {
                        "type": "select",
                        "label": "Gap between steps",
                        "attribute": "gap",
                        "options": [
                            {
                                "label": "Small",
                                "value": "sm",
                            },
                            {
                                "label": "Medium",
                                "value": "md",
                            },
                            {
                                "label": "Large",
                                "value": "lg",
                            },
                        ],
                        "defaultValue": "md",
                    },
                    {
                        "type": "segmented",
                        "label": "Reset later steps when an earlier one is edited",
                        "attribute": "cascade-edit",
                        "options": [
                            {
                                "label": "Yes (recommended)",
                                "value": "",
                            },
                            {
                                "label": "No (keep them validated)",
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
                "label": "Steps",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "min": 1,
            },
            {
                "label": "Final",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "final",
                "max": 1,
            },
        ];
    }

    protected override states(): EditableState[] {
        return [
            {
                id: "legacy-state-0",
                label: "Pin all-complete (reveal final slot)",
                isActive: () => {
                    const target = this._legacyStateTarget(".stepper");
                    if (!target) {
                        return false;
                    }
                    return "class" === "class"
                        ? target.classList.contains("preview-all-complete")
                        : target.getAttribute("class") === "preview-all-complete";
                },
                enter: () => {
                    const target = this._legacyStateTarget(".stepper");
                    if (!target) {
                        return { exit() {} };
                    }
                    if ("class" === "class") {
                        const wasActive = target.classList.contains("preview-all-complete");
                        target.classList.add("preview-all-complete");
                        return {
                            exit: () => {
                                if (!wasActive) {
                                    target.classList.remove("preview-all-complete");
                                }
                            },
                        };
                    }
                    const previous = target.getAttribute("class");
                    target.setAttribute("class", "preview-all-complete");
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
