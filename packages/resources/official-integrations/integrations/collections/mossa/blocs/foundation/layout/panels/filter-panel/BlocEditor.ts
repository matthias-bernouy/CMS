import { Editor, registerEditor, type ContentSlot, type EditableState } from "@bernouy/cms-content/editor";

/* Editor-only override: when the user pins the panel via an editor state,
   `.panel.is-pinned-open` is set on the shadow wrapper. The explicit host
   state gives these rules enough specificity to beat the runtime collapsed
   state without changing authored data. */
const editorCSS = `
:host([collapsed]) .panel.is-pinned-open .body    { display: flex; }
:host([collapsed]) .panel.is-pinned-open .chevron { transform: rotate(-180deg); }
`;

export class BlocEditor extends Editor {
    // -- Generated editor metadata --

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
                "label": "Reset",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "reset",
                "max": 1,
            },
            {
                "label": "Filters",
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
                id: "preview-state-0",
                label: "Pin open",
                isActive: () => {
                    const target = this._previewStateTarget(".panel");
                    if (!target) {
                        return false;
                    }
                    return "class" === "class"
                        ? target.classList.contains("is-pinned-open")
                        : target.getAttribute("class") === "is-pinned-open";
                },
                enter: () => {
                    const target = this._previewStateTarget(".panel");
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
