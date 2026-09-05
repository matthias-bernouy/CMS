import {
    CMS_BINDING_ATTRIBUTES,
    type EditableState,
    type EditableStateSession,
    type Editor,
    type SettingControl,
} from "@bernouy/cms-content/editor";
import { parseSource } from "@bernouy/cms-content/editor";
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
import {
    applyNativeEditorAttributeEffects,
    canonicalizeNativeEditorAttributeChanges,
    filterNativeEditorSettingSections,
    isNativeEditorAttributeAllowed,
    isNativeEditorAttributeMutationAllowed,
    isNativeEditorAttributeValueAllowed,
    isNativeEditorSettingAllowed,
    isNativeEditorSettingValueAllowed,
} from "../../../../native/attributePolicy";
import { prepareNativeMediaSettingChange } from "../../../../native/mediaSettingChanges";

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
            filterNativeEditorSettingSections(
                selection.editor.target,
                resolveSettingsValues(
                    selection.editor,
                    settingsWithPageState(
                        selection.editor,
                        settingsWithParamSync(selection.editor, selection.settings),
                    ),
                ),
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
        if (
            !isSettingAllowed(policy, setting) ||
            !isNativeEditorSettingAllowed(editor.target, setting) ||
            !isNativeEditorSettingValueAllowed(editor.target, setting, value) ||
            !isDeclaredNativeEndpoint(this.context.dataSources?.() ?? [], editor.target, setting, value, attributes)
        ) {
            return;
        }
        const mediaChange = prepareNativeMediaSettingChange(editor, setting, value, attributes);
        if (mediaChange?.kind === "accessible-name-draft") {
            return;
        }
        const attributeChanges = mediaChange?.attributes ?? attributes;
        if (attributeChanges) {
            this.applyAttributes(
                editor,
                normalizeNativeAttributeChanges(editor.target, setting, attributeChanges),
                policy,
            );
            return;
        }

        if (applyParamSyncSetting(editor, setting, value) || applyPageStateSetting(editor, setting, value)) {
            this.renderSettings();
            this.context.syncViewFrameContent();
            this.context.highlight().show(editor);
            return;
        }

        const attribute = setting.attribute;
        const mutationValue = typeof value === "boolean" ? value : value || null;
        if (!isNativeEditorAttributeMutationAllowed(editor.target, { [attribute]: mutationValue })) {
            return;
        }
        if (typeof value === "boolean") {
            editor.target.toggleAttribute(attribute, value);
        } else {
            writeSettingAttribute(editor.target, attribute, value || null);
        }
        applyNativeEditorAttributeEffects(editor.target, attribute);
        if (setting.type === "select" || setting.type === "segmented" || setting.type === "toggle") {
            this.renderSettings();
        }
    }

    private applyAttributes(
        editor: Editor,
        attributes: SettingsViewAttributeChanges,
        policy: ResolvedEditorInteractionPolicy,
    ): void {
        const canonicalAttributes = canonicalizeNativeEditorAttributeChanges(attributes);
        const accepted: SettingsViewAttributeChanges = {};
        for (const [attribute, value] of Object.entries(canonicalAttributes)) {
            if (
                !isAttributeAllowed(policy, attribute) ||
                !isNativeEditorAttributeAllowed(editor.target.localName, attribute) ||
                !isNativeEditorAttributeValueAllowed(editor.target.localName, attribute, value)
            ) {
                continue;
            }
            accepted[attribute] = value;
        }
        if (!isNativeEditorAttributeMutationAllowed(editor.target, accepted)) {
            return;
        }
        for (const [attribute, value] of Object.entries(accepted)) {
            if (typeof value === "boolean") {
                editor.target.toggleAttribute(attribute, value);
            } else {
                writeSettingAttribute(editor.target, attribute, value);
            }
            applyNativeEditorAttributeEffects(editor.target, attribute);
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

function normalizeNativeAttributeChanges(
    target: Element,
    setting: SettingControl,
    attributes: SettingsViewAttributeChanges,
): SettingsViewAttributeChanges {
    if (
        target.localName !== "form" ||
        setting.type !== "endpoint-picker" ||
        setting.attribute !== CMS_BINDING_ATTRIBUTES.source
    ) {
        return attributes;
    }
    return { ...attributes, [CMS_BINDING_ATTRIBUTES.sourceTrigger]: "submit" };
}

function isDeclaredNativeEndpoint(
    dataSources: EditorDataSource[],
    target: Element,
    setting: SettingControl,
    value: string | boolean,
    attributes: SettingsViewAttributeChanges | undefined,
): boolean {
    if (
        target.localName !== "form" ||
        setting.type !== "endpoint-picker" ||
        setting.attribute !== CMS_BINDING_ATTRIBUTES.source
    ) {
        return true;
    }
    if (typeof value !== "string") {
        return false;
    }
    const binding = parseSource(value);
    if (!binding || !attributes || attributes[CMS_BINDING_ATTRIBUTES.source] !== value) {
        return false;
    }
    const requestedMethod = attributes?.[CMS_BINDING_ATTRIBUTES.sourceMethod];
    if (typeof requestedMethod !== "string") {
        return false;
    }
    return dataSources.some((source) => {
        const method = source.method ?? "GET";
        return (
            requestedMethod === method &&
            (!setting.methods || setting.methods.includes(method)) &&
            (binding.url === source.url ||
                binding.url.startsWith(`${source.url}?`) ||
                (source.url.includes("?") && binding.url.startsWith(`${source.url}&`)))
        );
    });
}
