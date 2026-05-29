import { applyBagPosition } from '../../compute/applyBagPosition';
import type { BagController } from './BagController';

/**
 * Shows BAG against its current target. Renders the action bar buttons,
 * builds the breadcrumb, applies the cursor-following position, then
 * attaches event listeners and starts observing the target's resize.
 */
export function open(c: BagController, mouseX?: number, mouseY?: number) {
    if (!c.editor || !c.target || c.cooldown) return;
    c.renderBar();
    c.breadcrumb.update(c.editor);
    const r = applyBagPosition(c.host, c.target, c.editor,
        mouseX ?? c.events.lastMouse().x, mouseY ?? null, c.lastVAnchor);
    c.lastVAnchor = r.vAnchor;
    c.hoverEl = r.anchorEl;
    c.insertBtns.position();
    c.ro.disconnect();
    c.ro.observe(c.target);
    if (r.anchorEl !== c.target) c.ro.observe(r.anchorEl);
    c.target.classList.add('p9r-active');
    c.events.attach();
    c.breadcrumb.refinePosition(c.host.getBoundingClientRect());
}
