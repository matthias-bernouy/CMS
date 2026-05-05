export const upgradeProperty = (host: HTMLElement, prop: string) => {
    if (Object.prototype.hasOwnProperty.call(host, prop)) {
        const value = (host as any)[prop];
        delete (host as any)[prop];
        (host as any)[prop] = value;
    }
};

export const syncLinkA11y = (host: HTMLElement) => {
    if (host.hasAttribute('href')) {
        if (!host.hasAttribute('tabindex')) host.setAttribute('tabindex', '0');
        if (!host.hasAttribute('role')) host.setAttribute('role', 'link');
    } else {
        if (host.getAttribute('role') === 'link') host.removeAttribute('role');
        if (host.getAttribute('tabindex') === '0') host.removeAttribute('tabindex');
        if (!host.hasAttribute('role')) host.setAttribute('role', 'row');
    }
};
