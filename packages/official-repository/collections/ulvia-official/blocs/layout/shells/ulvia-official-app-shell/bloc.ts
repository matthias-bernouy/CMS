import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

const COMPACT_BREAKPOINT_REM = 68;

export class Bloc extends Component {
    private backdrop: HTMLButtonElement | null = null;
    private compact = false;
    private readonly contextualPanel: HTMLElement | null;
    private readonly contextualSlot: HTMLSlotElement | null;
    private contextualToggle: HTMLButtonElement | null = null;
    private readonly footer: HTMLElement | null;
    private readonly footerSlot: HTMLSlotElement | null;
    private readonly navigationPanel: HTMLElement | null;
    private readonly navigationSlot: HTMLSlotElement | null;
    private navigationToggle: HTMLButtonElement | null = null;
    private readonly resizeObserver: ResizeObserver;

    constructor() {
        super({ css, template });
        const root = this.shadowRoot;
        this.contextualPanel = root?.querySelector('[part="secondary-sidebar"]') ?? null;
        this.contextualSlot = root?.querySelector('slot[name="secondary-sidebar"]') ?? null;
        this.footer = root?.querySelector('[part="footer"]') ?? null;
        this.footerSlot = root?.querySelector('slot[name="footer"]') ?? null;
        this.navigationPanel = root?.querySelector('[part="secondary-navigation"]') ?? null;
        this.navigationSlot = root?.querySelector('slot[name="secondary-navigation"]') ?? null;
        this.resizeObserver = new ResizeObserver(this.syncCompactMode);
    }

    override connectedCallback(): void {
        this.backdrop = this.querySelector("[data-mobile-toggle-close]");
        this.contextualToggle = this.querySelector('[data-mobile-toggle="contextual"]');
        this.navigationToggle = this.querySelector('[data-mobile-toggle="navigation"]');
        this.backdrop?.addEventListener("click", this.closeFromControl);
        this.contextualSlot?.addEventListener("slotchange", this.syncNavigationAvailability);
        this.contextualToggle?.addEventListener("click", this.toggleContextualNavigation);
        this.footerSlot?.addEventListener("slotchange", this.syncFooter);
        this.navigationSlot?.addEventListener("slotchange", this.syncNavigationAvailability);
        this.navigationToggle?.addEventListener("click", this.toggleNavigation);
        this.addEventListener("click", this.closeAfterNavigation);
        this.addEventListener("keydown", this.closeOnEscape);
        this.resizeObserver.observe(this);
        this.syncFooter();
        this.syncNavigationAvailability();
        this.syncCompactMode();
    }

    disconnectedCallback(): void {
        this.backdrop?.removeEventListener("click", this.closeFromControl);
        this.contextualSlot?.removeEventListener("slotchange", this.syncNavigationAvailability);
        this.contextualToggle?.removeEventListener("click", this.toggleContextualNavigation);
        this.footerSlot?.removeEventListener("slotchange", this.syncFooter);
        this.navigationSlot?.removeEventListener("slotchange", this.syncNavigationAvailability);
        this.navigationToggle?.removeEventListener("click", this.toggleNavigation);
        this.removeEventListener("click", this.closeAfterNavigation);
        this.removeEventListener("keydown", this.closeOnEscape);
        this.resizeObserver.disconnect();
    }

    private closeAfterNavigation = (event: Event): void => {
        if (!this.compact || !this.hasAttribute("mobile-panel")) {
            return;
        }
        const path = event.composedPath();
        const isDisclosure = path.some((target) => {
            return target instanceof Element && target.localName === "ulvia-official-navigation-group";
        });
        const isNavigationAction = path.some((target) => {
            return (
                target instanceof Element &&
                (target.matches("a[href]") || target.localName === "ulvia-official-navigation-item")
            );
        });
        if (isNavigationAction && !isDisclosure) {
            this.closePanel(false);
            this.shadowRoot?.querySelector<HTMLElement>('[part="content"]')?.focus();
        }
    };

    private closeFromControl = (): void => this.closePanel(true);
    private closeOnEscape = (event: Event): void => {
        if (event instanceof KeyboardEvent && event.key === "Escape" && this.hasAttribute("mobile-panel")) {
            event.preventDefault();
            this.closePanel(true);
        }
    };

    private closePanel(restoreFocus: boolean): void {
        const activePanel = this.getAttribute("mobile-panel");
        this.removeAttribute("mobile-panel");
        this.syncNavigationState();
        if (restoreFocus) {
            (activePanel === "navigation" ? this.navigationToggle : this.contextualToggle)?.focus();
        }
    }

    private hasContent(slot: HTMLSlotElement | null): boolean {
        return (
            slot
                ?.assignedNodes({ flatten: true })
                .some((node) => node instanceof Element || node.textContent?.trim()) ?? false
        );
    }

    private syncCompactMode = (): void => {
        const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const compact = this.getBoundingClientRect().width <= COMPACT_BREAKPOINT_REM * rootSize;
        if (this.compact !== compact) {
            this.compact = compact;
            this.removeAttribute("mobile-panel");
        }
        this.syncNavigationState();
    };

    private syncFooter = (): void => {
        if (this.footer) {
            this.footer.hidden = !this.hasContent(this.footerSlot);
        }
    };

    private syncNavigationAvailability = (): void => {
        const hasNavigation = this.hasContent(this.navigationSlot);
        const hasContextual = this.hasContent(this.contextualSlot);
        if (this.navigationToggle) {
            this.navigationToggle.hidden = !hasNavigation;
        }
        if (this.contextualToggle) {
            this.contextualToggle.hidden = !hasContextual;
        }
        const activePanel = this.getAttribute("mobile-panel");
        if ((!hasNavigation && activePanel === "navigation") || (!hasContextual && activePanel === "contextual")) {
            this.removeAttribute("mobile-panel");
        }
        this.syncNavigationState();
    };

    private syncNavigationState(): void {
        const activePanel = this.compact ? this.getAttribute("mobile-panel") : null;
        const navigationOpen = activePanel === "navigation";
        const contextualOpen = activePanel === "contextual";
        this.navigationToggle?.setAttribute("aria-expanded", String(navigationOpen));
        this.contextualToggle?.setAttribute("aria-expanded", String(contextualOpen));
        if (this.backdrop) {
            this.backdrop.hidden = !navigationOpen && !contextualOpen;
        }
        this.syncPanelAccessibility(this.navigationPanel, navigationOpen);
        this.syncPanelAccessibility(this.contextualPanel, contextualOpen);
    }

    private syncPanelAccessibility(panel: HTMLElement | null, open: boolean): void {
        if (!panel) {
            return;
        }
        if (!this.compact) {
            panel.removeAttribute("aria-hidden");
            panel.removeAttribute("inert");
            return;
        }
        panel.setAttribute("aria-hidden", String(!open));
        panel.toggleAttribute("inert", !open);
    }

    private toggleContextualNavigation = (): void => this.togglePanel("contextual");
    private toggleNavigation = (): void => this.togglePanel("navigation");
    private togglePanel(panel: "contextual" | "navigation"): void {
        if (this.getAttribute("mobile-panel") === panel) {
            this.removeAttribute("mobile-panel");
        } else {
            this.setAttribute("mobile-panel", panel);
        }
        this.syncNavigationState();
    }
}
