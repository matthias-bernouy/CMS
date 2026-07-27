import {
    type EditableState,
    type EditableStateSession,
    type Editor,
    type SettingControl,
} from "@bernouy/cms-content/editor";
import type { EditorRuntime } from "../../../../runtime";
import type {
    SettingsView,
    SettingsViewAttributeChanges,
    SettingsViewMode,
} from "../../../Settings/SettingsView/SettingsView";
import type { EditorDataSource } from "../../../../runtime";
import type { FrameHighlight } from "./Core/FrameHighlight";
import type { SelectOptions } from "./shellTypes";
import { applyParamSyncSetting, settingsWithParamSync } from "../Domain/Settings/paramSync";
import { applyPageStateSetting, settingsWithPageState } from "../Domain/Settings/pageState";
import { getTextValue, resolveSettingsValues } from "../Domain/Settings/settingsValues";
import { exitAllStateSessions, toggleStateSession } from "../Domain/Settings/stateSessions";
import { writeSettingAttribute } from "../Domain/Settings/settingAttributes";
import {
    filterSettingSections,
    DEFAULT_EDITOR_INTERACTION_POLICY,
    isAttributeAllowed,
    isSettingAllowed,
    type ResolvedEditorInteractionPolicy,
} from "../../../../policy/editorInteractionPolicy";

type SelectionContext = {
    runtime(): EditorRuntime | null;
    settings(): SettingsView;
    dataSources(): EditorDataSource[];
    editingPolicy?(): ResolvedEditorInteractionPolicy;
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
        if (!runtime) {
            return;
        }

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
        if (!runtime) {
            return;
        }

        const selection = runtime.getSelection();
        if (!selection) {
            this.context.settings().setSettings([]);
            return;
        }

        const policy = this.editingPolicy();
        const settings = filterSettingSections(
            policy,
            resolveSettingsValues(
                selection.editor,
                settingsWithPageState(selection.editor, settingsWithParamSync(selection.editor, selection.settings)),
            ),
        );
        this.context
            .settings()
            .setSettings(
                settings,
                selection.textCapability,
                selection.textCapability ? getTextValue(selection.editor, selection.textCapability.format) : "",
                this.context.settingsMode(),
                selection.states,
                policy.bindings ? runtime.getSelectedDataScopes() : [],
                policy.bindings ? this.context.dataSources() : [],
            );
    }

    applySetting(
        editor: Editor,
        setting: SettingControl,
        value: string | boolean,
        attributes?: SettingsViewAttributeChanges,
    ): void {
        const policy = this.editingPolicy();
        if (!isSettingAllowed(policy, setting)) {
            return;
        }
        if (attributes) {
            this.applyAttributes(editor, attributes, policy);
            return;
        }

        if (applyParamSyncSetting(editor, setting, value) || applyPageStateSetting(editor, setting, value)) {
            this.renderSettings();
            this.context.syncViewFrameContent();
            this.context.highlight().show(editor);
            return;
        }

        const attribute = setting.attribute;
        if (typeof value === "boolean") {
            editor.target.toggleAttribute(attribute, value);
        } else {
            writeSettingAttribute(editor.target, attribute, value || null);
        }
        if (setting.type === "select" || setting.type === "segmented" || setting.type === "toggle") {
            this.renderSettings();
        }
    }

    private applyAttributes(
        editor: Editor,
        attributes: SettingsViewAttributeChanges,
        policy: ResolvedEditorInteractionPolicy,
    ): void {
        for (const [attribute, value] of Object.entries(attributes)) {
            if (!isAttributeAllowed(policy, attribute)) {
                continue;
            }
            if (typeof value === "boolean") {
                editor.target.toggleAttribute(attribute, value);
            } else {
                writeSettingAttribute(editor.target, attribute, value || null);
            }
        }
        this.renderSettings();
    }

    toggleState(editor: Editor, state: EditableState): void {
        toggleStateSession(this.context.stateSessions(), editor, state);
    }

    exitAllStateSessions(): void {
        const runtime = this.context.runtime();
        if (!runtime) {
            return;
        }
        exitAllStateSessions(this.context.stateSessions(), runtime.getStructure());
    }

    private editingPolicy(): ResolvedEditorInteractionPolicy {
        return this.context.editingPolicy?.() ?? DEFAULT_EDITOR_INTERACTION_POLICY;
    }
}
