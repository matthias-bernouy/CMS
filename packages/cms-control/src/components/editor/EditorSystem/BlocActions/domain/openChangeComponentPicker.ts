import getClosestEditorSystem from 'src/control/core/dom/editor/getClosestEditorSystem';

function inherit(source: HTMLElement, dest: HTMLElement) {
    const parentId = source.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
    if (parentId) dest.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, parentId);
    const slot = source.getAttribute('slot');
    if (slot) dest.setAttribute('slot', slot);
}

/**
 * Opens the BlocLibrary and swaps `target` with whatever the user picks
 * (template fragment, snippet element, or a raw bloc by tag).
 */
export function openChangeComponentPicker(target: HTMLElement, onDone: () => void) {
    const library = getClosestEditorSystem(target).blocLibrary;
    library.open();
    library.addEventListener('insert', ((e: CustomEvent) => {
        const detail = e.detail;
        if (detail.type === 'template') {
            const fragment = document.createRange().createContextualFragment(detail.html);
            Array.from(fragment.children).forEach(el => {
                el.setAttribute(p9r.attr.EDITOR.IS_CREATING, 'true');
            });
            target.replaceWith(fragment);
        } else if (detail.type === 'snippet') {
            const newEl = document.createElement('w13c-snippet');
            newEl.setAttribute('identifier', detail.identifier);
            inherit(target, newEl);
            newEl.setAttribute(p9r.attr.EDITOR.IS_CREATING, 'true');
            target.replaceWith(newEl);
        } else {
            const newEl = document.createElement(detail.id);
            inherit(target, newEl);
            newEl.setAttribute(p9r.attr.EDITOR.IS_CREATING, 'true');
            target.replaceWith(newEl);
        }
        onDone();
    }) as EventListener, { once: true });
}
