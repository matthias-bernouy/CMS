import type { Editor } from '@bernouy/cms/editor';
import { InsertButton } from './InsertButton';
import { positionInsertButtons } from '../../compute/insertButtonPosition';
import { resolveActionBarAnchor } from '../../compute/anchor';
import { findParentEditor } from '../../compute/ancestorChain';
import { insertBlankSibling } from '../../domain/insertBlankSibling';

/**
 * Owns the pair of "+" insert buttons that sit on the parent's edges.
 * `resolveTarget` walks the ancestor chain to find the editor with
 * add-before/after enabled — the buttons render against that ancestor's
 * rect, not the active editor's.
 */
export class InsertButtonsController {

    private _btnBefore: InsertButton;
    private _btnAfter: InsertButton;
    private _target: HTMLElement | null = null;
    private _editor: Editor | null = null;
    private _show: { before: boolean; after: boolean } = { before: false, after: false };

    constructor(onPick: (position: 'before' | 'after') => void) {
        this._btnBefore = InsertButton.create('before', () => onPick('before'));
        this._btnAfter = InsertButton.create('after', () => onPick('after'));
    }

    get elements(): HTMLElement[] {
        return [this._btnBefore, this._btnAfter];
    }

    attachTo(parent: HTMLElement | null): void {
        parent?.appendChild(this._btnBefore);
        parent?.appendChild(this._btnAfter);
    }

    resolveTarget(editor: Editor): void {
        let ed: Editor | null = editor;
        let target: HTMLElement | null = editor.target;
        while (ed && target) {
            const cfg = ed.actionBarConfiguration;
            if (cfg.get('addBefore') || cfg.get('addAfter')) {
                this._target = target;
                this._editor = ed;
                this._show = { before: !!cfg.get('addBefore'), after: !!cfg.get('addAfter') };
                return;
            }
            const parentEd = findParentEditor(target);
            if (!parentEd) break;
            ed = parentEd;
            target = parentEd.target;
        }
        this._target = editor.target;
        this._editor = editor;
        this._show = { before: false, after: false };
    }

    position(): void {
        if (!this._target) return;
        const { rect } = resolveActionBarAnchor(this._target, this._editor);
        const isInline = this._target.hasAttribute(p9r.attr.ACTION.INLINE_ADDING);
        positionInsertButtons(this._btnBefore, this._btnAfter, rect, isInline, this._show);
    }

    hide(): void {
        this._btnBefore.setVisible(false);
        this._btnAfter.setVisible(false);
    }

    insertBlank(position: 'before' | 'after'): void {
        if (!this._target) return;
        insertBlankSibling(this._target, position);
    }
}
