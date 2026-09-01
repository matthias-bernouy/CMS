export class RestaurantMenuTriggerController {
    constructor(host) {
        this.host = host;
        this.connected = false;
        this.onClick = this.onClick.bind(this);
        this.onSlotChange = this.onSlotChange.bind(this);
        this.onState = this.onState.bind(this);
    }

    connect() {
        if (this.connected) {
            return;
        }
        this.connected = true;
        this.host.addEventListener("click", this.onClick);
        this.host.shadowRoot?.addEventListener("slotchange", this.onSlotChange);
        this.host.ownerDocument.addEventListener("restaurant-menu-state", this.onState);
        this.refresh();
    }

    disconnect() {
        this.connected = false;
        this.host.removeEventListener("click", this.onClick);
        this.host.shadowRoot?.removeEventListener("slotchange", this.onSlotChange);
        this.host.ownerDocument.removeEventListener("restaurant-menu-state", this.onState);
    }

    refresh() {
        const trigger = this.trigger();
        const target = this.target();
        if (!trigger || trigger.localName === "basic-menu" || !target) {
            return;
        }
        trigger.setAttribute("aria-controls", target);
        trigger.setAttribute("aria-expanded", String(this.host.hasAttribute("menu-open")));
        trigger.setAttribute("aria-haspopup", "dialog");
    }

    onClick(event) {
        const path = event.composedPath();
        const menuSurface = path.some(
            (candidate) =>
                candidate instanceof Element && candidate.getAttribute("part")?.split(/\s+/).includes("menu"),
        );
        const trigger =
            path.find((candidate) => candidate instanceof Element && candidate.getAttribute("slot") === "menu") ??
            (menuSurface ? this.trigger() : undefined);
        const target = this.target();
        if (!trigger || trigger.localName === "basic-menu" || !target) {
            return;
        }
        event.preventDefault();
        trigger.focus?.();
        this.host.dispatchEvent(
            new CustomEvent("restaurant-menu-request", {
                bubbles: true,
                composed: true,
                detail: { action: "toggle", target, trigger },
            }),
        );
    }

    onSlotChange() {
        this.refresh();
    }

    onState(event) {
        if (event.detail?.target !== this.target()) {
            return;
        }
        const open = event.detail.open === true;
        this.host.toggleAttribute("menu-open", open);
        const trigger = this.trigger();
        trigger?.setAttribute("aria-expanded", String(open));
    }

    target() {
        return this.host.getAttribute("menu-target")?.trim() || "restaurant-menu";
    }

    trigger() {
        return this.host.querySelector('[slot="menu"]');
    }
}
