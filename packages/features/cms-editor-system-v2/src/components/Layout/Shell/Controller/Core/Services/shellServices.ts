import type { EditableStateSession, Editor } from "@bernouy/cms-content/editor";

import type { ShellDomRefs } from "../../../Domain/shellDomRefs";
import type { FrameHighlight } from "../FrameHighlight";
import type { ShellFrames } from "../../shellFrames";
import { eventElement } from "../../shellFrames";
import { ShellMutations } from "../../../Domain/Mutations/shellMutations";
import { ShellSelection } from "../../shellSelection";
import { ShellSync } from "../../shellSync";
import { ShellEvents } from "../../Events/shellEvents";
import { ShellApi } from "../shellApi";
import { ShellCommands } from "../shellCommands";
import { ShellRenderSyncCommands } from "../shellRenderSyncCommands";
import type { ShellControllerHost } from "./shellServiceTypes";
import type { ShellState } from "./shellState";

export function createShellControllerServices(
    host: ShellControllerHost,
    state: ShellState,
    refs: ShellDomRefs,
    frames: ShellFrames,
    highlight: FrameHighlight,
    stateSessions: WeakMap<Editor, Map<string, EditableStateSession>>,
) {
    let events: ShellEvents;
    const mutations = new ShellMutations({
        frameDocument:          () => frames.frameDocument,
        editorDocument:         () => state.editorDocument,
        runtime:                () => state.runtime,
        insertItems:            () => state.insertItems,
        repeatPicker:           () => refs.repeatPicker,
        findStructureNodeLabel: editor => renderSync.findStructureNodeLabel(editor),
        isEmptyDocumentContent: () => renderSync.isEmptyDocumentContent(),
        loadDocument:           (document, selectedTarget = null) => host.loadDocument(document, selectedTarget),
        syncViewFrameContent:   () => renderSync.syncViewFrameContent(),
    });
    const selection = new ShellSelection({
        runtime:              () => state.runtime,
        settings:             () => refs.settings,
        settingsMode:         () => state.settingsMode,
        stateSessions:        () => stateSessions,
        highlight:            () => highlight,
        renderStructure:      options => renderSync.renderStructure(options),
        syncViewFrameContent: () => renderSync.syncViewFrameContent(),
    });
    const sync = new ShellSync({
        host,
        root:                     () => host.shadowRoot!,
        refs:                     () => refs,
        topBar:                   () => refs.topBar,
        pageConfig:               () => state.pageConfig,
        setPageConfig:            config => { state.pageConfig = config; },
        catalog:                  () => state.catalog,
        insertItems:              () => state.insertItems,
        defaultTemplateSelection: () => state.defaultTemplateSelection,
        dataSources:              () => state.dataSources,
        runtime:                  () => state.runtime,
        chromeSyncPending:        () => state.chromeSyncPending,
        setChromeSyncPending:     value => { state.chromeSyncPending = value; },
    });
    const renderSync = new ShellRenderSyncCommands({ host, state, refs, frames, sync });
    const commands = new ShellCommands({
        host,
        state,
        frames,
        selection,
        renderSync,
        frameClickHandler: () => events.onFrameClick,
        saveEventName:    "editor-v2:save-document",
        deleteEventName:  "editor-v2:delete-document",
    });
    events = new ShellEvents({
        runtime:               () => state.runtime,
        settingsMode:          () => state.settingsMode,
        setSettingsMode:       mode => { state.settingsMode = mode; },
        setViewport:           viewport => { state.viewport = viewport; },
        setEditorMode:         mode => { state.editorMode = mode; },
        setSourceState:        sourceState => { state.sourceStateForce = sourceState; },
        pageSettingsModal:     () => refs.pageSettingsModal,
        pageConfig:            () => state.pageConfig,
        canvas:                () => refs.canvas,
        mutations:             () => mutations,
        select:                (editor, options) => commands.select(editor, options),
        syncSettingsTabs:      () => commands.syncSettingsTabs(),
        syncViewport:          () => commands.syncViewport(),
        syncEditorMode:        () => commands.syncEditorMode(),
        openPageSettings:      () => renderSync.openPageSettings(),
        closePageSettings:     () => renderSync.closePageSettings(),
        applyPageSettingsForm: () => renderSync.applyPageSettingsForm(),
        saveDocument:          () => commands.saveDocument(),
        setSaveStatus:         label => commands.setSaveStatus(label),
        dispatchDeleteDocument: () => commands.dispatchDeleteDocument(),
        handleFrameReady:      detail => commands.handleFrameReady(detail),
        applySetting:          (editor, setting, value) => commands.applySetting(editor, setting, value),
        syncViewFrameContent:  () => commands.syncViewFrameContent(),
        showHighlight:         editor => highlight.show(editor),
        renderSettings:        () => commands.renderSettings(),
        toggleState:           (editor, state) => commands.toggleState(editor, state),
        frameClickTarget:      event => eventElement(event),
    });
    return {
        mutations,
        selection,
        sync,
        commands,
        renderSync,
        events,
        api: new ShellApi({
            catalog:                                  () => state.catalog,
            setCatalogValue:                         catalog => { state.catalog = catalog; },
            setCatalogSize:                          size => host.setAttribute("catalog-size", String(size)),
            setInsertItemsValue:                     items => { state.insertItems = items; },
            setDefaultTemplateSelectionValue:        selection => { state.defaultTemplateSelection = selection; },
            setDataSourcesValue:                     sources => { state.dataSources = sources; },
            setPageConfigValue:                      config => { state.pageConfig = config; },
            topBarTitle:                             (title, path) => refs.topBar.setPageTitle(title, path),
            syncStructureTreeCatalog:                () => renderSync.syncStructureTreeCatalog(),
            syncStructureTreeInsertItems:            () => renderSync.syncStructureTreeInsertItems(),
            syncStructureTreeDefaultTemplateSelection: () => renderSync.syncStructureTreeDefaultTemplateSelection(),
            syncStructureTreeDataSources:            () => renderSync.syncStructureTreeDataSources(),
            syncPageSettingsForm:                    () => renderSync.syncPageSettingsForm(),
            renderStructure:                         () => commands.renderStructure(),
            exitAllStateSessions:                    () => commands.exitAllStateSessions(),
            disposeRuntime:                          () => state.runtime?.dispose(),
            setEditorDocument:                       document => { state.editorDocument = document; },
            setRuntime:                              runtime => { state.runtime = runtime; },
            runtime:                                 () => state.runtime,
            dataSources:                             () => state.dataSources,
            select:                                  (editor, options) => commands.select(editor, options),
        }),
    };
}
