import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string): Date | null {
    const match = ISO_DATE.exec(value);
    if (!match) {
        return null;
    }
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (
        Number.isNaN(date.getTime()) ||
        date.getFullYear() !== Number(match[1]) ||
        date.getMonth() !== Number(match[2]) - 1 ||
        date.getDate() !== Number(match[3])
    ) {
        return null;
    }
    return date;
}

function toIso(date: Date): string {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function labelFor(input: HTMLInputElement): string {
    return (
        input.getAttribute("aria-label")?.trim() ||
        Array.from(input.labels ?? [])
            .map((label) => label.textContent?.replace(/\s+/g, " ").trim())
            .find(Boolean) ||
        "Date"
    );
}

class DatePicker {
    private trigger: HTMLButtonElement;
    private value: HTMLElement;
    private popover: HTMLElement;
    private monthLabel: HTMLElement;
    private weekdays: HTMLElement;
    private days: HTMLElement;
    private previous: HTMLButtonElement;
    private next: HTMLButtonElement;
    private today: HTMLButtonElement;
    private clear: HTMLButtonElement;
    private viewDate = new Date();
    private activeDate = new Date();
    private sourceTabIndex: string | null;
    private sourceAriaHidden: string | null;

    constructor(
        private host: HTMLElement,
        private input: HTMLInputElement,
        private shadow: ShadowRoot,
    ) {
        this.popover = this.requiredPart("popover");
        this.monthLabel = this.requiredPart("month-label");
        this.weekdays = this.requiredPart("weekdays");
        this.days = this.requiredPart("days");
        this.trigger = document.createElement("button");
        this.trigger.type = "button";
        this.trigger.setAttribute("part", "date-trigger");
        this.trigger.setAttribute("aria-haspopup", "dialog");
        this.value = document.createElement("span");
        this.value.setAttribute("part", "date-value");
        const icon = document.createElement("span");
        icon.setAttribute("part", "date-icon");
        icon.setAttribute("aria-hidden", "true");
        this.trigger.append(this.value, icon);
        this.shadow.querySelector('[part="trigger-shell"]')?.append(this.trigger);
        this.previous = this.createAction("previous-shell", "previous-month");
        this.next = this.createAction("next-shell", "next-month");
        this.today = this.createAction("today-shell", "today");
        this.clear = this.createAction("clear-shell", "clear");
        this.sourceTabIndex = input.getAttribute("tabindex");
        this.sourceAriaHidden = input.getAttribute("aria-hidden");
    }

    connect(): void {
        this.input.setAttribute("aria-hidden", "true");
        this.input.tabIndex = -1;
        this.trigger.addEventListener("click", this.toggle);
        this.trigger.addEventListener("keydown", this.handleTriggerKeydown);
        this.previous.addEventListener("click", this.showPreviousMonth);
        this.next.addEventListener("click", this.showNextMonth);
        this.today.addEventListener("click", this.chooseToday);
        this.clear.addEventListener("click", this.clearValue);
        this.days.addEventListener("click", this.chooseDay);
        this.days.addEventListener("keydown", this.handleDayKeydown);
        this.popover.addEventListener("keydown", this.handlePopoverKeydown);
        this.input.addEventListener("input", this.sync);
        this.input.addEventListener("change", this.sync);
        this.input.addEventListener("focus", this.redirectFocus);
        this.input.addEventListener("click", this.openFromSource);
        this.host.ownerDocument.addEventListener("pointerdown", this.closeFromOutside);
        this.host.ownerDocument.addEventListener("reset", this.handleReset);
        this.sync();
    }

    disconnect(): void {
        this.trigger.removeEventListener("click", this.toggle);
        this.trigger.removeEventListener("keydown", this.handleTriggerKeydown);
        this.previous.removeEventListener("click", this.showPreviousMonth);
        this.next.removeEventListener("click", this.showNextMonth);
        this.today.removeEventListener("click", this.chooseToday);
        this.clear.removeEventListener("click", this.clearValue);
        this.days.removeEventListener("click", this.chooseDay);
        this.days.removeEventListener("keydown", this.handleDayKeydown);
        this.popover.removeEventListener("keydown", this.handlePopoverKeydown);
        this.input.removeEventListener("input", this.sync);
        this.input.removeEventListener("change", this.sync);
        this.input.removeEventListener("focus", this.redirectFocus);
        this.input.removeEventListener("click", this.openFromSource);
        this.host.ownerDocument.removeEventListener("pointerdown", this.closeFromOutside);
        this.host.ownerDocument.removeEventListener("reset", this.handleReset);
        this.restoreSource();
        this.trigger.remove();
        this.previous.remove();
        this.next.remove();
        this.today.remove();
        this.clear.remove();
    }

    sync = (): void => {
        const selected = parseDate(this.input.value);
        if (selected) {
            this.viewDate = new Date(selected.getFullYear(), selected.getMonth(), 1);
            this.activeDate = selected;
        }
        const locale = this.locale();
        this.value.textContent = selected
            ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(selected)
            : this.input.getAttribute("placeholder") || "Select a date";
        this.trigger.disabled = this.input.disabled;
        this.trigger.setAttribute("aria-label", labelFor(this.input));
        this.trigger.setAttribute("aria-expanded", String(!this.popover.hasAttribute("hidden")));
        this.clear.disabled = this.input.required || !this.input.value;
        this.render();
    };

    private render(): void {
        const locale = this.locale();
        this.monthLabel.textContent = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
            this.viewDate,
        );
        const sunday = new Date(2024, 0, 7);
        this.weekdays.replaceChildren(
            ...Array.from({ length: 7 }, (_, index) => {
                const day = document.createElement("span");
                day.textContent = new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(addDays(sunday, index));
                day.setAttribute("part", "weekday");
                day.setAttribute("aria-hidden", "true");
                return day;
            }),
        );
        const first = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth(), 1);
        const start = addDays(first, -first.getDay());
        const today = toIso(new Date());
        this.days.replaceChildren(
            ...Array.from({ length: 42 }, (_, index) => {
                const date = addDays(start, index);
                const iso = toIso(date);
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = String(date.getDate());
                button.dataset.date = iso;
                button.setAttribute("part", "day");
                button.setAttribute("aria-label", new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(date));
                button.setAttribute("aria-selected", String(iso === this.input.value));
                button.toggleAttribute("data-outside", date.getMonth() !== this.viewDate.getMonth());
                button.toggleAttribute("data-today", iso === today);
                button.toggleAttribute("data-active", iso === toIso(this.activeDate));
                button.disabled = this.isDisabled(iso);
                button.tabIndex = iso === toIso(this.activeDate) ? 0 : -1;
                return button;
            }),
        );
        this.previous.setAttribute("aria-label", this.host.getAttribute("previous-month-label") || "Previous month");
        this.next.setAttribute("aria-label", this.host.getAttribute("next-month-label") || "Next month");
        this.today.textContent = this.host.getAttribute("today-label") || "Today";
        this.clear.textContent = this.host.getAttribute("clear-label") || "Clear";
    }

    private isDisabled(iso: string): boolean {
        return Boolean((this.input.min && iso < this.input.min) || (this.input.max && iso > this.input.max));
    }

    private toggle = (): void => this.setOpen(this.popover.hasAttribute("hidden"));

    private setOpen(open: boolean): void {
        const nextOpen = open && !this.input.disabled;
        this.popover.toggleAttribute("hidden", !nextOpen);
        this.trigger.setAttribute("aria-expanded", String(nextOpen));
        this.host.toggleAttribute("data-date-open", nextOpen);
        if (nextOpen) {
            queueMicrotask(() => this.days.querySelector<HTMLElement>("[data-active]")?.focus());
        }
    }

    private selectDate(date: Date): void {
        const iso = toIso(date);
        if (this.isDisabled(iso)) {
            return;
        }
        this.input.value = iso;
        this.input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        this.input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        this.setOpen(false);
        this.trigger.focus();
    }

    private chooseDay = (event: Event): void => {
        const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-date]") : null;
        const date = button?.dataset.date ? parseDate(button.dataset.date) : null;
        if (date) {
            this.selectDate(date);
        }
    };

    private handleDayKeydown = (event: KeyboardEvent): void => {
        const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (event.key in offsets) {
            this.moveActive(addDays(this.activeDate, offsets[event.key]));
        } else if (event.key === "Home") {
            this.moveActive(addDays(this.activeDate, -this.activeDate.getDay()));
        } else if (event.key === "End") {
            this.moveActive(addDays(this.activeDate, 6 - this.activeDate.getDay()));
        } else if (event.key === "PageUp" || event.key === "PageDown") {
            const direction = event.key === "PageUp" ? -1 : 1;
            this.moveActive(new Date(this.activeDate.getFullYear(), this.activeDate.getMonth() + direction, 1));
        } else if (event.key === "Enter" || event.key === " ") {
            this.selectDate(this.activeDate);
        } else {
            return;
        }
        event.preventDefault();
    };

    private moveActive(date: Date): void {
        this.activeDate = date;
        this.viewDate = new Date(date.getFullYear(), date.getMonth(), 1);
        this.render();
        queueMicrotask(() => this.days.querySelector<HTMLElement>(`[data-date="${toIso(date)}"]`)?.focus());
    }

    private showPreviousMonth = (): void => this.changeMonth(-1);
    private showNextMonth = (): void => this.changeMonth(1);
    private changeMonth(direction: number): void {
        this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + direction, 1);
        this.activeDate = new Date(this.viewDate);
        this.render();
        queueMicrotask(() => this.days.querySelector<HTMLElement>("[data-active]")?.focus());
    }

    private chooseToday = (): void => this.selectDate(new Date());
    private clearValue = (): void => {
        if (this.input.required) {
            return;
        }
        this.input.value = "";
        this.input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        this.input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        this.setOpen(false);
        this.trigger.focus();
    };

    private handleTriggerKeydown = (event: KeyboardEvent): void => {
        if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            this.setOpen(true);
            event.preventDefault();
        }
    };

    private handlePopoverKeydown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
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
        if (event.target instanceof Node && !this.host.contains(event.target) && !this.shadow.contains(event.target)) {
            this.setOpen(false);
        }
    };

    private handleReset = (event: Event): void => {
        if (event.target === this.input.form) {
            window.setTimeout(this.sync);
        }
    };

    private createAction(shellPart: string, part: string): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("part", part);
        this.shadow.querySelector(`[part="${shellPart}"]`)?.append(button);
        return button;
    }

    private requiredPart(part: string): HTMLElement {
        const element = this.shadow.querySelector<HTMLElement>(`[part="${part}"]`);
        if (!element) {
            throw new Error(`Missing date picker part: ${part}`);
        }
        return element;
    }

    private locale(): string {
        return this.host.getAttribute("locale") || this.host.ownerDocument.documentElement.lang || "en";
    }

    private restoreSource(): void {
        this.sourceTabIndex === null
            ? this.input.removeAttribute("tabindex")
            : this.input.setAttribute("tabindex", this.sourceTabIndex);
        this.sourceAriaHidden === null
            ? this.input.removeAttribute("aria-hidden")
            : this.input.setAttribute("aria-hidden", this.sourceAriaHidden);
    }
}

