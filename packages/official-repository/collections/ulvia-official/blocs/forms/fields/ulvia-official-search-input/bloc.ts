import {
    CMS_BLOC_FORM_CONTROL_READY_EVENT,
    createBlocScope,
    observeBlocAttributes,
} from "@bernouy/cms-content/browser";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private input: HTMLInputElement | null = null;
    private clearButton: HTMLButtonElement | null = null;
    private root: Document | null = null;
    private submitTimer: number | undefined;

    static get observedAttributes(): string[] {
        return ["clear-label"];
    }

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
    }

    connect(): void {
        this.clearButton = this.scope.querySelector<HTMLButtonElement>("[data-search-clear]");
        this.root = this.blocRoot.ownerDocument;
        this.blocRoot.addEventListener(CMS_BLOC_FORM_CONTROL_READY_EVENT, this.handleControlReady);
        this.root.addEventListener("reset", this.handleReset);
        this.clearButton?.addEventListener("click", this.clearSearch);
        this.bindInput();
    }

    disconnect(): void {
        this.input?.removeEventListener("input", this.handleInput);
        this.blocRoot.removeEventListener(CMS_BLOC_FORM_CONTROL_READY_EVENT, this.handleControlReady);
        this.root?.removeEventListener("reset", this.handleReset);
        this.root = null;
        this.clearButton?.removeEventListener("click", this.clearSearch);
        window.clearTimeout(this.submitTimer);
    }

    attributeChanged(): void {
        this.syncValue();
    }

    private prepareInput(): void {
        if (!this.input) {
            return;
        }
        this.input.type = "text";
        this.input.setAttribute("role", "searchbox");
        if (!this.input.enterKeyHint) {
            this.input.enterKeyHint = "search";
        }
    }

    private bindInput(): void {
        this.input?.removeEventListener("input", this.handleInput);
        const controlRoot = this.scope.queryBlocRoot("ulvia-official-input");
        const control = controlRoot ? this.scope.getFormControl(controlRoot) : this.scope.getFormControl(this.blocRoot);
        this.input = control instanceof HTMLInputElement ? control : null;
        this.prepareInput();
        this.input?.addEventListener("input", this.handleInput);
        this.syncValue();
    }

    private handleControlReady = (event: Event): void => {
        if (event.target === this.scope.queryBlocRoot("ulvia-official-input")) {
            this.bindInput();
        }
    };

    private handleInput = (): void => {
        this.syncValue();
        if (!this.blocRoot.hasAttribute("auto-submit")) {
            return;
        }
        window.clearTimeout(this.submitTimer);
        const configuredDelay = Number(this.blocRoot.getAttribute("submit-delay") ?? "300");
        const delay = Number.isFinite(configuredDelay) ? Math.max(0, configuredDelay) : 300;
        this.submitTimer = window.setTimeout(() => this.input?.form?.requestSubmit(), delay);
    };

    private clearSearch = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        if (!this.input || this.input.disabled || this.input.readOnly) {
            return;
        }
        this.input.value = "";
        this.input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        this.input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        this.input.dispatchEvent(new Event("search", { bubbles: true, composed: true }));
        this.input.focus();
    };

    private handleReset = (event: Event): void => {
        if (event.target !== this.input?.form) {
            return;
        }
        window.clearTimeout(this.submitTimer);
        window.setTimeout(() => this.syncValue());
    };

    private syncValue(): void {
        this.clearButton?.toggleAttribute("hidden", !this.input?.value);
        this.clearButton?.setAttribute("aria-label", this.blocRoot.getAttribute("clear-label") || "Clear search");
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
