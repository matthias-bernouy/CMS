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
    | "add-source-state-child"
    | "add-root"
    | "clear-source-state"
    | "copy"
    | "delete"
    | "duplicate"
    | "move-after"
    | "move-before"
    | "paste-after"
    | "configure-repeat"
    | "replace"
    | "remove-repeat"
    | "remove-source"
    | "set-source";

export type StructureTreeActionDetail = {
    action: StructureTreeAction;
    editor?: Editor;
    sourceEditor?: Editor;
    entry?: EditorCatalogEntry;
    item?: BlockPickerItem;
    dataSource?: EditorDataSource;
    sourceBinding?: DataSourcePickerSourceBinding;
    slot?: string;
    sourceState?: SourceStateName;
};

export type StructureTreeRenderOptions = {
    scrollSelectedIntoView?: boolean;
    repeatableTargets?: HTMLElement[];
};

export type PendingPickerAction = {
    action: "add-child" | "add-source-state-child" | "add-root" | "replace";
    editor?: Editor;
    sourceState?: SourceStateName;
};
