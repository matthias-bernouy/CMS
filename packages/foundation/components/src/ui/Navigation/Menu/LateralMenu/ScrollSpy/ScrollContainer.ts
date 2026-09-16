export class ScrollContainer {
    private root?: HTMLElement | null;

    constructor(
        private readonly host: HTMLElement,
        private readonly onScroll: EventListener,
    ) {}

    refresh(): void {
        const next = findScrollRoot(this.host);
        if (this.root === next) {
            return;
        }
        eventTarget(this.root)?.removeEventListener("scroll", this.onScroll);
        this.root = next;
        eventTarget(this.root)?.addEventListener("scroll", this.onScroll, { passive: true });
    }

    disconnect(): void {
        eventTarget(this.root)?.removeEventListener("scroll", this.onScroll);
        this.root = undefined;
    }

    observerRoot(): HTMLElement | null {
        return this.root ?? null;
    }

    isAtEnd(): boolean {
        const height = this.root?.scrollHeight ?? document.documentElement.scrollHeight;
        const viewport = this.root?.clientHeight ?? window.innerHeight;
        const position = this.root?.scrollTop ?? window.scrollY;
        return height > viewport && position + viewport >= height - 2;
    }

    marker(offset: number): number {
        return (this.root?.getBoundingClientRect().top ?? 0) + offset;
    }
}

function findScrollRoot(host: HTMLElement): HTMLElement | null {
    for (let current = composedParent(host); current; current = composedParent(current)) {
        if (current instanceof HTMLElement && /(auto|scroll|overlay)/.test(getComputedStyle(current).overflowY)) {
            return current;
        }
    }
    return null;
}

function composedParent(element: Element): Element | null {
    if (element instanceof HTMLElement && element.assignedSlot) {
        return element.assignedSlot;
    }
    if (element.parentElement) {
        return element.parentElement;
    }
    const root = element.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
}

function eventTarget(root: HTMLElement | null | undefined): HTMLElement | Window | undefined {
    return root === undefined ? undefined : (root ?? window);
}
