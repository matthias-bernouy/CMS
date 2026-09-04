import { Component } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class Bloc extends Component {
    static observedAttributes = ["match"];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.slotElement.addEventListener("slotchange", this.syncCurrent);
        window.addEventListener("popstate", this.syncCurrent);
        this.syncCurrent();
    }

    disconnectedCallback(): void {
        this.slotElement.removeEventListener("slotchange", this.syncCurrent);
        window.removeEventListener("popstate", this.syncCurrent);
    }

    attributeChangedCallback(): void {
        this.syncCurrent();
    }

    private readonly syncCurrent = (): void => {
        const anchor = this.querySelector<HTMLAnchorElement>(":scope > a[href]");
        if (!anchor) {
            return;
        }
        anchor.toggleAttribute("aria-current", this.isCurrent(anchor));
        if (anchor.hasAttribute("aria-current")) {
            anchor.setAttribute("aria-current", "page");
        }
    };

    private isCurrent(anchor: HTMLAnchorElement): boolean {
        let url: URL;
        try {
            url = new URL(anchor.href, location.href);
        } catch {
            return false;
        }
        if (url.origin !== location.origin) {
            return false;
        }
        const itemPath = normalize(url.pathname);
        const currentPath = normalize(location.pathname);
        if (itemPath === currentPath) {
            return true;
        }
        return this.getAttribute("match") === "prefix" && itemPath !== "/" && currentPath.startsWith(`${itemPath}/`);
    }

    private get slotElement(): HTMLSlotElement {
        return this.shadowRoot!.querySelector("slot")!;
    }
}

function normalize(path: string): string {
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}
