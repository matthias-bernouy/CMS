import { Component } from "@bernouy/components/base";
import { observeSource } from "@bernouy/components";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

let sequence = 0;
const COMPACT_WIDTH = 760;

export class CmsShellDetailBody extends Component {
    private readonly tabs: HTMLElement;
    private readonly leftAside: HTMLElement;
    private readonly main: HTMLElement;
    private readonly aside: HTMLElement;
    private readonly leftAsideSlot: HTMLSlotElement;
    private readonly asideSlot: HTMLSlotElement;
    private resize?: ResizeObserver;
    private stopSourceObservation?: () => void;
    private invalidPending = false;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
        this.tabs = this.shadowRoot!.querySelector("p9r-tabs")!;
        this.leftAside = this.shadowRoot!.querySelector(".shell-detail-left-aside")!;
        this.main = this.shadowRoot!.querySelector(".shell-detail-main")!;
        this.aside = this.shadowRoot!.querySelector(".shell-detail-aside")!;
        this.leftAsideSlot = this.leftAside.querySelector("slot")!;
        this.asideSlot = this.aside.querySelector("slot")!;
        const id = ++sequence;
        this.main.id = `detail-main-${id}`;
        this.aside.id = `detail-aside-${id}`;
        this.tabs.setAttribute("active", this.main.id);
    }

    override connectedCallback(): void {
        this.main.setAttribute("label", this.getAttribute("main-label") ?? "Details");
        this.aside.setAttribute("label", this.getAttribute("aside-label") ?? "Settings");
        this.leftAsideSlot.addEventListener("slotchange", this.sync);
        this.asideSlot.addEventListener("slotchange", this.sync);
        this.addEventListener("cms-shell-detail-region-change", this.sync);
        if (!this.hasAttribute("tabbed")) {
            this.sync();
            return;
        }
        const source = this.closest("[cms-source]");
        if (source) {
            this.stopSourceObservation = observeSource(source, this.sync);
        }
        this.resize = new ResizeObserver(this.sync);
        this.resize.observe(this);
        this.addEventListener("invalid", this.onInvalid, true);
        this.sync();
    }

    disconnectedCallback(): void {
        this.resize?.disconnect();
        this.stopSourceObservation?.();
        this.leftAsideSlot.removeEventListener("slotchange", this.sync);
        this.asideSlot.removeEventListener("slotchange", this.sync);
        this.removeEventListener("cms-shell-detail-region-change", this.sync);
        this.removeEventListener("invalid", this.onInvalid, true);
    }

    /** Reveal an existing control without moving it or changing its form association. */
    reveal(control: HTMLElement): void {
        if (!this.hasAttribute("tabbed") || !this.hasAttribute("compact")) {
            return;
        }
        const branch = control.closest('[slot="left-aside"], [slot="main"], [slot="aside"]');
        if (branch?.parentElement === this) {
            const slot = branch.getAttribute("slot");
            if (slot === "left-aside") {
                return;
            }
            const panel = slot === "aside" ? this.aside : this.main;
            if (panel.parentElement === this.tabs) {
                this.tabs.setAttribute("active", panel.id);
            }
        }
    }

    private readonly onInvalid = (event: Event): void => {
        if (this.invalidPending || !(event.target instanceof HTMLElement)) {
            return;
        }
        this.invalidPending = true;
        this.reveal(event.target);
        queueMicrotask(() => {
            this.invalidPending = false;
        });
    };

    private readonly sync = (): void => {
        const requireContent = this.hasAttribute("tabbed");
        const hasLeftAside = this.hasSlottedRegion("left-aside", requireContent);
        const hasAside = this.hasSlottedRegion("aside", requireContent);
        const contained = this.hasAttribute("contained");
        this.leftAside.toggleAttribute("hidden", !hasLeftAside);
        this.togglePanel(this.aside, hasAside);
        this.main.toggleAttribute("fill", contained);
        this.aside.toggleAttribute("fill", contained);
        this.toggleAttribute("has-left-aside", hasLeftAside);
        this.toggleAttribute("has-aside", hasAside);
        const tabsWidth = this.tabs.getBoundingClientRect().width;
        const compact = (tabsWidth || this.getBoundingClientRect().width) <= COMPACT_WIDTH;
        this.toggleAttribute("compact", compact);
        this.tabs.toggleAttribute("expanded", !this.hasAttribute("tabbed") || !compact || !hasAside);
        if (!Array.from(this.tabs.children).some((panel) => panel.id === this.tabs.getAttribute("active"))) {
            this.tabs.setAttribute("active", this.main.id);
        }
    };

    private hasSlottedRegion(name: string, requireContent: boolean): boolean {
        return Array.from(this.children).some(
            (element) => element.getAttribute("slot") === name && (!requireContent || hasContent(element)),
        );
    }

    private togglePanel(panel: HTMLElement, present: boolean): void {
        if (present && panel.parentElement !== this.tabs) {
            this.tabs.append(panel);
        } else if (!present && panel.parentElement === this.tabs) {
            panel.remove();
        }
    }
}

function hasContent(element: Element): boolean {
    if (element instanceof HTMLSlotElement) {
        return element.assignedElements({ flatten: true }).some(hasContent);
    }
    if (["P9R-STACK", "DIV"].includes(element.tagName)) {
        return element.children.length
            ? Array.from(element.children).some(hasContent)
            : Boolean(element.textContent?.trim());
    }
    return !element.hasAttribute("hidden");
}

if (!customElements.get("cms-shell-detail-body")) {
    customElements.define("cms-shell-detail-body", CmsShellDetailBody);
}
