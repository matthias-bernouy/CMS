import type { CmsSourceStateForce, EditorCatalog, EditorDocument } from "@bernouy/cms-content/editor";

import type { EditorRuntime, EditorDataSource } from "../../../../../../runtime";
import type { TopBarEditorMode, TopBarViewport } from "../../../../TopBar/TopBar";
import type { SettingsViewMode } from "../../../../../Settings/SettingsView/SettingsView";
import type { DefaultTemplateSelection } from "../../../../StructureTree/StructureTree";
import type { BlockPickerItem } from "../../../../BlockPickerModal/BlockPickerModal";
import type { EditorV2PageConfig } from "../../shellTypes";

export type ShellState = {
    catalog: EditorCatalog;
    dataSources: EditorDataSource[];
    defaultTemplateSelection: DefaultTemplateSelection;
    insertItems: BlockPickerItem[];
    runtime: EditorRuntime | null;
    editorDocument: EditorDocument | null;
    settingsMode: SettingsViewMode;
    viewport: TopBarViewport;
    editorMode: TopBarEditorMode;
    sourceStateForce: CmsSourceStateForce;
    pageConfig: EditorV2PageConfig | null;
    chromeSyncPending: boolean;
};

export function createShellState(): ShellState {
    return {
        catalog: [],
        dataSources: [],
        defaultTemplateSelection: {},
        insertItems: [],
        runtime: null,
        editorDocument: null,
        settingsMode: "settings",
        viewport: "bleed",
        editorMode: "edit",
        sourceStateForce: "loading",
        pageConfig: null,
        chromeSyncPending: false,
    };
}
