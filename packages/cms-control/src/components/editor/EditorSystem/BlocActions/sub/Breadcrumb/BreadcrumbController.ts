import type { Editor } from '@bernouy/cms/editor';
import getClosestEditorSystem from 'src/control/core/dom/editor/getClosestEditorSystem';
import { Breadcrumb } from './Breadcrumb';
import { buildBreadcrumb } from '../../compute/breadcrumbBuilder';

/**
 * Owns the BAG's breadcrumb element: creates it, slots it in the host's
 * shadow DOM, builds + binds items from the editor's ancestor chain, and
 * proxies the inline-fallback positioning.
 */
export class BreadcrumbController {

    private _el: Breadcrumb;

    constructor(
        private _host: HTMLElement,
        private _onSwitch: (ed: Editor) => void,
    ) {
        this._el = Breadcrumb.create();
        const sr = this._host.shadowRoot!;
        sr.insertBefore(this._el, sr.querySelector('nav'));
    }

    update(editor: Editor): void {
        const editorSystem = getClosestEditorSystem(this._host);
        const { items, editorByKey } = buildBreadcrumb(editor, editorSystem);
        if (items.length === 0) {
            this._el.clear();
            return;
        }
        this._el.setItems(items, {
            onPick: (key) => {
                const ed = editorByKey.get(key);
                if (ed) this._onSwitch(ed);
            },
            onHover: (key, hovered) => {
                editorByKey.get(key)?.target.classList.toggle('p9r-breadcrumb-hover', hovered);
            },
        });
    }

    refinePosition(barRect: DOMRect): void {
        this._el.refinePosition(barRect);
    }

    clear(): void {
        this._el.clear();
    }
}
