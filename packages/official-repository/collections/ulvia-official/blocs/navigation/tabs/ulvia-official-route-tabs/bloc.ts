import { createBlocScope, observeBlocAttributes } from "@bernouy/cms-content/browser";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private readonly observer: MutationObserver;
    private syncQueued = false;

    static get observedAttributes(): string[] {
        return ["label"];
    }

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
        this.observer = new MutationObserver(this.scheduleSync);
        this.syncLabel();
    }

    connect(): void {
        this.blocRoot.addEventListener("click", this.handleClick);
        this.blocRoot.addEventListener("keydown", this.handleKeydown);
        window.addEventListener("hashchange", this.scheduleSync);
        const scope = this.panelScope();
        if (scope) {
            this.observer.observe(scope, { childList: true, subtree: true });
        }
        this.scheduleSync();
    }

    disconnect(): void {
        this.blocRoot.removeEventListener("click", this.handleClick);
        this.blocRoot.removeEventListener("keydown", this.handleKeydown);
        window.removeEventListener("hashchange", this.scheduleSync);
        this.observer.disconnect();
    }

    attributeChanged(): void {
        this.syncLabel();
    }

    private syncLabel(): void {
        this.scope
            .querySelector("nav")
            ?.setAttribute("aria-label", this.blocRoot.getAttribute("label") || "Page navigation");
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
        const links = this.localLinks().filter(
            (link) => !link.closest('[cms-bloc="ulvia-official-route-tab"]')?.hasAttribute("hidden"),
        );
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
        const scope = this.panelScope();
        if (!scope) {
            return;
        }
        const localLinks = this.localLinks();
        const entries = localLinks
            .map((link) => {
                const id = this.targetId(link);
                const panel = id ? scope.querySelector<HTMLElement>(`[role="tabpanel"]#${CSS.escape(id)}`) : null;
                return panel ? { link, panel } : null;
            })
            .filter(
                (entry): entry is { link: HTMLAnchorElement; panel: HTMLElement } =>
                    entry?.panel instanceof HTMLElement,
            );
        for (const link of localLinks) {
            link.closest('[cms-bloc="ulvia-official-route-tab"]')?.toggleAttribute(
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
            const tab = link.closest('[cms-bloc="ulvia-official-route-tab"]');
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
        return this.scope
            .queryBlocRoots<HTMLAnchorElement>("ulvia-official-route-tab")
            .filter((link) => link.hasAttribute("href") && Boolean(this.targetId(link)));
    }

    private targetId(link: HTMLAnchorElement): string | null {
        const target = new URL(link.href, window.location.href);
        if (target.origin !== window.location.origin || target.pathname !== window.location.pathname || !target.hash) {
            return null;
        }
        return decodeURIComponent(target.hash.slice(1));
    }

    private panelScope(): HTMLElement | null {
        return this.blocRoot.parentElement?.closest<HTMLElement>("[cms-bloc]") ?? null;
    }
}

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    controller.connect();
    const stopObserving = observeBlocAttributes(root, Controller.observedAttributes, () =>
        controller.attributeChanged(),
    );
    return () => {
        stopObserving();
        controller.disconnect();
    };
}
