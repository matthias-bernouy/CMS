import type { Editor } from '@bernouy/cms/editor';
import template from '../view/template.html' with { type: 'text' };
import { isLastRootBloc } from '../compute/isLastRootBloc';
import {
    buildCustomActionButton,
    buildPinButton,
    buildSelectParentButton,
    toggleActionButton,
} from './actionBarButtons';

export type SmartRenderResult = {
    /** Hashed config — caller stores it to skip re-render when unchanged. */
    configKey: string;
    hasAnyButton: boolean;
};

/**
 * Renders the action-bar buttons into `host` based on the editor's
 * configuration. Idempotent: caller passes the previous configKey; if it
 * matches, the function returns null without touching the DOM.
 */
export function renderActionBar(
    host: HTMLElement,
    editor: Editor,
    parentEditor: Editor | null,
    target: HTMLElement,
    previousConfigKey: string,
): SmartRenderResult | null {
    const config = editor.actionBarConfiguration;
    const hasConfig = editor.hasConfigPanel;
    const customActions = editor.customActions;
    const stateSyncCount = editor.stateSyncs.length;
    const variant = editor.variant;
    const canDelete = !!config.get('delete') && !isLastRootBloc(target);

    const hasAnyButton = hasConfig
        || !!config.get('duplicate')
        || canDelete
        || !!config.get('changeComponent')
        || customActions.length > 0
        || stateSyncCount > 0;
    const showSelectParent = !!parentEditor && hasAnyButton;

    const configKey = JSON.stringify(Array.from(config.entries()))
        + hasConfig + variant + customActions.map(a => a.action).join(',')
        + '|s=' + stateSyncCount + '|p=' + showSelectParent + '|d=' + canDelete;

    if (previousConfigKey === configKey) return null;

    host.setAttribute('data-variant', variant);
    host.innerHTML = template as unknown as string;
    const separator = host.querySelector('[data-group="delete"]');

    if (showSelectParent) host.insertBefore(buildSelectParentButton(), host.firstChild);

    toggleActionButton(host, 'edit', hasConfig);
    toggleActionButton(host, 'duplicate', !!config.get('duplicate'));
    toggleActionButton(host, 'changeComponent', !!config.get('changeComponent'));
    toggleActionButton(host, 'delete', canDelete);

    for (const action of customActions) {
        host.insertBefore(buildCustomActionButton(action), separator);
    }

    if (stateSyncCount > 0) {
        host.insertBefore(buildPinButton(stateSyncCount, editor.stateSyncs[0]?.label), separator);
    }

    const hasLeftButtons = hasConfig
        || !!config.get('duplicate')
        || !!config.get('changeComponent')
        || customActions.length > 0
        || stateSyncCount > 0;
    separator?.toggleAttribute('hidden', !canDelete || !hasLeftButtons);

    return { configKey, hasAnyButton };
}
