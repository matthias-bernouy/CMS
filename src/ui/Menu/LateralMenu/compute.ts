export const upgradeProperty = (host: HTMLElement, prop: string) => {
    if (Object.prototype.hasOwnProperty.call(host, prop)) {
        const value = (host as any)[prop];
        delete (host as any)[prop];
        (host as any)[prop] = value;
    }
};

export const getMenuItems = (slot: HTMLSlotElement | null): HTMLElement[] => {
    if (!slot) return [];
    return slot.assignedElements({ flatten: true })
        .filter((el): el is HTMLElement =>
            el instanceof HTMLElement &&
            el.tagName.toLowerCase() === 'w13c-lateral-menu-item' &&
            !el.hasAttribute('disabled'),
        );
};
