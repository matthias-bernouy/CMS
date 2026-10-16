import { BlocBehavior } from "@bernouy/cms-content/browser";

export class Bloc extends BlocBehavior {
    static get observedAttributes(): string[] {
        return ["active"];
    }

    constructor(root: HTMLElement) {
        super(root);
    }

    override connectedCallback(): void {
        this.syncCurrentPage();
    }

    attributeChangedCallback(): void {
        this.syncCurrentPage();
    }

    private syncCurrentPage(): void {
        const link = this.querySelector<HTMLAnchorElement>(":scope > a");
        if (!link) {
            return;
        }
        if (this.hasAttribute("active")) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    }
}
