import { CMS_BLOC_FORM_CONTROL_READY_EVENT, createBlocScope } from "@bernouy/cms-content/browser";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private root: Document | null = null;

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
    }

    connect(): void {
        this.root = this.blocRoot.ownerDocument;
        this.blocRoot.addEventListener(CMS_BLOC_FORM_CONTROL_READY_EVENT, this.handleControlReady);
        this.root.addEventListener("change", this.syncFromGroup);
        this.root.addEventListener("reset", this.queueSync);
        this.syncState();
    }

    disconnect(): void {
        this.root?.removeEventListener("change", this.syncFromGroup);
        this.root?.removeEventListener("reset", this.queueSync);
        this.blocRoot.removeEventListener(CMS_BLOC_FORM_CONTROL_READY_EVENT, this.handleControlReady);
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

    private handleControlReady = (event: Event): void => {
        if (event.target === this.scope.queryBlocRoot("ulvia-official-radio")) {
            this.syncState();
        }
    };

    private syncState(): void {
        const controlRoot = this.scope.queryBlocRoot("ulvia-official-radio");
        const control = controlRoot ? this.scope.getFormControl(controlRoot) : this.scope.getFormControl(this.blocRoot);
        const input = control instanceof HTMLInputElement && control.type === "radio" ? control : null;
        this.blocRoot.toggleAttribute("data-selected", input?.checked === true);
        this.blocRoot.toggleAttribute("data-disabled", input?.disabled === true);
    }
}

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    controller.connect();
    return () => {
        controller.disconnect();
    };
}
