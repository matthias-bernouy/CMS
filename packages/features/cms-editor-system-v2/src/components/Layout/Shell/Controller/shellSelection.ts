import {
    type EditableState,
    type EditableStateSession,
    type Editor,
    type SettingControl,
} from "@bernouy/cms-content/editor";
import {
    NETWORK_BINDING_ATTRIBUTES,
    type NetworkBindingAttribute,
    writeNetworkBindingAttribute,
} from "@bernouy/components/binding-dom";

import type { EditorRuntime } from "../../../../runtime";
import type { SettingsViewMode } from "../../../Settings/SettingsView/SettingsView";
import type { SettingsViewAttributeChanges } from "../../../Settings/SettingsView/SettingsView";
import type { SettingsView } from "../../../Settings/SettingsView/SettingsView";
import type { EditorDataSource } from "../../../../runtime";
import type { FrameHighlight } from "./Core/FrameHighlight";
import type { SelectOptions } from "./shellTypes";
import { applyParamSyncSetting, settingsWithParamSync } from "../Domain/Settings/paramSync";
import { applyPageStateSetting, settingsWithPageState } from "../Domain/Settings/pageState";
import { getTextValue, resolveSettingsValues } from "../Domain/Settings/settingsValues";
import { exitAllStateSessions, toggleStateSession } from "../Domain/Settings/stateSessions";

type SelectionContext = {
    runtime(): EditorRuntime | null;
    settings(): SettingsView;
    dataSources(): EditorDataSource[];
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

        this.context
            .settings()
            .setSettings(
                resolveSettingsValues(
                    selection.editor,
                    settingsWithPageState(
                        selection.editor,
                        settingsWithParamSync(selection.editor, selection.settings),
                    ),
                ),
                selection.textCapability,
                selection.textCapability ? getTextValue(selection.editor, selection.textCapability.format) : "",
                this.context.settingsMode(),
                selection.states,
                runtime.getSelectedDataScopes(),
                this.context.dataSources(),
            );
    }

    applySetting(
        editor: Editor,
        setting: SettingControl,
        value: string | boolean,
        attributes?: SettingsViewAttributeChanges,
    ): void {
        if (attributes) {
            this.applyAttributes(editor, attributes);
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

    private applyAttributes(editor: Editor, attributes: SettingsViewAttributeChanges): void {
        for (const [attribute, value] of Object.entries(attributes)) {
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
}

function writeSettingAttribute(element: Element, name: string, value: string | null): void {
    if (isNetworkBindingAttribute(name)) {
        writeNetworkBindingAttribute(element, name, value);
        return;
    }
    if (value === null) {
        element.removeAttribute(name);
    } else {
        element.setAttribute(name, value);
    }
}

function isNetworkBindingAttribute(name: string): name is NetworkBindingAttribute {
    return (NETWORK_BINDING_ATTRIBUTES as readonly string[]).includes(name);
}
