import type { EditorRuntime } from "../../../../../../runtime";
import type { FrameHighlight } from "../FrameHighlight";
import type { ShellCommands } from "../shellCommands";
import type { ShellRenderSyncCommands } from "../shellRenderSyncCommands";
import type { ShellDomRefs } from "../../../Domain/shellDomRefs";
import {
    bindShellLifecycle,
    lifecycleHandlers,
    lifecycleTargets,
    unbindShellLifecycle,
    type ShellLifecycleHandlers,
    type ShellLifecycleTargets,
} from "../../Events/shellLifecycle";
import type { ShellEvents } from "../../Events/shellEvents";

export type ShellLifecycleContext = {
    root: ShadowRoot;
    refs: ShellDomRefs;
    events: ShellEvents;
    commands: ShellCommands;
    renderSync: ShellRenderSyncCommands;
    highlight: FrameHighlight;
    runtime(): EditorRuntime | null;
    setRuntime(runtime: EditorRuntime | null): void;
};

export function connectShellController(context: ShellLifecycleContext): void {
    bindShellLifecycle(lifecycleTargetsFor(context), lifecycleHandlersFor(context));
    context.renderSync.syncStructureTreeCatalog();
    context.renderSync.syncStructureTreeDataSources();
    context.renderSync.syncViewport();
    context.renderSync.syncEditorMode();
    context.renderSync.syncChromeLabels();
}

export function disconnectShellController(context: ShellLifecycleContext): void {
    unbindShellLifecycle(lifecycleTargetsFor(context), lifecycleHandlersFor(context));
    context.commands.unbindFrameDocument();
    context.commands.unbindViewFrameDocument();
    context.highlight.dispose();
    context.commands.exitAllStateSessions();
    context.runtime()?.dispose();
    context.setRuntime(null);
}

export function lifecycleTargetsFor(context: ShellLifecycleContext): ShellLifecycleTargets {
    return lifecycleTargets({
        structureTree: context.refs.structureTree,
        settings: context.refs.settings,
        repeatPicker: context.refs.repeatPicker,
        canvas: context.refs.canvas,
        topBar: context.refs.topBar,
        pageSettingsModal: context.refs.pageSettingsModal,
        root: context.root,
        settingsTabs: context.refs.settingsTabs,
    });
}

export function lifecycleHandlersFor(context: ShellLifecycleContext): ShellLifecycleHandlers {
    return lifecycleHandlers({
        events: context.events as unknown as ShellLifecycleHandlers,
    });
}
