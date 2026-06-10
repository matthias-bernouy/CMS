export type KeyboardDeps = {
    target: () => HTMLElement | null;
    canDelete: () => boolean;
    onClose: () => void;
};

/**
 * Window-level keydown handler. Escape closes the BAG; Delete/Backspace
 * removes the current target unless the focused element is contentEditable
 * (text editors handle their own deletion semantics — see TextEditor).
 */
export function createKeyDownHandler(deps: KeyboardDeps) {
    return (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            deps.onClose();
            return;
        }
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;

        const target = deps.target();
        if (!target) return;

        const active = document.activeElement;
        if (active && (active as HTMLElement).isContentEditable) return;

        if (!deps.canDelete()) return;
        e.preventDefault();
        target.remove();
        deps.onClose();
    };
}
