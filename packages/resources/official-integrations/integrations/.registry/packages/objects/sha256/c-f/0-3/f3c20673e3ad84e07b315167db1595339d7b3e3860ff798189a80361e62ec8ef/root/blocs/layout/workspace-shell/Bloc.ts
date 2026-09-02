import { Component } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

const MOBILE_MEDIA_QUERY = "(max-width: 720px)";

export class WorkspaceShell extends Component {
    mobileMedia = null;

    constructor() {
        super({ css, template });
        this.sidebar = this.shadowRoot?.querySelector(".app-sidebar") ?? null;
        this.secondarySidebar = this.shadowRoot?.querySelector(".secondary-sidebar") ?? null;
        this.secondarySlot = this.shadowRoot?.querySelector('slot[name="secondary-sidebar"]') ?? null;
        this.content = this.shadowRoot?.querySelector(".app-content") ?? null;
        this.primaryMobileToggle = this.shadowRoot?.querySelector('[data-mobile-nav="primary"]') ?? null;
        this.secondaryMobileToggle = this.shadowRoot?.querySelector('[data-mobile-nav="secondary"]') ?? null;
        this.mobileBackdrop = this.shadowRoot?.querySelector("[data-mobile-nav-close]") ?? null;
    }

    static get observedAttributes() {
        return ["collapsed", "content-padding", "secondary-sidebar-width", "sidebar-width"];
    }

    connectedCallback() {
        upgradeProperty(this, "collapsed");
        this.syncLayoutSettings();
        this.syncAriaState();
        this.syncSecondarySidebar();
        this.mobileMedia = window.matchMedia(MOBILE_MEDIA_QUERY);
        this.syncMobileNavigation();
        this.secondarySlot?.addEventListener("slotchange", this.onSecondarySlotChange);
        this.primaryMobileToggle?.addEventListener("click", this.onPrimaryMobileToggle);
        this.secondaryMobileToggle?.addEventListener("click", this.onSecondaryMobileToggle);
        this.mobileBackdrop?.addEventListener("click", this.onMobileBackdropClick);
        this.addEventListener("click", this.onNavigationClick);
        this.shadowRoot?.addEventListener("keydown", this.onKeyDown);
        this.mobileMedia.addEventListener("change", this.onMobileMediaChange);
    }

