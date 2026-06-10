export { upgradeProperty } from "@bernouy/cms-blocs/base";

export const getMenuItems = (slot: HTMLSlotElement | null): HTMLElement[] => {
    if (!slot) return [];
    return slot.assignedElements({ flatten: true })
        .filter((el): el is HTMLElement =>
            el instanceof HTMLElement &&
            el.tagName.toLowerCase() === 'w13c-lateral-menu-item' &&
            !el.hasAttribute('disabled'),
        );
};
