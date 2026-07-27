export function upgradeProperty(element: HTMLElement, property: string): void {
    if (!Object.hasOwn(element, property)) {
        return;
    }
    const value = (element as unknown as Record<string, unknown>)[property];
    delete (element as unknown as Record<string, unknown>)[property];
    (element as unknown as Record<string, unknown>)[property] = value;
}

export function updateHref(anchor: HTMLAnchorElement | null, value: string | null): void {
    if (!anchor) {
        return;
    }
    if (value) {
        anchor.setAttribute("href", value);
    } else {
        anchor.removeAttribute("href");
    }
}

export function updateBadge(element: HTMLElement | null, value: string | null): void {
    if (!element) {
        return;
    }
    element.textContent = value ?? "";
    element.style.display = value ? "inline-flex" : "none";
}

export function setActiveState(host: HTMLElement, anchor: HTMLAnchorElement | null, active: boolean): void {
    host.toggleAttribute("data-current", active);
    if (active) {
        host.setAttribute("aria-current", "page");
    } else {
        host.removeAttribute("aria-current");
    }
    anchor?.classList.toggle("active", active);
}

export function checkActiveState(host: HTMLElement, anchor: HTMLAnchorElement | null): void {
    if (host.hasAttribute("active")) {
        setActiveState(host, anchor, true);
        return;
    }
    const href = host.getAttribute("href");
    if (!anchor || !href) {
        setActiveState(host, anchor, false);
        return;
    }

    try {
        const target = new URL(href, window.location.href);
        const current = new URL(window.location.href);
        const targetPath = target.pathname;
        const active = host.hasAttribute("exact")
            ? current.pathname === targetPath
            : targetPath === "/"
              ? current.pathname === "/"
              : current.pathname === targetPath || current.pathname.startsWith(`${targetPath}/`);
        setActiveState(host, anchor, active);
    } catch {
        console.warn("Invalid href in WorkspaceLateralMenuItem:", href);
        setActiveState(host, anchor, false);
    }
}
