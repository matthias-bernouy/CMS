import { createBlocScope } from "@bernouy/cms-content/browser";

const COMPACT_BREAKPOINT_REM = 68;

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private backdrop: HTMLButtonElement | null = null;
    private compact = false;
    private readonly contextualPanel: HTMLElement | null;
    private contextualToggle: HTMLButtonElement | null = null;
    private readonly footer: HTMLElement | null;
    private readonly navigationPanel: HTMLElement | null;
    private navigationCloseTimer: ReturnType<typeof setTimeout> | null = null;
    private navigationToggle: HTMLButtonElement | null = null;
    private promotedContextualLayout = false;
    private readonly resizeObserver: ResizeObserver;

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
        this.contextualPanel = this.scope.querySelector('[part="secondary-sidebar"]');
        this.footer = this.scope.querySelector('[part="footer"]');
        this.navigationPanel = this.scope.querySelector('[part="secondary-navigation"]');
        this.resizeObserver = new ResizeObserver(this.syncCompactMode);
    }

    connect(): void {
        this.backdrop = this.scope.querySelector("[data-mobile-toggle-close]");
        this.contextualToggle = this.scope.querySelector('[data-mobile-toggle="contextual"]');
        this.navigationToggle = this.scope.querySelector('[data-mobile-toggle="navigation"]');
        this.backdrop?.addEventListener("click", this.closeFromControl);
        this.contextualToggle?.addEventListener("click", this.toggleContextualNavigation);
        this.navigationToggle?.addEventListener("click", this.toggleNavigation);
        this.blocRoot.addEventListener("click", this.closeAfterNavigation);
        this.blocRoot.addEventListener("keydown", this.closeOnEscape);
        this.resizeObserver.observe(this.blocRoot);
        this.syncFooter();
        this.syncNavigationAvailability();
        this.syncCompactMode();
    }

    disconnect(): void {
        this.backdrop?.removeEventListener("click", this.closeFromControl);
        this.contextualToggle?.removeEventListener("click", this.toggleContextualNavigation);
        this.navigationToggle?.removeEventListener("click", this.toggleNavigation);
        this.blocRoot.removeEventListener("click", this.closeAfterNavigation);
        this.blocRoot.removeEventListener("keydown", this.closeOnEscape);
        this.resizeObserver.disconnect();
        if (this.navigationCloseTimer !== null) {
            clearTimeout(this.navigationCloseTimer);
            this.navigationCloseTimer = null;
        }
    }

    private closeAfterNavigation = (event: Event): void => {
        if (!this.compact || !this.blocRoot.hasAttribute("mobile-panel")) {
            return;
        }
        const path = event.composedPath();
        const isDisclosure = path.some((target) => {
            return target instanceof Element && target.getAttribute("cms-bloc") === "ulvia-official-navigation-group";
        });
        const isNavigationAction = path.some((target) => {
            return (
                target instanceof Element &&
                (target.matches("a[href]") || target.getAttribute("cms-bloc") === "ulvia-official-navigation-item")
            );
        });
        if (isNavigationAction && !isDisclosure) {
            this.navigationCloseTimer = setTimeout(() => {
                this.navigationCloseTimer = null;
                this.closePanel(false);
                this.scope.querySelector<HTMLElement>('[part="content"]')?.focus();
            }, 0);
        }
    };

    private closeFromControl = (): void => this.closePanel(true);
    private closeOnEscape = (event: Event): void => {
        if (event instanceof KeyboardEvent && event.key === "Escape" && this.blocRoot.hasAttribute("mobile-panel")) {
            event.preventDefault();
            this.closePanel(true);
        }
    };

    private closePanel(restoreFocus: boolean): void {
        const activePanel = this.blocRoot.getAttribute("mobile-panel");
        this.blocRoot.removeAttribute("mobile-panel");
        this.syncNavigationState();
        if (restoreFocus) {
            (activePanel === "navigation" ? this.navigationToggle : this.contextualToggle)?.focus();
        }
    }

    private hasContent(region: HTMLElement | null): boolean {
        return Array.from(region?.childNodes ?? []).some(this.isMeaningfulNode);
    }

    private isMeaningfulNode = (node: Node): boolean => {
        if (node instanceof HTMLElement && node.hidden) {
            return false;
        }
        return node instanceof Element || Boolean(node.textContent?.trim());
    };

    private syncCompactMode = (): void => {
        const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const compact = this.blocRoot.getBoundingClientRect().width <= COMPACT_BREAKPOINT_REM * rootSize;
        if (this.compact !== compact) {
            this.compact = compact;
            this.blocRoot.removeAttribute("mobile-panel");
        }
        this.syncNavigationState();
    };

    private syncFooter = (): void => {
        if (this.footer) {
            this.footer.hidden = !this.hasContent(this.footer);
        }
    };

    private syncNavigationAvailability = (): void => {
        const hasNavigation = this.hasContent(this.navigationPanel);
        const hasContextual = this.hasContent(this.contextualPanel);
        if (hasContextual && this.blocRoot.getAttribute("layout") === "sidebar") {
            this.blocRoot.setAttribute("layout", "dual-sidebar");
            this.promotedContextualLayout = true;
        } else if (!hasContextual && this.promotedContextualLayout) {
            this.blocRoot.setAttribute("layout", "sidebar");
            this.promotedContextualLayout = false;
        }
        if (this.navigationToggle) {
            this.navigationToggle.hidden = !hasNavigation;
        }
        if (this.contextualToggle) {
            this.contextualToggle.hidden = !hasContextual;
        }
        const activePanel = this.blocRoot.getAttribute("mobile-panel");
        if ((!hasNavigation && activePanel === "navigation") || (!hasContextual && activePanel === "contextual")) {
            this.blocRoot.removeAttribute("mobile-panel");
        }
        this.syncNavigationState();
    };

    private syncNavigationState(): void {
        const activePanel = this.compact ? this.blocRoot.getAttribute("mobile-panel") : null;
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
        if (this.blocRoot.getAttribute("mobile-panel") === panel) {
            this.blocRoot.removeAttribute("mobile-panel");
        } else {
            this.blocRoot.setAttribute("mobile-panel", panel);
        }
        this.syncNavigationState();
    }
}

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    controller.connect();
    return () => {
        controller.disconnect();
    };
}
