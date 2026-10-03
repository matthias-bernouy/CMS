import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type Rgb = { red: number; green: number; blue: number };
type ColourMode = "hex" | "rgb" | "hsl" | "hsv" | "cmyk";
type Channel = { id: string; label: string; maximum: number; value: number; suffix?: string };

const clamp = (value: number, maximum: number): number => Math.min(maximum, Math.max(0, value));
const MODES: ColourMode[] = ["hex", "rgb", "hsl", "hsv", "cmyk"];

function normalizeHex(value: string): string | null {
    const compact = value.trim().replace(/^#/, "");
    const expanded = /^[0-9a-f]{3}$/i.test(compact)
        ? compact
              .split("")
              .map((character) => `${character}${character}`)
              .join("")
        : compact;
    return /^[0-9a-f]{6}$/i.test(expanded) ? `#${expanded.toLowerCase()}` : null;
}

function hexToRgb(value: string): Rgb {
    const hex = normalizeHex(value) ?? "#000000";
    return {
        red: Number.parseInt(hex.slice(1, 3), 16),
        green: Number.parseInt(hex.slice(3, 5), 16),
        blue: Number.parseInt(hex.slice(5, 7), 16),
    };
}

function rgbToHex({ red, green, blue }: Rgb): string {
    return `#${[red, green, blue]
        .map((value) => Math.round(clamp(value, 255)).toString(16).padStart(2, "0"))
        .join("")}`;
}

function rgbToHsl({ red, green, blue }: Rgb): number[] {
    const [r, g, b] = [red, green, blue].map((value) => value / 255);
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const delta = maximum - minimum;
    const lightness = (maximum + minimum) / 2;
    let hue = 0;
    if (delta) {
        if (maximum === r) {
            hue = ((g - b) / delta) % 6;
        } else if (maximum === g) {
            hue = (b - r) / delta + 2;
        } else {
            hue = (r - g) / delta + 4;
        }
    }
    const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
    return [Math.round((hue * 60 + 360) % 360), Math.round(saturation * 100), Math.round(lightness * 100)];
}

function hslToRgb([hue, saturation, lightness]: number[]): Rgb {
    const h = ((hue % 360) + 360) % 360;
    const s = clamp(saturation, 100) / 100;
    const l = clamp(lightness, 100) / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const section = h / 60;
    const second = chroma * (1 - Math.abs((section % 2) - 1));
    const values =
        section < 1
            ? [chroma, second, 0]
            : section < 2
              ? [second, chroma, 0]
              : section < 3
                ? [0, chroma, second]
                : section < 4
                  ? [0, second, chroma]
                  : section < 5
                    ? [second, 0, chroma]
                    : [chroma, 0, second];
    const match = l - chroma / 2;
    return { red: (values[0] + match) * 255, green: (values[1] + match) * 255, blue: (values[2] + match) * 255 };
}

function rgbToHsv({ red, green, blue }: Rgb): number[] {
    const [r, g, b] = [red, green, blue].map((value) => value / 255);
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const delta = maximum - minimum;
    let hue = 0;
    if (delta) {
        if (maximum === r) {
            hue = ((g - b) / delta) % 6;
        } else if (maximum === g) {
            hue = (b - r) / delta + 2;
        } else {
            hue = (r - g) / delta + 4;
        }
    }
    return [
        Math.round((hue * 60 + 360) % 360),
        Math.round((maximum ? delta / maximum : 0) * 100),
        Math.round(maximum * 100),
    ];
}

function hsvToRgb([hue, saturation, value]: number[]): Rgb {
    const h = ((hue % 360) + 360) % 360;
    const s = clamp(saturation, 100) / 100;
    const v = clamp(value, 100) / 100;
    const chroma = v * s;
    const section = h / 60;
    const second = chroma * (1 - Math.abs((section % 2) - 1));
    const values =
        section < 1
            ? [chroma, second, 0]
            : section < 2
              ? [second, chroma, 0]
              : section < 3
                ? [0, chroma, second]
                : section < 4
                  ? [0, second, chroma]
                  : section < 5
                    ? [second, 0, chroma]
                    : [chroma, 0, second];
    const match = v - chroma;
    return { red: (values[0] + match) * 255, green: (values[1] + match) * 255, blue: (values[2] + match) * 255 };
}

function rgbToCmyk({ red, green, blue }: Rgb): number[] {
    const [r, g, b] = [red, green, blue].map((value) => value / 255);
    const black = 1 - Math.max(r, g, b);
    if (black === 1) {
        return [0, 0, 0, 100];
    }
    return [
        Math.round(((1 - r - black) / (1 - black)) * 100),
        Math.round(((1 - g - black) / (1 - black)) * 100),
        Math.round(((1 - b - black) / (1 - black)) * 100),
        Math.round(black * 100),
    ];
}

function cmykToRgb([cyan, magenta, yellow, black]: number[]): Rgb {
    const [c, m, y, k] = [cyan, magenta, yellow, black].map((value) => clamp(value, 100) / 100);
    return { red: 255 * (1 - c) * (1 - k), green: 255 * (1 - m) * (1 - k), blue: 255 * (1 - y) * (1 - k) };
}

function labelFor(input: HTMLInputElement): string {
    return (
        input.getAttribute("aria-label")?.trim() ||
        Array.from(input.labels ?? [])
            .map((label) => label.textContent?.replace(/\s+/g, " ").trim())
            .find(Boolean) ||
        "Colour"
    );
}

export class Bloc extends Component {
    private input: HTMLInputElement | null = null;
    private trigger: HTMLButtonElement;
    private swatch: HTMLElement;
    private value: HTMLElement;
    private action: HTMLElement;
    private popover: HTMLElement;
    private preview: HTMLElement;
    private modeTabs: HTMLElement;
    private editor: HTMLElement;
    private mode: ColourMode = "hex";
    private sourceTabIndex: string | null = null;
    private sourceAriaHidden: string | null = null;
    private sourceHidden = false;
    private observer = new MutationObserver(() => this.sync());

    static get observedAttributes(): string[] {
        return ["action-label", "default-mode"];
    }

    constructor() {
        super({ css, template });
        this.popover = this.requiredPart("popover");
        this.popover.setAttribute("role", "dialog");
        this.popover.setAttribute("aria-label", "Compose colour");
        const previewRow = document.createElement("span");
        previewRow.setAttribute("part", "preview-row");
        this.preview = document.createElement("span");
        this.preview.setAttribute("part", "preview-swatch");
        this.preview.setAttribute("role", "img");
        this.modeTabs = document.createElement("span");
        this.modeTabs.setAttribute("part", "mode-tabs");
        this.modeTabs.setAttribute("role", "tablist");
        previewRow.append(this.preview, this.modeTabs);
        this.editor = document.createElement("span");
        this.editor.setAttribute("part", "editor");
        this.popover.append(previewRow, this.editor);
        this.trigger = document.createElement("button");
        this.trigger.type = "button";
        this.trigger.setAttribute("part", "trigger");
        this.trigger.setAttribute("aria-haspopup", "dialog");
        this.swatch = document.createElement("span");
        this.swatch.setAttribute("part", "trigger-swatch");
        this.swatch.setAttribute("aria-hidden", "true");
        this.value = document.createElement("span");
        this.value.setAttribute("part", "value");
        this.action = document.createElement("span");
        this.action.setAttribute("part", "action");
        const indicator = document.createElement("span");
        indicator.setAttribute("part", "indicator");
        indicator.setAttribute("aria-hidden", "true");
        this.trigger.append(this.swatch, this.value, this.action, indicator);
        this.shadowRoot?.querySelector('[part="trigger-shell"]')?.append(this.trigger);
        this.renderModes();
    }

    override connectedCallback(): void {
        this.trigger.addEventListener("click", this.toggle);
        this.modeTabs.addEventListener("click", this.changeMode);
        this.editor.addEventListener("input", this.changeValue);
        this.ownerDocument.addEventListener("pointerdown", this.closeFromOutside);
        this.ownerDocument.addEventListener("reset", this.handleReset);
        this.bindInput();
    }

    disconnectedCallback(): void {
        this.trigger.removeEventListener("click", this.toggle);
        this.modeTabs.removeEventListener("click", this.changeMode);
        this.editor.removeEventListener("input", this.changeValue);
        this.ownerDocument.removeEventListener("pointerdown", this.closeFromOutside);
        this.ownerDocument.removeEventListener("reset", this.handleReset);
        this.input?.removeEventListener("input", this.sync);
        this.input?.removeEventListener("focus", this.redirectFocus);
        this.input?.removeEventListener("click", this.openFromSource);
        this.observer.disconnect();
        this.restoreSource();
    }

    attributeChangedCallback(name: string): void {
        if (name === "default-mode") {
            this.mode = this.requestedMode();
            this.renderModes();
            this.renderEditor();
        }
        this.sync();
    }

    private requiredPart(part: string): HTMLElement {
        const element = this.shadowRoot?.querySelector<HTMLElement>(`[part="${part}"]`);
        if (!element) {
            throw new Error(`Missing ${part} part`);
        }
        return element;
    }

    private requestedMode(): ColourMode {
        const requested = this.getAttribute("default-mode") as ColourMode | null;
        return requested && MODES.includes(requested) ? requested : "hex";
    }

    private bindInput(): void {
        this.input = this.querySelector<HTMLInputElement>('input[type="color"]');
        if (!this.input) {
            return;
        }
        this.sourceTabIndex = this.input.getAttribute("tabindex");
        this.sourceAriaHidden = this.input.getAttribute("aria-hidden");
        this.sourceHidden = this.input.hidden;
        this.input.hidden = true;
        this.input.setAttribute("aria-hidden", "true");
        this.input.tabIndex = -1;
        this.input.addEventListener("input", this.sync);
        this.input.addEventListener("focus", this.redirectFocus);
        this.input.addEventListener("click", this.openFromSource);
        this.observer.observe(this.input, { attributes: true, attributeFilter: ["value", "disabled"] });
        this.mode = this.requestedMode();
        this.renderModes();
        this.renderEditor();
        this.toggleAttribute("data-ready", true);
        this.sync();
    }

    private renderModes(): void {
        this.modeTabs.replaceChildren(
            ...MODES.map((mode) => {
                const button = document.createElement("button");
                button.type = "button";
                button.dataset.mode = mode;
                button.setAttribute("part", "mode");
                button.setAttribute("role", "tab");
                button.setAttribute("aria-selected", String(mode === this.mode));
                button.textContent = mode.toUpperCase();
                return button;
            }),
        );
    }

    private channels(rgb: Rgb): Channel[] {
        const suffix = "%";
        if (this.mode === "rgb") {
            return ["Red", "Green", "Blue"].map((label, index) => ({
                id: label.toLowerCase(),
                label,
                maximum: 255,
                value: Math.round([rgb.red, rgb.green, rgb.blue][index]),
            }));
        }
        if (this.mode === "hsl") {
            return ["Hue", "Saturation", "Lightness"].map((label, index) => ({
                id: label.toLowerCase(),
                label,
                maximum: index ? 100 : 359,
                value: rgbToHsl(rgb)[index],
                suffix: index ? suffix : "°",
            }));
        }
        if (this.mode === "hsv") {
            return ["Hue", "Saturation", "Value"].map((label, index) => ({
                id: label.toLowerCase(),
                label,
                maximum: index ? 100 : 359,
                value: rgbToHsv(rgb)[index],
                suffix: index ? suffix : "°",
            }));
        }
        return ["Cyan", "Magenta", "Yellow", "Black"].map((label, index) => ({
            id: label.toLowerCase(),
            label,
            maximum: 100,
            value: rgbToCmyk(rgb)[index],
            suffix,
        }));
    }

    private renderEditor(): void {
        const colour = normalizeHex(this.input?.value ?? "") ?? "#000000";
        if (this.mode === "hex") {
            const label = document.createElement("label");
            label.setAttribute("part", "hex-field");
            const title = document.createElement("span");
            title.textContent = "Hex value";
            const input = document.createElement("input");
            input.type = "text";
            input.maxLength = 7;
            input.autocomplete = "off";
            input.spellcheck = false;
            input.dataset.channel = "hex";
            input.setAttribute("part", "hex-input");
            input.value = colour.toUpperCase();
            label.append(title, input);
            this.editor.replaceChildren(label);
            return;
        }
        this.editor.replaceChildren(
            ...this.channels(hexToRgb(colour)).map((channel) => {
                const label = document.createElement("label");
                label.setAttribute("part", "channel");
                const title = document.createElement("span");
                title.textContent = channel.label;
                const output = document.createElement("output");
                output.value = `${channel.value}${channel.suffix ?? ""}`;
                const input = document.createElement("input");
                input.type = "range";
                input.min = "0";
                input.max = String(channel.maximum);
                input.step = "1";
                input.value = String(channel.value);
                input.dataset.channel = channel.id;
                input.dataset.suffix = channel.suffix ?? "";
                input.setAttribute("part", "channel-input");
                label.append(title, output, input);
                return label;
            }),
        );
    }

    private sync = (): void => {
        if (!this.input) {
            return;
        }
        const colour = normalizeHex(this.input.value) ?? "#000000";
        this.style.setProperty("--selected-color", colour);
        this.style.setProperty("--selected-hue", String(rgbToHsl(hexToRgb(colour))[0]));
        this.value.textContent = colour.toUpperCase();
        this.preview.setAttribute("aria-label", colour.toUpperCase());
        this.action.textContent = this.getAttribute("action-label") || "Compose";
        this.trigger.disabled = this.input.disabled;
        this.trigger.setAttribute("aria-label", labelFor(this.input));
        this.trigger.setAttribute("aria-expanded", String(!this.popover.hasAttribute("hidden")));
        this.editor
            .querySelectorAll<HTMLInputElement>("input")
            .forEach((input) => (input.disabled = this.input?.disabled === true));
        this.toggleAttribute("data-disabled", this.input.disabled);
    };

    private changeMode = (event: Event): void => {
        const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-mode]") : null;
        if (!button?.dataset.mode || !MODES.includes(button.dataset.mode as ColourMode)) {
            return;
        }
        this.mode = button.dataset.mode as ColourMode;
        this.renderModes();
        this.renderEditor();
        this.sync();
        queueMicrotask(() => this.editor.querySelector<HTMLElement>("input")?.focus());
    };

    private changeValue = (event: Event): void => {
        if (!(event.target instanceof HTMLInputElement)) {
            return;
        }
        let colour: string | null = null;
        if (this.mode === "hex") {
            colour = normalizeHex(event.target.value);
        } else {
            const values = Array.from(this.editor.querySelectorAll<HTMLInputElement>("input")).map((input) =>
                Number(input.value),
            );
            const rgb =
                this.mode === "rgb"
                    ? { red: values[0], green: values[1], blue: values[2] }
                    : this.mode === "hsl"
                      ? hslToRgb(values)
                      : this.mode === "hsv"
                        ? hsvToRgb(values)
                        : cmykToRgb(values);
            colour = rgbToHex(rgb);
            const output = event.target.previousElementSibling;
            if (output instanceof HTMLOutputElement) {
                output.value = `${event.target.value}${event.target.dataset.suffix ?? ""}`;
            }
        }
        if (colour) {
            this.applyColour(colour);
        }
    };

    private applyColour(colour: string): void {
        if (!this.input || this.input.disabled) {
            return;
        }
        this.input.value = colour;
        this.input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        this.sync();
    }

    private toggle = (): void => this.setOpen(this.popover.hasAttribute("hidden"));

    private setOpen(open: boolean): void {
        const nextOpen = open && !this.input?.disabled;
        this.popover.toggleAttribute("hidden", !nextOpen);
        this.trigger.setAttribute("aria-expanded", String(nextOpen));
        this.toggleAttribute("data-open", nextOpen);
        if (nextOpen) {
            queueMicrotask(() => this.modeTabs.querySelector<HTMLElement>("[aria-selected=true]")?.focus());
        }
    }

    private closeFromOutside = (event: Event): void => {
        if (event.target instanceof Node && !this.contains(event.target) && !this.shadowRoot?.contains(event.target)) {
            this.setOpen(false);
        }
    };

    private redirectFocus = (): void => this.trigger.focus();

    private openFromSource = (event: Event): void => {
        event.preventDefault();
        this.trigger.focus();
        this.setOpen(true);
    };

    private handleReset = (event: Event): void => {
        if (event.target === this.input?.form) {
            window.setTimeout(() => {
                this.renderEditor();
                this.sync();
            });
        }
    };

    private restoreSource(): void {
        if (!this.input) {
            return;
        }
        this.input.hidden = this.sourceHidden;
        this.sourceTabIndex === null
            ? this.input.removeAttribute("tabindex")
            : this.input.setAttribute("tabindex", this.sourceTabIndex);
        this.sourceAriaHidden === null
            ? this.input.removeAttribute("aria-hidden")
            : this.input.setAttribute("aria-hidden", this.sourceAriaHidden);
    }
}
