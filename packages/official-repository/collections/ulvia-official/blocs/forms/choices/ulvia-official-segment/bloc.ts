import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    private root: Document | ShadowRoot | null = null;

    constructor() {
        super({ css, template });
    }

    override connectedCallback(): void {
        this.root = this.getRootNode() as Document | ShadowRoot;
        this.root.addEventListener("change", this.syncFromGroup);
        this.root.addEventListener("reset", this.queueSync);
        this.syncState();
    }

    disconnectedCallback(): void {
        this.root?.removeEventListener("change", this.syncFromGroup);
        this.root?.removeEventListener("reset", this.queueSync);
        this.root = null;
    }

    private syncFromGroup = (event: Event): void => {
        if (event.target instanceof HTMLInputElement && event.target.type === "radio") {
            this.syncState();
        }
    };

    private queueSync = (): void => {
        window.setTimeout(() => this.syncState());
    };

    private syncState(): void {
        const input = this.querySelector<HTMLInputElement>('input[type="radio"]');
        this.toggleAttribute("data-selected", input?.checked === true);
        this.toggleAttribute("data-disabled", input?.disabled === true);
    }
}
