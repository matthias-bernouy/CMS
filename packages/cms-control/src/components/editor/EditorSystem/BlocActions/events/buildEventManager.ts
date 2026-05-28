import type { Editor } from '@bernouy/cms/editor';
import { EventManager } from './EventManager';
import { duplicateSibling } from '../domain/duplicateSibling';
import { openChangeComponentPicker } from '../domain/openChangeComponentPicker';
import { isLastRootBloc } from '../compute/isLastRootBloc';
import type { PinController } from '../sub/PinMenu/PinController';
import type { InsertButtonsController } from '../sub/InsertButton/InsertButtonsController';
import { collectExtensions } from '../sub/Extensions/ExtensionsButton';
import { openExtensionsPopover } from '../sub/Extensions/popover';

export type BagAccessors = {
    target: () => HTMLElement | null;
    editor: () => Editor | null;
    hoverEl: () => HTMLElement | null;
};

export type BagCallbacks = {
    onClose: () => void;
    onReflow: () => void;
    withCooldown: (fn: () => void) => void;
    onSelectParent: () => void;
};

/**
 * Wires the BAG's three controllers + DOM helpers into a fully-configured
 * EventManager. Kept in its own file so BlocActions.ts itself stays small.
 */
export function buildEventManager(
    host: HTMLElement,
    accessors: BagAccessors,
    pin: PinController,
    insertBtns: InsertButtonsController,
    cb: BagCallbacks,
): EventManager {
    return new EventManager({
        host,
        target: accessors.target,
        editor: accessors.editor,
        hoverEl: accessors.hoverEl,
        pinMenu: () => pin.menu,
        insertButtons: () => insertBtns.elements,
        canDelete: () => {
            if (!accessors.editor()?.actionBarConfiguration.get('delete')) return false;
            const t = accessors.target();
            return !!t && !isLastRootBloc(t);
        },
        onClose: cb.onClose,
        onReflow: cb.onReflow,
        onDelete: () => {
            const t = accessors.target();
            if (!t || isLastRootBloc(t)) { cb.onClose(); return; }
            t.remove();
            cb.onClose();
        },
        onEdit: () => accessors.editor()?.showConfigPanel(),
        onDuplicate: () => {
            const t = accessors.target();
            if (t) cb.withCooldown(() => duplicateSibling(t, 'after'));
        },
        onChangeComponent: () => {
            const t = accessors.target();
            if (t) openChangeComponentPicker(t, cb.onClose);
        },
        onPinClick: () => pin.handleClick(),
        onSelectParent: cb.onSelectParent,
        onExtensions: (sourceEvent) => {
            const t = accessors.target();
            if (!t) return;
            // HAG packs the originating button into `detail.target` — `e.target`
            // is the host (composed boundary). See horizontal-action-group's
            // `_dispatchAction`.
            const anchor = sourceEvent.detail?.target as HTMLElement | undefined;
            const exts = collectExtensions(t);
            if (!anchor || exts.length === 0) return;
            openExtensionsPopover(anchor, exts, t, cb.onClose);
        },
    });
}
