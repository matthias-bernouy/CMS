import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

const defaults: Record<string, string> = {
    "menu-label": "Menu",
    "menu-navigation-label": "Navigation mobile",
    "navigation-label": "Navigation principale",
};

export class PhotoSiteHeader extends Component {
    static observedAttributes = Object.keys(defaults);

    constructor() {
        super({ css, template });
    }

    connectedCallback() {
        this.sync();
    }

    attributeChangedCallback() {
        this.sync();
    }

    private sync() {
        this.shadowRoot
            ?.querySelector('[part="menu-label"]')
            ?.replaceChildren(this.getAttribute("menu-label") || defaults["menu-label"]);
        this.setAriaLabel("navigation", "navigation-label");
        this.setAriaLabel("menu-navigation", "menu-navigation-label");
    }

    private setAriaLabel(part: string, attribute: string) {
        const element = this.shadowRoot?.querySelector<HTMLElement>(`[part="${part}"]`);
        element?.setAttribute("aria-label", this.getAttribute(attribute) || defaults[attribute]);
    }
}
