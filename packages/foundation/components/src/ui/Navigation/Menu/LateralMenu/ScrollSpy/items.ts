export type TrackedItem = {
    item: HTMLElement;
    target: HTMLElement;
    hash: string;
};

export function collectItems(host: HTMLElement): TrackedItem[] {
    const current = new URL(window.location.href);
    return Array.from(host.querySelectorAll<HTMLElement>("w13c-lateral-menu-item[href]"))
        .filter((item) => item.closest("w13c-lateral-menu") === host && !item.hidden && !item.hasAttribute("disabled"))
        .flatMap((item) => trackedItem(item, current));
}

export function readOffset(host: HTMLElement): number {
    const configured =
        host.getAttribute("scrollspy-offset") ?? getComputedStyle(host).getPropertyValue("--menu-scrollspy-offset");
    const parsed = Number.parseFloat(configured || "16");
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 16;
}

export function decodeHash(hash: string): string {
    try {
        return decodeURIComponent(hash.replace(/^#/, ""));
    } catch {
        return hash.replace(/^#/, "");
    }
}

export function replaceHash(hash: string): void {
    if (decodeHash(window.location.hash) === decodeHash(hash)) {
        return;
    }
    history.replaceState(history.state, "", `${location.pathname}${location.search}${hash}`);
}

function trackedItem(item: HTMLElement, current: URL): TrackedItem[] {
    try {
        const url = new URL(item.getAttribute("href")!, current);
        const id = decodeHash(url.hash);
        const target = id ? document.getElementById(id) : null;
        const sameDocument =
            url.origin === current.origin && url.pathname === current.pathname && url.search === current.search;
        return target && sameDocument ? [{ item, target, hash: url.hash }] : [];
    } catch {
        return [];
    }
}
