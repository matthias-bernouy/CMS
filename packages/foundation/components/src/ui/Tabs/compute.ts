export const getPanels = (slot: HTMLSlotElement | null): HTMLElement[] => {
    if (!slot) {
        return [];
    }
    return slot.assignedElements({ flatten: true }).filter((el) => el.tagName === "P9R-TAB-PANEL") as HTMLElement[];
};

let _uid = 0;
export const nextTabId = () => `tabpanel-${_uid++}`;
