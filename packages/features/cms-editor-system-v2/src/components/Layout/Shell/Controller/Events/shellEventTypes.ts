import type {
    CmsSourceStateForce,
    Editor,
    Setting,
} from "@bernouy/cms-content/editor";

import type { EditorRuntime } from "../../../../../runtime";
import type { Canvas, CanvasFrameReadyDetail } from "../../../Canvas/Canvas";
import type {
    TopBarEditorMode,
    TopBarViewport,
} from "../../../TopBar/TopBar";
import type {
    SettingsViewMode,
    SettingsViewStateToggleDetail,
} from "../../../../Settings/SettingsView/SettingsView";
import type { ShellMutations } from "../../Domain/Mutations/shellMutations";
import type { SelectOptions } from "../shellTypes";

export type ShellEventsContext = {
    runtime(): EditorRuntime | null;
    settingsMode(): SettingsViewMode;
    setSettingsMode(mode: SettingsViewMode): void;
    setViewport(viewport: TopBarViewport): void;
    setEditorMode(mode: TopBarEditorMode): void;
    setSourceState(sourceState: CmsSourceStateForce): void;
    pageSettingsModal(): HTMLElement;
    pageConfig(): unknown;
    canvas(): Canvas;
    mutations(): ShellMutations;
    select(editor: Editor | null, options?: SelectOptions): void;
    syncSettingsTabs(): void;
    syncViewport(): void;
    syncEditorMode(): void;
    openPageSettings(): void;
    closePageSettings(): void;
    applyPageSettingsForm(): void;
    saveDocument(): void;
    setSaveStatus(label: string): void;
    dispatchDeleteDocument(): void;
    handleFrameReady(detail: CanvasFrameReadyDetail): void;
    applySetting(editor: Editor, setting: Setting, value: string | boolean): void;
    syncViewFrameContent(): void;
    showHighlight(editor: Editor): void;
    renderSettings(): void;
    toggleState(editor: Editor, state: SettingsViewStateToggleDetail["state"]): void;
    frameClickTarget(event: Event): Element | null;
};
