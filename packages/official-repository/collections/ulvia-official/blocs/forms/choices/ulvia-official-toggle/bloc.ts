import { createBlocScope } from "@bernouy/cms-content/browser";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private input: HTMLInputElement | null = null;
    private observer = new MutationObserver(() => this.sync());

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
    }

    connect(): void {
        this.ensureStructure();
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

    private ensureStructure(): void {
        const input = this.scope.querySelector<HTMLInputElement>('input[type="checkbox"][role="switch"]');
        if (!input || this.scope.querySelector('[part="control"]')) {
            return;
        }
        const control = document.createElement("span");
        const track = document.createElement("span");
        const thumb = document.createElement("span");
        control.setAttribute("part", "control");
        track.setAttribute("part", "track");
        track.setAttribute("aria-hidden", "true");
        thumb.setAttribute("part", "thumb");
        track.append(thumb);
        input.before(control);
        control.append(input, track);
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
