import {
    CMS_BLOC_FORM_CONTROL_READY_EVENT,
    createBlocScope,
    observeBlocAttributes,
} from "@bernouy/cms-content/browser";

const FIELD_VALUE_EVENT = "ulvia-official:field-value";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private rangeInput: HTMLInputElement | null = null;
    private manualInput: HTMLInputElement | null = null;
    private manualComponent: HTMLElement | null = null;
    private manualLabel: HTMLElement | null = null;
    private rangeElement: HTMLElement | null = null;
    private root: Document | null = null;
    private observer = new MutationObserver(() => this.sync());

    static get observedAttributes(): string[] {
        return ["size", "value-label", "value-placement"];
    }

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
    }

    connect(): void {
        this.manualLabel = this.scope.querySelector<HTMLElement>("[data-range-label]");
        this.root = this.blocRoot.ownerDocument;
        this.blocRoot.addEventListener(CMS_BLOC_FORM_CONTROL_READY_EVENT, this.handleControlReady);
        this.root.addEventListener("reset", this.handleReset);
        this.bindControls();
    }

    disconnect(): void {
        this.rangeInput?.removeEventListener("input", this.sync);
        this.rangeInput?.removeEventListener("change", this.sync);
        this.root?.removeEventListener("reset", this.handleReset);
        this.root = null;
        this.blocRoot.removeEventListener(CMS_BLOC_FORM_CONTROL_READY_EVENT, this.handleControlReady);
        this.manualInput?.removeEventListener("input", this.handleManualInput);
        this.manualInput?.removeEventListener("change", this.handleManualChange);
        this.observer.disconnect();
        this.publishFieldValue("", true);
    }

    attributeChanged(): void {
        this.sync();
    }

    private handleManualInput = (): void => {
        this.commitManualValue("input");
    };

    private handleManualChange = (): void => {
        this.commitManualValue("change");
    };

    private handleControlReady = (event: Event): void => {
        if (event.target === this.rangeElement || event.target === this.manualComponent) {
            this.bindControls();
        }
    };

    private bindControls(): void {
        this.rangeInput?.removeEventListener("input", this.sync);
        this.rangeInput?.removeEventListener("change", this.sync);
        this.manualInput?.removeEventListener("input", this.handleManualInput);
        this.manualInput?.removeEventListener("change", this.handleManualChange);
        this.observer.disconnect();
        this.rangeElement = this.scope.queryBlocRoot("ulvia-official-range");
        this.manualComponent = this.scope.queryBlocRoot("ulvia-official-input");
        const rangeControl = this.rangeElement ? this.scope.getFormControl(this.rangeElement) : null;
        const manualControl = this.manualComponent ? this.scope.getFormControl(this.manualComponent) : null;
        this.rangeInput =
            rangeControl instanceof HTMLInputElement && rangeControl.type === "range" ? rangeControl : null;
        this.manualInput = manualControl instanceof HTMLInputElement ? manualControl : null;
        this.rangeInput?.addEventListener("input", this.sync);
        this.rangeInput?.addEventListener("change", this.sync);
        this.manualInput?.addEventListener("input", this.handleManualInput);
        this.manualInput?.addEventListener("change", this.handleManualChange);
        if (this.rangeInput) {
            this.observer.observe(this.rangeInput, {
                attributes: true,
                attributeFilter: ["min", "max", "step", "value", "disabled"],
            });
        }
        if (this.rangeElement) {
            this.observer.observe(this.rangeElement, {
                attributes: true,
                attributeFilter: ["hide-value", "value-prefix", "value-suffix"],
            });
        }
        this.sync();
    }

    private commitManualValue(type: "input" | "change"): void {
        if (!this.rangeInput || !this.manualInput || this.rangeInput.disabled) {
            return;
        }
        const value = Number(this.manualInput.value);
        if (!Number.isFinite(value)) {
            return;
        }
        this.rangeInput.value = String(value);
        this.rangeInput.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
        this.sync();
    }

    private sync = (): void => {
        if (!this.rangeInput || !this.manualInput) {
            return;
        }
        this.manualInput.min = this.rangeInput.min;
        this.manualInput.max = this.rangeInput.max;
        this.manualInput.step = this.rangeInput.step || "1";
        this.manualInput.value = this.rangeInput.value;
        this.manualInput.disabled = this.rangeInput.disabled;
        this.manualComponent?.setAttribute("size", this.blocRoot.getAttribute("size") || "md");
        const valueLabel = this.blocRoot.getAttribute("value-label") || "Value";
        this.manualInput.setAttribute("aria-label", valueLabel);
        if (this.manualLabel) {
            this.manualLabel.textContent = valueLabel;
        }
        this.syncFieldValue();
    };

    private syncFieldValue(): void {
        const placeInField = this.blocRoot.getAttribute("value-placement") === "field";
        this.blocRoot.toggleAttribute("data-field-value", placeInField);
        if (!placeInField || !this.rangeInput || !this.rangeElement) {
            this.publishFieldValue("", true);
            return;
        }
        this.publishFieldValue(
            `${this.rangeElement.getAttribute("value-prefix") ?? ""}${this.rangeInput.value}${this.rangeElement.getAttribute("value-suffix") ?? ""}`,
            this.rangeElement.hasAttribute("hide-value"),
        );
    }

    private publishFieldValue(text: string, hidden: boolean): void {
        this.blocRoot.dispatchEvent(new CustomEvent(FIELD_VALUE_EVENT, { bubbles: true, detail: { hidden, text } }));
    }

    private handleReset = (event: Event): void => {
        if (event.target !== this.rangeInput?.form) {
            return;
        }
        window.setTimeout(this.sync);
    };
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
