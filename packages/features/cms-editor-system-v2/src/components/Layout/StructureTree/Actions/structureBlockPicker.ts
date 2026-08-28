import type {
    BlockPickerItem,
    BlockPickerOption,
    BlockPickerSlotGroup,
} from "../../Pickers/BlockPickerModal/BlockPickerModal";
import type { PendingPickerAction, StructureTreeAction } from "../State/structureTreeTypes";

export type StructureBlockPickerContext = {
    emitAction(action: StructureTreeAction, item?: BlockPickerItem, slot?: string): void;
    openBlockPicker(groups: BlockPickerSlotGroup[], contextLabel: string): void;
    setPendingPickerAction(action: PendingPickerAction): void;
};

export function openPickerOrEmitSingleMedia(
    action: PendingPickerAction,
    groups: BlockPickerSlotGroup[],
    contextLabel: string,
    context: StructureBlockPickerContext,
): void {
    const option = singleEnabledOption(groups);
    if (option?.item?.kind === "media") {
        context.emitAction(action.action, option.item, option.slot);
        return;
    }

    context.setPendingPickerAction(action);
    context.openBlockPicker(groups, contextLabel);
}

export function singleEnabledOption(groups: BlockPickerSlotGroup[]): BlockPickerOption | null {
    const options = groups.filter((group) => !group.disabledReason).flatMap((group) => group.options);

    return options.length === 1 ? (options[0] ?? null) : null;
}
