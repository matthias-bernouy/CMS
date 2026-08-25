type PopoverElement = HTMLElement & {
    hidePopover?: () => void;
    showPopover?: () => void;
};

export type InputHelpElements = {
    row: HTMLElement | null;
    button: HTMLButtonElement | null;
    popover: PopoverElement | null;
    slot: HTMLSlotElement | null;
    text: HTMLElement | null;
};

export class InputHelpController {
    constructor(
        private readonly host: HTMLElement,
        private readonly elements: InputHelpElements,
    ) {}

    connect(): void {
        this.elements.button?.addEventListener("click", this.onClick);
        this.elements.popover?.addEventListener("toggle", this.onToggle);
        this.elements.slot?.addEventListener("slotchange", this.sync);
        this.sync();
    }

    disconnect(): void {
        this.elements.button?.removeEventListener("click", this.onClick);
        this.elements.popover?.removeEventListener("toggle", this.onToggle);
        this.elements.slot?.removeEventListener("slotchange", this.sync);
        this.stopDismissalListeners();
    }

    readonly sync = (): void => {
        const { row, button, slot, text } = this.elements;
        const help = this.host.getAttribute("help")?.trim() ?? "";
        const label = this.host.getAttribute("label")?.trim() ?? "";
        const hasRichHelp =
            slot
                ?.assignedNodes({ flatten: true })
                .some((node) => node.nodeType !== Node.TEXT_NODE || !!node.textContent?.trim()) ?? false;
        if (text) {
            text.textContent = help;
            text.hidden = hasRichHelp || help === "";
        }
        if (button) {
            button.hidden = !help && !hasRichHelp;
            button.setAttribute("aria-label", label ? `More information about ${label}` : "More information");
        }
        if (row) {
            row.hidden = !label && !help && !hasRichHelp;
        }
        if (!help && !hasRichHelp) {
            this.close();
        }
    };

    private readonly onClick = (): void => {
        this.isOpen() ? this.close() : this.open();
    };

    private readonly onToggle = (): void => {
        const open = this.isOpen();
        this.syncExpanded(open);
        open ? this.startDismissalListeners() : this.stopDismissalListeners();
    };

    private readonly onDocumentKeydown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            this.close();
        }
    };

    private readonly onDocumentPointerdown = (event: PointerEvent): void => {
        if (this.isOpen() && !event.composedPath().includes(this.host)) {
            this.close();
        }
    };

    private open(): void {
        const popover = this.elements.popover;
        if (!popover) {
            return;
        }
        try {
            popover.showPopover?.();
        } catch {
            // The data attribute is also a fallback for DOM implementations
            // without the Popover API.
        }
        if (!this.nativeOpen()) {
            popover.dataset.open = "true";
        }
        this.position();
        this.syncExpanded(true);
        this.startDismissalListeners();
    }

    private close(): void {
        const popover = this.elements.popover;
        if (!popover) {
            return;
        }
        if (this.nativeOpen()) {
            popover.hidePopover?.();
        }
        delete popover.dataset.open;
        this.syncExpanded(false);
        this.stopDismissalListeners();
    }

    private isOpen(): boolean {
        return this.nativeOpen() || this.elements.popover?.dataset.open === "true";
    }

    private nativeOpen(): boolean {
        try {
            return this.elements.popover?.matches(":popover-open") ?? false;
        } catch {
            return false;
        }
    }

    private syncExpanded(open: boolean): void {
        this.elements.button?.setAttribute("aria-expanded", String(open));
    }

    private startDismissalListeners(): void {
        this.host.ownerDocument.addEventListener("keydown", this.onDocumentKeydown);
        this.host.ownerDocument.addEventListener("pointerdown", this.onDocumentPointerdown);
    }

    private stopDismissalListeners(): void {
        this.host.ownerDocument.removeEventListener("keydown", this.onDocumentKeydown);
        this.host.ownerDocument.removeEventListener("pointerdown", this.onDocumentPointerdown);
    }

    private position(): void {
        const { button, popover } = this.elements;
        const view = this.host.ownerDocument.defaultView;
        if (!button || !popover || !view) {
            return;
        }
        const anchor = button.getBoundingClientRect();
        const horizontalMargin = 8;
        const width = Math.min(280, view.innerWidth - horizontalMargin * 2);
        const left = Math.max(horizontalMargin, Math.min(anchor.left, view.innerWidth - width - horizontalMargin));
        let top = anchor.bottom + 6;
        if (top + popover.offsetHeight > view.innerHeight - horizontalMargin) {
            top = Math.max(horizontalMargin, anchor.top - popover.offsetHeight - 6);
        }
        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
    }
}

export function syncDescription(
    input: HTMLInputElement | null,
    hint: HTMLElement | null,
    error: HTMLElement | null,
    counter: HTMLElement | null,
): void {
    if (!input) {
        return;
    }
    const ids = [hint, error, counter]
        .filter((element): element is HTMLElement => !!element && !element.hidden && !!element.textContent)
        .map((element) => element.id)
        .filter(Boolean)
        .join(" ");
    if (ids) {
        input.setAttribute("aria-describedby", ids);
    } else {
        input.removeAttribute("aria-describedby");
    }
}
