import { createBlocScope, observeBlocAttributes } from "@bernouy/cms-content/browser";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    static get observedAttributes(): string[] {
        return ["expanded", "count"];
    }

    private trigger: HTMLButtonElement | null = null;
    private region: HTMLElement | null = null;
    private labelObserver: MutationObserver | null = null;

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
    }

    connect(): void {
        this.trigger = this.scope.querySelector("button");
        this.region = this.scope.querySelector('[part="region"]') ?? null;
        this.trigger?.addEventListener("click", this.toggle);
        this.labelObserver = new MutationObserver(this.sync);
        this.labelObserver.observe(this.blocRoot, { childList: true, characterData: true, subtree: true });
        this.sync();
    }

    disconnect(): void {
        this.trigger?.removeEventListener("click", this.toggle);
        this.labelObserver?.disconnect();
    }

    attributeChanged(): void {
        this.sync();
    }

    private toggle = (): void => {
        this.blocRoot.toggleAttribute("expanded");
    };

    private sync(): void {
        const expanded = this.blocRoot.hasAttribute("expanded");
        this.trigger?.setAttribute("aria-expanded", String(expanded));
        const label = this.trigger?.textContent?.trim();
        if (label) {
            this.trigger?.setAttribute("aria-label", label);
        }
        this.region?.setAttribute("aria-hidden", String(!expanded));
        if (this.region) {
            this.region.inert = !expanded;
        }

        const count = Number(this.blocRoot.getAttribute("count") || "0");
        if (count > 0) {
            this.trigger?.setAttribute("data-count", String(count));
        } else {
            this.trigger?.removeAttribute("data-count");
        }
    }
}

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    controller.connect();
    const stopObserving = observeBlocAttributes(root, Controller.observedAttributes, () =>
        controller.attributeChanged(),
    );
    return () => {
        stopObserving();
        controller.disconnect();
    };
}
