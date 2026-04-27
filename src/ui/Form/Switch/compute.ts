export const upgradeProperty = (host: HTMLElement, prop: string) => {
    if (Object.prototype.hasOwnProperty.call(host, prop)) {
        const value = (host as any)[prop];
        delete (host as any)[prop];
        (host as any)[prop] = value;
    }
};

export const syncFormValue = (
    host: HTMLElement,
    input: HTMLInputElement | null,
    internals: ElementInternals,
) => {
    const checked = input?.checked ?? host.hasAttribute('checked');
    internals.setFormValue(checked ? (host.getAttribute('value') ?? 'on') : null);
};
