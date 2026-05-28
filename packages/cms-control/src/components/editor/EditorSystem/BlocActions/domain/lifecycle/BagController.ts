import type { Editor } from '@bernouy/cms-control/editor';
import css from '../../view/style.css' with { type: 'text' };
import type { VAnchor } from '../../compute/groupPosition';
import { findParentEditor } from '../../compute/ancestorChain';
import { renderActionBar } from '../renderActionBar';
import { mountLinkSection } from '../mountLinkSection';
import { onActiveLinkChange } from 'cms-control/core/editorSystem/editorContext';
import { refreshPinButton } from '../../sub/PinMenu/refreshPinButton';
import { BreadcrumbController } from '../../sub/Breadcrumb/BreadcrumbController';
import { InsertButtonsController } from '../../sub/InsertButton/InsertButtonsController';
import { PinController } from '../../sub/PinMenu/PinController';
import { buildEventManager } from '../../events/buildEventManager';
import type { EventManager } from '../../events/EventManager';
import { switchToEditor, selectParent } from './navigate';
import { reflow } from './reflow';
import { open as openBag } from './open';
import { Highlight } from '../../../Highlight';
import getClosestEditorSystem from 'cms-control/core/dom/editor/getClosestEditorSystem';

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
    private _unsubLink: (() => void) | null = null;

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
        // Active-link wiring: when a link gets clicked we either refresh
        // the in-bar section (BAG already shown via an editor) or pop BAG
        // open in a link-only mode anchored to the link itself.
        this._unsubLink = onActiveLinkChange((link) => this._onActiveLinkChange(link));
    }

    private _onActiveLinkChange(link: HTMLAnchorElement | null) {
        if (link && this.editor) {
            // Editor already managing BAG — just refresh the section.
            mountLinkSection(this.host);
            return;
        }
        if (link && !this.editor) {
            this._openForLink(link);
            return;
        }
        // link cleared — drop the section first, then close BAG if it was
        // opened only for the link (no editor backing it).
        mountLinkSection(this.host);
        if (!this.editor) this.close();
    }

    /**
     * Open BAG in "link-only" mode — no bloc actions, no breadcrumb, just
     * the link section anchored to the clicked `<a>`. Used when the click
     * landed on a link that doesn't activate any TextEditor / SvgEditor
     * (e.g. an `<a>` deep inside a bloc shadow), so the user still gets
     * the navigate-to-target affordance.
     */
    private _openForLink(anchor: HTMLAnchorElement) {
        this.host.innerHTML = '';
        this.lastConfigKey = '';
        mountLinkSection(this.host);

        const r = anchor.getBoundingClientRect();
        // Prefer above the link; fall back below if not enough room. Clamp
        // inside the viewport so off-screen rects (e.g. user just scrolled
        // past) still surface BAG.
        const above = r.top - 50;
        const below = r.bottom + 6;
        const raw   = above >= 8 ? above : below;
        const top   = Math.max(8, Math.min(window.innerHeight - 60, raw));
        const left  = Math.max(8, Math.min(window.innerWidth  - 320, r.left));
        this.host.style.cssText =
            `position:fixed;top:${top}px;left:${left}px;` +
            `visibility:visible;opacity:1;pointer-events:auto;`;
    }

    setEditor(editor: Editor) {
        if (!editor.isInteractive) { this.close(); this.editor = null; this.target = null; return; }
        const prev = this.hoverEl;
        this.target?.classList.remove('p9r-active');
        this.editor = editor;
        this.target = editor.target;
        this.hoverEl = editor.getActionBarAnchor?.() ?? editor.target;
        this.highlight?.dispose();
        // Highlight follows the action-bar anchor, not the raw target —
        // editors that point the BAG at a sub-element (e.g. an inner
        // visual node) expect the outline to match the same element.
        // Root the overlay inside `#editorSystem` so the
        // `var(--primary-base, …)` color resolves against the chrome
        // palette declared there (EditorRoot.style.css), not the site
        // theme. The shadow root itself doesn't carry the palette — only
        // `#editorSystem` does — so appending to the shadow root would
        // give us the *site* tokens via the document cascade.
        const overlayParent = getClosestEditorSystem(this.host).shadowRoot!.querySelector<HTMLDivElement>("#editorSystem")!;
        this.highlight = new Highlight(this.hoverEl, { color: 'var(--primary-base, #3b82f6)', parent: overlayParent });
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
        const r = renderActionBar(this.host, this.editor, findParentEditor(this.target!), this.target!, this.lastConfigKey);
        if (r) { this.lastConfigKey = r.configKey; refreshPinButton(this.host, this.editor); }
        mountLinkSection(this.host);
    }

    withCooldown(fn: () => void) {
        fn();
        this.close();
        this.cooldown = true;
        requestAnimationFrame(() => { this.cooldown = false; });
    }
}
