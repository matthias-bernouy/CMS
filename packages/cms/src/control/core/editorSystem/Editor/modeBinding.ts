import type { EDITOR_SYSTEM_MODE } from 'types/w13c/EditorSystem';
import type EditorRoot from '../../../components/editor/EditorSystem/EditorRoot/EditorRoot';
import getClosestEditorSystem from '../../dom/editor/getClosestEditorSystem';

const EVENT_NAME = 'editor-system-switch-mode';

export type ModeCallbacks = {
    onEditorMode: () => void;
    onViewMode: () => void;
    /** Optional hook fired after the view swap completes (subclass extension point). */
    afterSwitch?: (mode: EDITOR_SYSTEM_MODE) => void;
};

/**
 * Subscribes to the closest <cms-editor-system>'s `editor-system-switch-mode`
 * event so an editor doesn't need to be poked manually to swap between
 * editor and view rendering. The host element resolves once at construction;
 * if the editor's target is moved into a different EditorSystem at runtime,
 * call `dispose()` and re-instantiate.
 */
export class ModeBinding {

    private _root: EditorRoot;
    private _handler: (e: Event) => void;

    constructor(target: HTMLElement, callbacks: ModeCallbacks) {
        this._root = getClosestEditorSystem(target);
        this._handler = (e: Event) => {
            const mode = (e as CustomEvent<EDITOR_SYSTEM_MODE>).detail;
            if (mode === 'editor') callbacks.onEditorMode();
            else if (mode === 'view') callbacks.onViewMode();
            callbacks.afterSwitch?.(mode);
        };
        this._root.addEventListener(EVENT_NAME, this._handler);
    }

    dispose(): void {
        this._root.removeEventListener(EVENT_NAME, this._handler);
    }
}
