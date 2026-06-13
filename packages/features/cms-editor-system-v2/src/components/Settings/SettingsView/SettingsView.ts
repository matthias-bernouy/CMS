import "../../Controls/Section/Section";
import "../../Controls/FieldGroup/FieldGroup";
import "../../Controls/TextInput/TextInput";
import "../../Controls/Textarea/Textarea";
import "../../Controls/RichTextEditor/RichTextEditor";
import "../../Controls/Select/Select";
import "../../Controls/Toggle/Toggle";
import "../../Controls/SegmentedControl/SegmentedControl";
import "../../Controls/PageLink/PageLink";
import "../../Controls/SchemaPicker/SchemaPicker";
import type {
    EditableState,
    Setting,
    SettingSection,
    TextCapability,
} from "@bernouy/cms-content/editor";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type SettingsViewSettingChangeDetail = {
    setting: Setting;
    value: string | boolean;
};

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

export class SettingsView extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    setSettings(
        sections: SettingSection[],
        textCapability: TextCapability | null = null,
        textValue = "",
        mode: SettingsViewMode = "settings",
        states: EditableState[] = [],
    ): void {
        const view = this.shadowRoot!.querySelector<HTMLElement>(".settings-view")!;
        view.replaceChildren();

        const visibleSections = sections.filter(section => mode === "settings"
            ? section.kind === "self"
            : section.kind === "surcharge");

        const shouldRenderText = mode === "settings" && textCapability;
        const shouldRenderStates = mode === "settings" && states.length > 0;

        if (visibleSections.length === 0 && !shouldRenderText && !shouldRenderStates) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = sections.length === 0 && !textCapability
                ? "Select an editable element"
                : mode === "settings"
                ? "No settings"
                : "No overrides";
            view.append(empty);
            return;
        }

        if (shouldRenderText) {
            view.append(this._renderTextCapability(textCapability, textValue));
        }

        if (shouldRenderStates) {
            view.append(this._renderStates(states));
        }

        for (const section of visibleSections) {
            view.append(this._renderSettingSection(section));
        }
    }

    private _renderStates(states: EditableState[]): HTMLElement {
        const section = document.createElement("cms-editor-v2-section");
        section.setAttribute("label", "States");

        for (const state of states) {
            const button = document.createElement("button");
            button.className = "state-button";
            button.type = "button";
            button.ariaPressed = String(state.isActive());

            const label = document.createElement("span");
            label.className = "state-label";
            label.textContent = state.label;

            const description = document.createElement("span");
            description.className = "state-description";
            description.textContent = state.description ?? (state.isActive() ? "Active" : "Inactive");

            button.append(label, description);
            button.addEventListener("click", () => {
                this.dispatchEvent(new CustomEvent<SettingsViewStateToggleDetail>(SETTINGS_VIEW_STATE_TOGGLE_EVENT, {
                    bubbles: true,
                    composed: true,
                    detail: { state },
                }));
            });
            section.append(button);
        }

        return section;
    }

    private _renderSettingSection(section: SettingSection): HTMLElement {
        const element = document.createElement("cms-editor-v2-section");
        element.setAttribute("label", section.kind === "surcharge" ? `${section.label} override` : section.label);

        if (section.settings.length === 0) {
            const empty = document.createElement("div");
            empty.className = "section-empty";
            empty.textContent = "No settings";
            element.append(empty);
            return element;
        }

        for (const setting of section.settings) {
            element.append(this._renderSetting(setting));
        }

        return element;
    }

    private _renderSetting(setting: Setting): HTMLElement {
        if (setting.type === "textarea") {
            const control = this._control("cms-editor-v2-textarea", setting);
            this._wireTextControl(control, "textarea", setting);
            return control;
        }

        if (setting.type === "select") {
            const control = this._control("cms-editor-v2-select", setting);
            control.setAttribute("options", JSON.stringify(setting.options));
            this._wireTextControl(control, "select", setting);
            return control;
        }

        if (setting.type === "segmented") {
            const wrapper = document.createElement("div");
            wrapper.className = "field";

            const label = document.createElement("div");
            label.className = "field-label";
            label.textContent = setting.label;

            const control = document.createElement("cms-editor-v2-segmented-control");
            for (const option of setting.options) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = option.label;
                button.value = option.value;
                button.disabled = setting.disabled === true;
                button.ariaPressed = String(option.value === setting.defaultValue);
                button.addEventListener("click", () => {
                    if (setting.disabled) return;
                    for (const item of Array.from(control.querySelectorAll("button"))) {
                        item.ariaPressed = String(item === button);
                    }
                    this._emitSettingChange(setting, option.value);
                });
                control.append(button);
            }

            wrapper.append(label, control);
            return wrapper;
        }

        if (setting.type === "toggle") {
            const control = this._control("cms-editor-v2-toggle", setting);
            if (setting.defaultValue) control.setAttribute("checked", "");
            this._wireToggleControl(control, setting);
            return control;
        }

        if (setting.type === "page-link") {
            const control = this._control("cms-editor-v2-page-link", setting);
            control.setAttribute("allow-page", String(setting.allowPage !== false));
            control.setAttribute("allow-external", String(setting.allowExternal !== false));
            control.setAttribute("allow-media", String(setting.allowMedia !== false));
            this._applyDisabled(control, setting);
            this._wirePageLinkControl(control, setting);
            return control;
        }

        if (setting.type === "schema-picker") {
            const control = document.createElement("cms-editor-v2-schema-picker");
            control.setAttribute("source", setting.label);
            control.setAttribute("path", setting.defaultValue ?? setting.attribute);
            this._applyDisabled(control, setting);
            return control;
        }

        const control = this._control("cms-editor-v2-text-input", setting);
        this._wireTextControl(control, "input", setting);
        return control;
    }

    private _control(tag: string, setting: Setting): HTMLElement {
        const control = document.createElement(tag);
        control.setAttribute("label", setting.label);
        control.setAttribute("value", String(setting.defaultValue ?? ""));
        if (setting.help) control.setAttribute("hint", setting.help);
        if (setting.placeholder) control.setAttribute("placeholder", setting.placeholder);
        this._applyDisabled(control, setting);
        return control;
    }

    private _renderTextCapability(capability: TextCapability, value: string): HTMLElement {
        const section = document.createElement("cms-editor-v2-section");
        section.setAttribute("label", "Content");

        const setting: Setting = {
            type: "text",
            label: capability.format === "richtext" ? "Rich text" : "Text",
            attribute: "__text",
            defaultValue: value,
            help: capability.format === "richtext" ? undefined : this._formatTextCapability(capability),
        };

        const control = this._control(
            capability.format === "richtext" ? "cms-editor-v2-rich-text-editor" : "cms-editor-v2-text-input",
            setting,
        );
        if (capability.format === "richtext") {
            control.setAttribute("capability", JSON.stringify(capability));
            this._wireRichTextControl(control);
        } else {
            this._wireContentControl(control, "input");
        }
        section.append(control);

        return section;
    }

    private _formatTextCapability(capability: TextCapability): string {
        const options = [
            capability.bold ? "bold" : null,
            capability.italic ? "italic" : null,
            capability.link ? "link" : null,
            capability.code ? "code" : null,
            capability.dynamic ? "dynamic" : null,
        ].filter((option): option is string => Boolean(option));

        return options.length > 0 ? options.join(", ") : "Plain text";
    }

    private _wireTextControl(control: HTMLElement, selector: "input" | "textarea" | "select", setting: Setting): void {
        const wire = () => {
            const input = control.shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
            if (!input) return;
            input.disabled = setting.disabled === true;
            if (setting.disabled) return;
            input.addEventListener("input", () => this._emitSettingChange(setting, input.value));
            input.addEventListener("change", () => this._emitSettingChange(setting, input.value));
        };

        this._whenDefined(control, wire);
    }

    private _wireContentControl(control: HTMLElement, selector: "input" | "textarea"): void {
        const wire = () => {
            const input = control.shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
            if (!input) return;
            input.addEventListener("input", () => this._emitContentChange(input.value, "text"));
            input.addEventListener("change", () => this._emitContentChange(input.value, "text"));
        };

        this._whenDefined(control, wire);
    }

    private _wireRichTextControl(control: HTMLElement): void {
        const wire = () => {
            control.addEventListener("input", (event) => {
                const value = (event as CustomEvent<{ value: string }>).detail?.value;
                if (typeof value !== "string") return;
                this._emitContentChange(value, "html");
            });
        };

        this._whenDefined(control, wire);
    }

    private _wirePageLinkControl(control: HTMLElement, setting: Setting): void {
        const wire = () => {
            if (setting.disabled) return;
            control.addEventListener("input", (event) => {
                const value = (event as CustomEvent<{ value: string }>).detail?.value;
                if (typeof value !== "string") return;
                this._emitSettingChange(setting, value);
            });
        };

        this._whenDefined(control, wire);
    }

    private _wireToggleControl(control: HTMLElement, setting: Setting): void {
        const wire = () => {
            const button = control.shadowRoot?.querySelector<HTMLButtonElement>("button");
            if (!button) return;
            button.disabled = setting.disabled === true;
            if (setting.disabled) return;
            button.addEventListener("click", () => {
                const checked = button.ariaPressed !== "true";
                button.ariaPressed = String(checked);
                control.toggleAttribute("checked", checked);
                this._emitSettingChange(setting, checked);
            });
        };

        this._whenDefined(control, wire);
    }

    private _applyDisabled(control: HTMLElement, setting: Setting): void {
        if (setting.disabled) {
            control.setAttribute("disabled", "");
            control.setAttribute("aria-disabled", "true");
        } else {
            control.removeAttribute("disabled");
            control.removeAttribute("aria-disabled");
        }
    }

    private _whenDefined(control: HTMLElement, callback: () => void): void {
        if (customElements.get(control.localName)) {
            callback();
            return;
        }

        customElements.whenDefined(control.localName).then(callback);
    }

    private _emitSettingChange(setting: Setting, value: string | boolean): void {
        this.dispatchEvent(new CustomEvent<SettingsViewSettingChangeDetail>(SETTINGS_VIEW_SETTING_CHANGE_EVENT, {
            bubbles: true,
            composed: true,
            detail: { setting, value },
        }));
    }

    private _emitContentChange(value: string, format: "text" | "html"): void {
        this.dispatchEvent(new CustomEvent<SettingsViewContentChangeDetail>(SETTINGS_VIEW_CONTENT_CHANGE_EVENT, {
            bubbles: true,
            composed: true,
            detail: { value, format },
        }));
    }

}

if (!customElements.get("cms-editor-v2-settings-view")) {
    customElements.define("cms-editor-v2-settings-view", SettingsView);
}
