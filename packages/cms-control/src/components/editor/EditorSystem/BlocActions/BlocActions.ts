import { HorizontalActionGroup } from '@bernouy/webcomponents/blocs/horizontal-action-group';
import type { Editor } from '@bernouy/cms/editor';
import { BagController } from './domain/lifecycle/BagController';

/**
 * Custom element wrapping the BAG. The class is intentionally thin —
 * all state and lifecycle live in `BagController`. The element exists
 * so the editor system can declaratively place a `<cms-bloc-actions>`
 * in its shadow DOM (and so we get a free MutationObserver that handles
 * upgrade/connection ordering).
 */
export class BlocActions extends HorizontalActionGroup {

    private _ctrl: BagController;

    constructor() {
        super();
        this._ctrl = new BagController(this);
    }

    override connectedCallback() {
        super.connectedCallback();
        this._ctrl.insertBtns.attachTo(this.parentElement);
    }

    setEditor(editor: Editor) { this._ctrl.setEditor(editor); }
    open(mouseX?: number, mouseY?: number) { this._ctrl.open(mouseX, mouseY); }
    close() { this._ctrl.close(); }
}

if (!customElements.get('cms-bloc-actions')) customElements.define('cms-bloc-actions', BlocActions);
