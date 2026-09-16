import { collectItems, decodeHash, readOffset, replaceHash, type TrackedItem } from "./items";
import { controlItem, restoreItem, type ScrollSpyItemState } from "./itemState";
import { ScrollContainer } from "./ScrollContainer";

export const LATERAL_MENU_SCROLLSPY_CHANGE_EVENT = "w13c-lateral-menu-scrollspy-change";

export class LateralMenuScrollSpy {
    private readonly originalStates = new Map<HTMLElement, ScrollSpyItemState>();
    private readonly visibleTargets = new Set<Element>();
    private items: TrackedItem[] = [];
    private observer?: IntersectionObserver;
    private refreshFrame?: number;
    private activeItem?: HTMLElement;
    private initialized = false;
    private atScrollEnd = false;
    private readonly scrollContainer: ScrollContainer;

    constructor(
        private readonly host: HTMLElement,
        private readonly onSelection: (item?: HTMLElement) => void,
    ) {
        this.scrollContainer = new ScrollContainer(host, this.onScroll);
    }

    connect(): void {
        window.addEventListener("hashchange", this.onHashChange);
        window.addEventListener("resize", this.scheduleRefresh);
        this.scheduleRefresh();
    }

    disconnect(): void {
        window.removeEventListener("hashchange", this.onHashChange);
        window.removeEventListener("resize", this.scheduleRefresh);
        this.scrollContainer.disconnect();
        this.observer?.disconnect();
        if (this.refreshFrame !== undefined) {
            cancelAnimationFrame(this.refreshFrame);
        }
        for (const item of this.originalStates.keys()) {
            restoreItem(item, this.originalStates);
        }
        this.items = [];
        this.visibleTargets.clear();
        this.activeItem = undefined;
        this.initialized = false;
        this.onSelection();
    }

    scheduleRefresh = (): void => {
        if (this.refreshFrame !== undefined) {
            cancelAnimationFrame(this.refreshFrame);
        }
        this.refreshFrame = requestAnimationFrame(() => {
            this.refreshFrame = undefined;
            if (this.host.isConnected && this.host.hasAttribute("scrollspy")) {
                this.refresh();
            }
        });
    };

    private refresh(): void {
        this.observer?.disconnect();
        this.visibleTargets.clear();
        const nextItems = collectItems(this.host);
        const nextElements = new Set(nextItems.map(({ item }) => item));
        for (const item of this.originalStates.keys()) {
            if (!nextElements.has(item)) {
                restoreItem(item, this.originalStates);
            }
        }
        for (const { item } of nextItems) {
            controlItem(item, this.originalStates);
        }
        this.items = nextItems;
        this.scrollContainer.refresh();
        this.atScrollEnd = this.scrollContainer.isAtEnd();

        const hashItem = this.itemForHash(window.location.hash);
        this.select(hashItem ?? this.itemAtViewportPosition(), false);
        if (!this.initialized && hashItem) {
            hashItem.target.scrollIntoView({ block: "start" });
        }
        this.initialized = true;
        this.observeTargets();
    }

    private observeTargets(): void {
        if (typeof IntersectionObserver === "undefined" || this.items.length === 0) {
            return;
        }
        this.observer = new IntersectionObserver(this.onIntersection, {
            root: this.scrollContainer.observerRoot(),
            rootMargin: `-${readOffset(this.host)}px 0px 0px 0px`,
        });
        for (const { target } of this.items) {
            this.observer.observe(target);
        }
    }

    private readonly onIntersection = (entries: IntersectionObserverEntry[]): void => {
        for (const entry of entries) {
            entry.isIntersecting ? this.visibleTargets.add(entry.target) : this.visibleTargets.delete(entry.target);
        }
        this.atScrollEnd = this.scrollContainer.isAtEnd();
        this.select(this.atScrollEnd ? this.items.at(-1) : this.visibleItem(), true);
    };

    private readonly onHashChange = (): void => {
        this.select(this.itemForHash(window.location.hash) ?? this.itemAtViewportPosition(), false);
    };

    private readonly onScroll = (): void => {
        const atScrollEnd = this.scrollContainer.isAtEnd();
        if (atScrollEnd === this.atScrollEnd) {
            return;
        }
        this.atScrollEnd = atScrollEnd;
        this.select(atScrollEnd ? this.items.at(-1) : this.visibleItem(), true);
    };

    private visibleItem(): TrackedItem | undefined {
        return this.items.find(({ target }) => this.visibleTargets.has(target)) ?? this.itemAtViewportPosition();
    }

    private itemForHash(hash: string): TrackedItem | undefined {
        const id = decodeHash(hash);
        return id ? this.items.find(({ target }) => target.id === id) : undefined;
    }

    private itemAtViewportPosition(): TrackedItem | undefined {
        if (this.scrollContainer.isAtEnd()) {
            return this.items.at(-1);
        }
        const marker = this.scrollContainer.marker(readOffset(this.host));
        let selected = this.items[0];
        for (const item of this.items) {
            if (item.target.getBoundingClientRect().top > marker + 1) {
                break;
            }
            selected = item;
        }
        return selected;
    }

    private select(selected: TrackedItem | undefined, updateHash: boolean): void {
        const changed = this.activeItem !== selected?.item;
        if (updateHash && selected && changed) {
            replaceHash(selected.hash);
        }
        for (const { item } of this.items) {
            item.toggleAttribute("active", item === selected?.item);
        }
        this.onSelection(selected?.item);
        if (!selected || !changed) {
            return;
        }
        this.activeItem = selected.item;
        this.host.dispatchEvent(
            new CustomEvent(LATERAL_MENU_SCROLLSPY_CHANGE_EVENT, {
                bubbles: true,
                composed: true,
                detail: selected,
            }),
        );
    }
}
