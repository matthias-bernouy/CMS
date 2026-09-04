import {
    Editor,
    registerEditor,
    type SettingSection,
    type ContentSlot,
    type EditableState,
} from "@bernouy/cms-content/editor";

const editorCSS = `
.section.is-open .chevron { transform: none; }
.section.is-open .body { grid-template-rows: 1fr; }
`;

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Behavior",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Collapsible",
                        "attribute": "collapsible",
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
                        "label": "Open by default",
                        "attribute": "open",
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
                        "defaultValue": "true",
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
                "max": 1,
            },
            {
                "label": "Items",
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
                    const target = this._legacyStateTarget(".section");
                    if (!target) {
                        return false;
                    }
                    return "class" === "class"
                        ? target.classList.contains("is-open")
                        : target.getAttribute("class") === "is-open";
                },
                enter: () => {
                    const target = this._legacyStateTarget(".section");
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
        this._syncNested();
    }

    override mountEditor(): void {
        this._legacyEditorStyle.textContent = editorCSS;
        this.target.shadowRoot?.append(this._legacyEditorStyle);
        this._observer = new MutationObserver(() => this._syncNested());
        this._observer.observe(document.body, { childList: true, subtree: true });
    }

    override unmountEditor(): void {
        this._legacyEditorStyle.remove();
        this._observer?.disconnect();
        this._observer = null;
    }

    private _observer: MutationObserver | null = null;

    // Tag-agnostic: flag the target when any light-DOM ancestor shares
    // its nodeName. Baked into the DOM so the public view reads it via
    // CSS with no runtime JS.
    private _syncNested(): void {
        let parent: Element | null = this.target.parentElement;
        while (parent) {
            if (parent.nodeName === this.target.nodeName) {
                if (!this.target.hasAttribute("data-nested")) {
                    this.target.setAttribute("data-nested", "");
                }
                return;
            }
            parent = parent.parentElement;
        }
        if (this.target.hasAttribute("data-nested")) {
            this.target.removeAttribute("data-nested");
        }
    }
}

registerEditor({ editor: BlocEditor });
