import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

const defaults: Record<string, string> = {
    copyright: "© 2026 Stillroom",
    description: "Studio photographique indépendant",
    location: "Brest, Bretagne",
    "legal-navigation-label": "Informations légales",
    "main-navigation-label": "Navigation du pied de page",
};

export class PhotoSiteFooter extends Component {
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
        for (const attribute of ["copyright", "description", "location"]) {
            this.shadowRoot
                ?.querySelector(`[data-text="${attribute}"]`)
                ?.replaceChildren(this.getAttribute(attribute) || defaults[attribute]);
        }
        this.setAriaLabel("main-navigation", "main-navigation-label");
        this.setAriaLabel("legal-navigation", "legal-navigation-label");
    }

    private setAriaLabel(part: string, attribute: string) {
        const element = this.shadowRoot?.querySelector<HTMLElement>(`[part="${part}"]`);
        element?.setAttribute("aria-label", this.getAttribute(attribute) || defaults[attribute]);
    }
}
