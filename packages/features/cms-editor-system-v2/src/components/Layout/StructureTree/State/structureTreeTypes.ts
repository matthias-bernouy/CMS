import type {
    Editor,
    EditorCatalogEntry,
} from "@bernouy/cms-content/editor";
import type { BlockPickerItem } from "../../BlockPickerModal/BlockPickerModal";
import type { DataSourcePickerSourceBinding } from "../../DataSourcePicker/DataSourcePicker";
import type {
    EditorDataSource,
    SourceStateName,
} from "../../../../runtime";

export type StructureTreeKey = HTMLElement | object;

export type StructureTreeRenderRequest = {
    anchor?: {
        key: StructureTreeKey;
        offsetTop: number;
    };
};

export type StructureTreeAction =
    | "add-child"
    | "add-root"
    | "copy"
    | "delete"
    | "duplicate"
    | "move-after"
    | "move-before"
    | "paste-after"
    | "configure-repeat"
    | "replace"
    | "remove-repeat"
    | "remove-source-status-condition"
    | "remove-source"
    | "set-condition"
    | "set-source-status-condition"
    | "set-source-status-conditions"
    | "set-source";

export type StructureTreeActionDetail = {
    action: StructureTreeAction;
    editor?: Editor;
    sourceEditor?: Editor;
    entry?: EditorCatalogEntry;
    item?: BlockPickerItem;
    dataSource?: EditorDataSource;
    sourceBinding?: DataSourcePickerSourceBinding;
    sourceConditions?: Array<{ sourceEditor: Editor; sourceState: SourceStateName }>;
    conditionExpression?: string;
    slot?: string;
    sourceState?: SourceStateName;
};

export type StructureTreeRenderOptions = {
    scrollSelectedIntoView?: boolean;
    repeatableTargets?: HTMLElement[];
};

export type PendingPickerAction = {
    action: "add-child" | "add-root" | "replace";
    editor?: Editor;
};
