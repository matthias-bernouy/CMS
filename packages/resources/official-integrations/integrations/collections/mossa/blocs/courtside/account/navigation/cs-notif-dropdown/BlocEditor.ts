import { Editor, registerEditor, type ContentSlot, type EditableState } from "@bernouy/cms-content/editor";

const editorCSS = `
.wrap.is-open .panel {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
}
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
                "label": "Empty",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "empty",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Count",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "count",
                "max": 1,
            },
            {
                "label": "Notifications",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
            },
        ];
    }

    protected override states(): EditableState[] {
        return [
            {
                id: "legacy-state-0",
                label: "Pin open",
                isActive: () => {
                    const target = this._legacyStateTarget(".wrap");
                    if (!target) {
                        return false;
                    }
                    return "class" === "class"
                        ? target.classList.contains("is-open")
                        : target.getAttribute("class") === "is-open";
                },
                enter: () => {
                    const target = this._legacyStateTarget(".wrap");
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
