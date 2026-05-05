import type { Editor } from '@bernouy/cms/editor';
import type { StateSync } from '../../../../componentSync/sync/StateSync';
import { PinMenu } from './PinMenu';
import { refreshPinButton } from './refreshPinButton';

/**
 * Owns the floating pin menu (or single-toggle action when there's only
 * one StateSync). Lives outside BAG's shadow DOM (appended to <body>)
 * because it floats over the page chrome, not just the BAG itself.
 */
export class PinController {

    private _menu: PinMenu | null = null;

    constructor(
        private _host: HTMLElement,
        private _getEditor: () => Editor | null,
    ) {}

    get menu(): HTMLElement | null { return this._menu; }

    handleClick(): void {
        const editor = this._getEditor();
        const syncs = editor?.stateSyncs ?? [];
        if (syncs.length === 0) return;
        if (syncs.length === 1) {
            this._toggle(syncs[0]!);
            refreshPinButton(this._host, editor);
            return;
        }
        this._toggleMenu(syncs);
    }

    close(): void {
        this._menu?.remove();
        this._menu = null;
    }

    private _toggle(sync: StateSync): void {
        sync.toggle();
        this._getEditor()?.notifyPinStateChanged(sync);
    }

    private _toggleMenu(syncs: StateSync[]): void {
        if (this._menu) { this.close(); return; }
        const btn = this._host.querySelector('[data-action="pin-state"]') as HTMLElement | null;
        if (!btn) return;
        const menu = PinMenu.create(syncs.map(sync => ({
            label: sync.label,
            isPinned: sync.isPinned,
            onToggle: () => {
                this._toggle(sync);
                refreshPinButton(this._host, this._getEditor());
            },
        })));
        const rect = btn.getBoundingClientRect();
        menu.setPosition(rect.left, rect.bottom);
        document.body.appendChild(menu);
        this._menu = menu;
    }
}
