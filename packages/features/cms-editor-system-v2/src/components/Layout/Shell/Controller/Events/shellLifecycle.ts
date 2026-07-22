import { CANVAS_BACKGROUND_CLICK_EVENT, CANVAS_FRAME_READY_EVENT } from "../../../Canvas/Canvas";
import {
    TOPBAR_DELETE_EVENT,
    TOPBAR_EDITOR_MODE_CHANGE_EVENT,
    TOPBAR_PAGE_SETTINGS_EVENT,
    TOPBAR_SAVE_EVENT,
    TOPBAR_SOURCE_STATE_CHANGE_EVENT,
    TOPBAR_VIEW_RELOAD_EVENT,
    TOPBAR_VIEWPORT_CHANGE_EVENT,
} from "../../../TopBar/TopBar";
import {
    SETTINGS_VIEW_CONTENT_CHANGE_EVENT,
    SETTINGS_VIEW_SETTING_CHANGE_EVENT,
    SETTINGS_VIEW_STATE_TOGGLE_EVENT,
} from "../../../../Settings/SettingsView/SettingsView";
import { REPEAT_PICKER_SELECT_EVENT } from "../../../Pickers/RepeatPicker/RepeatPicker";
import type { Canvas } from "../../../Canvas/Canvas";
import type { TopBar } from "../../../TopBar/TopBar";
import type { SettingsView } from "../../../../Settings/SettingsView/SettingsView";
import type { StructureTree } from "../../../StructureTree/StructureTree";
import type { RepeatPicker } from "../../../Pickers/RepeatPicker/RepeatPicker";

export type ShellLifecycleTargets = {
    structureTree: StructureTree;
    settings: SettingsView;
    repeatPicker: RepeatPicker;
    canvas: Canvas;
    topBar: TopBar;
    pageSettingsModal: HTMLElement;
    root: ShadowRoot;
    settingsTabs: HTMLElement;
};

export type ShellLifecycleHandlers = {
    onSelectEditor: EventListener;
    onStructureAction: EventListener;
    onSettingChange: EventListener;
    onContentChange: EventListener;
    onStateToggle: EventListener;
    onRepeatSelect: EventListener;
    onFrameReady: EventListener;
    onCanvasBackgroundClick: EventListener;
    onViewportChange: EventListener;
    onEditorModeChange: EventListener;
    onSourceStateChange: EventListener;
    onViewReload: EventListener;
    onPageSettings: EventListener;
    onSave: EventListener;
    onDeleteDocument: EventListener;
    onPageSettingsModalClick: EventListener;
    onKeyDown: EventListener;
    onSettingsTabsClick: EventListener;
};

export function bindShellLifecycle(targets: ShellLifecycleTargets, handlers: ShellLifecycleHandlers): void {
    updateShellLifecycle("addEventListener", targets, handlers);
}

export function unbindShellLifecycle(targets: ShellLifecycleTargets, handlers: ShellLifecycleHandlers): void {
    updateShellLifecycle("removeEventListener", targets, handlers);
}

export function lifecycleTargets(host: ShellLifecycleTargets): ShellLifecycleTargets {
    return host;
}

export function lifecycleHandlers(host: { events: ShellLifecycleHandlers }): ShellLifecycleHandlers {
    return host.events;
}

function updateShellLifecycle(
    method: "addEventListener" | "removeEventListener",
    targets: ShellLifecycleTargets,
    handlers: ShellLifecycleHandlers,
): void {
    targets.structureTree[method]("editor-v2:select-editor", handlers.onSelectEditor);
    targets.structureTree[method]("editor-v2:structure-action", handlers.onStructureAction);
    targets.settings[method](SETTINGS_VIEW_SETTING_CHANGE_EVENT, handlers.onSettingChange);
    targets.settings[method](SETTINGS_VIEW_CONTENT_CHANGE_EVENT, handlers.onContentChange);
    targets.settings[method](SETTINGS_VIEW_STATE_TOGGLE_EVENT, handlers.onStateToggle);
    targets.repeatPicker[method](REPEAT_PICKER_SELECT_EVENT, handlers.onRepeatSelect);
    targets.canvas[method](CANVAS_FRAME_READY_EVENT, handlers.onFrameReady);
    targets.canvas[method](CANVAS_BACKGROUND_CLICK_EVENT, handlers.onCanvasBackgroundClick);
    targets.topBar[method](TOPBAR_VIEWPORT_CHANGE_EVENT, handlers.onViewportChange);
    targets.topBar[method](TOPBAR_EDITOR_MODE_CHANGE_EVENT, handlers.onEditorModeChange);
    targets.topBar[method](TOPBAR_SOURCE_STATE_CHANGE_EVENT, handlers.onSourceStateChange);
    targets.topBar[method](TOPBAR_VIEW_RELOAD_EVENT, handlers.onViewReload);
    targets.topBar[method](TOPBAR_PAGE_SETTINGS_EVENT, handlers.onPageSettings);
    targets.topBar[method](TOPBAR_SAVE_EVENT, handlers.onSave);
    targets.topBar[method](TOPBAR_DELETE_EVENT, handlers.onDeleteDocument);
    targets.pageSettingsModal[method]("click", handlers.onPageSettingsModalClick);
    targets.root[method]("keydown", handlers.onKeyDown);
    targets.settingsTabs[method]("click", handlers.onSettingsTabsClick);
}
