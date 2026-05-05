import { ICON_PARENT, ICON_PIN } from '../../../../icons';

type CustomActionShape = {
    action: string;
    title: string;
    icon: string;
};

export function buildSelectParentButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.setAttribute('data-action', 'select-parent');
    btn.setAttribute('title', 'Select parent');
    btn.innerHTML = ICON_PARENT;
    return btn;
}

export function buildCustomActionButton(action: CustomActionShape): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.setAttribute('data-action', action.action);
    btn.setAttribute('title', action.title);
    btn.innerHTML = action.icon;
    return btn;
}

export function buildPinButton(stateSyncCount: number, firstLabel: string | undefined): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.setAttribute('data-action', 'pin-state');
    btn.setAttribute('title', stateSyncCount === 1 && firstLabel ? `Pin: ${firstLabel}` : 'Pin state');
    btn.innerHTML = ICON_PIN;
    return btn;
}

export function toggleActionButton(host: HTMLElement, action: string, show: boolean) {
    host.querySelector(`[data-action="${action}"]`)?.toggleAttribute('hidden', !show);
}
