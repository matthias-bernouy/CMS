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
import type { ShellEventsContext } from "./shellEventTypes";

export class ShellEvents {
    constructor(private readonly context: ShellEventsContext) {}

    readonly onSelectEditor = (event: Event): void => {
        const editor = (event as CustomEvent<{ editor: Editor }>).detail.editor;
        this.context.select(editor, {
            scrollFrameIntoView:     true,
            scrollStructureIntoView: false,
        });
    };

    readonly onSettingsTabsClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-settings-mode]");
        if (!button) return;
        this.context.setSettingsMode(button.dataset.settingsMode === "overrides" ? "overrides" : "settings");
        this.context.syncSettingsTabs();
        this.context.renderSettings();
    };

    readonly onViewportChange = (event: CustomEvent<TopBarViewportChangeDetail>): void => {
        this.context.setViewport(event.detail.viewport);
        this.context.syncViewport();
    };

    readonly onEditorModeChange = (event: CustomEvent<TopBarEditorModeChangeDetail>): void => {
        this.context.setEditorMode(event.detail.mode);
        this.context.syncEditorMode();
    };

    readonly onSourceStateChange = (event: CustomEvent<TopBarSourceStateChangeDetail>): void => {
        this.context.setSourceState(event.detail.sourceState);
        this.context.syncEditorMode();
    };

    readonly onViewReload = (): void => this.context.canvas().reloadViewFrame();
    readonly onPageSettings = (): void => this.context.openPageSettings();

    readonly onSave = (): void => {
        this.context.applyPageSettingsForm();
        this.context.saveDocument();
    };

    readonly onDeleteDocument = (): void => {
        if (!this.context.pageConfig()) {
            this.context.setSaveStatus("No page");
            return;
        }
        this.context.dispatchDeleteDocument();
    };

    readonly onPageSettingsModalClick = (event: Event): void => {
        if ((event.target as Element | null)?.closest("[data-page-settings-apply]")) {
            this.context.applyPageSettingsForm();
            this.context.closePageSettings();
            this.context.saveDocument();
            return;
        }
        if ((event.target as Element | null)?.closest("[data-page-settings-close]")) {
            this.context.closePageSettings();
        }
    };

    readonly onKeyDown = (event: Event): void => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === "Escape" && !this.context.pageSettingsModal().hidden) {
            this.context.closePageSettings();
        }
    };

    readonly onStructureAction = (event: CustomEvent<StructureTreeActionDetail>): void => {
        this.context.mutations().handleStructureAction(event.detail);
    };

    readonly onFrameReady = (event: CustomEvent<CanvasFrameReadyDetail>): void => {
        this.context.handleFrameReady(event.detail);
    };

    readonly onSettingChange = (event: CustomEvent<SettingsViewSettingChangeDetail>): void => {
        const selection = this.context.runtime()?.getSelection();
        if (!selection) return;
        this.context.applySetting(selection.editor, event.detail.setting, event.detail.value);
        this.context.syncViewFrameContent();
        this.context.showHighlight(selection.editor);
    };

    readonly onContentChange = (event: CustomEvent<SettingsViewContentChangeDetail>): void => {
        const selection = this.context.runtime()?.getSelection();
        if (!selection?.textCapability) return;
        if (event.detail.format === "html") selection.editor.target.innerHTML = event.detail.value;
        else selection.editor.target.textContent = event.detail.value;
        this.context.syncViewFrameContent();
        this.context.showHighlight(selection.editor);
    };

    readonly onStateToggle = (event: CustomEvent<SettingsViewStateToggleDetail>): void => {
        const selection = this.context.runtime()?.getSelection();
        if (!selection) return;
        this.context.toggleState(selection.editor, event.detail.state);
        this.context.renderSettings();
        this.context.showHighlight(selection.editor);
    };

    readonly onRepeatSelect = (event: CustomEvent<RepeatPickerSelectDetail>): void => {
        this.context.mutations().applyRepeatSelection(event.detail.path, event.detail.alias);
    };

    readonly onFrameClick = (event: Event): void => {
        const runtime = this.context.runtime();
        if (!runtime) return;
        event.preventDefault();
        this.context.select(runtime.getClosestEditor(this.context.frameClickTarget(event)) ?? null, {
            scrollStructureIntoView: true,
        });
    };

    readonly onCanvasBackgroundClick = (): void => {
        if (this.context.runtime()) this.context.select(null, { scrollStructureIntoView: false });
    };
}
