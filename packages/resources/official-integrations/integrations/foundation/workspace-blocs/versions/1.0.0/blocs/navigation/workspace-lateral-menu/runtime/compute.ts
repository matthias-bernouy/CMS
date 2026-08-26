export function upgradeProperty(element: HTMLElement, property: string): void {
    if (!Object.hasOwn(element, property)) {
        return;
    }
    const value = (element as unknown as Record<string, unknown>)[property];
    delete (element as unknown as Record<string, unknown>)[property];
    (element as unknown as Record<string, unknown>)[property] = value;
}

export function getMenuItems(slot: HTMLSlotElement | null): HTMLAnchorElement[] {
    if (!slot) {
        return [];
    }
    return slot.assignedElements({ flatten: true }).flatMap((element) => {
        if (!(element instanceof HTMLElement) || element.tagName.toLowerCase() !== "workspace-lateral-menu-item") {
            return [];
        }
        const anchor = element.querySelector(":scope > a[href]");
        return anchor instanceof HTMLAnchorElement ? [anchor] : [];
    });
}
