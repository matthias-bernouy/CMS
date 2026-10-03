import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

const PRESETS = [
    "#086c55",
    "#3157d5",
    "#7c3aed",
    "#be185d",
    "#b42318",
    "#c2410c",
    "#ca8a04",
    "#111827",
    "#64748b",
    "#ffffff",
];

function labelFor(input: HTMLInputElement): string {
    return (
        input.getAttribute("aria-label")?.trim() ||
        Array.from(input.labels ?? [])
            .map((label) => label.textContent?.replace(/\s+/g, " ").trim())
            .find(Boolean) ||
        "Colour"
    );
}

function normalizedHex(value: string): string | null {
    const compact = value.trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(compact)) {
        return `#${compact
            .split("")
            .map((character) => `${character}${character}`)
            .join("")}`.toLowerCase();
    }
    return /^[0-9a-f]{6}$/i.test(compact) ? `#${compact.toLowerCase()}` : null;
}

export class Bloc extends Component {
    private input: HTMLInputElement | null = null;
    private trigger: HTMLButtonElement;
    private triggerSwatch: HTMLElement;
    private value: HTMLElement;
    private action: HTMLElement;
    private popover: HTMLElement | null;
    private presets: HTMLElement | null;
    private hexInput: HTMLInputElement;
    private sourceTabIndex: string | null = null;
    private sourceAriaHidden: string | null = null;
    private observer = new MutationObserver(() => this.sync());

    static get observedAttributes(): string[] {
        return ["action-label"];
    }

    constructor() {
        super({ css, template });
        this.trigger = document.createElement("button");
        this.trigger.type = "button";
        this.trigger.setAttribute("part", "trigger");
        this.trigger.setAttribute("aria-haspopup", "dialog");
        this.triggerSwatch = document.createElement("span");
        this.triggerSwatch.setAttribute("part", "trigger-swatch");
        this.triggerSwatch.setAttribute("aria-hidden", "true");
        this.value = document.createElement("span");
        this.value.setAttribute("part", "value");
        this.action = document.createElement("span");
        this.action.setAttribute("part", "action");
        const indicator = document.createElement("span");
        indicator.setAttribute("part", "indicator");
        indicator.setAttribute("aria-hidden", "true");
        this.trigger.append(this.triggerSwatch, this.value, this.action, indicator);
        this.shadowRoot?.querySelector('[part="trigger-shell"]')?.append(this.trigger);
        this.popover = this.shadowRoot?.querySelector('[part="popover"]') ?? null;
        this.presets = this.shadowRoot?.querySelector('[part="presets"]') ?? null;
        this.hexInput = document.createElement("input");
        this.hexInput.type = "text";
        this.hexInput.maxLength = 7;
        this.hexInput.autocomplete = "off";
        this.hexInput.spellcheck = false;
        this.hexInput.setAttribute("part", "hex-input");
        this.shadowRoot?.querySelector('[part="hex-shell"]')?.append(this.hexInput);
    }

    override connectedCallback(): void {
        this.trigger.addEventListener("click", this.toggle);
        this.trigger.addEventListener("keydown", this.handleTriggerKeydown);
        this.presets?.addEventListener("click", this.choosePreset);
        this.hexInput.addEventListener("input", this.previewHex);
        this.hexInput.addEventListener("change", this.commitHex);
        this.hexInput.addEventListener("keydown", this.handleHexKeydown);
        this.ownerDocument.addEventListener("pointerdown", this.closeFromOutside);
        this.ownerDocument.addEventListener("reset", this.handleReset);
        this.bindInput();
    }

