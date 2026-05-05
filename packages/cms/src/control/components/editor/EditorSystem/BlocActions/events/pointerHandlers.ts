export type PointerDeps = {
    host: HTMLElement;
    target: () => HTMLElement | null;
    pinMenu: () => HTMLElement | null;
    insertButtons: () => HTMLElement[];
    onClose: () => void;
    onReflow: () => void;
};

export type PointerHandlers = {
    onLeave: (e: MouseEvent) => void;
    onMouseMove: (e: MouseEvent) => void;
    onClickOutside: (e: MouseEvent) => void;
    /** Last cursor position recorded by mousemove (used by reflow positioning). */
    lastMouse: () => { x: number; y: number };
    cancelPendingReflow: () => void;
};

/**
 * Pointer-related handlers (mouse leave, move, click outside). The leave
 * handler delegates to a parent editor when the cursor exits a child but
 * stays within an ancestor that's also editorized — the parent then
 * dispatches its own mouseenter so its action bar opens.
 */
export function createPointerHandlers(deps: PointerDeps): PointerHandlers {
    let lastX = 0;
    let lastY = 0;
    let raf: number | null = null;

    const onMouseMove = (e: MouseEvent) => {
        lastX = e.clientX;
        lastY = e.clientY;
        if (raf !== null) return;
        raf = requestAnimationFrame(() => {
            raf = null;
            deps.onReflow();
        });
    };

    const onClickOutside = (e: MouseEvent) => {
        const t = e.target as HTMLElement;
        if (deps.host.contains(t)) return;
        if (deps.pinMenu()?.contains(t)) return;
        if (deps.insertButtons().includes(t)) return;
        if (deps.target()?.contains(t)) return;
        deps.onClose();
    };

    const onLeave = (e: MouseEvent) => {
        const to = e.relatedTarget as HTMLElement;
        if (deps.host.contains(to)) return;
        if (deps.pinMenu()?.contains(to)) return;
        if (deps.insertButtons().includes(to)) return;

        // BAG lives in a shadow DOM; the editor target lives in its light DOM.
        // Crossing the boundary retargets relatedTarget to the shadow host, so
        // the contains() checks above miss. :hover sees through it.
        if (deps.host.matches(':hover')) return;
        if (deps.pinMenu()?.matches(':hover')) return;
        if (deps.insertButtons().some(b => b.matches(':hover'))) return;

        // If leaving a child but staying within an ancestor editor, replay a
        // mouseenter on it so its hover binding re-opens BAG on the parent.
        const parentEditor = to?.closest?.(`[${p9r.attr.EDITOR.IS_EDITOR}]`) as HTMLElement | null;
        const tgt = deps.target();
        if (parentEditor && tgt && parentEditor.contains(tgt)) {
            parentEditor.dispatchEvent(new MouseEvent('mouseenter', {
                clientX: e.clientX,
                clientY: e.clientY,
                bubbles: false,
            }));
            return;
        }

        deps.onClose();
    };

    return {
        onLeave,
        onMouseMove,
        onClickOutside,
        lastMouse: () => ({ x: lastX, y: lastY }),
        cancelPendingReflow: () => {
            if (raf !== null) {
                cancelAnimationFrame(raf);
                raf = null;
            }
        },
    };
}
