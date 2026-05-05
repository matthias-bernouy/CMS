import type { Editor } from '@bernouy/cms/editor';
import css from '../../view/style.css' with { type: 'text' };
import type { VAnchor } from '../../compute/groupPosition';
import { findParentEditor } from '../../compute/ancestorChain';
import { renderActionBar } from '../renderActionBar';
import { refreshPinButton } from '../../sub/PinMenu/refreshPinButton';
import { BreadcrumbController } from '../../sub/Breadcrumb/BreadcrumbController';
import { InsertButtonsController } from '../../sub/InsertButton/InsertButtonsController';
import { PinController } from '../../sub/PinMenu/PinController';
import { buildEventManager } from '../../events/buildEventManager';
import type { EventManager } from '../../events/EventManager';
import { switchToEditor, selectParent } from './navigate';
import { reflow } from './reflow';
import { open as openBag } from './open';
import { isInteractive } from './isInteractive';
import { Highlight } from '../../../Highlight';

/**
 * Owns BAG's runtime state + sub-controllers. The custom element class is
 * a thin wrapper that delegates `setEditor`/`open`/`close` here.
 */
export class BagController {

    target: HTMLElement | null = null;
    editor: Editor | null = null;
    hoverEl: HTMLElement | null = null;
    cooldown = false;
    positionLocked = false;
    lastVAnchor: VAnchor = 'bottom';
    lastConfigKey = '';

    breadcrumb: BreadcrumbController;
    insertBtns: InsertButtonsController;
    pin: PinController;
    events: EventManager;
    ro: ResizeObserver;
    highlight: Highlight | null = null;

    constructor(public host: HTMLElement) {
        const s = document.createElement('style');
        s.textContent = css as unknown as string;
        host.shadowRoot!.appendChild(s);
        this.breadcrumb = new BreadcrumbController(host, (ed) => switchToEditor(this, ed));
        this.insertBtns = new InsertButtonsController((pos) => this.withCooldown(() => this.insertBtns.insertBlank(pos)));
        this.pin = new PinController(host, () => this.editor);
        this.ro = new ResizeObserver(() => reflow(this));
        this.events = buildEventManager(host,
            { target: () => this.target, editor: () => this.editor, hoverEl: () => this.hoverEl },
            this.pin, this.insertBtns,
            { onClose: () => this.close(), onReflow: () => reflow(this),
              withCooldown: (fn) => this.withCooldown(fn), onSelectParent: () => selectParent(this) });
    }

    setEditor(editor: Editor) {
        if (!isInteractive(editor)) { this.close(); this.editor = null; this.target = null; return; }
        const prev = this.hoverEl;
        this.target?.classList.remove('p9r-active');
        this.editor = editor;
        this.target = editor.target;
        this.hoverEl = editor.getActionBarAnchor?.() ?? editor.target;
        this.highlight?.dispose();
        this.highlight = new Highlight(this.target, { color: 'var(--primary-base, #3b82f6)' });
        this.events.rebindHover(prev);
        this.insertBtns.resolveTarget(editor);
    }

    open(mouseX?: number, mouseY?: number) {
        openBag(this, mouseX, mouseY);
    }

    close() {
        this.pin.close();
        this.highlight?.dispose();
        this.highlight = null;
        this.target?.classList.remove('p9r-active');
        document.querySelectorAll('.p9r-breadcrumb-hover').forEach(el => el.classList.remove('p9r-breadcrumb-hover'));
        this.host.style.cssText = 'visibility:hidden;opacity:0;pointer-events:none;';
        this.insertBtns.hide();
        this.ro.disconnect();
        this.events.detach();
        this.positionLocked = false;
    }

    renderBar() {
        if (!this.editor) return;
        const r = renderActionBar(this.host, this.editor, findParentEditor(this.target!), this.lastConfigKey);
        if (r) { this.lastConfigKey = r.configKey; refreshPinButton(this.host, this.editor); }
    }

    withCooldown(fn: () => void) {
        fn();
        this.close();
        this.cooldown = true;
        requestAnimationFrame(() => { this.cooldown = false; });
    }
}
