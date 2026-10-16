import { createBlocScope } from "@bernouy/cms-content/browser";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private root: Document | null = null;
    private list: HTMLElement | null = null;
    private resizeObserver = new ResizeObserver(() => this.queueIndicator());

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
    }

    connect(): void {
        this.root = this.blocRoot.ownerDocument;
        this.list = this.scope.queryBlocRoot("ulvia-official-option-list");
        this.root.addEventListener("change", this.handleChange);
        if (this.list) {
            this.resizeObserver.observe(this.list);
        }
        this.queueIndicator();
    }

    disconnect(): void {
        this.root?.removeEventListener("change", this.handleChange);
        this.resizeObserver.disconnect();
        this.root = null;
        this.list = null;
    }

    private handleChange = (event: Event): void => {
        if (event.target instanceof HTMLInputElement && this.blocRoot.contains(event.target)) {
            this.queueIndicator();
        }
    };

    private queueIndicator(): void {
        requestAnimationFrame(() => this.positionIndicator());
    }

    private positionIndicator(): void {
        if (!this.list) {
            return;
        }
        const selected = this.scope
            .queryBlocRoots("ulvia-official-segment")
            .find((segment) => segment.hasAttribute("data-selected"));
        if (!selected) {
            this.list.style.setProperty("--ulvia-official-option-list-indicator-opacity", "0");
            return;
        }
        const listRect = this.list.getBoundingClientRect();
        const selectedRect = selected.getBoundingClientRect();
        this.list.style.setProperty(
            "--ulvia-official-option-list-indicator-inline-start",
            `${selectedRect.left - listRect.left}px`,
        );
        this.list.style.setProperty(
            "--ulvia-official-option-list-indicator-block-start",
            `${selectedRect.top - listRect.top}px`,
        );
        this.list.style.setProperty("--ulvia-official-option-list-indicator-width", `${selectedRect.width}px`);
        this.list.style.setProperty("--ulvia-official-option-list-indicator-height", `${selectedRect.height}px`);
        this.list.style.setProperty("--ulvia-official-option-list-indicator-opacity", "1");
    }
}

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    controller.connect();
    return () => {
        controller.disconnect();
    };
}
