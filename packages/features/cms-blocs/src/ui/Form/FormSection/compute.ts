export { upgradeProperty } from "@bernouy/cms-blocs/base";

export const syncTitle = (host: HTMLElement, title: HTMLElement | null) => {
    if (title) title.textContent = host.getAttribute('data-title') ?? '';
};

export const syncAria = (
    host: HTMLElement, toggle: HTMLElement | null, content: HTMLElement | null,
) => {
    if (!toggle) return;
    const collapsed = host.hasAttribute('collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    if (content) content.hidden = collapsed;
};
