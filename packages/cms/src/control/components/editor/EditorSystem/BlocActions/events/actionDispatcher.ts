import type { Editor } from '@bernouy/cms/editor';

export type ActionDeps = {
    editor: () => Editor | null;
    onDelete: () => void;
    onEdit: () => void;
    onDuplicate: () => void;
    onChangeComponent: () => void;
    onPinClick: () => void;
    onSelectParent: () => void;
};

/**
 * Builds a single handler for the `action-click` CustomEvent dispatched by
 * the action button row. Built-in actions route to their dedicated callback;
 * unknown actions fall through to the editor's `customActions` list.
 */
export function createActionDispatcher(deps: ActionDeps) {
    return (e: CustomEvent) => {
        switch (e.detail.action) {
            case 'delete':          return deps.onDelete();
            case 'edit':            return deps.onEdit();
            case 'duplicate':       return deps.onDuplicate();
            case 'changeComponent': return deps.onChangeComponent();
            case 'pin-state':       return deps.onPinClick();
            case 'select-parent':   return deps.onSelectParent();
            default: {
                const custom = deps.editor()?.customActions.find(a => a.action === e.detail.action);
                custom?.handler();
            }
        }
    };
}
