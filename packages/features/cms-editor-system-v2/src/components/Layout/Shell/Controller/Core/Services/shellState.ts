import type { CmsSourceStateForce, EditorCatalog, EditorDocument } from "@bernouy/cms-content/editor";

import type { EditorRuntime, EditorDataSource } from "../../../../../../runtime";
import type { TopBarEditorMode, TopBarViewport } from "../../../../TopBar/TopBar";
import type { SettingsViewMode } from "../../../../../Settings/SettingsView/SettingsView";
import type { EditorPreviewMode, EditorV2PageConfig } from "../../shellTypes";
import {
    resolveEditorInteractionPolicy,
    type ResolvedEditorInteractionPolicy,
} from "../../../../../../policy/editorInteractionPolicy";

export type ShellState = {
    catalog: EditorCatalog;
    dataSources: EditorDataSource[];
    runtime: EditorRuntime | null;
    editorDocument: EditorDocument | null;
    settingsMode: SettingsViewMode;
    viewport: TopBarViewport;
    editorMode: TopBarEditorMode;
    sourceStateForce: CmsSourceStateForce;
    pageConfig: EditorV2PageConfig | null;
    editingPolicy: ResolvedEditorInteractionPolicy;
    previewMode: EditorPreviewMode;
    chromeSyncPending: boolean;
};

export function createShellState(): ShellState {
    return {
        catalog: [],
        dataSources: [],
        runtime: null,
        editorDocument: null,
        settingsMode: "settings",
        viewport: "bleed",
        editorMode: "edit",
        sourceStateForce: "loading",
        pageConfig: null,
        editingPolicy: resolveEditorInteractionPolicy(),
        previewMode: "mirrored",
        chromeSyncPending: false,
    };
}
