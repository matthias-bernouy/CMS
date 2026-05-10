import type { BlocActionExtension, Field } from 'src/control/core/editorSystem/extensions/types';

/** One section of the popover, scoped to a single extension. The header shows
 *  the extension's icon + label; rows below are the options it exposes via
 *  `getOptions()`. Mirrors `RichTextBar/extensions/render.ts` so the two
 *  popovers feel identical. `target` is the BAG target — passed to
 *  `getOptions(ctx)` so extensions can filter options against where they're
 *  about to act (e.g. hide already-iterated paths from iterate-action). */
export function buildGroup(ext: BlocActionExtension, target: HTMLElement, onPick: (opt: Field) => void): HTMLElement {
    const group = document.createElement('div');
    group.className = 'group';
    const header = document.createElement('div');
    header.className = 'header';
    if (ext.icon) header.insertAdjacentHTML('afterbegin', `<span class="icon">${ext.icon}</span>`);
    const lbl = document.createElement('span');
    lbl.className = 'label';
    lbl.textContent = ext.label();
    header.appendChild(lbl);
    group.appendChild(header);
    const opts = ext.getOptions({ target });
    if (opts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No options';
        group.appendChild(empty);
    } else {
        for (const o of opts) group.appendChild(buildRow(o, onPick));
    }
    return group;
}

function buildRow(opt: Field, onPick: (opt: Field) => void): HTMLButtonElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'row';
    row.innerHTML = `<span class="row-label"></span><span class="row-path"></span>`;
    (row.querySelector('.row-label') as HTMLElement).textContent = opt.label;
    (row.querySelector('.row-path')  as HTMLElement).textContent = opt.path;
    row.addEventListener('mousedown', e => e.preventDefault());
    row.addEventListener('click', e => { e.stopPropagation(); onPick(opt); });
    return row;
}
