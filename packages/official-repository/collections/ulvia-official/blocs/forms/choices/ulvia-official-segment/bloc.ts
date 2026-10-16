import { BlocBehavior } from "@bernouy/cms-content/browser";

export class Bloc extends BlocBehavior {
    private root: Document | null = null;

    constructor(root: HTMLElement) {
        super(root);
    }

    override connectedCallback(): void {
        this.root = this.ownerDocument;
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
