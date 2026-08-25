import { setLabel } from "./compute";

type PopoverElement = HTMLElement & {
    hidePopover?: () => void;
    showPopover?: () => void;
};

export class P9rSelectView {
    readonly trigger: HTMLButtonElement | null;
    readonly display: HTMLElement | null;
    readonly list: HTMLElement | null;
    readonly panel: PopoverElement | null;
    private readonly label: HTMLElement | null;
    private readonly hint: HTMLElement | null;

    constructor(
        root: ShadowRoot,
        private readonly internals: ElementInternals,
    ) {
        this.trigger = root.querySelector(".trigger");
        this.display = root.querySelector(".value");
        this.list = root.querySelector(".list");
        this.panel = root.querySelector(".panel");
        this.label = root.querySelector(".label");
        this.hint = root.querySelector(".hint");
    }

    syncAttributes(host: HTMLElement, value: string, disabled: boolean, showValidationMessage: boolean): void {
        setLabel(this.label, host);
        if (!this.trigger) {
            return;
        }
        this.trigger.disabled = disabled;
        syncOptionalAttribute(this.trigger, "aria-label", host.getAttribute("aria-label"));
        syncBooleanAria(this.trigger, "aria-required", host.hasAttribute("required"));
        this.syncValidity(host, value, showValidationMessage);
    }

    syncValidity(host: HTMLElement, value: string, showValidationMessage: boolean): void {
        if (!this.trigger) {
            return;
        }
        const valueMissing = host.hasAttribute("required") && !value;
        if (valueMissing) {
            this.internals.setValidity({ valueMissing: true }, "Please select a value.", this.trigger);
        } else {
            this.internals.setValidity({});
        }
        const invalid = host.hasAttribute("invalid") || (showValidationMessage && valueMissing);
        syncBooleanAria(this.trigger, "aria-invalid", invalid);
        this.syncHint(host, showValidationMessage && valueMissing);
    }

    setFormValue(value: string): void {
        this.internals.setFormValue(value);
    }

    setOpen(open: boolean): void {
        this.trigger?.setAttribute("aria-expanded", String(open));
        if (!open) {
            this.trigger?.removeAttribute("aria-activedescendant");
        }
    }

    setActive(index: number, options: HTMLElement[]): void {
        options.forEach((option, optionIndex) => {
            option.dataset.active = String(optionIndex === index);
        });
        const active = options[index];
        if (active) {
            this.trigger?.setAttribute("aria-activedescendant", active.id);
            active.scrollIntoView({ block: "nearest" });
        } else {
            this.trigger?.removeAttribute("aria-activedescendant");
        }
    }

    show(): void {
        this.panel?.showPopover?.();
    }

    hide(): void {
        this.panel?.hidePopover?.();
        this.setOpen(false);
    }

    focus(): void {
        this.trigger?.focus();
    }

    private syncHint(host: HTMLElement, showValidationMessage: boolean): void {
        if (!this.hint || !this.trigger) {
            return;
        }
        const hint = showValidationMessage ? "Please select a value." : (host.getAttribute("hint") ?? "");
        this.hint.textContent = hint;
        this.hint.dataset.level = showValidationMessage ? "error" : (host.getAttribute("hint-level") ?? "info");
        this.hint.hidden = hint === "";
        syncOptionalAttribute(this.trigger, "aria-describedby", hint ? this.hint.id : null);
    }
}

function syncOptionalAttribute(element: HTMLElement, name: string, value: string | null): void {
    if (value) {
        element.setAttribute(name, value);
    } else {
        element.removeAttribute(name);
    }
}

function syncBooleanAria(element: HTMLElement, name: "aria-invalid" | "aria-required", value: boolean): void {
    if (value) {
        element.setAttribute(name, "true");
    } else {
        element.removeAttribute(name);
    }
}
