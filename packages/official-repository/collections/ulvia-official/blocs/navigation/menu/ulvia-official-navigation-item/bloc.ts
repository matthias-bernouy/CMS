import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    static get observedAttributes(): string[] {
        return ["active"];
    }

    constructor() {
        super({ css, template });
    }

    override connectedCallback(): void {
        this.sync();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private sync(): void {
        const control = this.querySelector<HTMLElement>(":scope > a, :scope > button");
        if (!control) {
            return;
        }
        const current = this.hasAttribute("active") || this.matchesCurrentLocation(control);
        this.toggleAttribute("data-current", current);
        if (current) {
            control.setAttribute("aria-current", "page");
        } else {
            control.removeAttribute("aria-current");
        }
    }

    private matchesCurrentLocation(control: HTMLElement): boolean {
        if (!(control instanceof HTMLAnchorElement) || !control.href || control.target) {
            return false;
        }
        const target = new URL(control.href, window.location.href);
        return (
            target.origin === window.location.origin &&
            normalizePath(target.pathname) === normalizePath(location.pathname)
        );
    }
}

function normalizePath(path: string): string {
    return path.length > 1 ? path.replace(/\/+$/u, "") : path;
}