export class Bloc extends Component {
    private input: HTMLInputElement | null = null;
    private slotElement: HTMLSlotElement | null;
    private dateUi: HTMLElement | null;
    private datePicker: DatePicker | null = null;
    private observer = new MutationObserver(() => this.syncState());

    static get observedAttributes(): string[] {
        return ["locale", "today-label", "clear-label", "previous-month-label", "next-month-label"];
    }

    constructor() {
        super({ css, template });
        this.slotElement = this.shadowRoot?.querySelector("slot") ?? null;
        this.dateUi = this.shadowRoot?.querySelector('[part="date-ui"]') ?? null;
    }

    override connectedCallback(): void {
        this.slotElement?.addEventListener("slotchange", this.bindInput);
        this.bindInput();
    }

    disconnectedCallback(): void {
        this.slotElement?.removeEventListener("slotchange", this.bindInput);
        this.observer.disconnect();
        this.datePicker?.disconnect();
        this.datePicker = null;
    }

    attributeChangedCallback(): void {
        this.datePicker?.sync();
    }

    private bindInput = (): void => {
        this.observer.disconnect();
        this.datePicker?.disconnect();
        this.datePicker = null;
        this.input = this.querySelector<HTMLInputElement>(":scope > input");
        if (this.input) {
            this.observer.observe(this.input, {
                attributes: true,
                attributeFilter: [
                    "aria-invalid",
                    "disabled",
                    "max",
                    "min",
                    "placeholder",
                    "readonly",
                    "required",
                    "type",
                ],
            });
        }
        this.syncState();
    };

    private syncState(): void {
        const customDate = this.input?.type === "date";
        if (customDate && this.input && this.shadowRoot && !this.datePicker) {
            this.datePicker = new DatePicker(this, this.input, this.shadowRoot);
            this.datePicker.connect();
        } else if (!customDate && this.datePicker) {
            this.datePicker.disconnect();
            this.datePicker = null;
        }
        this.dateUi?.toggleAttribute("hidden", !customDate);
        this.toggleAttribute("data-custom-date", customDate);
        this.toggleAttribute("data-disabled", this.input?.disabled === true);
        this.toggleAttribute("data-invalid", this.input?.getAttribute("aria-invalid") === "true");
        this.datePicker?.sync();
    }
}