    disconnectedCallback(): void {
        this.trigger.removeEventListener("click", this.toggle);
        this.trigger.removeEventListener("keydown", this.handleTriggerKeydown);
        this.presets?.removeEventListener("click", this.choosePreset);
        this.hexInput.removeEventListener("input", this.previewHex);
        this.hexInput.removeEventListener("change", this.commitHex);
        this.hexInput.removeEventListener("keydown", this.handleHexKeydown);
        this.ownerDocument.removeEventListener("pointerdown", this.closeFromOutside);
        this.ownerDocument.removeEventListener("reset", this.handleReset);
        this.input?.removeEventListener("input", this.sync);
        this.input?.removeEventListener("change", this.sync);
        this.input?.removeEventListener("focus", this.redirectFocus);
        this.input?.removeEventListener("click", this.openFromSource);
        this.observer.disconnect();
        this.restoreSource();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private bindInput(): void {
        this.input = this.querySelector<HTMLInputElement>('input[type="color"]');
        if (!this.input) {
            return;
        }
        this.sourceTabIndex = this.input.getAttribute("tabindex");
        this.sourceAriaHidden = this.input.getAttribute("aria-hidden");
        this.input.setAttribute("aria-hidden", "true");
        this.input.tabIndex = -1;
        this.input.addEventListener("input", this.sync);
        this.input.addEventListener("change", this.sync);
        this.input.addEventListener("focus", this.redirectFocus);
        this.input.addEventListener("click", this.openFromSource);
        this.observer.observe(this.input, { attributes: true, attributeFilter: ["value", "disabled"] });
        this.renderPresets();
        this.toggleAttribute("data-ready", true);
        this.sync();
    }

    private renderPresets(): void {
        this.presets?.replaceChildren(
            ...PRESETS.map((color) => {
                const button = document.createElement("button");
                button.type = "button";
                button.dataset.color = color;
                button.title = color.toUpperCase();
                button.setAttribute("aria-label", color.toUpperCase());
                button.setAttribute("part", "preset");
                button.style.setProperty("--preset-color", color);
                return button;
            }),
        );
    }

    private sync = (): void => {
        if (!this.input) {
            return;
        }
        const color = this.input.value.toLowerCase();
        this.style.setProperty("--selected-color", color);
        this.value.textContent = color.toUpperCase();
        if (this.ownerDocument.activeElement !== this.hexInput && this.shadowRoot?.activeElement !== this.hexInput) {
            this.hexInput.value = color.toUpperCase();
        }
        this.action.textContent = this.getAttribute("action-label") || "Change";
        this.trigger.disabled = this.input.disabled;
        this.trigger.setAttribute("aria-label", labelFor(this.input));
        this.trigger.setAttribute("aria-expanded", String(!this.popover?.hasAttribute("hidden")));
        this.hexInput.disabled = this.input.disabled;
        this.hexInput.setAttribute("aria-label", `${labelFor(this.input)} hex value`);
        this.presets?.querySelectorAll<HTMLElement>("[data-color]").forEach((item) => {
            item.setAttribute("aria-selected", String(item.dataset.color === color));
        });
        this.toggleAttribute("data-disabled", this.input.disabled);
    };

    private toggle = (): void => this.setOpen(this.popover?.hasAttribute("hidden") === true);

    private setOpen(open: boolean): void {
        const nextOpen = open && !this.input?.disabled;
        this.popover?.toggleAttribute("hidden", !nextOpen);
        this.trigger.setAttribute("aria-expanded", String(nextOpen));
        this.toggleAttribute("data-open", nextOpen);
    }

    private choosePreset = (event: Event): void => {
        const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-color]") : null;
        if (button?.dataset.color) {
            this.applyColor(button.dataset.color, true);
        }
    };

    private previewHex = (): void => {
        const color = normalizedHex(this.hexInput.value);
        if (color) {
            this.applyColor(color, false);
        }
    };

    private commitHex = (): void => {
        const color = normalizedHex(this.hexInput.value);
        if (color) {
            this.applyColor(color, true);
        } else {
            this.sync();
        }
    };

    private applyColor(color: string, commit: boolean): void {
        if (!this.input || this.input.disabled) {
            return;
        }
        this.input.value = color;
        this.input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        if (commit) {
            this.input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        }
        this.sync();
    }

    private handleTriggerKeydown = (event: KeyboardEvent): void => {
        if (event.key === "ArrowDown") {
            this.setOpen(true);
            this.hexInput.focus();
            event.preventDefault();
        } else if (event.key === "Escape") {
            this.setOpen(false);
        }
    };

    private handleHexKeydown = (event: KeyboardEvent): void => {
        if (event.key === "Enter") {
            this.commitHex();
            this.setOpen(false);
            this.trigger.focus();
        } else if (event.key === "Escape") {
            this.setOpen(false);
            this.trigger.focus();
        }
    };

    private redirectFocus = (): void => this.trigger.focus();
    private openFromSource = (event: Event): void => {
        event.preventDefault();
        this.trigger.focus();
        this.setOpen(true);
    };

    private closeFromOutside = (event: Event): void => {
        if (event.target instanceof Node && !this.contains(event.target) && !this.shadowRoot?.contains(event.target)) {
            this.setOpen(false);
        }
    };

    private handleReset = (event: Event): void => {
        if (event.target === this.input?.form) {
            window.setTimeout(this.sync);
        }
    };

    private restoreSource(): void {
        if (!this.input) {
            return;
        }
        this.sourceTabIndex === null
            ? this.input.removeAttribute("tabindex")
            : this.input.setAttribute("tabindex", this.sourceTabIndex);
        this.sourceAriaHidden === null
            ? this.input.removeAttribute("aria-hidden")
            : this.input.setAttribute("aria-hidden", this.sourceAriaHidden);
    }
}
