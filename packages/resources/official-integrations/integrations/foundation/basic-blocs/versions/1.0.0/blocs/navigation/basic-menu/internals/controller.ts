import { trapMenuFocus } from "./focus";

let generatedId = 0;

export class BasicMenuController {
    constructor(host) {
        this.host = host;
        this.connected = false;
        this.lastState = undefined;
        this.previousOverflow = "";
        this.triggerElement = undefined;
        this.onClick = this.onClick.bind(this);
        this.onKeydown = this.onKeydown.bind(this);
        this.onSlotChange = this.onSlotChange.bind(this);
    }

    connect() {
        if (this.connected) {
            return;
        }
        this.connected = true;
        this.host.addEventListener("click", this.onClick);
        this.host.ownerDocument.addEventListener("keydown", this.onKeydown);
        this.host.shadowRoot?.addEventListener("slotchange", this.onSlotChange);
        this.sync();
    }

    disconnect() {
        this.connected = false;
        this.host.removeEventListener("click", this.onClick);
        this.host.ownerDocument.removeEventListener("keydown", this.onKeydown);
        this.host.shadowRoot?.removeEventListener("slotchange", this.onSlotChange);
        this.unlockScroll();
    }

    open() {
        if (this.trigger()) {
            this.host.setAttribute("open", "");
        }
    }

    close() {
        this.host.removeAttribute("open");
    }

    toggle() {
        if (this.host.hasAttribute("open")) {
            this.close();
        } else {
            this.open();
        }
    }

    sync() {
        const open = this.host.hasAttribute("open");
        const panel = this.panel();
        const trigger = this.trigger();
        const panelId = this.panelId();
        panel?.setAttribute("id", panelId);
        panel?.setAttribute("aria-hidden", String(!open));
        panel?.setAttribute("aria-label", this.host.getAttribute("navigation-label")?.trim() || "Menu navigation");
        const closeLabel = this.host.getAttribute("close-label")?.trim() || "Close";
        this.host.shadowRoot?.querySelector("[data-close-label]")?.replaceChildren(closeLabel);
        if (trigger) {
            trigger.setAttribute("aria-controls", panelId);
            trigger.setAttribute("aria-expanded", String(open));
            trigger.setAttribute("aria-haspopup", "dialog");
            this.linkAriaControl(trigger, panel);
        }
        if (open) {
            this.lockScroll();
            requestAnimationFrame(() => panel?.focus());
        } else {
            this.unlockScroll();
            if (this.lastState === true) {
                this.triggerElement?.focus();
            }
        }
        if (open !== this.lastState) {
            this.lastState = open;
            this.host.dispatchEvent(
                new CustomEvent("basic-menu-state", {
                    bubbles: true,
                    composed: true,
                    detail: { id: this.host.id, open },
                }),
            );
        }
    }

    onClick(event) {
        const path = event.composedPath();
        const trigger = this.trigger();
        if (trigger && path.includes(trigger)) {
            event.preventDefault();
            this.triggerElement = trigger;
            this.toggle();
            return;
        }
        const closes = path.some(
            (candidate) => candidate instanceof Element && candidate.hasAttribute("data-menu-close"),
        );
        const navigation = path.some(
            (candidate) => candidate instanceof HTMLAnchorElement && candidate.getAttribute("slot") === "navigation",
        );
        if (closes || (navigation && this.host.getAttribute("close-on-navigation") !== "off")) {
            this.close();
        }
    }

    onKeydown(event) {
        if (!this.host.hasAttribute("open")) {
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            this.close();
            return;
        }
        if (event.key !== "Tab") {
            return;
        }
        trapMenuFocus(this.host, event, this.trigger());
    }

    onSlotChange() {
        this.triggerElement = undefined;
        this.sync();
    }

    trigger() {
        const assigned = this.host.querySelector(':scope > [slot="trigger"]');
        if (assigned instanceof HTMLButtonElement) {
            return assigned;
        }
        if (assigned?.localName === "basic-button") {
            const button = assigned.querySelector(":scope > button");
            return button instanceof HTMLButtonElement ? button : undefined;
        }
        return undefined;
    }

    panel() {
        return this.host.shadowRoot?.querySelector('[part="panel"]');
    }

    panelId() {
        if (!this.host.id) {
            generatedId += 1;
            this.host.id = `basic-menu-${generatedId}`;
        }
        return `${this.host.id}-panel`;
    }

    linkAriaControl(trigger, panel) {
        if (panel && "ariaControlsElements" in trigger) {
            trigger.ariaControlsElements = [panel];
        }
    }

    lockScroll() {
        const root = this.host.ownerDocument.documentElement;
        if (root.style.overflow !== "hidden") {
            this.previousOverflow = root.style.overflow;
            root.style.overflow = "hidden";
        }
    }

    unlockScroll() {
        const root = this.host.ownerDocument.documentElement;
        if (root.style.overflow === "hidden") {
            root.style.overflow = this.previousOverflow;
        }
    }
}
