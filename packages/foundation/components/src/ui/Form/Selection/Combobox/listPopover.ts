type PopoverElement = HTMLElement & {
    showPopover?: () => void;
    hidePopover?: () => void;
};

export class ComboListPopover {
    private repositionBound = false;

    constructor(
        private readonly anchor: HTMLElement,
        private readonly list: PopoverElement,
    ) {}

    show(): void {
        this.list.hidden = false;
        this.position();
        if (this.list.showPopover && !this.list.matches(":popover-open")) {
            this.list.showPopover();
        }
        this.bindReposition();
        this.position();
    }

    hide(): void {
        if (this.list.hidePopover && this.list.matches(":popover-open")) {
            this.list.hidePopover();
        }
        this.list.hidden = true;
        this.unbindReposition();
    }

    private bindReposition(): void {
        if (this.repositionBound) {
            return;
        }
        window.addEventListener("scroll", this.position, { capture: true, passive: true });
        window.addEventListener("resize", this.position);
        this.repositionBound = true;
    }

    private unbindReposition(): void {
        if (!this.repositionBound) {
            return;
        }
        window.removeEventListener("scroll", this.position, true);
        window.removeEventListener("resize", this.position);
        this.repositionBound = false;
    }

    private readonly position = (): void => {
        const rect = this.anchor.getBoundingClientRect();
        const gap = 3;
        const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom - gap;
        const spaceAbove = rect.top - gap;
        const opensUp = spaceBelow < 120 && spaceAbove > spaceBelow;
        this.list.style.left = `${rect.left}px`;
        this.list.style.width = `${rect.width}px`;
        this.list.style.maxHeight = `${Math.max(80, Math.min(220, opensUp ? spaceAbove : spaceBelow))}px`;
        if (opensUp) {
            this.list.style.top = "auto";
            this.list.style.bottom = `${viewportHeight - rect.top + gap}px`;
        } else {
            this.list.style.top = `${rect.bottom + gap}px`;
            this.list.style.bottom = "auto";
        }
    };
}
