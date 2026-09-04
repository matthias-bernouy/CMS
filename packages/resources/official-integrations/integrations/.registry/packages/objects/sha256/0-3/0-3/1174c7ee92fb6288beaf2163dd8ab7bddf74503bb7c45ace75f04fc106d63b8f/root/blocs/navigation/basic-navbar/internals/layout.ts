export class NavbarLayoutController {
    constructor({ host, bar, brand, links, actions, navigation, slots, onExpanded }) {
        this.host = host;
        this.bar = bar;
        this.brand = brand;
        this.links = links;
        this.actions = actions;
        this.navigation = navigation;
        this.slots = slots;
        this.onExpanded = onExpanded;
        this.resizeObserver = null;
        this.mutationObserver = null;
        this.frame = null;
    }

    connect() {
        this.host.addEventListener("load", this.schedule, true);
        for (const slot of this.slots) {
            slot.addEventListener("slotchange", this.schedule);
        }
        if (globalThis.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(this.schedule);
            for (const element of [this.host, this.brand, this.links, this.actions]) {
                this.resizeObserver.observe(element);
            }
        }
        if (globalThis.MutationObserver) {
            this.mutationObserver = new MutationObserver(this.schedule);
            this.mutationObserver.observe(this.host, {
                attributes: true,
                attributeFilter: ["class", "slot", "style"],
                characterData: true,
                childList: true,
                subtree: true,
            });
        }
        this.schedule();
        this.host.ownerDocument.fonts?.ready.then(this.schedule);
    }

    disconnect() {
        this.host.removeEventListener("load", this.schedule, true);
        for (const slot of this.slots) {
            slot.removeEventListener("slotchange", this.schedule);
        }
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.mutationObserver?.disconnect();
        this.mutationObserver = null;
        if (this.frame !== null) {
            this.host.ownerDocument.defaultView?.cancelAnimationFrame(this.frame);
            this.frame = null;
        }
    }

    schedule = () => {
        if (this.frame !== null || !this.host.isConnected) {
            return;
        }
        const view = this.host.ownerDocument.defaultView;
        if (!view) {
            this.measure();
            return;
        }
        this.frame = view.requestAnimationFrame(this.measure);
    };

    measure = () => {
        this.frame = null;
        if (!this.host.isConnected) {
            return;
        }
        this.host.removeAttribute("collapsed");
        const collapsed = this.requiredWidth() > this.bar.clientWidth + 1;
        this.host.toggleAttribute("collapsed", collapsed);
        if (!collapsed) {
            this.onExpanded();
        }
    };

    requiredWidth() {
        const barStyle = getComputedStyle(this.bar);
        const panelStyle = getComputedStyle(this.navigation);
        const brandVisible = getComputedStyle(this.brand).display !== "none";
        const actionsVisible = getComputedStyle(this.actions).display !== "none";
        return (
            pixels(barStyle.paddingLeft) +
            pixels(barStyle.paddingRight) +
            (brandVisible ? this.brand.scrollWidth + pixels(barStyle.columnGap) : 0) +
            this.links.scrollWidth +
            (actionsVisible ? pixels(panelStyle.columnGap) + this.actions.scrollWidth : 0)
        );
    }
}

function pixels(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
