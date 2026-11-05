import { createBlocScope } from "@bernouy/cms-content/browser";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private textarea: HTMLTextAreaElement | null = null;
    private counter: HTMLElement | null;
    private root: Document | null = null;
    private observer = new MutationObserver(() => this.sync());

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
        this.counter = this.scope.querySelector('[part="count"]') ?? null;
    }

    connect(): void {
        this.root = this.blocRoot.ownerDocument;
        this.root.addEventListener("reset", this.handleReset);
        this.bindTextarea();
    }

    disconnect(): void {
        this.textarea?.removeEventListener("input", this.sync);
        this.root?.removeEventListener("reset", this.handleReset);
        this.root = null;
        this.observer.disconnect();
    }

    private bindTextarea = (): void => {
        this.textarea?.removeEventListener("input", this.sync);
        this.observer.disconnect();
        this.textarea = this.scope.querySelector<HTMLTextAreaElement>("textarea");
        this.textarea?.addEventListener("input", this.sync);
        if (this.textarea) {
            this.observer.observe(this.textarea, {
                attributes: true,
                attributeFilter: ["maxlength", "disabled"],
            });
        }
        this.sync();
    };

    private sync = (): void => {
        const limit = this.textarea?.maxLength ?? -1;
        const length = this.textarea?.value.length ?? 0;
        this.blocRoot.toggleAttribute("data-count-ready", limit > 0);
        if (this.counter) {
            this.counter.textContent = limit > 0 ? `${length} / ${limit}` : "";
        }
    };

    private handleReset = (event: Event): void => {
        if (event.target !== this.textarea?.form) {
            return;
        }
        window.setTimeout(this.sync);
    };
}

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    controller.connect();
    return () => {
        controller.disconnect();
    };
}
