export type ScrollSpyItemState = {
    active: boolean;
    manualActive: boolean;
    match: string | null;
};

export function controlItem(item: HTMLElement, states: Map<HTMLElement, ScrollSpyItemState>): void {
    if (!states.has(item)) {
        states.set(item, {
            active: item.hasAttribute("active"),
            manualActive: item.hasAttribute("manual-active"),
            match: item.getAttribute("match"),
        });
    }
    item.setAttribute("manual-active", "");
    item.setAttribute("match", "hash");
}

export function restoreItem(item: HTMLElement, states: Map<HTMLElement, ScrollSpyItemState>): void {
    const state = states.get(item);
    if (!state) {
        return;
    }
    item.toggleAttribute("active", state.active);
    state.match === null ? item.removeAttribute("match") : item.setAttribute("match", state.match);
    item.toggleAttribute("manual-active", state.manualActive);
    states.delete(item);
}
