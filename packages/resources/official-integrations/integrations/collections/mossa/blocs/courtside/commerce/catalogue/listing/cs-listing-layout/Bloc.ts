import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    private readonly mobileBreakpoint = "(max-width: 760px)";
    private mobileQuery: MediaQueryList | null = null;
    private restoreFocusTo: HTMLElement | null = null;
    private lockedScrollY = 0;
    private scrollLock: {
        bodyPosition: string;
        bodyTop: string;
        bodyLeft: string;
        bodyRight: string;
        bodyWidth: string;
        bodyOverflow: string;
        rootOverflow: string;
        rootOverscrollBehavior: string;
    } | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.openButton.addEventListener("click", this.open);
        this.closeButton.addEventListener("click", this.close);
        this.backdrop.addEventListener("click", this.close);
        this.addEventListener("filters-reset", this.reset);
        document.addEventListener("keydown", this.handleKeydown);
        this.mobileQuery = window.matchMedia(this.mobileBreakpoint);
        this.mobileQuery.addEventListener("change", this.handleViewportChange);
        this.syncDrawerState();
    }

    disconnectedCallback(): void {
        this.openButton.removeEventListener("click", this.open);
        this.closeButton.removeEventListener("click", this.close);
        this.backdrop.removeEventListener("click", this.close);
        this.removeEventListener("filters-reset", this.reset);
        document.removeEventListener("keydown", this.handleKeydown);
        this.mobileQuery?.removeEventListener("change", this.handleViewportChange);
        this.closeDrawer(false);
        this.mobileQuery = null;
    }

    private open = () => {
        if (!this.isMobile || this.hasAttribute("filters-open")) {
            return;
        }

        this.restoreFocusTo =
            this.shadowRoot?.activeElement instanceof HTMLElement ? this.shadowRoot.activeElement : this.openButton;
        this.setAttribute("filters-open", "");
        this.backdrop.hidden = false;
        this.openButton.setAttribute("aria-expanded", "true");
        this.syncDrawerState();
        this.lockPageScroll();
        requestAnimationFrame(() => this.closeButton.focus({ preventScroll: true }));
    };

    private close = () => {
        this.closeDrawer(true);
    };

    private closeDrawer(restoreFocus: boolean): void {
        const wasOpen = this.hasAttribute("filters-open");
        this.removeAttribute("filters-open");
        this.backdrop.hidden = true;
        this.openButton.setAttribute("aria-expanded", "false");
        this.syncDrawerState();
        this.unlockPageScroll();

        if (wasOpen && restoreFocus) {
            const target = this.restoreFocusTo?.isConnected ? this.restoreFocusTo : this.openButton;
            target.focus({ preventScroll: true });
        }
        this.restoreFocusTo = null;
    }

    private handleKeydown = (event: KeyboardEvent): void => {
        if (event.key !== "Escape" || !this.hasAttribute("filters-open")) {
            return;
        }
        event.preventDefault();
        this.closeDrawer(true);
    };

    private handleViewportChange = (): void => {
        if (!this.isMobile) {
            this.closeDrawer(false);
        } else {
            this.syncDrawerState();
        }
    };

    private syncDrawerState(): void {
        const mobile = this.isMobile;
        const open = mobile && this.hasAttribute("filters-open");

        this.sidebar.inert = mobile && !open;
        if (mobile && !open) {
            this.sidebar.setAttribute("aria-hidden", "true");
        } else {
            this.sidebar.removeAttribute("aria-hidden");
        }
        if (open) {
            this.sidebar.setAttribute("role", "dialog");
            this.sidebar.setAttribute("aria-modal", "true");
        } else {
            this.sidebar.removeAttribute("role");
            this.sidebar.removeAttribute("aria-modal");
        }
    }

    private lockPageScroll(): void {
        if (this.scrollLock) {
            return;
        }

        const body = document.body;
        const root = document.documentElement;
        this.lockedScrollY = window.scrollY;
        this.scrollLock = {
            bodyPosition: body.style.position,
            bodyTop: body.style.top,
            bodyLeft: body.style.left,
            bodyRight: body.style.right,
            bodyWidth: body.style.width,
            bodyOverflow: body.style.overflow,
            rootOverflow: root.style.overflow,
            rootOverscrollBehavior: root.style.overscrollBehavior,
        };

        body.style.position = "fixed";
        body.style.top = `-${this.lockedScrollY}px`;
        body.style.left = "0";
        body.style.right = "0";
        body.style.width = "100%";
        body.style.overflow = "hidden";
        root.style.overflow = "hidden";
        root.style.overscrollBehavior = "none";
    }

    private unlockPageScroll(): void {
        if (!this.scrollLock) {
            return;
        }

        const body = document.body;
        const root = document.documentElement;
        const snapshot = this.scrollLock;
        this.scrollLock = null;
        body.style.position = snapshot.bodyPosition;
        body.style.top = snapshot.bodyTop;
        body.style.left = snapshot.bodyLeft;
        body.style.right = snapshot.bodyRight;
        body.style.width = snapshot.bodyWidth;
        body.style.overflow = snapshot.bodyOverflow;
        root.style.overflow = snapshot.rootOverflow;
        root.style.overscrollBehavior = snapshot.rootOverscrollBehavior;
        window.scrollTo(0, this.lockedScrollY);
    }

    private reset = () => {
        this.querySelectorAll<HTMLElement>("[cms-param-sync], [data-filter-reset]").forEach((control) => {
            const input = control as HTMLElement & { value?: string };
            if ("value" in input) {
                input.value = control.getAttribute("data-reset-value") ?? "";
            } else {
                control.removeAttribute("value");
            }
            control.dispatchEvent(new Event("change", { bubbles: true }));
        });
        this.querySelectorAll<HTMLElement>("cs-category-filters").forEach((filters) => {
            filters.dispatchEvent(new Event("category-filters-reset"));
        });
        this.close();
    };

    private get isMobile(): boolean {
        return this.mobileQuery?.matches ?? window.matchMedia(this.mobileBreakpoint).matches;
    }
    private get openButton() {
        return this.shadowRoot!.querySelector<HTMLButtonElement>(".open")!;
    }
    private get closeButton() {
        return this.shadowRoot!.querySelector<HTMLButtonElement>(".close")!;
    }
    private get backdrop() {
        return this.shadowRoot!.querySelector<HTMLElement>(".backdrop")!;
    }
    private get sidebar() {
        return this.shadowRoot!.querySelector<HTMLElement>(".sidebar")!;
    }
}
