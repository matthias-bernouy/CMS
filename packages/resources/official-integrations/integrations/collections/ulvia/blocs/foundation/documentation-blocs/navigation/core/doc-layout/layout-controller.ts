const MOBILE_QUERY = "(max-width: 60rem)";
const THEME_KEY = "documentation-color-scheme";

export class LayoutController {
    backdrop = null;
    host = null;
    media = window.matchMedia("(prefers-color-scheme: dark)");
    themeButton = null;
    toggle = null;

    constructor(host) {
        this.host = host;
        this.backdrop = host.shadowRoot?.querySelector(".backdrop") ?? null;
        this.themeButton = host.shadowRoot?.querySelector(".theme-toggle") ?? null;
        this.toggle = host.shadowRoot?.querySelector(".toggle") ?? null;
    }

    connect() {
        this.toggle?.addEventListener("click", this.onToggle);
        this.backdrop?.addEventListener("click", this.onClose);
        this.themeButton?.addEventListener("click", this.onThemeToggle);
        this.host.addEventListener("click", this.onHostClick);
        document.addEventListener("keydown", this.onFocusTrap);
        this.media.addEventListener("change", this.sync);
        this.sync();
    }

    disconnect() {
        this.toggle?.removeEventListener("click", this.onToggle);
        this.backdrop?.removeEventListener("click", this.onClose);
        this.themeButton?.removeEventListener("click", this.onThemeToggle);
        this.host.removeEventListener("click", this.onHostClick);
        document.removeEventListener("keydown", this.onFocusTrap);
        this.media.removeEventListener("change", this.sync);
        document.body.style.removeProperty("overflow");
    }

    sync = () => {
        const open = this.host.hasAttribute("sidebar-open");
        this.toggle?.setAttribute("aria-expanded", String(open));
        this.toggle?.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
        if (open && matchMedia(MOBILE_QUERY).matches) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.removeProperty("overflow");
        }
        const configured = this.host.getAttribute("theme") ?? this.host.getAttribute("variant") ?? "system";
        const stored = localStorage.getItem(THEME_KEY);
        const choice = configured === "system" && stored ? stored : configured;
        const dark = choice === "dark" || (choice === "system" && this.media.matches);
        this.host.toggleAttribute("data-dark", dark);
        this.themeButton?.setAttribute("aria-label", dark ? "Use light theme" : "Use dark theme");
    };

    onToggle = () => {
        const open = !this.host.hasAttribute("sidebar-open");
        this.host.toggleAttribute("sidebar-open", open);
        if (open) {
            requestAnimationFrame(() => this.host.querySelector('[slot="sidebar"] a[href]')?.focus());
        }
    };

    onClose = () => this.close(true);

    onHostClick = (event) => {
        if (
            this.host.hasAttribute("sidebar-open") &&
            event.composedPath().some((node) => node instanceof HTMLAnchorElement)
        ) {
            this.close(false);
        }
    };

    onFocusTrap = (event) => {
        if (event.key !== "Tab" || !this.host.hasAttribute("sidebar-open")) {
            return;
        }
        const sidebarControls = this.host.querySelectorAll('[slot="sidebar"] a[href], [slot="sidebar"] button');
        const focusable = [this.toggle, ...sidebarControls].filter(Boolean);
        const edge = event.shiftKey ? focusable[0] : focusable.at(-1);
        if (document.activeElement === edge) {
            event.preventDefault();
            focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus();
        }
    };

    onThemeToggle = () => {
        const next = this.host.hasAttribute("data-dark") ? "light" : "dark";
        if ((this.host.getAttribute("theme") ?? "system") === "system") {
            localStorage.setItem(THEME_KEY, next);
        }
        this.host.toggleAttribute("data-dark", next === "dark");
        this.themeButton?.setAttribute("aria-label", next === "dark" ? "Use light theme" : "Use dark theme");
    };

    close(restoreFocus) {
        this.host.removeAttribute("sidebar-open");
        if (restoreFocus) {
            this.toggle?.focus();
        }
    }
}
