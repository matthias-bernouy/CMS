import type { Editor } from "@bernouy/cms-content/editor";
import type { BlockPickerItem } from "../../../BlockPickerModal/BlockPickerModal";
import type { ConditionPickerCondition } from "../../../ConditionPicker/ConditionPicker";
import type { DataSourcePickerSourceBinding } from "../../../DataSourcePicker/DataSourcePicker";
import type { EditorDataSource, SourceStateName } from "../../../../../runtime";
import type { StructureTreeAction, StructureTreeActionDetail } from "../structureTreeTypes";
import type { StructureTreeRefs } from "./structureTreeRefs";

export class StructureTreeEmitter {
    constructor(
        private readonly host: HTMLElement,
        private readonly refs: StructureTreeRefs,
    ) {}

    selectEditor(editor: Editor): void {
        this.host.dispatchEvent(new CustomEvent("editor-v2:select-editor", {
            bubbles: true,
            composed: true,
            detail: { editor },
        }));
    }

    emitAction(
        action: StructureTreeAction,
        editor?: Editor,
        item?: BlockPickerItem,
        slot?: string,
        sourceState?: SourceStateName,
        sourceEditor?: Editor,
        dataSource?: EditorDataSource,
        sourceBinding?: DataSourcePickerSourceBinding,
        sourceConditions?: ConditionPickerCondition[],
    ): void {
        this.host.dispatchEvent(new CustomEvent<StructureTreeActionDetail>("editor-v2:structure-action", {
            bubbles: true,
            composed: true,
            detail: {
                action,
                editor,
                sourceEditor,
                item,
                dataSource,
                sourceBinding,
                sourceConditions,
                entry: item?.kind === "block" ? item.entry : undefined,
                slot,
                sourceState,
            },
        }));
    }

    closeContextMenu(): void {
        this.refs.contextMenu.remove();
    }
}
