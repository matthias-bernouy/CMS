import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    private readonly observer: MutationObserver;
    private syncQueued = false;

    static get observedAttributes(): string[] {
        return ["label"];
    }

    constructor() {
        super({ css, template });
        this.observer = new MutationObserver(this.scheduleSync);
        this.syncLabel();
    }

    override connectedCallback(): void {
        this.addEventListener("click", this.handleClick);
        window.addEventListener("hashchange", this.scheduleSync);
        this.observer.observe(this.getRootNode(), { childList: true, subtree: true });
        this.scheduleSync();
    }

    disconnectedCallback(): void {
        this.removeEventListener("click", this.handleClick);
        window.removeEventListener("hashchange", this.scheduleSync);
        this.observer.disconnect();
    }

    attributeChangedCallback(): void {
        this.syncLabel();
    }

    private syncLabel(): void {
        this.shadowRoot
            ?.querySelector("nav")
            ?.setAttribute("aria-label", this.getAttribute("label") || "Page navigation");
    }

    private handleClick = (event: Event): void => {
        const link = event.composedPath().find((target) => target instanceof HTMLAnchorElement);
        if (link instanceof HTMLAnchorElement && this.targetId(link)) {
            queueMicrotask(this.scheduleSync);
        }
    };

    private scheduleSync = (): void => {
        if (this.syncQueued) {
            return;
        }
        this.syncQueued = true;
        queueMicrotask(() => {
            this.syncQueued = false;
            this.syncPanels();
        });
    };

    private syncPanels(): void {
        const localLinks = Array.from(
            this.querySelectorAll<HTMLAnchorElement>(":scope > ulvia-official-route-tab > a[href]"),
        ).filter((link) => this.targetId(link));
        const entries = localLinks
            .map((link) => {
                const id = this.targetId(link);
                return id ? { link, panel: document.getElementById(id) } : null;
            })
            .filter(
                (entry): entry is { link: HTMLAnchorElement; panel: HTMLElement } =>
                    entry?.panel instanceof HTMLElement,
            );
        for (const link of localLinks) {
            link.closest("ulvia-official-route-tab")?.toggleAttribute(
                "hidden",
                !entries.some((entry) => entry.link === link),
            );
        }
        if (entries.length === 0) {
            return;
        }
        const selected = entries.find(({ panel }) => `#${panel.id}` === window.location.hash) ?? entries[0];
        for (const { link, panel } of entries) {
            const active = panel === selected.panel;
            const tab = link.closest("ulvia-official-route-tab");
            tab?.toggleAttribute("active", active);
            link.setAttribute("aria-selected", String(active));
            link.setAttribute("role", "tab");
            panel.hidden = !active;
            panel.setAttribute("role", "tabpanel");
        }
    }

    private targetId(link: HTMLAnchorElement): string | null {
        const target = new URL(link.href, window.location.href);
        if (target.origin !== window.location.origin || target.pathname !== window.location.pathname || !target.hash) {
            return null;
        }
        return decodeURIComponent(target.hash.slice(1));
    }
}
