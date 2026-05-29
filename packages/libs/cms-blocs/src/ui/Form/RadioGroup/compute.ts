export const upgradeProperty = (host: HTMLElement, prop: string) => {
    if (Object.prototype.hasOwnProperty.call(host, prop)) {
        const value = (host as any)[prop];
        delete (host as any)[prop];
        (host as any)[prop] = value;
    }
};

export const getRadios = (slot: HTMLSlotElement | null): HTMLElement[] => {
    if (!slot) return [];
    return slot.assignedElements({ flatten: true })
        .filter(el => el.tagName === 'P9R-RADIO') as HTMLElement[];
};

let _uid = 0;
export const nextRadioGroupName = () => `radiogroup-${_uid++}`;

export const applyValue = (
    radios: HTMLElement[], value: string | null, internals: ElementInternals,
) => {
    radios.forEach(r => {
        const selected = value !== null && r.getAttribute('value') === value;
        if (selected) r.setAttribute('checked', '');
        else r.removeAttribute('checked');
        r.setAttribute('tabindex', selected ? '0' : '-1');
    });
    internals.setFormValue(value ?? null);
};

export const syncLabel = (label: HTMLElement | null, value: string | null) => {
    if (label) label.textContent = value ?? '';
};

export const syncDisabled = (radios: HTMLElement[], disabled: boolean) => {
    if (!disabled) return;
    radios.forEach(r => r.setAttribute('disabled', ''));
};
