export const upgradeProperty = (host: HTMLElement, prop: string) => {
    if (Object.prototype.hasOwnProperty.call(host, prop)) {
        const value = (host as any)[prop];
        delete (host as any)[prop];
        (host as any)[prop] = value;
    }
};

export const getOptions = (slot: HTMLSlotElement | null): Element[] => {
    if (!slot) return [];
    return slot.assignedElements().filter(el => el.tagName === 'OPTION');
};

export const updateLabel = (labelEl: HTMLElement | null, value: string) => {
    if (labelEl) labelEl.textContent = value;
};

export const updateSliderPosition = (host: HTMLElement, options: Element[], value: string) => {
    const index = options.findIndex(opt => opt.getAttribute('value') === value);
    if (index === -1) return;
    host.style.setProperty('--active-index', index.toString());
    options.forEach((opt, i) => {
        const checked = i === index;
        opt.setAttribute('aria-checked', checked.toString());
        opt.setAttribute('tabindex', checked ? '0' : '-1');
    });
};

export const updateSlottedSelections = (options: Element[], selectedValue: string) => {
    options.forEach(opt => {
        if (opt.getAttribute('value') === selectedValue) opt.setAttribute('selected', '');
        else opt.removeAttribute('selected');
    });
};
