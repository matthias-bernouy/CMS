import { applyBagPosition } from '../../compute/applyBagPosition';
import type { BagController } from './BagController';

/**
 * Re-pins BAG against its target after a layout change (ResizeObserver
 * fires, or the user moves the cursor over a tracked element). When
 * `positionLocked` is true (e.g. after `_switchTo`), the visual transform
 * is held in place — only the breadcrumb fallback + insert buttons reflow.
 */
export function reflow(c: BagController) {
    if (!c.target) return;
    if (!c.positionLocked) {
        const m = c.events.lastMouse();
        const r = applyBagPosition(c.host, c.target, c.editor, m.x, m.y, c.lastVAnchor);
        c.lastVAnchor = r.vAnchor;
        c.hoverEl = r.anchorEl;
    }
    c.insertBtns.hide();
    c.insertBtns.position();
    c.breadcrumb.refinePosition(c.host.getBoundingClientRect());
}
