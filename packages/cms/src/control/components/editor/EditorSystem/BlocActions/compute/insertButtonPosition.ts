export type InsertButtonControl = {
    setInline(inline: boolean): void;
    setVisible(visible: boolean): void;
    setLocation(left: number, top: number): void;
};

/**
 * Positions the two insert-before / insert-after "+" buttons around `rect`.
 * `inline` flips between a horizontal layout (buttons on the left/right of
 * the bloc, for text-like targets) and the default vertical layout (above
 * and below).
 */
export function positionInsertButtons(
    btnBefore: InsertButtonControl,
    btnAfter: InsertButtonControl,
    rect: DOMRect,
    inline: boolean,
    show: { before: boolean; after: boolean },
) {
    btnBefore.setInline(inline);
    btnAfter.setInline(inline);
    if (!show.before && !show.after) return;

    const sx = window.scrollX;
    const sy = window.scrollY;

    if (inline) {
        const cy = rect.top + sy + rect.height / 2 - 12;
        if (show.before) { btnBefore.setLocation(rect.left + sx - 12, cy); btnBefore.setVisible(true); }
        if (show.after)  { btnAfter.setLocation(rect.right + sx - 12, cy); btnAfter.setVisible(true); }
    } else {
        const cx = rect.left + sx + rect.width / 2 - 12;
        if (show.before) { btnBefore.setLocation(cx, rect.top + sy - 12); btnBefore.setVisible(true); }
        if (show.after)  { btnAfter.setLocation(cx, rect.bottom + sy - 12); btnAfter.setVisible(true); }
    }
}
