import {
    type EditableState,
    type EditableStateSession,
    type Editor,
    type Setting,
} from "@bernouy/cms-content/editor";

import type { EditorRuntime } from "../../../../runtime";
import type { SettingsViewMode } from "../../../Settings/SettingsView/SettingsView";
import type { SettingsView } from "../../../Settings/SettingsView/SettingsView";
import type { FrameHighlight } from "./Core/FrameHighlight";
import type { SelectOptions } from "./shellTypes";
import {
    applyParamSyncSetting,
    settingsWithParamSync,
} from "../Domain/Settings/paramSync";
import {
    applyPageStateSetting,
    settingsWithPageState,
} from "../Domain/Settings/pageState";
import {
    getTextValue,
    resolveSettingsValues,
} from "../Domain/Settings/settingsValues";
import {
    exitAllStateSessions,
    toggleStateSession,
} from "../Domain/Settings/stateSessions";

type SelectionContext = {
    runtime(): EditorRuntime | null;
    settings(): SettingsView;
    settingsMode(): SettingsViewMode;
    stateSessions(): WeakMap<Editor, Map<string, EditableStateSession>>;
    highlight(): FrameHighlight;
    renderStructure(options?: SelectOptions): void;
    syncViewFrameContent(): void;
};

export class ShellSelection {
    constructor(private readonly context: SelectionContext) {}

    select(editor: Editor | null, options: SelectOptions = {}): void {
        const runtime = this.context.runtime();
        if (!runtime) return;

        const selection = runtime.select(editor);
        this.context.renderStructure(options);
        if (!selection) {
            this.context.settings().setSettings([]);
            this.context.highlight().hide();
            return;
        }

        this.renderSettings();
        this.context.highlight().show(selection.editor, {
            scrollIntoView: options.scrollFrameIntoView === true,
        });
    }

    renderSettings(): void {
        const runtime = this.context.runtime();
        if (!runtime) return;

        const selection = runtime.getSelection();
        if (!selection) {
            this.context.settings().setSettings([]);
            return;
        }

        this.context.settings().setSettings(
            resolveSettingsValues(
                selection.editor,
                settingsWithPageState(selection.editor, settingsWithParamSync(selection.editor, selection.settings)),
            ),
            selection.textCapability,
            selection.textCapability ? getTextValue(selection.editor, selection.textCapability.format) : "",
            this.context.settingsMode(),
            selection.states,
            runtime.getSelectedDataScopes(),
        );
    }

    applySetting(editor: Editor, setting: Setting, value: string | boolean): void {
        if (applyParamSyncSetting(editor, setting, value) || applyPageStateSetting(editor, setting, value)) {
            this.renderSettings();
            this.context.syncViewFrameContent();
            this.context.highlight().show(editor);
            return;
        }

        const attribute = setting.attribute;
        if (typeof value === "boolean") {
            editor.target.toggleAttribute(attribute, value);
        } else if (value === "") {
            editor.target.removeAttribute(attribute);
        } else if (typeof value === "string") {
            editor.target.setAttribute(attribute, value);
        }
    }

    toggleState(editor: Editor, state: EditableState): void {
        toggleStateSession(this.context.stateSessions(), editor, state);
    }

    exitAllStateSessions(): void {
        const runtime = this.context.runtime();
        if (!runtime) return;
        exitAllStateSessions(this.context.stateSessions(), runtime.getStructure());
    }
}
