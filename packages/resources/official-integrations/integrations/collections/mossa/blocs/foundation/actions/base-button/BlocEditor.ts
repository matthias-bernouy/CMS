import {
    Editor,
    registerEditor,
    type SettingSection,
    type ContentSlot,
    type TextCapability,
} from "@bernouy/cms-content/editor";

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
                        "label": "Action",
                        "attribute": "type",
                        "defaultValue": this._actionType(),
                        "options": [
                            {
                                "label": "Link",
                                "value": "link",
                            },
                            {
                                "label": "Button",
                                "value": "button",
                            },
                            {
                                "label": "Submit",
                                "value": "submit",
                            },
                        ],
                        "attributesOnValue": [
                            {
                                "value": "link",
                                "attributes": {
                                    "name": null,
                                    "value": null,
                                },
                            },
                            {
                                "value": "button",
                                "attributes": {
                                    "href": null,
                                    "target": null,
                                    "name": null,
                                    "value": null,
                                },
                            },
                            {
                                "value": "submit",
                                "attributes": {
                                    "href": null,
                                    "target": null,
                                },
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Disabled",
                        "attribute": "disabled",
                        "defaultValue": "no",
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
                    },
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
                        "visibleWhen": {
                            "attribute": "type",
                            "equals": "link",
                        },
                    },
                    {
                        "type": "page-link",
                        "label": "Target page",
                        "attribute": "href",
                        "visibleWhen": {
                            "attribute": "type",
                            "equals": "link",
                        },
                    },
                    {
                        "type": "text",
                        "label": "Name",
                        "attribute": "name",
                        "visibleWhen": {
                            "attribute": "type",
                            "equals": "submit",
                        },
                    },
                    {
                        "type": "text",
                        "label": "Value",
                        "attribute": "value",
                        "visibleWhen": {
                            "attribute": "type",
                            "equals": "submit",
                        },
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Style",
                "settings": [
                    {
                        "type": "select",
                        "label": "Color",
                        "attribute": "color",
                        "options": [
                            {
                                "label": "Primary",
                                "value": "primary",
                            },
                            {
                                "label": "Secondary",
                                "value": "secondary",
                            },
                            {
                                "label": "Success",
                                "value": "success",
                            },
                            {
                                "label": "Warning",
                                "value": "warning",
                            },
                            {
                                "label": "Danger",
                                "value": "danger",
                            },
                            {
                                "label": "Info",
                                "value": "info",
                            },
                        ],
                        "defaultValue": "primary",
                    },
                    {
                        "type": "select",
                        "label": "Variant",
                        "attribute": "variant",
                        "options": [
                            {
                                "label": "Filled",
                                "value": "primary",
                            },
                            {
                                "label": "Outlined",
                                "value": "secondary",
                            },
                            {
                                "label": "Ghost",
                                "value": "ghost",
                            },
                            {
                                "label": "Contextual",
                                "value": "contextual",
                            },
                        ],
                        "defaultValue": "primary",
                    },
                    {
                        "type": "select",
                        "label": "Size",
                        "attribute": "size",
                        "options": [
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
                        "defaultValue": "md",
                    },
                    {
                        "type": "select",
                        "label": "Width",
                        "attribute": "width",
                        "options": [
                            {
                                "label": "Auto",
                                "value": "auto",
                            },
                            {
                                "label": "Full (fill parent)",
                                "value": "full",
                            },
                        ],
                        "defaultValue": "auto",
                    },
                    {
                        "type": "segmented",
                        "label": "Alignment",
                        "attribute": "align",
                        "defaultValue": "center",
                        "options": [
                            {
                                "label": "Left",
                                "value": "left",
                            },
                            {
                                "label": "Center",
                                "value": "center",
                            },
                            {
                                "label": "Right",
                                "value": "right",
                            },
                        ],
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Icons",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Left icon",
                        "attribute": "has-icon-left",
                        "defaultValue": "no",
                        "options": [
                            {
                                "label": "None",
                                "value": "no",
                            },
                            {
                                "label": "Show",
                                "value": "yes",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Right icon",
                        "attribute": "has-icon-right",
                        "defaultValue": "no",
                        "options": [
                            {
                                "label": "None",
                                "value": "no",
                            },
                            {
                                "label": "Show",
                                "value": "yes",
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
                "label": "Left icon",
                "accepts": [
                    {
                        "kind": "media",
                        "accept": ["svg"],
                    },
                ],
                "slot": "icon-left",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Right icon",
                "accepts": [
                    {
                        "kind": "media",
                        "accept": ["svg"],
                    },
                ],
                "slot": "icon-right",
                "min": 1,
                "max": 1,
            },
        ];
    }
    // -- End generated legacy editor metadata --

    constructor(target: HTMLElement) {
        super(target);
    }

    override mountEditor(): void {}
    override unmountEditor(): void {}

    protected override textCapability(): TextCapability {
        return {
            format: "text",
            dynamic: true,
        };
    }

    private _actionType(): "link" | "button" | "submit" {
        const type = this.target.getAttribute("type");
        if (type === "link" || type === "button" || type === "submit") {
            return type;
        }
        return this.target.hasAttribute("href") ? "link" : "button";
    }
}

registerEditor({ editor: BlocEditor });
