import { Component, upgradeProperty } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import baseCss from "../../Selection/Combobox/base.css" with { type: "text" };
import listCss from "../../Selection/Combobox/list.css" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { comboOptionsFrom, createPromptItem, emptyItem } from "../../Selection/Combobox/list";
import type { ComboItem, ComboOption } from "../../Selection/Combobox/types";
import { dispatchTokenChange } from "./tokenEvents";
import { RemoteTokenOptions } from "./remoteOptions";
import { parseTokens, tokenItemsFor, tokenValue } from "./tokens";
import { TokenInputView, type TokenInputHandlers } from "./TokenInputView";

export class TokenInput extends Component {
    static formAssociated = true;
    static readonly observedAttributes = [
        "value",
        "label",
        "aria-label",
        "placeholder",
        "hint",
        "hint-level",
        "invalid",
        "required",
        "disabled",
        "creatable",
        "api",
        "resource",
    ];

    private readonly view: TokenInputView;
    private readonly remoteOptions: RemoteTokenOptions;
    private options: ComboOption[] = [];
    private items: ComboItem[] = [];
    private selected: string[] = [];
    private activeIndex = -1;
    private inputFocused = false;
    private defaultValue = "";
    private defaultsCaptured = false;
    private showValidationMessage = false;

    constructor() {
        super({ css: baseCss + listCss + css, template: template as unknown as string });
        this.view = new TokenInputView(this.shadowRoot, this.attachInternals());
        this.remoteOptions = new RemoteTokenOptions(this, () => this.syncOptions());
    }

    override connectedCallback(): void {
        for (const property of ["value", "disabled"]) {
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
        this.remoteOptions.connect();
    }

    disconnectedCallback(): void {
        this.remoteOptions.disconnect();
        this.view.disconnect(this.handlers);
        this.removeEventListener("invalid", this.onInvalid);
    }

    attributeChangedCallback(name: string, _oldValue: string | null, value: string | null): void {
        if (name === "value") {
            this.value = value ?? "";
        } else {
            this.syncAttributes();
            if ((name === "api" || name === "resource") && this.isConnected) {
                this.remoteOptions.reload();
            }
        }
    }

    get value(): string {
        return tokenValue(this.selected);
    }
    set value(value: string) {
        this.selected = parseTokens(value);
        this.syncDisplay();
    }
    get values(): string[] {
        return [...this.selected];
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

    private readonly handlers: TokenInputHandlers = {
        focus: () => {
            this.inputFocused = true;
            this.renderList(this.query);
        },
        input: () => {
            this.activeIndex = -1;
            this.renderList(this.query);
        },
        keydown: (event) => this.onKeydown(event),
        blur: () => {
            this.commitPendingValue();
            this.inputFocused = false;
            window.setTimeout(() => this.hideList(), 120);
        },
        create: (event) => this.onCreate(event),
        options: () => this.syncOptions(),
    };

    private syncAttributes(): void {
        this.view.syncAttributes(this, this.disabled, this.selected.length);
        this.syncDisplay();
    }

    private syncOptions(): void {
        this.options = this.remoteOptions.merge(comboOptionsFrom(this));
        this.value = this.getAttribute("value") ?? this.value;
        if (this.inputFocused) {
            this.renderList(this.query);
        }
    }

    private syncDisplay(): void {
        this.view.syncDisplay(this.value, this.selected, this.options, this.removeValue);
        if (this.selected.length > 0) {
            this.showValidationMessage = false;
        }
        this.view.syncAttributes(
            this,
            this.disabled,
            this.selected.length,
            this.hasAttribute("creatable") && this.options.length > 0,
        );
        this.view.syncValidity(this, this.selected.length, this.showValidationMessage);
    }

    private renderList(query: string): void {
        if (this.hasAttribute("creatable") && this.options.length === 0) {
            this.hideList();
            return;
        }
        this.items = tokenItemsFor(this.options, this.selected, query, this.hasAttribute("creatable"));
        const emptyState = this.hasAttribute("creatable")
            ? createPromptItem("Type to create", () => this.view.input?.focus())
            : emptyItem();
        this.view.renderList(this.items, this.activeIndex, this.selectItem, emptyState);
    }

    private readonly selectItem = (item: ComboItem): void => {
        if (!this.selected.includes(item.value)) {
            this.selected.push(item.value);
        }
        if (this.view.input) {
            this.view.input.value = "";
        }
        this.activeIndex = -1;
        this.syncDisplay();
        this.hideList();
        dispatchTokenChange(this, this.value, this.values, item.kind === "create");
    };

    private readonly removeValue = (value: string): void => {
        if (!value) {
            return;
        }
        this.selected = this.selected.filter((item) => item !== value);
        this.syncDisplay();
        dispatchTokenChange(this, this.value, this.values, false);
        this.view.input?.focus();
    };

    private onCreate(event: MouseEvent): void {
        event.preventDefault();
        if (this.query) {
            this.selectItem({ kind: "create", value: this.query, label: this.query, disabled: false });
        } else {
            this.view.input?.focus();
            this.renderList("");
        }
    }

    private commitPendingValue(): void {
        const query = this.query;
        if (!query || !this.hasAttribute("creatable")) {
            return;
        }
        if (this.selected.includes(query)) {
            if (this.view.input) {
                this.view.input.value = "";
            }
            return;
        }
        const normalized = query.toLowerCase();
        const option = this.options.find(
            (item) => !item.disabled && (item.value === query || item.label.toLowerCase() === normalized),
        );
        this.selectItem(
            option ? { ...option, kind: "option" } : { kind: "create", value: query, label: query, disabled: false },
        );
    }

    private onKeydown(event: KeyboardEvent): void {
        if (
            (event.key === "Enter" || event.key === ",") &&
            this.hasAttribute("creatable") &&
            this.options.length === 0 &&
            this.query
        ) {
            event.preventDefault();
            this.selectItem({ kind: "create", value: this.query, label: this.query, disabled: false });
            return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            this.moveActive(event);
        } else if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            const item = this.items[this.activeIndex] ?? this.items[0];
            if (item) {
                this.selectItem(item);
            }
        } else if (event.key === "Escape") {
            event.preventDefault();
            this.hideList();
        } else if (event.key === "Backspace" && !this.view.input?.value) {
            this.removeValue(this.selected.at(-1) ?? "");
        }
    }

    private moveActive(event: KeyboardEvent): void {
        event.preventDefault();
        if (this.view.listHidden) {
            this.renderList(this.query);
        }
        if (this.items.length === 0) {
            return;
        }
        const step = event.key === "ArrowDown" ? 1 : -1;
        this.activeIndex = Math.max(0, Math.min(this.items.length - 1, this.activeIndex + step));
        this.renderList(this.query);
        this.view.input?.setAttribute("aria-activedescendant", `option-${this.activeIndex}`);
    }

    private hideList(): void {
        this.view.hideList();
        this.activeIndex = -1;
    }

    private get query(): string {
        return this.view.input?.value.trim() ?? "";
    }

    private readonly onInvalid = (event: Event): void => {
        if (event.target === this) {
            this.showValidationMessage = true;
            this.view.syncValidity(this, this.selected.length, true);
        }
    };
}
