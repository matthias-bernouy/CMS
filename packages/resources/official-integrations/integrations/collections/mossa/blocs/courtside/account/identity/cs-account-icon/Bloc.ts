import { Component } from "@bernouy/components/base";

const iconPaths: Record<string, string> = {
    listings:
        '<path d="M4 5h16M4 12h16M4 19h16"></path><circle cx="7" cy="5" r="1"></circle><circle cx="7" cy="12" r="1"></circle><circle cx="7" cy="19" r="1"></circle>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3"></path><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"></path>',
    offers: '<path d="M20 13 13 20a2 2 0 0 1-3 0l-6-6a2 2 0 0 1 0-3l7-7h7l2 2v7Z"></path><circle cx="15" cy="9" r="1"></circle>',
    profile: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
    purchases: '<path d="M6 8h12l1 13H5L6 8Z"></path><path d="M9 10V6a3 3 0 0 1 6 0v4"></path>',
    sales: '<path d="m21 8-9-5-9 5 9 5 9-5Z"></path><path d="m3 8 9 5 9-5v8l-9 5-9-5V8Z"></path>',
    wallet: '<path d="M4 6h15a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13"></path><path d="M16 12h5"></path><circle cx="16" cy="12" r="1"></circle>',
};

export class Bloc extends Component {
    static observedAttributes = ["name"];

    constructor() {
        super({
            css: ":host{display:inline-flex;width:1em;height:1em;color:inherit;vertical-align:-0.125em}span,svg{display:block;width:100%;height:100%}",
            template: '<span part="icon" aria-hidden="true"></span>',
        });
    }

    override connectedCallback(): void {
        this.renderIcon();
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.renderIcon();
        }
    }

    private renderIcon(): void {
        const icon = this.shadowRoot?.querySelector<HTMLElement>('[part="icon"]');
        if (!icon) {
            return;
        }
        const paths = iconPaths[this.getAttribute("name") || ""];
        icon.innerHTML = paths
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
            : "";
    }
}
