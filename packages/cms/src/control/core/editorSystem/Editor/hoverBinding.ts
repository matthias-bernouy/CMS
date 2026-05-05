import getClosestEditorSystem from '../../dom/editor/getClosestEditorSystem';
import type { Editor } from './Editor';

export class HoverBinding {

    private _hoverElement: HTMLElement | null = null;
    private _handler = (e: MouseEvent) => this._onHover(e);

    constructor(private editor: Editor) {}

    bind(): void {
        this.unbind();
        this._hoverElement = this.editor.getActionBarAnchor() ?? this.editor.target;
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
