export { upgradeProperty } from "@bernouy/components/base";

export const updateHref = (anchor: HTMLAnchorElement | null, value: string | null) => {
    if (!anchor) return;
    if (value) anchor.setAttribute('href', value);
    else anchor.removeAttribute('href');
};

export const updateBadge = (badgeEl: HTMLElement | null, value: string | null) => {
    if (!badgeEl) return;
    if (value) {
        badgeEl.textContent = value;
        badgeEl.style.display = 'inline-flex';
    } else {
        badgeEl.textContent = '';
        badgeEl.style.display = 'none';
    }
};

export const setActiveState = (host: HTMLElement, anchor: HTMLAnchorElement | null, active: boolean) => {
    if (active) {
        host.setAttribute('active', '');
        host.setAttribute('aria-current', 'page');
        anchor?.classList.add('active');
    } else {
        host.removeAttribute('active');
        host.removeAttribute('aria-current');
        anchor?.classList.remove('active');
    }
};

export const checkActiveState = (host: HTMLElement, anchor: HTMLAnchorElement | null) => {
    if (host.hasAttribute('active')) {
        setActiveState(host, anchor, true);
        return;
    }
    if (!anchor || !host.hasAttribute('href')) return;
    const hrefAttr = host.getAttribute('href');
    if (!hrefAttr) return;

    try {
        const resolvedURL = new URL(hrefAttr, window.location.href);
        const currentURL = new URL(window.location.href);
        const currentPath = currentURL.pathname;
        const targetPath = resolvedURL.pathname;
        const isActive = targetPath === '/'
            ? currentPath === '/'
            : currentPath === targetPath || currentPath.startsWith(targetPath + '/');

        setActiveState(host, anchor, isActive);
    } catch {
        console.warn('Invalid href in LateralMenuItem:', hrefAttr);
    }
};
