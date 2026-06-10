export { upgradeProperty } from "@bernouy/cms-blocs/base";

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
