import type { Editor } from '@bernouy/cms/editor';
import { EventManager } from './EventManager';
import { duplicateSibling } from '../domain/duplicateSibling';
import { openChangeComponentPicker } from '../domain/openChangeComponentPicker';
import type { PinController } from '../sub/PinMenu/PinController';
import type { InsertButtonsController } from '../sub/InsertButton/InsertButtonsController';

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
        canDelete: () => !!accessors.editor()?.actionBarConfiguration.get('delete'),
        onClose: cb.onClose,
        onReflow: cb.onReflow,
        onDelete: () => { accessors.target()?.remove(); cb.onClose(); },
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
    });
}
