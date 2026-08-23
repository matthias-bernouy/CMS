import { Component, upgradeProperty } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

const MOBILE_MEDIA_QUERY = "(max-width: 720px)";

export class LeftMenuLayout extends Component {
    private _sidebar: HTMLElement | null;
    private _secondarySidebar: HTMLElement | null;
    private _secondarySlot: HTMLSlotElement | null;
    private _content: HTMLElement | null;
    private _primaryMobileToggle: HTMLButtonElement | null;
    private _secondaryMobileToggle: HTMLButtonElement | null;
    private _mobileBackdrop: HTMLButtonElement | null;
    private _skipLink: HTMLAnchorElement | null;
    private _mobileMedia: MediaQueryList | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._sidebar = this.shadowRoot?.querySelector(".app-sidebar") ?? null;
        this._secondarySidebar = this.shadowRoot?.querySelector(".secondary-sidebar") ?? null;
        this._secondarySlot = this.shadowRoot?.querySelector('slot[name="secondary-sidebar"]') ?? null;
        this._content = this.shadowRoot?.querySelector(".app-content") ?? null;
        this._primaryMobileToggle = this.shadowRoot?.querySelector('[data-mobile-nav="primary"]') ?? null;
        this._secondaryMobileToggle = this.shadowRoot?.querySelector('[data-mobile-nav="secondary"]') ?? null;
        this._mobileBackdrop = this.shadowRoot?.querySelector("[data-mobile-nav-close]") ?? null;
        this._skipLink = this.shadowRoot?.querySelector(".skip-link") ?? null;
    }

    static get observedAttributes() {
        return ["collapsed"];
    }

    override connectedCallback() {
        for (const prop of ["collapsed"]) {
            upgradeProperty(this, prop);
        }

        this._syncAriaState();
        this._syncSecondarySidebar();
        this._mobileMedia = window.matchMedia(MOBILE_MEDIA_QUERY);
        this._syncMobileNavigation();
        this._secondarySlot?.addEventListener("slotchange", this._onSecondarySlotChange);
        this._primaryMobileToggle?.addEventListener("click", this._onPrimaryMobileToggle);
        this._secondaryMobileToggle?.addEventListener("click", this._onSecondaryMobileToggle);
        this._mobileBackdrop?.addEventListener("click", this._onMobileBackdropClick);
        this._skipLink?.addEventListener("click", this._onSkipLinkClick);
        this.addEventListener("click", this._onNavigationClick);
        this.shadowRoot?.addEventListener("keydown", this._onKeyDown);
        this._mobileMedia.addEventListener("change", this._onMobileMediaChange);
    }

    disconnectedCallback() {
        this._secondarySlot?.removeEventListener("slotchange", this._onSecondarySlotChange);
        this._primaryMobileToggle?.removeEventListener("click", this._onPrimaryMobileToggle);
        this._secondaryMobileToggle?.removeEventListener("click", this._onSecondaryMobileToggle);
        this._mobileBackdrop?.removeEventListener("click", this._onMobileBackdropClick);
        this._skipLink?.removeEventListener("click", this._onSkipLinkClick);
        this.removeEventListener("click", this._onNavigationClick);
        this.shadowRoot?.removeEventListener("keydown", this._onKeyDown);
        this._mobileMedia?.removeEventListener("change", this._onMobileMediaChange);
        this._mobileMedia = null;
    }

    attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null) {
        if (!this._sidebar) {
            return;
        }
        if (oldVal === newVal) {
            return;
        }

        if (name === "collapsed") {
            this._syncAriaState();
            this.dispatchEvent(
                new CustomEvent("w13c-left-menu-collapse", {
                    bubbles: true,
                    composed: true,
                    detail: { collapsed: newVal !== null },
                }),
            );
        }
    }

    private _syncAriaState() {
        if (!this._sidebar) {
            return;
        }
        const isCollapsed = this.hasAttribute("collapsed");
        this._sidebar.setAttribute("aria-expanded", String(!isCollapsed));
        this._sidebar.setAttribute("aria-hidden", String(isCollapsed));
    }

    private _syncSecondarySidebar() {
        if (!this._secondarySidebar || !this._secondarySlot) {
            return;
        }
        const hasSecondaryNavigation = this._secondarySlot
            .assignedElements({ flatten: true })
            .some((element) => element instanceof HTMLElement && !element.hidden);
        this._secondarySidebar.hidden = !hasSecondaryNavigation;
        if (this._secondaryMobileToggle) {
            this._secondaryMobileToggle.hidden = !hasSecondaryNavigation;
        }
        if (!hasSecondaryNavigation && this.hasAttribute("mobile-secondary-open")) {
            this.removeAttribute("mobile-secondary-open");
        }
        this._syncMobileNavigation();
    }

    private _onSecondarySlotChange = () => this._syncSecondarySidebar();

    private _onPrimaryMobileToggle = (): void => {
        const open = !this.hasAttribute("mobile-primary-open");
        this.toggleAttribute("mobile-primary-open", open);
        this.removeAttribute("mobile-secondary-open");
        this._syncMobileNavigation();
    };

    private _onSecondaryMobileToggle = (): void => {
        const open = !this.hasAttribute("mobile-secondary-open");
        this.toggleAttribute("mobile-secondary-open", open);
        this.removeAttribute("mobile-primary-open");
        this._syncMobileNavigation();
    };

    private _onMobileBackdropClick = (): void => this._closeMobileNavigation(true);

    private _onSkipLinkClick = (event: Event): void => {
        event.preventDefault();
        this.focusContent();
    };

    private _onNavigationClick = (event: Event): void => {
        const path = event.composedPath();
        const navigationOpen = this.hasAttribute("mobile-primary-open") || this.hasAttribute("mobile-secondary-open");
        const isMobileControl = [this._primaryMobileToggle, this._secondaryMobileToggle, this._mobileBackdrop].some(
            (control) => control !== null && path.includes(control),
        );
        if (
            !this._mobileMedia?.matches ||
            !navigationOpen ||
            isMobileControl ||
            !this._isNavigationPath(event, path) ||
            !isNavigationAction(path)
        ) {
            return;
        }
        this._closeMobileNavigation(false);
        this._content?.focus();
    };

    private _isNavigationPath(event: Event, path: readonly (EventTarget | undefined)[]): boolean {
        if (
            (this._sidebar !== null && path.includes(this._sidebar)) ||
            (this._secondarySidebar !== null && path.includes(this._secondarySidebar))
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

    private _onKeyDown = (event: Event): void => {
        if (
            event instanceof KeyboardEvent &&
            event.key === "Escape" &&
            (this.hasAttribute("mobile-primary-open") || this.hasAttribute("mobile-secondary-open"))
        ) {
            event.preventDefault();
            this._closeMobileNavigation(true);
        }
    };

    private _onMobileMediaChange = (): void => {
        if (!this._mobileMedia?.matches) {
            this._closeMobileNavigation(false);
            return;
        }
        this._syncMobileNavigation();
    };

    private _closeMobileNavigation(restoreFocus: boolean): void {
        const primaryWasOpen = this.hasAttribute("mobile-primary-open");
        const secondaryWasOpen = this.hasAttribute("mobile-secondary-open");
        this.removeAttribute("mobile-primary-open");
        this.removeAttribute("mobile-secondary-open");
        this._syncMobileNavigation();
        if (restoreFocus) {
            (primaryWasOpen
                ? this._primaryMobileToggle
                : secondaryWasOpen
                  ? this._secondaryMobileToggle
                  : null
            )?.focus();
        }
    }

    private _syncMobileNavigation(): void {
        const isMobile = this._mobileMedia?.matches ?? false;
        const primaryOpen = isMobile && this.hasAttribute("mobile-primary-open");
        const secondaryOpen = isMobile && !this._secondarySidebar?.hidden && this.hasAttribute("mobile-secondary-open");

        this._primaryMobileToggle?.setAttribute("aria-expanded", String(primaryOpen));
        this._secondaryMobileToggle?.setAttribute("aria-expanded", String(secondaryOpen));
        if (this._mobileBackdrop) {
            this._mobileBackdrop.hidden = !primaryOpen && !secondaryOpen;
        }
        this._syncMobileSidebarAccessibility(this._sidebar, isMobile, primaryOpen);
        this._syncMobileSidebarAccessibility(this._secondarySidebar, isMobile, secondaryOpen);
    }

    private _syncMobileSidebarAccessibility(sidebar: HTMLElement | null, isMobile: boolean, open: boolean): void {
        if (!sidebar) {
            return;
        }
        if (!isMobile) {
            sidebar.removeAttribute("inert");
            if (sidebar === this._sidebar) {
                this._syncAriaState();
            } else {
                sidebar.removeAttribute("aria-hidden");
            }
            return;
        }
        sidebar.setAttribute("aria-hidden", String(!open));
        sidebar.toggleAttribute("inert", !open);
    }

    get collapsed(): boolean {
        return this.hasAttribute("collapsed");
    }

    set collapsed(val: boolean) {
        if (val) {
            this.setAttribute("collapsed", "");
        } else {
            this.removeAttribute("collapsed");
        }
    }

    toggle() {
        this.collapsed = !this.collapsed;
    }

    focusContent() {
        this._content?.focus();
    }
}

function isNavigationAction(path: readonly (EventTarget | undefined)[]): boolean {
    return path.some((target) => {
        if (!(target instanceof Element)) {
            return false;
        }
        return target.matches("a[href], button:not([disabled]), w13c-lateral-menu-item:not([disabled])");
    });
}
