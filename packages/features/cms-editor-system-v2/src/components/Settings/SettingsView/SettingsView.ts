import "../../Controls/Section/Section";
import "../../Controls/FieldGroup/FieldGroup";
import "../../Controls/TextInput/TextInput";
import "../../Controls/Textarea/Textarea";
import "../../Controls/Select/Select";
import "../../Controls/Toggle/Toggle";
import "../../Controls/SegmentedControl/SegmentedControl";
import "../../Controls/PageLink/PageLink";
import "../../Controls/SchemaPicker/SchemaPicker";
import type {
    DataScope,
    Setting,
    SettingSection,
} from "@bernouy/cms-content/editor";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class SettingsView extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    setSettings(sections: SettingSection[], dataScopes: DataScope[] = []): void {
        const view = this.shadowRoot!.querySelector<HTMLElement>(".settings-view")!;
        view.replaceChildren();

        if (sections.length === 0 && dataScopes.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "Select an editable element";
            view.append(empty);
            return;
        }

        for (const section of sections) {
            view.append(this._renderSettingSection(section));
        }

        if (dataScopes.length > 0) {
            view.append(this._renderDataScopes(dataScopes));
        }
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
            return this._control("cms-editor-v2-textarea", setting);
        }

        if (setting.type === "select") {
            const control = this._control("cms-editor-v2-select", setting);
            control.setAttribute("options", setting.options.map(option => option.label).join(","));
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
                button.ariaPressed = String(option.value === setting.defaultValue);
                control.append(button);
            }

            wrapper.append(label, control);
            return wrapper;
        }

        if (setting.type === "toggle") {
            const control = this._control("cms-editor-v2-toggle", setting);
            if (setting.defaultValue) control.setAttribute("checked", "");
            return control;
        }

        if (setting.type === "page-link") {
            return this._control("cms-editor-v2-page-link", setting);
        }

        if (setting.type === "schema-picker") {
            const control = document.createElement("cms-editor-v2-schema-picker");
            control.setAttribute("source", setting.label);
            control.setAttribute("path", setting.defaultValue ?? setting.attribute);
            return control;
        }

        return this._control("cms-editor-v2-text-input", setting);
    }

    private _control(tag: string, setting: Setting): HTMLElement {
        const control = document.createElement(tag);
        control.setAttribute("label", setting.label);
        control.setAttribute("value", String(setting.defaultValue ?? ""));
        if (setting.help) control.setAttribute("hint", setting.help);
        if (setting.placeholder) control.setAttribute("placeholder", setting.placeholder);
        return control;
    }

    private _renderDataScopes(scopes: DataScope[]): HTMLElement {
        const section = document.createElement("cms-editor-v2-section");
        section.setAttribute("label", "Data scopes");

        for (const scope of scopes) {
            const item = document.createElement("div");
            item.className = "data-scope";

            const name = document.createElement("strong");
            name.textContent = scope.label ?? scope.name;

            const meta = document.createElement("span");
            meta.textContent = scope.source ?? scope.name;

            item.append(name, meta);
            section.append(item);
        }

        return section;
    }
}

if (!customElements.get("cms-editor-v2-settings-view")) {
    customElements.define("cms-editor-v2-settings-view", SettingsView);
}
