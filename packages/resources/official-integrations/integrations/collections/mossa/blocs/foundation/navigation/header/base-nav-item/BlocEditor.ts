import {
    Editor,
    registerEditor,
    type SettingSection,
    type ContentSlot,
    type EditableState,
} from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Link",
                "settings": [
                    {
                        "type": "select",
                        "label": "Open in",
                        "attribute": "target",
                        "options": [
                            {
                                "label": "Same tab",
                                "value": "_self",
                            },
                            {
                                "label": "New tab",
                                "value": "_blank",
                            },
                        ],
                        "defaultValue": "_self",
                    },
                    {
                        "type": "page-link",
                        "label": "Target page",
                        "attribute": "href",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Label",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "label",
                "min": 1,
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
            },
        ];
    }

    protected override states(): EditableState[] {
        return [
            {
                id: "legacy-state-0",
                label: "Pin open",
                isActive: () => {
                    const target = this._legacyStateTarget(".item");
                    if (!target) {
                        return false;
                    }
                    return "class" === "class"
                        ? target.classList.contains("is-open")
                        : target.getAttribute("class") === "is-open";
                },
                enter: () => {
                    const target = this._legacyStateTarget(".item");
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

    private readonly _childrenObserver = new MutationObserver(() => this.calc());

    constructor(target: HTMLElement) {
        super(target);
    }

    override mountEditor(): void {
        this.calc();
        this._childrenObserver.observe(this.target, {
            attributes: true,
            attributeFilter: ["slot"],
            childList: true,
            subtree: true,
        });
    }

    override unmountEditor(): void {
        this._childrenObserver.disconnect();
    }

    private calc(): void {
        if (!this._hasDropdown) {
            this.target.removeAttribute("data-has-dropdown");
        } else {
            this.target.setAttribute("data-has-dropdown", "true");
        }
    }

    get _hasDropdown() {
        return this.target.querySelector("[slot='items']") !== null;
    }
}

registerEditor({ editor: BlocEditor });
