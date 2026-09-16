import { Component } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import { NAV_TAB_ACTIVE_EVENT } from "./NavTab/NavTab";

export class NavTabs extends Component {
    private readonly navigation: HTMLElement;
    private readonly tabSlot: HTMLSlotElement;
    private revealFrame?: number;

    static get observedAttributes(): string[] {
        return ["aria-label"];
    }

    constructor() {
        super({ css, template: template as unknown as string });
        this.navigation = this.shadowRoot!.querySelector("nav")!;
        this.tabSlot = this.shadowRoot!.querySelector("slot")!;
    }

    override connectedCallback(): void {
        this.syncLabel();
        this.addEventListener(NAV_TAB_ACTIVE_EVENT, this.onActiveTab);
        this.tabSlot.addEventListener("slotchange", this.onSlotChange);
        this.scheduleActiveTab();
    }

    disconnectedCallback(): void {
        this.removeEventListener(NAV_TAB_ACTIVE_EVENT, this.onActiveTab);
        this.tabSlot.removeEventListener("slotchange", this.onSlotChange);
        if (this.revealFrame !== undefined) {
            cancelAnimationFrame(this.revealFrame);
        }
    }

    attributeChangedCallback(name: string): void {
        if (name === "aria-label") {
            this.syncLabel();
        }
    }

    private syncLabel(): void {
        this.navigation.setAttribute("aria-label", this.getAttribute("aria-label")?.trim() || "Section navigation");
    }

    private readonly onActiveTab = (event: Event): void => {
        const tab = (event as CustomEvent<{ tab?: HTMLElement }>).detail.tab;
        if (tab?.parentElement === this) {
            this.scheduleReveal(tab);
        }
    };

    private readonly onSlotChange = (): void => this.scheduleActiveTab();

    private scheduleActiveTab(): void {
        const active = this.tabSlot.assignedElements().find((element) => element.hasAttribute("active"));
        if (active instanceof HTMLElement) {
            this.scheduleReveal(active);
        }
    }

    private scheduleReveal(tab: HTMLElement): void {
        if (this.revealFrame !== undefined) {
            cancelAnimationFrame(this.revealFrame);
        }
        this.revealFrame = requestAnimationFrame(() => {
            this.revealFrame = undefined;
            if (this.isConnected) {
                revealHorizontalItem(this.navigation, tab);
            }
        });
    }
}

function revealHorizontalItem(container: HTMLElement, item: HTMLElement): void {
    if (container.clientWidth >= container.scrollWidth) {
        return;
    }
    const containerBounds = container.getBoundingClientRect();
    const itemBounds = item.getBoundingClientRect();
    const start = itemBounds.left - containerBounds.left + container.scrollLeft;
    const end = itemBounds.right - containerBounds.left + container.scrollLeft;
    if (start < container.scrollLeft) {
        container.scrollLeft = start;
    } else if (end > container.scrollLeft + container.clientWidth) {
        container.scrollLeft = end - container.clientWidth;
    }
}
