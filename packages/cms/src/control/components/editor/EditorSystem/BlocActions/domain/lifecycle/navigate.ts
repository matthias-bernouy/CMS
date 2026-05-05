import type { Editor } from '@bernouy/cms/editor';
import type { VAnchor } from '../../compute/groupPosition';
import { findParentEditor } from '../../compute/ancestorChain';
import type { BagController } from './BagController';

/**
 * Opens BAG on a different editor while preserving the current visual
 * position (transform + vAnchor). Used by the breadcrumb's onPick callback
 * and by the select-parent action button — both want to "jump up" the
 * editor tree without making the bar visibly hop to a new location.
 */
export function switchToEditor(c: BagController, target: Editor) {
    const t = c.host.style.transform;
    const va = c.host.getAttribute('data-v-anchor') as VAnchor | null;
    c.positionLocked = true;
    c.setEditor(target);
    c.open();
    c.host.style.transform = t;
    if (va !== null) {
        c.host.setAttribute('data-v-anchor', va);
        c.lastVAnchor = va;
        c.breadcrumb.refinePosition(c.host.getBoundingClientRect());
    }
}

export function selectParent(c: BagController) {
    if (!c.target) return;
    const p = findParentEditor(c.target);
    if (p) switchToEditor(c, p);
}
