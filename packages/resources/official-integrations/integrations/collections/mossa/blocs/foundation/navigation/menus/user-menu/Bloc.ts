import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const trigger = this.shadowRoot!.querySelector(".trigger") as HTMLButtonElement;
        trigger.addEventListener("click", this._onToggle);
        document.addEventListener("click", this._onOutsideClick);
        document.addEventListener("keydown", this._onEscape);

        this._roleSlot = this.shadowRoot!.querySelector('slot[name="role"]') as HTMLSlotElement;
        this._logoutSlot = this.shadowRoot!.querySelector('slot[name="logout"]') as HTMLSlotElement;
        this._roleSlot.addEventListener("slotchange", this._onSlotChange);
        this._logoutSlot.addEventListener("slotchange", this._onSlotChange);
        this._onSlotChange();
    }

    disconnectedCallback(): void {
        const trigger = this.shadowRoot!.querySelector(".trigger") as HTMLButtonElement;
        trigger?.removeEventListener("click", this._onToggle);
        document.removeEventListener("click", this._onOutsideClick);
        document.removeEventListener("keydown", this._onEscape);
        this._roleSlot?.removeEventListener("slotchange", this._onSlotChange);
        this._logoutSlot?.removeEventListener("slotchange", this._onSlotChange);
    }

    private _roleSlot: HTMLSlotElement | null = null;
    private _logoutSlot: HTMLSlotElement | null = null;

    private _onSlotChange = () => {
        this.toggleAttribute("has-role", this.hasAssignedElement(this._roleSlot));
        this.toggleAttribute("has-logout", this.hasAssignedElement(this._logoutSlot));
    };

    private hasAssignedElement(slot: HTMLSlotElement | null): boolean {
        return (slot?.assignedElements().length ?? 0) > 0;
    }

    private _onToggle = (e: Event) => {
        e.stopPropagation();
        this.toggleAttribute("open");
    };

    private _onOutsideClick = (e: Event) => {
        if (!this.hasAttribute("open")) {
            return;
        }
        if (this.contains(e.target as Node)) {
            return;
        }
        this.removeAttribute("open");
    };

    private _onEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            this.removeAttribute("open");
        }
    };
}
