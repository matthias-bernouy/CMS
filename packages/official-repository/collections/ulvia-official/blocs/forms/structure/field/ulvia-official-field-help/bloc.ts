import { createBlocScope } from "@bernouy/cms-content/browser";

let nextPanelId = 0;

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private trigger: HTMLButtonElement | null = null;
    private panel: HTMLElement | null = null;

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
    }

    connect(): void {
        this.trigger = this.scope.querySelector<HTMLButtonElement>("[data-field-help-trigger]");
        this.panel = this.scope.querySelector("[data-field-help-panel]");
        this.prepareTrigger();
        this.trigger?.addEventListener("click", this.togglePanel);
        document.addEventListener("pointerdown", this.closeFromOutside);
        document.addEventListener("keydown", this.closeFromKeyboard);
        this.blocRoot.ownerDocument.defaultView?.addEventListener("resize", this.clampPanelToViewport);
    }

    disconnect(): void {
        this.trigger?.removeEventListener("click", this.togglePanel);
        document.removeEventListener("pointerdown", this.closeFromOutside);
        document.removeEventListener("keydown", this.closeFromKeyboard);
        this.blocRoot.ownerDocument.defaultView?.removeEventListener("resize", this.clampPanelToViewport);
    }

    private prepareTrigger(): void {
        if (!this.trigger) {
            return;
        }
        const label = this.trigger.getAttribute("aria-label") || this.trigger.textContent?.trim();
        if (label) {
            this.trigger.setAttribute("aria-label", label);
        }
        if (this.panel) {
            this.panel.id ||= `ulvia-field-help-${++nextPanelId}`;
            this.panel.setAttribute("role", "tooltip");
            this.trigger.setAttribute("aria-controls", this.panel.id);
        }
        this.trigger.textContent = "?";
    }

    private togglePanel = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        this.setOpen(this.panel?.hasAttribute("hidden") === true);
    };

    private closeFromOutside = (event: Event): void => {
        if (event.target instanceof Node && !this.blocRoot.contains(event.target)) {
            this.setOpen(false);
        }
    };

    private closeFromKeyboard = (event: KeyboardEvent): void => {
        if (event.key === "Escape" && this.panel?.hasAttribute("hidden") === false) {
            this.setOpen(false);
            this.trigger?.focus();
        }
    };

    private setOpen(open: boolean): void {
        this.panel?.toggleAttribute("hidden", !open);
        this.trigger?.setAttribute("aria-expanded", String(open));
        if (open && this.panel) {
            this.trigger?.setAttribute("aria-describedby", this.panel.id);
            this.clampPanelToViewport();
        } else {
            this.trigger?.removeAttribute("aria-describedby");
            this.panel?.style.removeProperty("--ulvia-official-field-help-shift-x");
        }
    }

    private clampPanelToViewport = (): void => {
        if (!this.panel || this.panel.hasAttribute("hidden")) {
            return;
        }
        this.panel.style.setProperty("--ulvia-official-field-help-shift-x", "0px");
        const viewportWidth = this.blocRoot.ownerDocument.defaultView?.innerWidth ?? 0;
        const rect = this.panel.getBoundingClientRect();
        const gutter = 16;
        const shift =
            rect.left < gutter
                ? gutter - rect.left
                : rect.right > viewportWidth - gutter
                  ? viewportWidth - gutter - rect.right
                  : 0;
        this.panel.style.setProperty("--ulvia-official-field-help-shift-x", `${shift}px`);
    };
}

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    controller.connect();
    return () => {
        controller.disconnect();
    };
}
