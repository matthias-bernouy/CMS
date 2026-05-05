import type { Editor } from '@bernouy/cms/editor';

/**
 * True if the editor has *anything* to surface in the action bar:
 * an enabled action, a custom action, a state-sync, or a config panel.
 * If false, BAG closes itself and clears its target — there's nothing to show.
 */
export function isInteractive(editor: Editor): boolean {
    const someEnabled = Array.from(editor.actionBarConfiguration.values()).some(v => v);
    return someEnabled
        || editor.customActions.length > 0
        || editor.stateSyncs.length > 0
        || editor.hasConfigPanel;
}
