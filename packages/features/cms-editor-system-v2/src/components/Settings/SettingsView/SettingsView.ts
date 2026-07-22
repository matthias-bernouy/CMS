import "../../Controls/Fields/Section/Section";
import "../../Controls/Fields/TextInput/TextInput";
import "../../Controls/Fields/Textarea/Textarea";
import "../../Controls/RichText/RichTextEditor/RichTextEditor";
import "../../Controls/Fields/Select/Select";
import "../../Controls/Fields/Toggle/Toggle";
import "../../Controls/Fields/SegmentedControl/SegmentedControl";
import "../../Controls/Pickers/PageLink/PageLink";
import { type SettingControl } from "@bernouy/cms-content/editor";
import type { DataScope, EditableState, SettingSection, TextCapability } from "@bernouy/cms-content/editor";
import type { EditorDataSource } from "../../../runtime";
import { EndpointSettingController } from "./internals/endpointSetting";
import { renderFieldLabel, SettingControlRenderer } from "./internals/rendering/settingControls";
import { renderSettingSection, renderSettingsStates } from "./internals/rendering/settingsSections";
import { renderTextCapability } from "./internals/rendering/textCapability";
import { attributesForSettingValue } from "./internals/settingState";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./styles/index";

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type SettingsViewSettingChangeDetail = {
    setting: SettingControl;
    value: string | boolean;
    attributes?: SettingsViewAttributeChanges;
};
export type SettingsViewAttributeValue = string | boolean | null;
export type SettingsViewAttributeChanges = Record<string, SettingsViewAttributeValue>;

export type SettingsViewContentChangeDetail = {
    value: string;
    format: "text" | "html";
};

export type SettingsViewStateToggleDetail = {
    state: EditableState;
};

export const SETTINGS_VIEW_SETTING_CHANGE_EVENT = "editor-v2:setting-change";
export const SETTINGS_VIEW_CONTENT_CHANGE_EVENT = "editor-v2:content-change";
export const SETTINGS_VIEW_STATE_TOGGLE_EVENT = "editor-v2:state-toggle";
export type SettingsViewMode = "settings" | "overrides";
export type SettingsViewThemeToken = {
    label: string;
    variable: string;
    category?: string;
};

export class SettingsView extends HTMLElement {
    private _dataScopes: DataScope[] = [];
    private readonly _endpointSettings: EndpointSettingController;
    private readonly _settingControls: SettingControlRenderer;
    private _themeTokens: SettingsViewThemeToken[] = [];

    constructor() {
        super();
        const shadowRoot = this.attachShadow({ mode: "open" });
        shadowRoot.append(template.content.cloneNode(true));
        this._endpointSettings = new EndpointSettingController(
            shadowRoot,
            renderFieldLabel,
            (setting, value, attributes) => this._emitSettingChange(setting, value, attributes),
        );
        this._settingControls = new SettingControlRenderer(
            this._endpointSettings,
            () => this._dataScopes,
            () => this._themeTokens,
            (setting, value) => this._emitSettingChange(setting, value),
        );
    }

    setThemeTokens(tokens: SettingsViewThemeToken[]): void {
        this._themeTokens = tokens.filter((token) => token.label && /^[a-z][a-z0-9-]*$/.test(token.variable));
    }

    setSettings(
        sections: SettingSection[],
        textCapability: TextCapability | null = null,
        textValue = "",
        mode: SettingsViewMode = "settings",
        states: EditableState[] = [],
        dataScopes: DataScope[] = [],
        dataSources: EditorDataSource[] = [],
    ): void {
        this._endpointSettings.setDataSources(dataSources);
        this._dataScopes = dataScopes;
        const view = this.shadowRoot!.querySelector<HTMLElement>(".settings-view")!;
        view.replaceChildren();

        const visibleSections = sections.filter((section) =>
            mode === "settings" ? section.kind === "self" : section.kind === "surcharge",
        );

        const shouldRenderText = mode === "settings" && textCapability;
        const shouldRenderStates = mode === "settings" && states.length > 0;

        if (visibleSections.length === 0 && !shouldRenderText && !shouldRenderStates) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent =
                sections.length === 0 && !textCapability
                    ? "Select an editable element"
                    : mode === "settings"
                      ? "No settings"
                      : "No overrides";
            view.append(empty);
            return;
        }

        if (shouldRenderText) {
            view.append(
                renderTextCapability(textCapability, textValue, dataScopes, (value, format) =>
                    this._emitContentChange(value, format),
                ),
            );
        }

        if (shouldRenderStates) {
            view.append(renderSettingsStates(states, (state) => this._emitStateToggle(state)));
        }

        for (const section of visibleSections) {
            view.append(renderSettingSection(section, this._settingControls));
        }
    }

    private _emitStateToggle(state: EditableState): void {
        this.dispatchEvent(
            new CustomEvent<SettingsViewStateToggleDetail>(SETTINGS_VIEW_STATE_TOGGLE_EVENT, {
                bubbles: true,
                composed: true,
                detail: { state },
            }),
        );
    }

    private _emitSettingChange(
        setting: SettingControl,
        value: string | boolean,
        attributes?: SettingsViewAttributeChanges,
    ): void {
        const changes = attributes ?? attributesForSettingValue(setting, value);
        this.dispatchEvent(
            new CustomEvent<SettingsViewSettingChangeDetail>(SETTINGS_VIEW_SETTING_CHANGE_EVENT, {
                bubbles: true,
                composed: true,
                detail: changes ? { setting, value, attributes: changes } : { setting, value },
            }),
        );
    }

    private _emitContentChange(value: string, format: "text" | "html"): void {
        this.dispatchEvent(
            new CustomEvent<SettingsViewContentChangeDetail>(SETTINGS_VIEW_CONTENT_CHANGE_EVENT, {
                bubbles: true,
                composed: true,
                detail: { value, format },
            }),
        );
    }
}

if (!customElements.get("cms-editor-v2-settings-view")) {
    customElements.define("cms-editor-v2-settings-view", SettingsView);
}
