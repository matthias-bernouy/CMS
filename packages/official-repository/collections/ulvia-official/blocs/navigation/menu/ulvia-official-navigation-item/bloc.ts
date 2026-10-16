import { BlocBehavior } from "@bernouy/cms-content/browser";

export class Bloc extends BlocBehavior {
    static get observedAttributes(): string[] {
        return ["active"];
    }

    constructor(root: HTMLElement) {
        super(root);
    }

    override connectedCallback(): void {
        this.sync();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private sync(): void {
        const control = this.blocRoot.matches("a, button") ? this.blocRoot : null;
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
        const current = new URL(window.location.href);
        return (
            target.origin === current.origin &&
            normalizePath(target.pathname) === normalizePath(current.pathname) &&
            Array.from(target.searchParams).every(([name, value]) => current.searchParams.getAll(name).includes(value))
        );
    }
}

function normalizePath(path: string): string {
    return path.length > 1 ? path.replace(/\/+$/u, "") : path;
}
