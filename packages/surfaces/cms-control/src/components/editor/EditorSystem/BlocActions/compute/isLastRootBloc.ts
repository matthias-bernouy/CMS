/**
 * True when `target` is a root-level bloc (no parent identifier) AND no
 * other root sibling exists. Used to keep the page from becoming empty —
 * the last root must stay until the user adds another one.
 */
export function isLastRootBloc(target: HTMLElement): boolean {
    if (target.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER)) return false;

    const parent = target.parentElement;
    if (!parent) return true;

    let count = 0;
    for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        if (!(child instanceof HTMLElement)) continue;
        if (!child.hasAttribute(p9r.attr.EDITOR.IDENTIFIER)) continue;
        if (child.hasAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER)) continue;
        if (++count > 1) return false;
    }
    return count === 1;
}
