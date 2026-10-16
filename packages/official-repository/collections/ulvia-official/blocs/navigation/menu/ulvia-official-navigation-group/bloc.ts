import { BlocBehavior } from "@bernouy/cms-content/browser";

export class Bloc extends BlocBehavior {
    static get observedAttributes(): string[] {
        return ["expanded", "count"];
    }

    private trigger: HTMLButtonElement | null = null;
    private region: HTMLElement | null = null;
    private labelObserver: MutationObserver | null = null;

    constructor(root: HTMLElement) {
        super(root);
    }

    override connectedCallback(): void {
        this.trigger = this.querySelector("button");
        this.region = this?.querySelector('[part="region"]') ?? null;
        this.trigger?.addEventListener("click", this.toggle);
        this.labelObserver = new MutationObserver(this.sync);
        this.labelObserver.observe(this.blocRoot, { childList: true, characterData: true, subtree: true });
        this.sync();
    }

    disconnectedCallback(): void {
        this.trigger?.removeEventListener("click", this.toggle);
        this.labelObserver?.disconnect();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private toggle = (): void => {
        this.toggleAttribute("expanded");
    };

    private sync(): void {
        const expanded = this.hasAttribute("expanded");
        this.trigger?.setAttribute("aria-expanded", String(expanded));
        const label = this.trigger?.textContent?.trim();
        if (label) {
            this.trigger?.setAttribute("aria-label", label);
        }
        this.region?.setAttribute("aria-hidden", String(!expanded));
        if (this.region) {
            this.region.inert = !expanded;
        }

        const count = Number(this.getAttribute("count") || "0");
        if (count > 0) {
            this.trigger?.setAttribute("data-count", String(count));
        } else {
            this.trigger?.removeAttribute("data-count");
        }
    }
}
