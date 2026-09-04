import {
    Editor,
    registerEditor,
    type SettingSection,
    type ContentSlot,
    type EditableState,
} from "@bernouy/cms-content/editor";

/**
 * Editor for `<base-form>`. The v2 `states()` API writes preview states
 * directly to the shadow `.state-host`.
 */
export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Mode",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Mode",
                        "attribute": "mode",
                        "defaultValue": "submit",
                        "options": [
                            {
                                "label": "Submit",
                                "value": "submit",
                            },
                            {
                                "label": "URL sync (write to query params)",
                                "value": "url-sync",
                            },
                        ],
                    },
                    {
                        "type": "text",
                        "label": "Debounce (ms)",
                        "attribute": "debounce",
                        "placeholder": "100",
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Validation",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Disable native validation",
                        "attribute": "novalidate",
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
                "label": "Layout",
                "settings": [
                    {
                        "type": "select",
                        "label": "Layout",
                        "attribute": "layout",
                        "options": [
                            {
                                "label": "Stacked",
                                "value": "stack",
                            },
                            {
                                "label": "Inline",
                                "value": "inline",
                            },
                            {
                                "label": "Grid",
                                "value": "grid",
                            },
                        ],
                        "defaultValue": "stack",
                    },
                    {
                        "type": "select",
                        "label": "Max width",
                        "attribute": "width",
                        "options": [
                            {
                                "label": "Small (420px)",
                                "value": "sm",
                            },
                            {
                                "label": "Medium (640px)",
                                "value": "md",
                            },
                            {
                                "label": "Large (860px)",
                                "value": "lg",
                            },
                            {
                                "label": "Full",
                                "value": "full",
                            },
                        ],
                        "defaultValue": "md",
                    },
                    {
                        "type": "segmented",
                        "label": "Alignment",
                        "attribute": "align",
                        "options": [
                            {
                                "label": "Start",
                                "value": "",
                            },
                            {
                                "label": "Center",
                                "value": "center",
                            },
                            {
                                "label": "End",
                                "value": "end",
                            },
                        ],
                        "defaultValue": "",
                    },
                    {
                        "type": "select",
                        "label": "Gap",
                        "attribute": "gap",
                        "defaultValue": "md",
                        "options": [
                            {
                                "label": "None",
                                "value": "",
                            },
                            {
                                "label": "Extra small",
                                "value": "xs",
                            },
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
                            {
                                "label": "Extra large",
                                "value": "xl",
                            },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Fields",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
            },
            {
                "label": "Loading",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "loading",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Error",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "error",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Success",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "success",
                "min": 1,
                "max": 1,
            },
        ];
    }

    protected override states(): EditableState[] {
        return [
            {
                id: "form",
                label: "Form",
                isActive: () => {
                    const target = this._stateTarget(".state-host");
                    if (!target) {
                        return false;
                    }
                    return target.getAttribute("data-state") === "default";
                },
                enter: () => {
                    const target = this._stateTarget(".state-host");
                    if (!target) {
                        return { exit() {} };
                    }
                    const previous = target.getAttribute("data-state");
                    target.setAttribute("data-state", "default");
                    return {
                        exit: () => {
                            if (previous === null) {
                                target.removeAttribute("data-state");
                            } else {
                                target.setAttribute("data-state", previous);
                            }
                        },
                    };
                },
            },
            {
                id: "loading",
                label: "Loading",
                isActive: () => {
                    const target = this._stateTarget(".state-host");
                    if (!target) {
                        return false;
                    }
                    return target.getAttribute("data-state") === "loading";
                },
                enter: () => {
                    const target = this._stateTarget(".state-host");
                    if (!target) {
                        return { exit() {} };
                    }
                    const previous = target.getAttribute("data-state");
                    target.setAttribute("data-state", "loading");
                    return {
                        exit: () => {
                            if (previous === null) {
                                target.removeAttribute("data-state");
                            } else {
                                target.setAttribute("data-state", previous);
                            }
                        },
                    };
                },
            },
            {
                id: "error",
                label: "Error",
                isActive: () => {
                    const target = this._stateTarget(".state-host");
                    if (!target) {
                        return false;
                    }
                    return target.getAttribute("data-state") === "error";
                },
                enter: () => {
                    const target = this._stateTarget(".state-host");
                    if (!target) {
                        return { exit() {} };
                    }
                    const previous = target.getAttribute("data-state");
                    target.setAttribute("data-state", "error");
                    return {
                        exit: () => {
                            if (previous === null) {
                                target.removeAttribute("data-state");
                            } else {
                                target.setAttribute("data-state", previous);
                            }
                        },
                    };
                },
            },
            {
                id: "success",
                label: "Success",
                isActive: () => {
                    const target = this._stateTarget(".state-host");
                    if (!target) {
                        return false;
                    }
                    return target.getAttribute("data-state") === "success";
                },
                enter: () => {
                    const target = this._stateTarget(".state-host");
                    if (!target) {
                        return { exit() {} };
                    }
                    const previous = target.getAttribute("data-state");
                    target.setAttribute("data-state", "success");
                    return {
                        exit: () => {
                            if (previous === null) {
                                target.removeAttribute("data-state");
                            } else {
                                target.setAttribute("data-state", previous);
                            }
                        },
                    };
                },
            },
        ];
    }

    private _stateTarget(selector: string): HTMLElement | null {
        if (selector === ":host") {
            return this.target;
        }
        return (
            this.target.shadowRoot?.querySelector<HTMLElement>(selector) ??
            this.target.querySelector<HTMLElement>(selector)
        );
    }
    // -- End generated legacy editor metadata --

    constructor(target: HTMLElement) {
        super(target);
    }
}

registerEditor({ editor: BlocEditor });
