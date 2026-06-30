import type { Editor } from "@bernouy/cms-content/editor";

import type {
    CanvasFrameReadyDetail,
} from "../../../Canvas/Canvas";
import type {
    TopBarEditorModeChangeDetail,
    TopBarSourceStateChangeDetail,
    TopBarViewportChangeDetail,
} from "../../../TopBar/TopBar";
import type {
    SettingsViewContentChangeDetail,
    SettingsViewSettingChangeDetail,
    SettingsViewStateToggleDetail,
} from "../../../../Settings/SettingsView/SettingsView";
import type { RepeatPickerSelectDetail } from "../../../RepeatPicker/RepeatPicker";
import type { StructureTreeActionDetail } from "../../../StructureTree/StructureTree";
import { setTextValue } from "../../Domain/Settings/settingsValues";
import type { ShellEventsContext } from "./shellEventTypes";

export class ShellEvents {
    constructor(private readonly context: ShellEventsContext) {}

    readonly onSelectEditor = (event: Event): void => {
        const editor = (event as CustomEvent<{ editor: Editor }>).detail.editor;
        this.context.commands.select(editor, {
            scrollFrameIntoView:     true,
            scrollStructureIntoView: false,
        });
    };

    readonly onSettingsTabsClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-settings-mode]");
        if (!button) return;
        this.context.state.settingsMode = button.dataset.settingsMode === "overrides" ? "overrides" : "settings";
        this.context.commands.syncSettingsTabs();
        this.context.commands.renderSettings();
    };

    readonly onViewportChange = (event: CustomEvent<TopBarViewportChangeDetail>): void => {
        this.context.state.viewport = event.detail.viewport;
        this.context.commands.syncViewport();
    };

    readonly onEditorModeChange = (event: CustomEvent<TopBarEditorModeChangeDetail>): void => {
        this.context.state.editorMode = event.detail.mode;
        this.context.commands.syncEditorMode();
    };

    readonly onSourceStateChange = (event: CustomEvent<TopBarSourceStateChangeDetail>): void => {
        this.context.state.sourceStateForce = event.detail.sourceState;
        this.context.commands.syncEditorMode();
    };

    readonly onViewReload = (): void => this.context.refs.canvas.reloadViewFrame();
    readonly onPageSettings = (): void => this.context.renderSync.openPageSettings();

    readonly onSave = (): void => {
        this.context.renderSync.applyPageSettingsForm();
        this.context.commands.saveDocument();
    };

    readonly onDeleteDocument = (): void => {
        if (!this.context.state.pageConfig) {
            this.context.commands.setSaveStatus("No page");
            return;
        }
        this.context.commands.dispatchDeleteDocument();
    };

    readonly onPageSettingsModalClick = (event: Event): void => {
        if ((event.target as Element | null)?.closest("[data-page-settings-apply]")) {
            this.context.renderSync.applyPageSettingsForm();
            this.context.renderSync.closePageSettings();
            this.context.commands.saveDocument();
            return;
        }
        if ((event.target as Element | null)?.closest("[data-page-settings-close]")) {
            this.context.renderSync.closePageSettings();
        }
    };

    readonly onKeyDown = (event: Event): void => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === "Escape" && !this.context.refs.pageSettingsModal.hidden) {
            this.context.renderSync.closePageSettings();
        }
    };

    readonly onStructureAction = (event: CustomEvent<StructureTreeActionDetail>): void => {
        this.context.mutations.handleStructureAction(event.detail);
    };

    readonly onFrameReady = (event: CustomEvent<CanvasFrameReadyDetail>): void => {
        this.context.commands.handleFrameReady(event.detail);
    };

    readonly onSettingChange = (event: CustomEvent<SettingsViewSettingChangeDetail>): void => {
        const selection = this.context.state.runtime?.getSelection();
        if (!selection) return;
        this.context.commands.applySetting(selection.editor, event.detail.setting, event.detail.value, event.detail.attributes);
        this.context.commands.syncViewFrameContent();
        this.context.highlight.show(selection.editor);
    };

    readonly onContentChange = (event: CustomEvent<SettingsViewContentChangeDetail>): void => {
        const selection = this.context.state.runtime?.getSelection();
        if (!selection?.textCapability) return;
        setTextValue(
            selection.editor,
            selection.textCapability.format,
            event.detail.value,
        );
        this.context.commands.syncViewFrameContent();
        this.context.highlight.show(selection.editor);
    };

    readonly onStateToggle = (event: CustomEvent<SettingsViewStateToggleDetail>): void => {
        const selection = this.context.state.runtime?.getSelection();
        if (!selection) return;
        this.context.commands.toggleState(selection.editor, event.detail.state);
        this.context.commands.renderSettings();
        this.context.highlight.show(selection.editor);
    };

    readonly onRepeatSelect = (event: CustomEvent<RepeatPickerSelectDetail>): void => {
        this.context.mutations.applyRepeatSelection(event.detail.path, event.detail.alias);
    };

    readonly onFrameClick = (event: Event): void => {
        const runtime = this.context.state.runtime;
        if (!runtime) return;
        event.preventDefault();
        this.context.commands.select(runtime.getClosestEditor(this.context.frameClickTarget(event)) ?? null, {
            scrollStructureIntoView: true,
        });
    };

    readonly onCanvasBackgroundClick = (): void => {
        if (this.context.state.runtime) this.context.commands.select(null, { scrollStructureIntoView: false });
    };
}
