export { upgradeProperty } from "@bernouy/cms-blocs/base";

export const syncFormValue = (
    host: HTMLElement,
    input: HTMLInputElement | null,
    internals: ElementInternals,
) => {
    const checked = input?.checked ?? host.hasAttribute('checked');
    internals.setFormValue(checked ? (host.getAttribute('value') ?? 'on') : null);
};
