import type { Editor } from '@bernouy/cms/editor';
import { computeGroupPosition, type VAnchor } from './groupPosition';
import { resolveActionBarAnchor } from './anchor';

export type ApplyResult = { vAnchor: VAnchor; anchorEl: HTMLElement };

/**
 * Computes the BAG's position relative to its target's anchor and applies
 * it to the host element (transform + visibility + data-v-anchor). Returns
 * the chosen vAnchor + the resolved anchor element so the caller can update
 * its hover binding.
 */
export function applyBagPosition(
    bag: HTMLElement,
    target: HTMLElement,
    editor: Editor | null,
    mouseX: number,
    mouseY: number | null,
    lastVAnchor: VAnchor,
): ApplyResult {
    const { rect, element } = resolveActionBarAnchor(target, editor);
    const my = mouseY ?? (lastVAnchor === 'top' ? rect.top : rect.bottom);
    const { x, y, vAnchor } = computeGroupPosition({
        rect,
        barWidth: (bag as HTMLElement & { offsetWidth: number }).offsetWidth,
        barHeight: (bag as HTMLElement & { offsetHeight: number }).offsetHeight,
        mouseX,
        mouseY: my,
    });
    bag.setAttribute('data-v-anchor', vAnchor);
    bag.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    bag.style.visibility = 'visible';
    bag.style.opacity = '1';
    bag.style.pointerEvents = 'auto';
    return { vAnchor, anchorEl: element };
}
