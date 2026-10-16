import { BlocBehavior } from "@bernouy/cms-content/browser";

export class Bloc extends BlocBehavior {
    static get observedAttributes(): string[] {
        return ["label"];
    }

    constructor(root: HTMLElement) {
        super(root);
        this.syncLabel();
    }

    attributeChangedCallback(): void {
        this.syncLabel();
    }

    private syncLabel(): void {
        this?.querySelector("nav")?.setAttribute("aria-label", this.getAttribute("label") || "Navigation");
    }
}
