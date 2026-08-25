import type { P9rSelectView } from "../P9rSelectView";
import type { SelectKeyboard } from "./keyboard";

export class SelectPopover {
    isOpen = false;

    constructor(
        private readonly view: P9rSelectView,
        private readonly keyboard: SelectKeyboard,
    ) {}

    connect(): void {
        this.view.panel?.addEventListener("beforetoggle", this.onBeforeToggle);
        this.view.panel?.addEventListener("toggle", this.onToggle);
    }

    disconnect(): void {
        this.view.panel?.removeEventListener("beforetoggle", this.onBeforeToggle);
        this.view.panel?.removeEventListener("toggle", this.onToggle);
        this.view.hide();
        this.unbindReposition();
    }

    open(): void {
        if (this.isOpen) {
            return;
        }
        this.view.show();
        this.isOpen = true;
        this.view.setOpen(true);
        this.keyboard.opened();
    }

    private readonly onBeforeToggle = (event: Event): void => {
        if ((event as ToggleEvent).newState === "open") {
            this.reposition();
        }
    };

    private readonly onToggle = (event: Event): void => {
        this.isOpen = (event as ToggleEvent).newState === "open";
        this.view.setOpen(this.isOpen);
        if (this.isOpen) {
            this.keyboard.opened();
            window.addEventListener("scroll", this.reposition, { capture: true, passive: true });
            window.addEventListener("resize", this.reposition);
        } else {
            this.keyboard.closed();
            this.unbindReposition();
        }
    };

    private unbindReposition(): void {
        window.removeEventListener("scroll", this.reposition, { capture: true });
        window.removeEventListener("resize", this.reposition);
    }

    private readonly reposition = (): void => {
        if (!this.view.trigger || !this.view.panel) {
            return;
        }
        const rect = this.view.trigger.getBoundingClientRect();
        this.view.panel.style.top = `${rect.bottom + 4}px`;
        this.view.panel.style.left = `${rect.left}px`;
        this.view.panel.style.width = `${rect.width}px`;
    };
}
