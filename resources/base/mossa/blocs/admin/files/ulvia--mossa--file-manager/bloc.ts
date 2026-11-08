const cardSelector = '[part~="file-card"]';
const detailsSelector = '[part~="file-details"]';

export function mount(root: HTMLElement): () => void {
    const cards = (): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(cardSelector));
    const filter = (): void => {
        const query =
            root.querySelector<HTMLInputElement>("[data-file-search]")?.value.trim().toLocaleLowerCase() ?? "";
        const items = cards();
        let visible = 0;
        for (const card of items) {
            card.hidden = !(card.querySelector("[data-file-name]")?.getAttribute("data-file-name") ?? "")
                .toLocaleLowerCase()
                .includes(query);
            if (card.hidden) {
                card.querySelector<HTMLDetailsElement>(detailsSelector)?.removeAttribute("open");
            } else {
                visible++;
            }
        }
        const empty = root.querySelector<HTMLElement>("[data-file-no-matches]");
        if (empty) {
            empty.hidden = items.length === 0 || visible > 0;
        }
    };
    const refresh = (): void => {
        const offset = Number(root.querySelector("[data-offset]")?.getAttribute("data-offset") ?? 0);
        const count = cards().length;
        for (const control of root.querySelectorAll<HTMLElement>("[data-file-controls]")) {
            control.hidden = count === 0 && offset === 0;
        }
        const locale = document.documentElement.lang || "en";
        for (const size of root.querySelectorAll<HTMLElement>("[data-file-size]")) {
            const bytes = Number(size.getAttribute("data-file-size"));
            if (Number.isFinite(bytes) && bytes >= 0) {
                const index = bytes >= 1048576 ? 2 : bytes >= 1024 ? 1 : 0;
                size.textContent = new Intl.NumberFormat(locale, {
                    style: "unit",
                    unit: ["byte", "kilobyte", "megabyte"][index],
                    unitDisplay: "short",
                    maximumFractionDigits: 1,
                }).format(bytes / 1024 ** index);
            }
        }
        for (const [selector, delta, enabled] of [
            ['[part~="file-previous"]', -24, offset > 0],
            ['[part~="file-next"]', 24, cards().length === 24],
        ] as const) {
            const link = root.querySelector<HTMLAnchorElement>(selector);
            if (link) {
                link.hidden = !enabled;
                const url = new URL(location.href);
                url.searchParams.set("ulvia--mossa--files-offset", String(Math.max(0, offset + delta)));
                link.href = url.href;
            }
        }
        filter();
    };
    const toggle = (event: Event): void => {
        const target = event.target;
        if (!(target instanceof HTMLDetailsElement) || !target.matches(detailsSelector) || !target.open) {
            return;
        }
        for (const details of root.querySelectorAll<HTMLDetailsElement>(detailsSelector)) {
            if (details !== target) {
                details.open = false;
            }
        }
    };
    const close = (event: Event): void => {
        const button = (event.target as Element).closest('[part~="file-close"]');
        const details = button?.closest<HTMLDetailsElement>(detailsSelector);
        if (details) {
            details.open = false;
            details.querySelector("summary")?.focus();
        }
    };
    const observer = new MutationObserver((records) => {
        if (
            records.some((record) =>
                [...record.addedNodes, ...record.removedNodes].some(
                    (node) =>
                        node instanceof Element &&
                        (node.matches(cardSelector) ||
                            node.querySelector(`${cardSelector}, [data-offset]`) ||
                            node.matches("[data-offset]")),
                ),
            )
        ) {
            observer.disconnect();
            refresh();
            observer.observe(root, { childList: true, subtree: true });
        }
    });
    refresh();
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("input", filter);
    root.addEventListener("toggle", toggle, true);
    root.addEventListener("click", close);
    return () => {
        observer.disconnect();
        root.removeEventListener("input", filter);
        root.removeEventListener("toggle", toggle, true);
        root.removeEventListener("click", close);
    };
}
