import { Editor, registerEditor, type ContentSlot, type EditableState } from "@bernouy/cms-content/editor";

/* Editor-only override: when the user pins the panel via an editor state,
   `.panel.is-pinned-open` is set on the shadow wrapper. The runtime rule
   `:host([collapsed]) .body { display: none }` would still hide the body
   (host attribute, shadow class — independent), so we force-show with
   !important. Mirror chevron rotation too so the indicator stays sensible. */
const editorCSS = `
.panel.is-pinned-open .body    { display: flex !important; }
.panel.is-pinned-open .chevron { transform: rotate(-180deg) !important; }
`;

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

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
                id: "legacy-state-0",
                label: "Pin open",
                isActive: () => {
                    const target = this._legacyStateTarget(".panel");
                    if (!target) {
                        return false;
                    }
                    return "class" === "class"
                        ? target.classList.contains("is-pinned-open")
                        : target.getAttribute("class") === "is-pinned-open";
                },
                enter: () => {
                    const target = this._legacyStateTarget(".panel");
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
