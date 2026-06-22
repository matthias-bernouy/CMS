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
import type { ShellControllerInternals } from "./shellServiceTypes";

export function createShellControllerServices(
    host: ShellControllerInternals,
    refs: ShellDomRefs,
    frames: ShellFrames,
    highlight: FrameHighlight,
    stateSessions: WeakMap<Editor, Map<string, EditableStateSession>>,
) {
    let events: ShellEvents;
    const mutations = new ShellMutations({
        frameDocument:          () => frames.frameDocument,
        editorDocument:         () => host._editorDocument,
        runtime:                () => host._runtime,
        insertItems:            () => host._insertItems,
        repeatPicker:           () => refs.repeatPicker,
        findStructureNodeLabel: editor => renderSync.findStructureNodeLabel(editor),
        isEmptyDocumentContent: () => renderSync.isEmptyDocumentContent(),
        loadDocument:           (document, selectedTarget = null) => host.loadDocument(document, selectedTarget),
        syncViewFrameContent:   () => renderSync.syncViewFrameContent(),
    });
    const selection = new ShellSelection({
        runtime:              () => host._runtime,
        settings:             () => refs.settings,
        settingsMode:         () => host._settingsMode,
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
        pageConfig:               () => host._pageConfig,
        setPageConfig:            config => { host._pageConfig = config; },
        catalog:                  () => host._catalog,
        insertItems:              () => host._insertItems,
        defaultTemplateSelection: () => host._defaultTemplateSelection,
        dataSources:              () => host._dataSources,
        runtime:                  () => host._runtime,
        chromeSyncPending:        () => host._chromeSyncPending,
        setChromeSyncPending:     value => { host._chromeSyncPending = value; },
    });
    const renderSync = new ShellRenderSyncCommands({ host, refs, frames, sync });
    const commands = new ShellCommands({
        host,
        frames,
        selection,
        renderSync,
        frameClickHandler: () => events.onFrameClick,
        saveEventName:    "editor-v2:save-document",
        deleteEventName:  "editor-v2:delete-document",
    });
    events = new ShellEvents({
        runtime:               () => host._runtime,
        settingsMode:          () => host._settingsMode,
        setSettingsMode:       mode => { host._settingsMode = mode; },
        setViewport:           viewport => { host._viewport = viewport; },
        setEditorMode:         mode => { host._editorMode = mode; },
        setSourceState:        sourceState => { host._sourceStateForce = sourceState; },
        pageSettingsModal:     () => refs.pageSettingsModal,
        pageConfig:            () => host._pageConfig,
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
            catalog:                                  () => host._catalog,
            setCatalogValue:                         catalog => { host._catalog = catalog; },
            setCatalogSize:                          size => host.setAttribute("catalog-size", String(size)),
            setInsertItemsValue:                     items => { host._insertItems = items; },
            setDefaultTemplateSelectionValue:        selection => { host._defaultTemplateSelection = selection; },
            setDataSourcesValue:                     sources => { host._dataSources = sources; },
            setPageConfigValue:                      config => { host._pageConfig = config; },
            topBarTitle:                             (title, path) => refs.topBar.setPageTitle(title, path),
            syncStructureTreeCatalog:                () => renderSync.syncStructureTreeCatalog(),
            syncStructureTreeInsertItems:            () => renderSync.syncStructureTreeInsertItems(),
            syncStructureTreeDefaultTemplateSelection: () => renderSync.syncStructureTreeDefaultTemplateSelection(),
            syncStructureTreeDataSources:            () => renderSync.syncStructureTreeDataSources(),
            syncPageSettingsForm:                    () => renderSync.syncPageSettingsForm(),
            renderStructure:                         () => commands.renderStructure(),
            exitAllStateSessions:                    () => commands.exitAllStateSessions(),
            disposeRuntime:                          () => host._runtime?.dispose(),
            setEditorDocument:                       document => { host._editorDocument = document; },
            setRuntime:                              runtime => { host._runtime = runtime; },
            runtime:                                 () => host._runtime,
            dataSources:                             () => host._dataSources,
            select:                                  (editor, options) => commands.select(editor, options),
        }),
    };
}
