import { Component, upgradeProperty } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import baseCss from "./base.css" with { type: "text" };
import variantCss from "./variant.css" with { type: "text" };
import { SelectKeyboard } from "./domain/keyboard";
import { buildOptionList, setValue } from "./domain/options";
import { SelectPopover } from "./domain/popover";
import { P9rSelectView } from "./P9rSelectView";

const css = baseCss + variantCss;

export class P9rSelect extends Component {
    static formAssociated = true;
    static readonly observedAttributes = [
        "value",
        "label",
        "aria-label",
        "disabled",
        "required",
        "invalid",
        "hint",
        "hint-level",
    ];

    private readonly internals: ElementInternals;
    private readonly view: P9rSelectView;
    private readonly keyboard: SelectKeyboard;
    private readonly popoverController: SelectPopover;
    private options: HTMLElement[] = [];
    private currentValue = "";
    private defaultValue = "";
    private defaultsCaptured = false;
    private formDisabled = false;
    private showValidationMessage = false;

    constructor() {
        super({ css, template: template as unknown as string });
        this.internals = this.attachInternals();
        this.view = new P9rSelectView(this.shadowRoot!, this.internals);
        this.keyboard = new SelectKeyboard(
            this.view,
            () => this.options,
            () => this.currentValue,
            this.select,
        );
        this.popoverController = new SelectPopover(this.view, this.keyboard);
    }

    override connectedCallback(): void {
        for (const property of ["value", "disabled"]) {
            upgradeProperty(this, property);
        }
        this.optionSlot?.addEventListener("slotchange", this.onSlot);
        this.view.trigger?.addEventListener("keydown", this.onKeydown);
        this.popoverController.connect();
        this.addEventListener("invalid", this.onInvalid);
        this.syncFromSlot();
        if (!this.defaultsCaptured) {
            this.defaultValue = this.currentValue;
            this.defaultsCaptured = true;
        }
        this.syncAttributes();
    }

    disconnectedCallback(): void {
        this.optionSlot?.removeEventListener("slotchange", this.onSlot);
        this.view.trigger?.removeEventListener("keydown", this.onKeydown);
        this.removeEventListener("invalid", this.onInvalid);
        this.popoverController.disconnect();
    }

    attributeChangedCallback(name: string, _oldValue: string | null, value: string | null): void {
        if (name === "value") {
            this.value = value ?? "";
        } else {
            this.syncAttributes();
        }
    }

    get value(): string {
        return this.currentValue;
    }

    set value(value: string) {
        const option = this.options.find((item) => item.dataset.value === value);
        if (option) {
            this.setValue(value, option.textContent ?? value);
        } else if (this.options.length === 0) {
            this.currentValue = value;
            this.view.setFormValue(value);
        }
    }

    get name(): string | null {
        return this.getAttribute("name");
    }

    get disabled(): boolean {
        return this.hasAttribute("disabled");
    }

    set disabled(value: boolean) {
        value ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }

    override focus(): void {
        this.view.focus();
    }

    formDisabledCallback(disabled: boolean): void {
        this.formDisabled = disabled;
        this.syncAttributes();
    }

    formResetCallback(): void {
        this.showValidationMessage = false;
        this.value = this.defaultValue;
    }

    formStateRestoreCallback(state: string | File | FormData | null): void {
        if (typeof state === "string") {
            this.value = state;
        }
    }

    private syncFromSlot = (): void => {
        const result = buildOptionList(this, this.view.list, this.select);
        this.options = result.options;
        const requestedValue = this.getAttribute("value") ?? this.currentValue;
        const requestedOption = this.options.find((item) => item.dataset.value === requestedValue);
        if (requestedOption) {
            this.setValue(requestedValue, requestedOption.textContent ?? "");
        } else if (result.initialValue !== null) {
            this.setValue(result.initialValue, result.initialLabel);
        } else {
            this.setValue("", "");
        }
    };

    private readonly select = (value: string, label: string): void => {
        this.setValue(value, label);
        this.view.hide();
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    };

    private setValue(value: string, label: string): void {
        this.currentValue = value;
        this.showValidationMessage = false;
        this.view.setFormValue(value);
        setValue(this.options, this.view.display, value, label);
        this.view.syncValidity(this, value, false);
    }

    private syncAttributes(): void {
        this.view.syncAttributes(
            this,
            this.currentValue,
            this.disabled || this.formDisabled,
            this.showValidationMessage,
        );
    }

    private readonly onKeydown = (event: KeyboardEvent): void => {
        this.keyboard.handle(event, this.popoverController.isOpen, () => this.popoverController.open());
    };

    private readonly onInvalid = (event: Event): void => {
        if (event.target === this) {
            this.showValidationMessage = true;
            this.view.syncValidity(this, this.currentValue, true);
        }
    };

    private get optionSlot(): HTMLSlotElement | null {
        return this.shadowRoot?.querySelector("slot") ?? null;
    }

    private readonly onSlot = (): void => this.syncFromSlot();
}
