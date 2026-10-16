import { createBlocScope, observeBlocAttributes } from "@bernouy/cms-content/browser";

const DEFAULT_COLOURS = "#086c55,#3157d5,#7c3aed,#be185d,#b42318,#c2410c,#ca8a04,#111827,#64748b,#ffffff";

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

function labelFor(input: HTMLInputElement): string {
    return (
        input.getAttribute("aria-label")?.trim() ||
        Array.from(input.labels ?? [])
            .map((label) => label.textContent?.replace(/\s+/g, " ").trim())
            .find(Boolean) ||
        "Colour preset"
    );
}

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private input: HTMLInputElement | null = null;
    private trigger: HTMLButtonElement;
    private swatch: HTMLElement;
    private value: HTMLElement;
    private popover: HTMLElement;
    private sourceTabIndex: string | null = null;
    private sourceAriaHidden: string | null = null;
    private sourceHidden = false;

    static get observedAttributes(): string[] {
        return ["colours", "action-label"];
    }

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
        const popover = this.scope.querySelector<HTMLElement>('[part="popover"]');
        if (!popover) {
            throw new Error("Missing colour preset popover");
        }
        this.popover = popover;
        this.popover.setAttribute("aria-label", "Available colours");
        this.trigger = document.createElement("button");
        this.trigger.type = "button";
        this.trigger.setAttribute("part", "trigger");
        this.trigger.setAttribute("aria-haspopup", "listbox");
        this.swatch = document.createElement("span");
        this.swatch.setAttribute("part", "selected-swatch");
        this.swatch.setAttribute("aria-hidden", "true");
        this.value = document.createElement("span");
        this.value.setAttribute("part", "value");
        const action = document.createElement("span");
        action.setAttribute("part", "action");
        action.textContent = this.blocRoot.getAttribute("action-label") || "Choose";
        this.trigger.append(this.swatch, this.value, action);
        this.scope.querySelector('[part="trigger-shell"]')?.append(this.trigger);
    }

    connect(): void {
        this.trigger.addEventListener("click", this.toggle);
        this.popover.addEventListener("click", this.choose);
        this.blocRoot.ownerDocument.addEventListener("pointerdown", this.closeFromOutside);
        this.bindInput();
    }

    disconnect(): void {
        this.trigger.removeEventListener("click", this.toggle);
        this.popover.removeEventListener("click", this.choose);
        this.blocRoot.ownerDocument.removeEventListener("pointerdown", this.closeFromOutside);
        this.input?.removeEventListener("input", this.sync);
        this.input?.removeEventListener("focus", this.redirectFocus);
        this.input?.removeEventListener("click", this.openFromSource);
        this.restoreSource();
    }

    attributeChanged(): void {
        this.renderOptions();
        this.sync();
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
        this.renderOptions();
        this.blocRoot.toggleAttribute("data-ready", true);
        this.sync();
    }

    private colours(): string[] {
        const values = (this.blocRoot.getAttribute("colours") || DEFAULT_COLOURS).split(/[\s,;]+/);
        return [...new Set(values.map(normalizeHex).filter((value): value is string => Boolean(value)))];
    }

    private renderOptions(): void {
        this.popover.replaceChildren(
            ...this.colours().map((colour) => {
                const button = document.createElement("button");
                button.type = "button";
                button.dataset.colour = colour;
                button.setAttribute("part", "preset");
                button.setAttribute("role", "option");
                button.setAttribute("aria-label", colour.toUpperCase());
                button.style.setProperty("--ulvia-official-color-presets-preset-colour", colour);
                return button;
            }),
        );
    }

    private sync = (): void => {
        if (!this.input) {
            return;
        }
        const colour = normalizeHex(this.input.value) ?? "#000000";
        this.blocRoot.style.setProperty("--ulvia-official-color-presets-selected-colour", colour);
        this.value.textContent = colour.toUpperCase();
        this.trigger.disabled = this.input.disabled;
        this.trigger.setAttribute("aria-label", labelFor(this.input));
        this.trigger.setAttribute("aria-expanded", String(!this.popover.hasAttribute("hidden")));
        this.popover.querySelectorAll<HTMLElement>("[data-colour]").forEach((option) => {
            option.setAttribute("aria-selected", String(option.dataset.colour === colour));
        });
        this.blocRoot.toggleAttribute("data-disabled", this.input.disabled);
    };

    private choose = (event: Event): void => {
        const option = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-colour]") : null;
        if (!this.input || !option?.dataset.colour || this.input.disabled) {
            return;
        }
        this.input.value = option.dataset.colour;
        this.input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        this.input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        this.setOpen(false);
        this.trigger.focus();
    };

    private toggle = (): void => this.setOpen(this.popover.hasAttribute("hidden"));

    private setOpen(open: boolean): void {
        const nextOpen = open && !this.input?.disabled;
        this.popover.toggleAttribute("hidden", !nextOpen);
        this.trigger.setAttribute("aria-expanded", String(nextOpen));
        this.blocRoot.toggleAttribute("data-open", nextOpen);
    }

    private closeFromOutside = (event: Event): void => {
        if (event.target instanceof Node && !this.blocRoot.contains(event.target)) {
            this.setOpen(false);
        }
    };

    private redirectFocus = (): void => this.trigger.focus();

    private openFromSource = (event: Event): void => {
        event.preventDefault();
        this.trigger.focus();
        this.setOpen(true);
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
