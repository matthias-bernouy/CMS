import { Component, upgradeProperty } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export const NAV_TAB_ACTIVE_EVENT = "p9r-nav-tab-active";

export class NavTab extends Component {
    private readonly link: HTMLAnchorElement;
    private readonly countElement: HTMLElement;

    static get observedAttributes(): string[] {
        return ["href", "active", "count", "aria-label"];
    }

    constructor() {
        super({ css, template: template as unknown as string });
        this.link = this.shadowRoot!.querySelector("a")!;
        this.countElement = this.shadowRoot!.querySelector(".count")!;
    }

    override connectedCallback(): void {
        for (const property of ["href", "active", "count"]) {
            upgradeProperty(this, property);
        }
        this.sync();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    get href(): string | null {
        return this.getAttribute("href");
    }

    set href(value: string | null) {
        value === null ? this.removeAttribute("href") : this.setAttribute("href", value);
    }

    get active(): boolean {
        return this.hasAttribute("active");
    }

    set active(value: boolean) {
        this.toggleAttribute("active", value);
    }

    get count(): string | null {
        return this.getAttribute("count");
    }

    set count(value: string | null) {
        value === null ? this.removeAttribute("count") : this.setAttribute("count", value);
    }

    private sync(): void {
        const href = this.getAttribute("href");
        if (href) {
            this.link.setAttribute("href", href);
        } else {
            this.link.removeAttribute("href");
        }
        if (this.hasAttribute("active")) {
            this.link.setAttribute("aria-current", "page");
            if (this.isConnected) {
                this.dispatchEvent(
                    new CustomEvent(NAV_TAB_ACTIVE_EVENT, {
                        bubbles: true,
                        composed: true,
                        detail: { tab: this },
                    }),
                );
            }
        } else {
            this.link.removeAttribute("aria-current");
        }
        const count = this.getAttribute("count")?.trim() ?? "";
        this.countElement.textContent = count;
        this.countElement.toggleAttribute("hidden", !count);
        const label = this.getAttribute("aria-label")?.trim();
        if (label) {
            this.link.setAttribute("aria-label", label);
        } else {
            this.link.removeAttribute("aria-label");
        }
    }
}
