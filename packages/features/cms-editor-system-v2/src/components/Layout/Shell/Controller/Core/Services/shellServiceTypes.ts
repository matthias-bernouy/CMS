import type {
    CmsSourceStateForce,
    EditorCatalog,
    EditorDocument,
} from "@bernouy/cms-content/editor";

import type { EditorRuntime, EditorDataSource } from "../../../../../../runtime";
import type { TopBarEditorMode, TopBarViewport } from "../../../../TopBar/TopBar";
import type { SettingsViewMode } from "../../../../../Settings/SettingsView/SettingsView";
import type { DefaultTemplateSelection } from "../../../../StructureTree/StructureTree";
import type { BlockPickerItem } from "../../../../BlockPickerModal/BlockPickerModal";
import type { EditorV2PageConfig } from "../../shellTypes";

export type ShellControllerInternals = HTMLElement & {
    _catalog: EditorCatalog;
    _dataSources: EditorDataSource[];
    _defaultTemplateSelection: DefaultTemplateSelection;
    _insertItems: BlockPickerItem[];
    _runtime: EditorRuntime | null;
    _editorDocument: EditorDocument | null;
    _settingsMode: SettingsViewMode;
    _viewport: TopBarViewport;
    _editorMode: TopBarEditorMode;
    _sourceStateForce: CmsSourceStateForce;
    _pageConfig: EditorV2PageConfig | null;
    _chromeSyncPending: boolean;
    loadDocument(document: EditorDocument, selectedTarget?: HTMLElement | null): void;
};
