import {
    Editor,
    registerEditor,
    type SettingSection,
    type ContentSlot,
    type EditableState,
} from "@bernouy/cms-content/editor";

/**
 * Editor for `<base-form-wizard-step>`. The runtime hides any step whose
 * state is `pending` or `complete`. In the editor we keep that contract
 * — only one step at a time, so the canvas mirrors what the user will
 * actually see — but we let the author flip between steps from the
 * wizard's progress bar (which the parent wizard's `BlocEditor` makes
 * fully clickable in edit mode). The editor preview state can still
 * force a specific step visible regardless of the wizard's current-step.
 * See rule 11.
 */
const editorCSS = `
/* Pin override — when the author engages the per-step pin from the
   side panel, the step becomes visible even if the wizard's
   current-step points elsewhere. Mirrored by an observer in mountEditor() so
   the host attribute (which the runtime CSS hides) gets relaxed. */
:host([editor-pinned-active]) { display: block !important; }
`;

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Progress label",
                "settings": [
                    {
                        "type": "text",
                        "label": "Short label shown in the progress bar",
                        "attribute": "progress-label",
                        "placeholder": "e.g. Récap",
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Behaviour",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Let the user return to this step via the progress bar",
                        "attribute": "allow-backtrack",
                        "options": [
                            {
                                "label": "Yes",
                                "value": "",
                            },
                            {
                                "label": "No",
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
                "label": "Step content",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "min": 1,
            },
            {
                "label": "Cta Next",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "cta-next",
                "max": 1,
            },
            {
                "label": "Cta Prev",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "cta-prev",
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

    private _pinObserver: MutationObserver | null = null;

    constructor(target: HTMLElement) {
        super(target);
    }

    override mountEditor(): void {
        this._legacyEditorStyle.textContent = editorCSS;
        this.target.shadowRoot?.append(this._legacyEditorStyle);
        const step = this.target.shadowRoot?.querySelector(".step");
        if (!step) {
            return;
        }
        const sync = () => {
            const pinned = step.getAttribute("data-pinned-state") === "active";
            this.target.toggleAttribute("editor-pinned-active", pinned);
        };
        this._pinObserver = new MutationObserver(sync);
        this._pinObserver.observe(step, { attributes: true, attributeFilter: ["data-pinned-state"] });
        sync();
    }

    override unmountEditor(): void {
        this._legacyEditorStyle.remove();
        this._pinObserver?.disconnect();
        this._pinObserver = null;
        this.target.removeAttribute("editor-pinned-active");
    }
}

registerEditor({ editor: BlocEditor });
