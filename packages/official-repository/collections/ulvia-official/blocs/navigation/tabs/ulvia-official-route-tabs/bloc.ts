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
        this.addEventListener("keydown", this.handleKeydown);
        window.addEventListener("hashchange", this.scheduleSync);
        this.observer.observe(this.getRootNode(), { childList: true, subtree: true });
        this.scheduleSync();
    }

    disconnectedCallback(): void {
        this.removeEventListener("click", this.handleClick);
        this.removeEventListener("keydown", this.handleKeydown);
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

    private handleKeydown = (event: Event): void => {
        if (!(event instanceof KeyboardEvent) || !(event.target instanceof HTMLAnchorElement)) {
            return;
        }
        const links = this.localLinks().filter((link) => !link.closest("ulvia-official-route-tab")?.hidden);
        const current = links.indexOf(event.target);
        if (current < 0) {
            return;
        }
        const next = this.keyboardTarget(event.key, current, links);
        if (!next) {
            return;
        }
        event.preventDefault();
        next.focus();
        next.click();
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
        const localLinks = this.localLinks();
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
            link.id ||= `${panel.id}-tab`;
            link.setAttribute("aria-controls", panel.id);
            link.setAttribute("aria-selected", String(active));
            link.setAttribute("role", "tab");
            link.tabIndex = active ? 0 : -1;
            panel.hidden = !active;
            panel.setAttribute("aria-labelledby", link.id);
            panel.setAttribute("role", "tabpanel");
        }
    }

    private keyboardTarget(key: string, current: number, links: HTMLAnchorElement[]): HTMLAnchorElement | null {
        if (key === "Home") {
            return links[0] ?? null;
        }
        if (key === "End") {
            return links.at(-1) ?? null;
        }
        if (key === "ArrowRight") {
            return links[(current + 1) % links.length] ?? null;
        }
        if (key === "ArrowLeft") {
            return links[(current - 1 + links.length) % links.length] ?? null;
        }
        return null;
    }

    private localLinks(): HTMLAnchorElement[] {
        return Array.from(
            this.querySelectorAll<HTMLAnchorElement>(":scope > ulvia-official-route-tab > a[href]"),
        ).filter((link) => Boolean(this.targetId(link)));
    }

    private targetId(link: HTMLAnchorElement): string | null {
        const target = new URL(link.href, window.location.href);
        if (target.origin !== window.location.origin || target.pathname !== window.location.pathname || !target.hash) {
            return null;
        }
        return decodeURIComponent(target.hash.slice(1));
    }
}
