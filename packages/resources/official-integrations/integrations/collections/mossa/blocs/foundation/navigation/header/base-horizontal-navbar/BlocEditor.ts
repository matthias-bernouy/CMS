import {
    Editor,
    registerEditor,
    type SettingSection,
    type ContentSlot,
    type EditableState,
} from "@bernouy/cms-content/editor";

const editorCSS = `
.navbar.is-open {
    flex-wrap: wrap;
}
.navbar.is-open .burger-toggle {
    display: flex;
}
.navbar.is-open .panel {
    display: flex;
    flex-direction: column;
    flex-basis: 100%;
    align-items: stretch;
    gap: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--ulvia-surface-border);
    margin-top: 0.75rem;
}
.navbar.is-open .links,
.navbar.is-open .actions {
    flex-direction: column;
    gap: 0.5rem;
}
.navbar.is-open .actions {
    align-items: flex-start;
    width: 100%;
}
.navbar.is-open .actions ::slotted([slot="actions"]) {
    --user-menu-panel-left: 0;
    --user-menu-panel-right: auto;
}
`;

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
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
                                "label": "Background",
                                "value": "background",
                            },
                            {
                                "label": "Surface",
                                "value": "surface",
                            },
                            {
                                "label": "Primary",
                                "value": "primary",
                            },
                            {
                                "label": "Secondary",
                                "value": "secondary",
                            },
                        ],
                        "defaultValue": "background",
                    },
                    {
                        "type": "select",
                        "label": "Sticky",
                        "attribute": "sticky",
                        "options": [
                            {
                                "label": "No",
                                "value": "no",
                            },
                            {
                                "label": "Yes",
                                "value": "yes",
                            },
                        ],
                        "defaultValue": "no",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Brand link",
                "accepts": [
                    {
                        "kind": "component",
                        "tag": "a",
                    },
                ],
                "slot": "brand",
                "max": 1,
            },
            {
                "label": "Links",
                "accepts": [
                    {
                        "kind": "component",
                        "tag": "a",
                    },
                ],
                "slot": "navigation",
            },
            {
                "label": "Actions",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "actions",
            },
        ];
    }

    protected override states(): EditableState[] {
        return [
            {
                id: "legacy-state-0",
                label: "Pin open",
                isActive: () => {
                    const target = this._legacyStateTarget(".navbar");
                    if (!target) {
                        return false;
                    }
                    return "class" === "class"
                        ? target.classList.contains("is-open")
                        : target.getAttribute("class") === "is-open";
                },
                enter: () => {
                    const target = this._legacyStateTarget(".navbar");
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
        this.computeContainerQuery();
    }

    override mountEditor(): void {
        this._legacyEditorStyle.textContent = editorCSS;
        this.target.shadowRoot?.append(this._legacyEditorStyle);
        this.observer.observe(this.target, {
            characterData: true,
            attributes: true,
            childList: true,
            subtree: true,
            attributeFilter: ["navbar-breakpoint"],
        });
    }

    override unmountEditor(): void {
        this._legacyEditorStyle.remove();
        this.observer.disconnect();
    }

    private observer = new MutationObserver((e) => {
        if (e.length === 1 && e[0]?.attributeName === "navbar-breakpoint") {
            return;
        }
        this.computeContainerQuery();
    });

    sandbox() {
        const sandbox = document.createElement("div");
        sandbox.setAttribute("aria-hidden", "true");
        sandbox.style.cssText = ["visibility:hidden", "position: absolute", "top: -99999px"].join(";");

        const clone = this.target.cloneNode(true) as HTMLElement;
        clone.setAttribute("navbar-breakpoint", "0px"); // force inline

        sandbox.append(clone);
        document.body.append(sandbox);
        return sandbox;
    }

    computeContainerQuery() {
        const sandbox = this.sandbox() as HTMLElement;
        const host = sandbox.firstChild! as HTMLElement;
        let minWidth = 0;
        let style;

        const nav = host.shadowRoot?.querySelector(".navbar")! as HTMLElement;
        const links = host.shadowRoot?.querySelector(".links")! as HTMLElement;

        host.style.minWidth = "1920px";
        nav.style.flexWrap = "nowrap";
        nav.style.maxWidth = "unset";

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const linksWidth = links.offsetWidth;
                links.style.flex = "0 0 auto";

                minWidth += nav.offsetWidth;

                style = getComputedStyle(host);
                minWidth += parseFloat(style.marginLeft);
                minWidth += parseFloat(style.marginRight);
                minWidth += parseFloat(style.paddingLeft);
                minWidth += parseFloat(style.paddingRight);

                minWidth += links.offsetWidth - linksWidth;

                this.target.setAttribute("navbar-breakpoint", minWidth + "px");
                (this.target as any).updateCSS();

                sandbox.remove();
            });
        });
    }
}

registerEditor({ editor: BlocEditor });
