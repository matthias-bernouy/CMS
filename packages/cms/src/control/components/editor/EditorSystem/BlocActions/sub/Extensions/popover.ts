import type { BlocActionExtension } from 'src/control/core/editorSystem/extensions/types';
import css from './style.css' with { type: 'text' };
import { buildGroup } from './render';

const POPOVER_TAG = 'cms-bag-extensions-popover';

class ExtensionsPopover extends HTMLElement {
    constructor() {
        super();
        const sr = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = css as unknown as string;
        sr.appendChild(style);
        const wrap = document.createElement('div');
        wrap.id = 'wrap';
        sr.appendChild(wrap);
    }
}
if (!customElements.get(POPOVER_TAG)) customElements.define(POPOVER_TAG, ExtensionsPopover);

/**
 * Opens a floating popover anchored under `anchor` (the BAG button), listing
 * every published action grouped by extension. Click on an option fires
 * `ext.onPick(option, { target })` and dismisses both popover and BAG.
 *
 * Lives on `document.body` (not inside BAG) so its z-index and clipping are
 * independent of BAG's positioning rules.
 */
export function openExtensionsPopover(
    anchor: HTMLElement,
    exts: BlocActionExtension[],
    target: HTMLElement,
    onAfterPick: () => void,
): void {
    closeExtensionsPopover();
    const popover = document.createElement(POPOVER_TAG) as ExtensionsPopover;
    const wrap = popover.shadowRoot!.getElementById('wrap')!;
    for (const ext of exts) wrap.appendChild(buildGroup(ext, (opt) => {
        // Tear down popover + BAG BEFORE the bloc's onPick mutates the DOM.
        // If we mutate first, BAG is still attached to a target that's about
        // to be moved/replaced, and its hover/highlight observers can fire on
        // a half-rebuilt tree (visible flash where the parent looks "removed").
        closeExtensionsPopover();
        onAfterPick();
        ext.onPick(opt, { target });
    }));
    document.body.appendChild(popover);
    positionUnder(popover, anchor);
    queueMicrotask(() => document.addEventListener('mousedown', dismissOnOutside, { capture: true }));
}

export function closeExtensionsPopover(): void {
    // querySelectorAll, not querySelector — guards against multiple popovers
    // co-existing if a prior open() raced with close().
    document.querySelectorAll(POPOVER_TAG).forEach(p => p.remove());
    document.removeEventListener('mousedown', dismissOnOutside, { capture: true });
}

function dismissOnOutside(e: MouseEvent): void {
    const path = e.composedPath();
    if (path.some(n => (n as Element)?.tagName?.toLowerCase?.() === POPOVER_TAG)) return;
    closeExtensionsPopover();
}

function positionUnder(popover: HTMLElement, anchor: HTMLElement): void {
    const r = anchor.getBoundingClientRect();
    popover.style.cssText = `position:fixed;top:${r.bottom + 6}px;left:${r.left}px;z-index:10010;`;
    const own = popover.getBoundingClientRect();
    const overflowRight = own.right - (window.innerWidth - 8);
    if (overflowRight > 0) popover.style.left = `${r.left - overflowRight}px`;
    if (popover.getBoundingClientRect().left < 8) popover.style.left = `8px`;
}
