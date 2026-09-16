export { upgradeProperty } from "@bernouy/components/base";

export const getMenuItems = (slot: HTMLSlotElement | null): HTMLElement[] => {
    if (!slot) {
        return [];
    }
    const root = slot.getRootNode();
    const host = root instanceof ShadowRoot ? root.host : null;
    return slot
        .assignedElements({ flatten: true })
        .flatMap((element) => [
            ...(element.matches("w13c-lateral-menu-item") ? [element] : []),
            ...Array.from(element.querySelectorAll("w13c-lateral-menu-item")),
        ])
        .filter(
            (element): element is HTMLElement =>
                element instanceof HTMLElement &&
                element.closest("w13c-lateral-menu") === host &&
                !element.hasAttribute("disabled") &&
                !element.hidden &&
                !element.closest("w13c-lateral-menu-section:not([open]), w13c-lateral-menu-section[hidden]"),
        );
};
