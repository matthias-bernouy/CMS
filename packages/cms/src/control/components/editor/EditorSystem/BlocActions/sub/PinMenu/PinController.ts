import type { Editor } from '@bernouy/cms/editor';
import type { StateSync } from '../../../../componentSync/sync/StateSync/StateSync';
import { PinMenu, type PinMenuRow } from './PinMenu';
import { refreshPinButton } from './refreshPinButton';

/**
 * Owns the floating pin popover. Lives outside BAG's shadow DOM (appended to <body>)
 * because it floats over the page chrome, not just the BAG itself.
 *
 * Click-on-pin-button rules:
 *   - 1 single-value sync alone → direct toggle, no popover.
 *   - Otherwise (multi-value, or 2+ syncs) → open popover. Each declared value
 *     (multi-value) and each sync (single-value) renders as a flat list row.
 *
 * Picking ANY row enforces "only one pin at a time" (unpins all others) and
 * triggers the full PinMode (BAG closes, floating Unpin appears).
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
        if (syncs.length === 1 && !syncs[0]!.isMulti) {
            this._commit(syncs[0]!, () => syncs[0]!.toggle());
            return;
        }
        this._toggleMenu(syncs);
    }

    close(): void {
        this._menu?.remove();
        this._menu = null;
    }

    /** Apply a state change atomically: unpin all other syncs first (one pin at a
     *  time), apply the change, then notify the editor + refresh the BAG button. */
    private _commit(sync: StateSync, change: () => void): void {
        const editor = this._getEditor();
        if (editor) for (const s of editor.stateSyncs) if (s !== sync && s.isPinned) s.unpin();
        change();
        editor?.notifyPinStateChanged(sync);
        refreshPinButton(this._host, editor);
    }

    private _toggleMenu(syncs: StateSync[]): void {
        if (this._menu) { this.close(); return; }
        const btn = this._host.querySelector('[data-action="pin-state"]') as HTMLElement | null;
        if (!btn) return;
        const menu = PinMenu.create(this._buildRows(syncs));
        const rect = btn.getBoundingClientRect();
        menu.setPosition(rect.left, rect.bottom);
        document.body.appendChild(menu);
        this._menu = menu;
    }

    private _buildRows(syncs: StateSync[]): PinMenuRow[] {
        const rows: PinMenuRow[] = [];
        for (const sync of syncs) {
            if (sync.isMulti) {
                sync.values.forEach((value, i) => rows.push({
                    label:    sync.labels[i] ?? value,
                    isActive: value === sync.activeValue,
                    onClick:  () => this._commit(sync, () => sync.setActiveValue(value === sync.activeValue ? null : value)),
                }));
            } else {
                rows.push({
                    label:    sync.label,
                    isActive: sync.isPinned,
                    onClick:  () => this._commit(sync, () => sync.toggle()),
                });
            }
        }
        return rows;
    }
}
