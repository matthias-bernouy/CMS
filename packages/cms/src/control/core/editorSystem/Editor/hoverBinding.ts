import getClosestEditorSystem from '../../dom/editor/getClosestEditorSystem';
import type { Editor } from './Editor';

export class HoverBinding {

    private _hoverElement: HTMLElement | null = null;
    private _handler = (e: MouseEvent) => this._onHover(e);

    constructor(private editor: Editor) {}

    /**
     * Attach the hover listener to the editor's anchor — or to the
     * editor's own target when the anchor would point to a *different*
     * editor's element. Stealing another editor's hover would mean two
     * listeners racing on the same element, with the registration order
     * deciding which BAG opens; a fetch-style bloc (anchor → produced
     * child) would fight the produced child's own hover. The child
     * always owns its hover; the parent stays reachable via the
     * breadcrumb when the child's BAG opens, and the parent's own BAG
     * still positions against the anchor on `open()`.
     */
    bind(): void {
        this.unbind();
        let resolved = this.editor.getActionBarAnchor() ?? this.editor.target;
        const resolvedId = resolved.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
        const myId       = this.editor.target.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
        if (resolvedId && resolvedId !== myId) resolved = this.editor.target;
        this._hoverElement = resolved;
        this._hoverElement.addEventListener('mouseenter', this._handler);
    }

    unbind(): void {
        if (!this._hoverElement) return;
        this._hoverElement.removeEventListener('mouseenter', this._handler);
        this._hoverElement = null;
    }

    private _onHover(e: MouseEvent) {
        const editorSystem = getClosestEditorSystem(this.editor.target);
        editorSystem.blocActions.setEditor(this.editor);
        editorSystem.blocActions.open(e.clientX, e.clientY);
    }
}