    disconnectedCallback() {
        this.secondarySlot?.removeEventListener("slotchange", this.onSecondarySlotChange);
        this.primaryMobileToggle?.removeEventListener("click", this.onPrimaryMobileToggle);
        this.secondaryMobileToggle?.removeEventListener("click", this.onSecondaryMobileToggle);
        this.mobileBackdrop?.removeEventListener("click", this.onMobileBackdropClick);
        this.removeEventListener("click", this.onNavigationClick);
        this.shadowRoot?.removeEventListener("keydown", this.onKeyDown);
        this.mobileMedia?.removeEventListener("change", this.onMobileMediaChange);
        this.mobileMedia = null;
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) {
            return;
        }
        this.syncLayoutSettings();
        if (name === "collapsed" && this.sidebar) {
            this.syncAriaState();
            this.dispatchEvent(
                new CustomEvent("workspace-shell-collapse", {
                    bubbles: true,
                    composed: true,
                    detail: { collapsed: newValue !== null },
                }),
            );
        }
    }

    syncLayoutSettings() {
        this.syncLength("sidebar-width", "--workspace-shell-sidebar-width");
        this.syncLength("secondary-sidebar-width", "--workspace-shell-secondary-width");
        this.syncLength("content-padding", "--workspace-shell-content-padding");
    }

    syncLength(attribute, property) {
        const value = validLength(this.getAttribute(attribute));
        if (value) {
            this.style.setProperty(property, value);
        } else {
            this.style.removeProperty(property);
        }
    }

    syncAriaState() {
        const collapsed = this.hasAttribute("collapsed");
        this.sidebar?.setAttribute("aria-expanded", String(!collapsed));
        this.sidebar?.setAttribute("aria-hidden", String(collapsed));
    }

    syncSecondarySidebar() {
        if (!this.secondarySidebar || !this.secondarySlot) {
            return;
        }
        const hasNavigation = this.secondarySlot
            .assignedElements({ flatten: true })
            .some((element) => element instanceof HTMLElement && !element.hidden);
        this.secondarySidebar.hidden = !hasNavigation;
        if (this.secondaryMobileToggle) {
            this.secondaryMobileToggle.hidden = !hasNavigation;
        }
        if (!hasNavigation) {
            this.removeAttribute("mobile-secondary-open");
        }
        this.syncMobileNavigation();
    }

    onSecondarySlotChange = () => this.syncSecondarySidebar();

    onPrimaryMobileToggle = () => {
        this.toggleAttribute("mobile-primary-open", !this.hasAttribute("mobile-primary-open"));
        this.removeAttribute("mobile-secondary-open");
        this.syncMobileNavigation();
    };

    onSecondaryMobileToggle = () => {
        this.toggleAttribute("mobile-secondary-open", !this.hasAttribute("mobile-secondary-open"));
        this.removeAttribute("mobile-primary-open");
        this.syncMobileNavigation();
    };

    onMobileBackdropClick = () => this.closeMobileNavigation(true);

    onNavigationClick = (event) => {
        const path = event.composedPath();
        const navigationOpen = this.hasAttribute("mobile-primary-open") || this.hasAttribute("mobile-secondary-open");
        const mobileControl = [this.primaryMobileToggle, this.secondaryMobileToggle, this.mobileBackdrop].some(
            (control) => control !== null && path.includes(control),
        );
        if (
            !this.mobileMedia?.matches ||
            !navigationOpen ||
            mobileControl ||
            !this.isNavigationPath(event, path) ||
            !isNavigationAction(path)
        ) {
            return;
        }
        this.closeMobileNavigation(false);
        this.content?.focus();
    };

    isNavigationPath(event, path) {
        if (
            (this.sidebar !== null && path.includes(this.sidebar)) ||
            (this.secondarySidebar !== null && path.includes(this.secondarySidebar))
        ) {
            return true;
        }
        let current = event.target instanceof Node ? event.target : null;
        while (current && current !== this) {
            if (
                current instanceof HTMLElement &&
                (current.slot === "sidebar" || current.slot === "secondary-sidebar")
            ) {
                return true;
            }
            current = current.parentNode;
        }
        return false;
    }

    onKeyDown = (event) => {
        if (
            event instanceof KeyboardEvent &&
            event.key === "Escape" &&
            (this.hasAttribute("mobile-primary-open") || this.hasAttribute("mobile-secondary-open"))
        ) {
            event.preventDefault();
            this.closeMobileNavigation(true);
        }
    };

    onMobileMediaChange = () => {
        if (!this.mobileMedia?.matches) {
            this.closeMobileNavigation(false);
        } else {
            this.syncMobileNavigation();
        }
    };

    closeMobileNavigation(restoreFocus) {
        const primaryWasOpen = this.hasAttribute("mobile-primary-open");
        const secondaryWasOpen = this.hasAttribute("mobile-secondary-open");
        this.removeAttribute("mobile-primary-open");
        this.removeAttribute("mobile-secondary-open");
        this.syncMobileNavigation();
        if (restoreFocus) {
            (primaryWasOpen ? this.primaryMobileToggle : secondaryWasOpen ? this.secondaryMobileToggle : null)?.focus();
        }
    }

    syncMobileNavigation() {
        const mobile = this.mobileMedia?.matches ?? false;
        const primaryOpen = mobile && this.hasAttribute("mobile-primary-open");
        const secondaryOpen = mobile && !this.secondarySidebar?.hidden && this.hasAttribute("mobile-secondary-open");
        this.primaryMobileToggle?.setAttribute("aria-expanded", String(primaryOpen));
        this.secondaryMobileToggle?.setAttribute("aria-expanded", String(secondaryOpen));
        if (this.mobileBackdrop) {
            this.mobileBackdrop.hidden = !primaryOpen && !secondaryOpen;
        }
        this.syncMobileSidebarAccessibility(this.sidebar, mobile, primaryOpen);
        this.syncMobileSidebarAccessibility(this.secondarySidebar, mobile, secondaryOpen);
    }

    syncMobileSidebarAccessibility(sidebar, mobile, open) {
        if (!sidebar) {
            return;
        }
        if (!mobile) {
            sidebar.removeAttribute("inert");
            if (sidebar === this.sidebar) {
                this.syncAriaState();
            } else {
                sidebar.removeAttribute("aria-hidden");
            }
            return;
        }
        sidebar.setAttribute("aria-hidden", String(!open));
        sidebar.toggleAttribute("inert", !open);
    }

    get collapsed() {
        return this.hasAttribute("collapsed");
    }

    set collapsed(value) {
        this.toggleAttribute("collapsed", Boolean(value));
    }

    toggle() {
        this.collapsed = !this.collapsed;
    }

    focusContent() {
        this.content?.focus();
    }
}

function isNavigationAction(path) {
    return path.some(
        (target) =>
            target instanceof Element &&
            target.matches("a[href], button:not([disabled]), workspace-lateral-menu-item:not([disabled])"),
    );
}

function validLength(value) {
    const candidate = value?.trim() || "";
    return /^\d+(?:\.\d+)?(?:px|rem|em|ch|vw)$/.test(candidate) ? candidate : null;
}

function upgradeProperty(element, property) {
    if (!Object.hasOwn(element, property)) {
        return;
    }
    const value = element[property];
    delete element[property];
    element[property] = value;
}

customElements.define("BE5_TAG_TO_BE_REPLACED", WorkspaceShell);
