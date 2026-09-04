const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export class RestaurantMenuController {
    constructor(host) {
        this.host = host;
        this.connected = false;
        this.lastState = undefined;
        this.previousOverflow = "";
        this.trigger = undefined;
        this.onClick = this.onClick.bind(this);
        this.onKeydown = this.onKeydown.bind(this);
        this.onRequest = this.onRequest.bind(this);
    }

    connect() {
        if (this.connected) {
            return;
        }
        this.connected = true;
        this.host.addEventListener("click", this.onClick);
        this.host.ownerDocument.addEventListener("keydown", this.onKeydown);
        this.host.ownerDocument.addEventListener("restaurant-menu-request", this.onRequest);
        this.sync();
    }

    disconnect() {
        this.connected = false;
        this.host.removeEventListener("click", this.onClick);
        this.host.ownerDocument.removeEventListener("keydown", this.onKeydown);
        this.host.ownerDocument.removeEventListener("restaurant-menu-request", this.onRequest);
        this.unlockScroll();
    }

    open(trigger) {
        this.trigger = trigger;
        this.host.setAttribute("open", "");
    }

    close() {
        this.host.removeAttribute("open");
    }

    sync() {
        const open = this.host.hasAttribute("open");
        const panel = this.host.shadowRoot?.querySelector('[part="panel"]');
        panel?.setAttribute("aria-hidden", String(!open));
        if (open) {
            this.lockScroll();
            requestAnimationFrame(() => panel?.focus());
        } else {
            this.unlockScroll();
            if (this.lastState === true) {
                this.trigger?.focus?.();
            }
        }
        if (open !== this.lastState) {
            this.lastState = open;
            this.host.dispatchEvent(
                new CustomEvent("restaurant-menu-state", {
                    bubbles: true,
                    composed: true,
                    detail: { open, target: this.host.id || "restaurant-menu" },
                }),
            );
        }
    }

    onClick(event) {
        const path = event.composedPath();
        const closes = path.some(
            (candidate) => candidate instanceof Element && candidate.hasAttribute("data-menu-close"),
        );
        const navigationLink = path.find(
            (candidate) => candidate instanceof HTMLAnchorElement && candidate.getAttribute("slot") === "navigation",
        );
        if (closes || (navigationLink && this.host.getAttribute("close-on-navigation") !== "off")) {
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
        const focusable = this.focusable();
        if (!focusable.length) {
            event.preventDefault();
            return;
        }
        const first = focusable[0];
        const last = focusable.at(-1);
        const active = this.host.shadowRoot?.activeElement || this.host.ownerDocument.activeElement;
        if (event.shiftKey && active === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first?.focus();
        }
    }

    onRequest(event) {
        if (event.detail?.target !== (this.host.id || "restaurant-menu")) {
            return;
        }
        if (event.detail.action === "close") {
            this.close();
        } else if (event.detail.action === "open" || !this.host.hasAttribute("open")) {
            this.open(event.detail.trigger);
        } else {
            this.close();
        }
    }

    focusable() {
        return [...this.host.querySelectorAll(FOCUSABLE), ...this.host.shadowRoot.querySelectorAll(FOCUSABLE)].filter(
            (element) => !element.hasAttribute("hidden"),
        );
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
