import { BlocBehavior } from "@bernouy/cms-content/browser";

export class Bloc extends BlocBehavior {
    private input: HTMLInputElement | null = null;
    private observer = new MutationObserver(() => this.sync());

    constructor(root: HTMLElement) {
        super(root);
    }

    override connectedCallback(): void {
        this.input = this.querySelector<HTMLInputElement>('input[type="checkbox"][role="switch"]');
        this.input?.addEventListener("change", this.sync);
        if (this.input) {
            this.observer.observe(this.input, {
                attributes: true,
                attributeFilter: ["checked", "disabled", "aria-invalid"],
            });
        }
        this.sync();
    }

    disconnectedCallback(): void {
        this.input?.removeEventListener("change", this.sync);
        this.observer.disconnect();
    }

    private sync = (): void => {
        this.toggleAttribute("data-checked", this.input?.checked === true);
        this.toggleAttribute("data-disabled", this.input?.disabled === true);
        this.toggleAttribute("data-invalid", this.input?.getAttribute("aria-invalid") === "true");
    };
}
