import type { EditableStateSession, Editor } from "@bernouy/cms-content/editor";

import type { ShellDomRefs } from "../../../Domain/shellDomRefs";
import type { FrameHighlight } from "../FrameHighlight";
import type { ShellFrames } from "../../shellFrames";
import { ShellMutations } from "../../../Domain/Mutations/shellMutations";
import { InlineTextEditing } from "../../../Domain/Settings/inlineTextEditing";
import { InlineRichTextToolbar } from "../../../Domain/Settings/inlineRichTextToolbar";
import { ShellSelection } from "../../shellSelection";
import { ShellSync } from "../../shellSync";
import { ShellEvents } from "../../Events/shellEvents";
import { ShellInlineTextEvents } from "../../Events/shellInlineTextEvents";
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
    let inlineTextEvents: ShellInlineTextEvents;
    const mutations = new ShellMutations({
        frameDocument: () => frames.frameDocument,
        editorDocument: () => state.editorDocument,
        runtime: () => state.runtime,
        catalog: () => state.catalog,
        rootEditor: () => {
            const contentRoot = state.editorDocument?.contentRoot;
            return contentRoot && state.runtime ? (state.runtime.getEditor(contentRoot) ?? null) : null;
        },
        editingPolicy: () => state.editingPolicy,
        repeatPicker: () => refs.repeatPicker,
        findStructureNodeLabel: (editor) => renderSync.findStructureNodeLabel(editor),
        isEmptyDocumentContent: () => renderSync.isEmptyDocumentContent(),
        loadDocument: (document, selectedTarget = null) => host.loadDocument(document, selectedTarget),
        syncViewFrameContent: () => renderSync.syncViewFrameContent(),
    });
    const selection = new ShellSelection({
        runtime: () => state.runtime,
        settings: () => refs.settings,
        dataSources: () => state.dataSources,
        editingPolicy: () => state.editingPolicy,
        settingsMode: () => state.settingsMode,
        stateSessions: () => stateSessions,
        highlight: () => highlight,
        renderStructure: (options) => renderSync.renderStructure(options),
        syncViewFrameContent: () => renderSync.syncViewFrameContent(),
    });
    const sync = new ShellSync({
        host,
        state,
        refs,
    });
    const renderSync = new ShellRenderSyncCommands({ host, state, refs, frames, sync });
    const inlineText = new InlineTextEditing(
        new InlineRichTextToolbar(refs.inlineRichText, {
            dataScopes: () => state.runtime?.getSelectedDataScopes() ?? [],
            changed: (editor) => {
                selection.renderSettings();
                renderSync.syncViewFrameContent();
                highlight.show(editor);
            },
        }),
    );
    const commands = new ShellCommands({
        host,
        state,
        frames,
        selection,
        renderSync,
        inlineText,
        frameEventHandlers: () => ({
            click: inlineTextEvents.onFrameClick,
            focusout: inlineTextEvents.onFrameFocusOut,
            input: inlineTextEvents.onFrameInput,
            keydown: inlineTextEvents.onFrameKeyDown,
            paste: inlineTextEvents.onFramePaste,
            pointerdown: inlineTextEvents.onFramePointerDown,
        }),
        saveEventName: "editor-v2:save-document",
        deleteEventName: "editor-v2:delete-document",
    });
    events = new ShellEvents({
        host,
        state,
        refs,
        mutations,
        commands,
        renderSync,
        highlight,
    });
    inlineTextEvents = new ShellInlineTextEvents({ state, commands, highlight, inlineText });
    return {
        mutations,
        selection,
        sync,
        commands,
        renderSync,
        events,
        api: new ShellApi({
            host,
            state,
            refs,
            renderSync,
            commands,
        }),
    };
}
