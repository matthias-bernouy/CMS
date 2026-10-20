import { createBlocScope } from "@bernouy/cms-content/browser";
import {
    cmykToRgb,
    hexToRgb,
    hslToRgb,
    hsvToRgb,
    MODES,
    normalizeHex,
    rgbToCmyk,
    rgbToHex,
    rgbToHsl,
    rgbToHsv,
    type ColourMode,
    type Rgb,
} from "./colour";

type Channel = { id: string; label: string; maximum: number; value: number; suffix?: string };

function labelFor(input: HTMLInputElement): string {
    return (
        input.getAttribute("aria-label")?.trim() ||
        Array.from(input.labels ?? [])
            .map((label) => label.textContent?.replace(/\s+/g, " ").trim())
            .find(Boolean) ||
        "Colour"
    );
}

export class ColorInputController {
    private readonly scope: ReturnType<typeof createBlocScope>;
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

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
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
        this.scope.querySelector('[part="trigger-shell"]')?.append(this.trigger);
        this.renderModes();
    }

    connect(): void {
        this.trigger.addEventListener("click", this.toggle);
        this.modeTabs.addEventListener("click", this.changeMode);
        this.editor.addEventListener("input", this.changeValue);
        this.blocRoot.ownerDocument.addEventListener("keydown", this.closeFromKeyboard);
        this.blocRoot.ownerDocument.addEventListener("pointerdown", this.closeFromOutside);
        this.blocRoot.ownerDocument.addEventListener("reset", this.handleReset);
        this.bindInput();
    }

    disconnect(): void {
        this.trigger.removeEventListener("click", this.toggle);
        this.modeTabs.removeEventListener("click", this.changeMode);
        this.editor.removeEventListener("input", this.changeValue);
        this.blocRoot.ownerDocument.removeEventListener("keydown", this.closeFromKeyboard);
        this.blocRoot.ownerDocument.removeEventListener("pointerdown", this.closeFromOutside);
        this.blocRoot.ownerDocument.removeEventListener("reset", this.handleReset);
        this.input?.removeEventListener("input", this.sync);
        this.input?.removeEventListener("focus", this.redirectFocus);
        this.input?.removeEventListener("click", this.openFromSource);
        this.observer.disconnect();
        this.restoreSource();
    }

    attributeChanged(name: string): void {
        if (name === "default-mode") {
            this.mode = this.requestedMode();
            this.renderModes();
            this.renderEditor();
        }
        this.sync();
    }

    private requiredPart(part: string): HTMLElement {
        const element = this.scope.querySelector<HTMLElement>(`[part="${part}"]`);
        if (!element) {
            throw new Error(`Missing ${part} part`);
        }
        return element;
    }

    private requestedMode(): ColourMode {
        const requested = this.blocRoot.getAttribute("default-mode") as ColourMode | null;
        return requested && MODES.includes(requested) ? requested : "hex";
    }

    private bindInput(): void {
        this.input = this.scope.querySelector<HTMLInputElement>('input[type="color"]');
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
        this.blocRoot.toggleAttribute("data-ready", true);
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
        this.blocRoot.style.setProperty("--ulvia-official-color-input-selected-color", colour);
        this.blocRoot.style.setProperty(
            "--ulvia-official-color-input-selected-hue",
            String(rgbToHsl(hexToRgb(colour))[0]),
        );
        this.value.textContent = colour.toUpperCase();
        this.preview.setAttribute("aria-label", colour.toUpperCase());
        this.action.textContent = this.blocRoot.getAttribute("action-label") || "Compose";
        this.trigger.disabled = this.input.disabled;
        this.trigger.setAttribute("aria-label", labelFor(this.input));
        this.trigger.setAttribute("aria-expanded", String(!this.popover.hasAttribute("hidden")));
        this.editor
            .querySelectorAll<HTMLInputElement>("input")
            .forEach((input) => (input.disabled = this.input?.disabled === true));
        this.blocRoot.toggleAttribute("data-disabled", this.input.disabled);
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
        this.blocRoot.toggleAttribute("data-open", nextOpen);
        if (nextOpen) {
            queueMicrotask(() => this.modeTabs.querySelector<HTMLElement>("[aria-selected=true]")?.focus());
        }
    }

    private closeFromOutside = (event: Event): void => {
        if (event.target instanceof Node && !this.blocRoot.contains(event.target)) {
            this.setOpen(false);
        }
    };

    private closeFromKeyboard = (event: Event): void => {
        if (event instanceof KeyboardEvent && event.key === "Escape" && !this.popover.hasAttribute("hidden")) {
            event.preventDefault();
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
