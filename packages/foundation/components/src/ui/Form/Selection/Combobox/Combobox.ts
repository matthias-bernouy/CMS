import { Component, upgradeProperty } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import baseCss from "./base.css" with { type: "text" };
import listCss from "./list.css" with { type: "text" };
import { ComboboxKeyboard, comboItemsFor, comboOptionsFrom } from "./list";
import type { ComboItem, ComboOption } from "./types";
import { ComboboxView, type ComboboxHandlers } from "./ComboboxView";

export class Combobox extends Component {
    static formAssociated = true;
    static readonly observedAttributes = [
        "value",
        "label",
        "aria-label",
        "placeholder",
        "disabled",
        "required",
        "invalid",
        "hint",
        "hint-level",
        "creatable",
    ];
    private readonly view: ComboboxView;
    private readonly keyboard: ComboboxKeyboard;
    private options: ComboOption[] = [];
    private items: ComboItem[] = [];
    private selectedValue = "";
    private selectedLabel = "";
    private defaultValue = "";
    private defaultsCaptured = false;
    private showValidationMessage = false;

    constructor() {
        super({ css: baseCss + listCss, template: template as unknown as string });
        this.view = new ComboboxView(this.shadowRoot, this.attachInternals());
        this.keyboard = new ComboboxKeyboard(
            this.view,
            () => this.items,
            () => this.view.input?.value.trim() ?? "",
            (query) => this.renderList(query),
            this.selectItem,
            () => this.syncDisplay(),
        );
    }

    override connectedCallback(): void {
        for (const property of ["value", "disabled", "required"]) {
            upgradeProperty(this, property);
        }
        this.view.connect(this.handlers);
        this.syncOptions();
        if (!this.defaultsCaptured) {
            this.defaultValue = this.value;
            this.defaultsCaptured = true;
        }
        this.addEventListener("invalid", this.onInvalid);
        this.syncAttributes();
    }

    disconnectedCallback(): void {
        this.view.disconnect(this.handlers);
        this.removeEventListener("invalid", this.onInvalid);
    }

    attributeChangedCallback(name: string, _oldValue: string | null, value: string | null): void {
        if (name === "value") {
            this.value = value ?? "";
        } else {
            this.syncAttributes();
        }
    }

    get value(): string {
        return this.selectedValue;
    }
    set value(value: string) {
        this.selectedValue = value ?? "";
        this.selectedLabel =
            this.options.find((item) => item.value === this.selectedValue)?.label ?? this.selectedValue;
        this.syncDisplay();
    }
    get disabled(): boolean {
        return this.hasAttribute("disabled");
    }
    set disabled(value: boolean) {
        value ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }
    get required(): boolean {
        return this.hasAttribute("required");
    }
    set required(value: boolean) {
        value ? this.setAttribute("required", "") : this.removeAttribute("required");
    }
    override focus(): void {
        this.view.input?.focus();
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

    private readonly handlers: ComboboxHandlers = {
        focus: () => {
            this.view.input?.select();
            this.renderList("");
        },
        input: () => {
            this.view.syncClearButtonForInput();
            this.keyboard.reset();
            this.renderList(this.keyboard.query);
        },
        keydown: (event) => this.keyboard.handle(event),
        blur: () =>
            window.setTimeout(() => {
                this.keyboard.hide();
                this.syncDisplay();
            }, 120),
        clear: (event) => {
            event.preventDefault();
            this.selectItem({ kind: "option", value: "", label: "", disabled: false });
            this.view.input?.focus();
        },
        options: () => this.syncOptions(),
    };

    private syncAttributes(): void {
        this.view.syncAttributes(this, this.disabled);
        this.syncDisplay();
    }

    private syncOptions(): void {
        this.options = comboOptionsFrom(this);
        this.value = this.getAttribute("value") ?? this.selectedValue;
    }

    private syncDisplay(): void {
        this.view.syncDisplay(this.selectedValue, this.selectedLabel);
        if (this.selectedValue) {
            this.showValidationMessage = false;
        }
        this.view.syncValidity(this, this.selectedValue, this.showValidationMessage);
    }

    private renderList(query: string): void {
        this.items = comboItemsFor(this.options, query, this.hasAttribute("creatable"));
        this.view.renderList(this.items, this.keyboard.activeIndex, this.selectedValue, this.selectItem);
    }

    private readonly selectItem = (item: ComboItem): void => {
        this.selectedValue = item.value;
        this.selectedLabel = item.kind === "create" ? item.value : item.label;
        if (this.view.input) {
            this.view.input.value = this.selectedLabel;
        }
        this.syncDisplay();
        this.keyboard.hide();
        this.dispatchEvent(
            new CustomEvent("change", {
                bubbles: true,
                composed: true,
                detail: { value: item.value, label: this.selectedLabel, created: item.kind === "create" },
            }),
        );
    };

    private readonly onInvalid = (event: Event): void => {
        if (event.target === this) {
            this.showValidationMessage = true;
            this.view.syncValidity(this, this.selectedValue, true);
        }
    };
}
