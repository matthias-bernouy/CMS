import { createBlocScope, observeBlocAttributes } from "@bernouy/cms-content/browser";
import { DatePicker } from "./runtime/datePicker";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private input: HTMLInputElement | null = null;
    private dateUi: HTMLElement | null;
    private datePicker: DatePicker | null = null;
    private observer = new MutationObserver(() => this.syncState());

    static get observedAttributes(): string[] {
        return ["locale", "today-label", "clear-label", "previous-month-label", "next-month-label"];
    }

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
        this.dateUi = this.scope.querySelector('[part="date-ui"]') ?? null;
    }

    connect(): void {
        this.bindInput();
    }

    disconnect(): void {
        this.observer.disconnect();
        this.datePicker?.disconnect();
        this.datePicker = null;
    }

    attributeChanged(): void {
        this.datePicker?.sync();
    }

    private bindInput = (): void => {
        this.observer.disconnect();
        this.datePicker?.disconnect();
        this.datePicker = null;
        this.input = this.scope.querySelector<HTMLInputElement>("input");
        if (this.input) {
            this.observer.observe(this.input, {
                attributes: true,
                attributeFilter: [
                    "aria-invalid",
                    "disabled",
                    "max",
                    "min",
                    "placeholder",
                    "readonly",
                    "required",
                    "type",
                ],
            });
        }
        this.syncState();
    };

    private syncState(): void {
        const customDate = this.input?.type === "date";
        if (customDate && this.input && !this.datePicker) {
            this.datePicker = new DatePicker(this.blocRoot, this.input, this.blocRoot);
            this.datePicker.connect();
        } else if (!customDate && this.datePicker) {
            this.datePicker.disconnect();
            this.datePicker = null;
        }
        this.dateUi?.toggleAttribute("hidden", !customDate);
        this.blocRoot.toggleAttribute("data-custom-date", customDate);
        this.blocRoot.toggleAttribute("data-disabled", this.input?.disabled === true);
        this.blocRoot.toggleAttribute("data-invalid", this.input?.getAttribute("aria-invalid") === "true");
        this.datePicker?.sync();
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
