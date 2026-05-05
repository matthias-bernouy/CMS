import type { Editor } from '@bernouy/cms/editor';

/**
 * Reflects the editor's pin state on the action bar's pin button.
 * No-op when the bar isn't currently rendering a pin button.
 */
export function refreshPinButton(host: HTMLElement, editor: Editor | null) {
    const btn = host.querySelector('[data-action="pin-state"]') as HTMLElement | null;
    if (!btn) return;
    const anyPinned = editor?.stateSyncs.some(s => s.isPinned) ?? false;
    btn.toggleAttribute('data-active', anyPinned);
}
