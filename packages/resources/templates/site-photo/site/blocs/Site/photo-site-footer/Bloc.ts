import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

const defaults: Record<string, string> = {
    "about-href": "/a-propos",
    "about-label": "À propos",
    "albums-href": "/albums",
    "albums-label": "Albums",
    "brand-href": "/",
    "brand-label": "Stillroom",
    copyright: "© 2026 Stillroom",
    "contact-href": "/contact",
    "contact-label": "Contact",
    description: "Studio photographique indépendant",
    location: "Brest, Bretagne",
    "legal-navigation-label": "Informations légales",
    "main-navigation-label": "Navigation du pied de page",
    "mentions-href": "/informations/mentions-legales",
    "mentions-label": "Mentions légales",
    "privacy-href": "/informations/confidentialite",
    "privacy-label": "Confidentialité",
    "cookies-href": "/informations/cookies",
    "cookies-label": "Cookies",
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
        if (!this.shadowRoot) {
            return;
        }
        for (const [attribute, fallback] of Object.entries(defaults)) {
            const value = this.getAttribute(attribute) || fallback;
            const key = attribute.replace(/-(href|label)$/, "");
            const property = attribute.endsWith("-href") ? "href" : "text";
            for (const element of this.shadowRoot.querySelectorAll<HTMLElement>(`[data-${property}="${key}"]`)) {
                if (property === "href" && element instanceof HTMLAnchorElement) {
                    element.href = value;
                } else {
                    element.textContent = value;
                }
            }
        }
        this.setAriaLabel("main-navigation", "main-navigation-label");
        this.setAriaLabel("legal-navigation", "legal-navigation-label");
    }

    private setAriaLabel(part: string, attribute: string) {
        const element = this.shadowRoot?.querySelector<HTMLElement>(`[part="${part}"]`);
        element?.setAttribute("aria-label", this.getAttribute(attribute) || defaults[attribute]);
    }
}
