import { Component, upgradeProperty } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import baseCss from "./base.css" with { type: "text" };
import listCss from "./list.css" with { type: "text" };
import { comboItemsFor, comboOptionsFrom } from "./list";
import type { ComboItem, ComboOption } from "./types";
import { ComboboxView, type ComboboxHandlers } from "./ComboboxView";

export class Combobox extends Component {
    static formAssociated = true;
    static get observedAttributes(): string[] {
        return ["value", "label", "placeholder", "disabled", "creatable"];
    }

    private readonly view: ComboboxView;
    private options: ComboOption[] = [];
    private items: ComboItem[] = [];
    private activeIndex = -1;
    private selectedValue = "";
    private selectedLabel = "";

    constructor() {
        super({ css: baseCss + listCss, template: template as unknown as string });
        this.view = new ComboboxView(this.shadowRoot, this.attachInternals());
    }

    override connectedCallback(): void {
        for (const property of ["value", "disabled"]) {
            upgradeProperty(this, property);
        }
        this.view.connect(this.handlers);
        this.syncOptions();
        this.syncAttributes();
    }

    disconnectedCallback(): void {
        this.view.disconnect(this.handlers);
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
    override focus(): void {
        this.view.input?.focus();
    }

    private readonly handlers: ComboboxHandlers = {
        focus: () => this.renderList(this.query),
        input: () => {
            this.view.syncClearButtonForInput();
            this.activeIndex = -1;
            this.renderList(this.query);
        },
        keydown: (event) => this.onKeydown(event),
        blur: () =>
            window.setTimeout(() => {
                this.hideList();
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
    }

    private renderList(query: string): void {
        this.items = comboItemsFor(this.options, query);
        if (this.items.length === 0 && query && this.hasAttribute("creatable")) {
            this.items = [{ kind: "create", value: query, label: `Add "${query}"`, disabled: false }];
        }
        this.view.renderList(this.items, this.activeIndex, this.selectedValue, this.selectItem);
    }

    private readonly selectItem = (item: ComboItem): void => {
        this.selectedValue = item.value;
        this.selectedLabel = item.kind === "create" ? item.value : item.label;
        if (this.view.input) {
            this.view.input.value = this.selectedLabel;
        }
        this.syncDisplay();
        this.hideList();
        this.dispatchEvent(
            new CustomEvent("change", {
                bubbles: true,
                composed: true,
                detail: { value: item.value, label: this.selectedLabel, created: item.kind === "create" },
            }),
        );
    };

    private onKeydown(event: KeyboardEvent): void {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            this.moveActive(event);
        } else if (event.key === "Enter") {
            const item = this.items[this.activeIndex];
            if (item) {
                event.preventDefault();
                this.selectItem(item);
            }
        } else if (event.key === "Escape") {
            event.preventDefault();
            this.hideList();
            this.syncDisplay();
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
}
