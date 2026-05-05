export const upgradeProperty = (host: HTMLElement, prop: string) => {
    if (Object.prototype.hasOwnProperty.call(host, prop)) {
        const value = (host as any)[prop];
        delete (host as any)[prop];
        (host as any)[prop] = value;
    }
};

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

export const checkActiveState = (host: HTMLElement, anchor: HTMLAnchorElement | null) => {
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

        if (isActive) {
            host.setAttribute('active', '');
            host.setAttribute('aria-current', 'page');
            anchor.classList.add('active');
        } else {
            host.removeAttribute('active');
            host.removeAttribute('aria-current');
            anchor.classList.remove('active');
        }
    } catch {
        console.warn('Invalid href in LateralMenuItem:', hrefAttr);
    }
};
