/**
 * Deep-clones `target` as a sibling. Strips the editor markers from the
 * clone and its descendants so the new tree gets re-editorized cleanly
 * by ObserverManager's mutation observer.
 */
export function duplicateSibling(target: HTMLElement, position: 'before' | 'after') {
    const clone = target.cloneNode(true) as HTMLElement;
    clone.removeAttribute(p9r.attr.EDITOR.IS_EDITOR);
    clone.classList.remove('p9r-active');
    clone.querySelectorAll(`[${p9r.attr.EDITOR.IS_EDITOR}]`).forEach(el => {
        el.removeAttribute(p9r.attr.EDITOR.IS_EDITOR);
        el.classList.remove('p9r-active');
    });
    if (position === 'before') target.before(clone);
    else target.after(clone);
}
