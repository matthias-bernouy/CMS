import { createBlocScope } from "@bernouy/cms-content/browser";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private input: HTMLInputElement | null = null;
    private observer = new MutationObserver(() => this.sync());

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
    }

    connect(): void {
        this.input = this.scope.querySelector<HTMLInputElement>('input[type="checkbox"][role="switch"]');
        this.input?.addEventListener("change", this.sync);
        if (this.input) {
            this.observer.observe(this.input, {
                attributes: true,
                attributeFilter: ["checked", "disabled", "aria-invalid"],
            });
        }
        this.sync();
    }

    disconnect(): void {
        this.input?.removeEventListener("change", this.sync);
        this.observer.disconnect();
    }

    private sync = (): void => {
        this.blocRoot.toggleAttribute("data-checked", this.input?.checked === true);
        this.blocRoot.toggleAttribute("data-disabled", this.input?.disabled === true);
        this.blocRoot.toggleAttribute("data-invalid", this.input?.getAttribute("aria-invalid") === "true");
    };
}

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    controller.connect();
    return () => {
        controller.disconnect();
    };
}
