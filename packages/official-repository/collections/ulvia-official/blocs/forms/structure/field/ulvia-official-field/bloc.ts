import {
    CMS_BLOC_FORM_CONTROL_READY_EVENT,
    createBlocScope,
    connectBlocFormControl,
    requestBlocFormControl,
} from "@bernouy/cms-content/browser";

const FIELD_VALUE_EVENT = "ulvia-official:field-value";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
    }

    connect(): void {
        this.blocRoot.addEventListener(CMS_BLOC_FORM_CONTROL_READY_EVENT, this.handleControlReady);
        this.blocRoot.addEventListener(FIELD_VALUE_EVENT, this.handleFieldValue);
        this.connectControl();
    }

    disconnect(): void {
        this.blocRoot.removeEventListener(CMS_BLOC_FORM_CONTROL_READY_EVENT, this.handleControlReady);
        this.blocRoot.removeEventListener(FIELD_VALUE_EVENT, this.handleFieldValue);
    }

    private handleControlReady = (event: Event): void => {
        const root = event.target;
        if (
            root instanceof HTMLElement &&
            root !== this.blocRoot &&
            root.parentElement?.closest('[cms-bloc="ulvia-official-field"]') === this.blocRoot
        ) {
            this.connectControl();
        }
    };

    private connectControl(): void {
        const label = this.scope.querySelector<HTMLLabelElement>('label[part~="field-label"]');
        if (!label) {
            return;
        }
        const descriptions = this.scope.querySelectorAll<HTMLElement>(
            '[part~="field-description"], [part~="field-error"]',
        );
        const roots = Array.from(this.blocRoot.querySelectorAll<HTMLElement>("[cms-bloc]"));
        const controlRoot = roots.find(
            (root) =>
                root.parentElement?.closest('[cms-bloc="ulvia-official-field"]') === this.blocRoot &&
                requestBlocFormControl(root),
        );
        if (controlRoot) {
            connectBlocFormControl(controlRoot, { label, descriptions });
        }
    }

    private handleFieldValue = (event: Event): void => {
        if (!(event instanceof CustomEvent) || !(event.target instanceof HTMLElement)) {
            return;
        }
        if (event.target.parentElement?.closest("[cms-bloc]") !== this.blocRoot) {
            return;
        }
        const output = this.scope.querySelector<HTMLElement>("[data-field-value]");
        if (!output) {
            return;
        }
        const detail = event.detail as { hidden?: unknown; text?: unknown };
        output.textContent = typeof detail.text === "string" ? detail.text : "";
        output.toggleAttribute("hidden", detail.hidden !== false);
    };
}

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    controller.connect();
    return () => {
        controller.disconnect();
    };
}
