import "../../Controls/Fields/Section/Section";
import "../../Controls/Fields/TextInput/TextInput";
import "../../Controls/Fields/Textarea/Textarea";
import "../../Controls/RichText/RichTextEditor/RichTextEditor";
import "../../Controls/Fields/Select/Select";
import "../../Controls/Fields/Toggle/Toggle";
import "../../Controls/Fields/SegmentedControl/SegmentedControl";
import "../../Controls/Pickers/PageLink/PageLink";
import {
    CMS_BINDING_ATTRIBUTES,
    asSourceBody,
    asSource,
    parseSourceBody,
    parseSource,
    type EndpointPickerMethod,
    type EndpointPickerSetting,
    type CmsSourceBinding,
    type ColorSetting,
    type SettingControl,
    type SettingDisplay,
    type SettingIconName,
    type SettingLabelDisplay,
    type SettingVisibilityRule,
    type SettingVisibilityValue,
} from "@bernouy/cms-content/editor";
import type {
    DataScope,
    EditableState,
    Setting,
    SettingSection,
    TextCapability,
} from "@bernouy/cms-content/editor";
import {
    DataSourcePicker,
    DATA_SOURCE_PICKER_REMOVE_EVENT,
    DATA_SOURCE_PICKER_SELECT_EVENT,
    type DataSourcePickerSelectDetail,
    type DataSourcePickerSourceBinding,
} from "../../Layout/DataSourcePicker/DataSourcePicker";
import type { EditorDataSource } from "../../../runtime";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

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

const SETTING_ICON_PATHS: Partial<Record<SettingIconName, string>> = {
    "layout-none":    `<rect x="8" y="8" width="8" height="8" rx="1.5"></rect>`,
    "layout-column":  `<path d="M8 4h8M8 12h8M8 20h8"></path>`,
    "layout-row":     `<path d="M4 8v8M12 8v8M20 8v8"></path>`,
    "layout-grid":    `<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"></path>`,
    "align-start":    `<path d="M5 4v16M9 8h10M9 16h7"></path>`,
    "align-center":   `<path d="M12 4v16M6 8h12M8 16h8"></path>`,
    "align-end":      `<path d="M19 4v16M5 8h10M8 16h7"></path>`,
    "align-stretch":  `<path d="M5 5h14M5 12h14M5 19h14"></path>`,
    "justify-start":  `<path d="M4 6h16M8 10v8M16 10v5"></path>`,
    "justify-center": `<path d="M4 12h16M8 6v12M16 8v8"></path>`,
    "justify-end":    `<path d="M4 18h16M8 6v8M16 9v5"></path>`,
    "justify-between": `<path d="M4 5h16M8 8v3M16 13v3M4 19h16"></path>`,
    "side-top":       `<path d="M5 6h14M8 10h8v8H8z"></path>`,
    "side-right":     `<path d="M18 5v14M6 8h8v8H6z"></path>`,
    "side-bottom":    `<path d="M5 18h14M8 6h8v8H8z"></path>`,
    "side-left":      `<path d="M6 5v14M10 8h8v8h-8z"></path>`,
    "axis-x":         `<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"></path>`,
    "axis-y":         `<path d="M12 4v16M9 7l3-3 3 3M9 17l3 3 3-3"></path>`,
    "radius":         `<path d="M6 18V9a3 3 0 0 1 3-3h9"></path>`,
    "color":          `<path d="M12 3s6 6.1 6 11a6 6 0 0 1-12 0c0-4.9 6-11 6-11z"></path>`,
    "visibility":     `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>`,
    "remove":         `<path d="M5 12h14"></path>`,
    "add":            `<path d="M12 5v14M5 12h14"></path>`,
    "more":           `<path d="M5 12h.01M12 12h.01M19 12h.01"></path>`,
};

const COLOR_TOKEN_SWATCHES: Record<string, string> = {
    auto:      "linear-gradient(135deg, #ffffff 0 45%, #e7ecea 45% 55%, #ffffff 55%)",
    base:      "#ffffff",
    surface:   "#f8faf9",
    muted:     "#eef5f2",
    primary:   "var(--editor-v2-accent)",
    secondary: "#315ce9",
    success:   "var(--editor-v2-success)",
    warning:   "#f1c232",
    danger:    "#c74436",
    info:      "#315ce9",
    custom:    "linear-gradient(135deg, #165f4b, #315ce9, #f1c232)",
};

export class SettingsView extends HTMLElement {
    private _dataSources: EditorDataSource[] = [];
    private _dataScopes: DataScope[] = [];
    private _endpointPicker: DataSourcePicker | null = null;
    private _disconnectEndpointPickerEvents: (() => void) | null = null;

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
        dataScopes: DataScope[] = [],
        dataSources: EditorDataSource[] = [],
    ): void {
        this._dataSources = dataSources;
        this._dataScopes = dataScopes;
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
            view.append(this._renderTextCapability(textCapability, textValue, dataScopes));
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

        const settings = visibleSettings(section.settings);

        if (settings.length === 0) {
            const empty = document.createElement("div");
            empty.className = "section-empty";
            empty.textContent = "No settings";
            element.append(empty);
            return element;
        }

        for (const setting of settings) {
            element.append(this._renderSetting(setting));
        }

        return element;
    }

    private _renderSetting(setting: Setting): HTMLElement {
        if (setting.type === "row") {
            return this._renderSettingRow(setting);
        }

        return this._renderSettingControl(setting);
    }

    private _renderSettingRow(setting: Extract<Setting, { type: "row" }>): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.className = "setting-row";
        const label = setting.label ? this._renderFieldLabel(setting.label, setting.labelDisplay) : null;
        if (label) {
            label.classList.add("setting-row-label");
            wrapper.classList.add("setting-row-labeled");
            wrapper.append(label);
        }

        const controls = document.createElement("div");
        controls.className = "setting-row-controls";
        controls.style.setProperty("--setting-row-count", String(Math.max(1, setting.settings.length)));
        for (const child of setting.settings) {
            const element = this._renderSettingControl(child);
            element.classList.add("setting-row-control");
            controls.append(element);
        }
        wrapper.append(controls);
        return wrapper;
    }

    private _renderSettingControl(setting: SettingControl): HTMLElement {
        if (setting.type === "textarea") {
            const control = this._control("cms-editor-v2-textarea", setting);
            this._setDataScopes(control);
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

            const label = this._renderFieldLabel(setting.label, setting.labelDisplay);

            const control = document.createElement("cms-editor-v2-segmented-control");
            control.setAttribute("aria-label", setting.ariaLabel ?? setting.label);
            for (const option of setting.options) {
                const button = document.createElement("button");
                button.type = "button";
                button.value = option.value;
                button.disabled = setting.disabled === true;
                button.title = option.ariaLabel ?? option.label;
                button.ariaLabel = option.ariaLabel ?? option.label;
                button.ariaPressed = String(option.value === setting.defaultValue);
                button.append(...this._renderOptionContent(setting.display, option.display, option.icon ?? setting.icon, option.label));
                button.addEventListener("click", () => {
                    if (setting.disabled) return;
                    for (const item of Array.from(control.querySelectorAll("button"))) {
                        item.ariaPressed = String(item === button);
                    }
                    this._emitSettingChange(setting, option.value);
                });
                control.append(button);
            }

            if (label) wrapper.append(label);
            wrapper.append(control);
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

        if (setting.type === "endpoint-picker") {
            return this._renderEndpointPickerSetting(setting);
        }

        if (setting.type === "color") {
            return this._renderColorSetting(setting);
        }

        const control = this._control("cms-editor-v2-text-input", setting);
        this._setDataScopes(control);
        this._wireTextControl(control, "input", setting);
        return control;
    }

    private _renderColorSetting(setting: ColorSetting): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.className = "field color-field";

        const label = this._renderFieldLabel(setting.label, setting.labelDisplay);
        if (label) wrapper.append(label);

        const tokens = setting.tokens ?? [];
        if (tokens.length > 0) {
            const swatches = document.createElement("div");
            swatches.className = "color-swatches";
            for (const option of tokens) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "color-swatch-button";
                button.disabled = setting.disabled === true;
                button.title = option.ariaLabel ?? option.label;
                button.ariaLabel = option.ariaLabel ?? option.label;
                button.ariaPressed = String(option.value === setting.defaultValue);
                button.style.setProperty("--color-swatch", colorSwatchValue(option.value));

                const swatch = document.createElement("span");
                swatch.className = "color-swatch";
                button.append(swatch);
                button.addEventListener("click", () => {
                    if (setting.disabled) return;
                    const customInput = wrapper.querySelector<HTMLInputElement>(".color-custom-input");
                    const customValue = customInput?.value.trim() ?? setting.customDefaultValue ?? "";
                    for (const item of Array.from(swatches.querySelectorAll("button"))) {
                        item.ariaPressed = String(item === button);
                    }
                    const custom = wrapper.querySelector<HTMLElement>(".color-custom");
                    if (custom) custom.hidden = option.value !== "custom" || setting.allowCustom !== true;
                    wrapper.toggleAttribute("data-custom-open", option.value === "custom" && setting.allowCustom === true);
                    this._emitSettingChange(setting, option.value, colorAttributes(setting, option.value, customValue));
                });
                swatches.append(button);
            }
            wrapper.append(swatches);
        }

        if (setting.allowCustom) {
            const custom = document.createElement("div");
            custom.className = "color-custom";
            custom.hidden = setting.defaultValue !== "custom";

            const input = document.createElement("input");
            input.className = "color-custom-input";
            input.type = "text";
            input.placeholder = setting.placeholder ?? "#f6f7f8";
            input.value = setting.customDefaultValue ?? "";
            input.disabled = setting.disabled === true;

            const apply = document.createElement("button");
            apply.className = "color-custom-apply";
            apply.type = "button";
            apply.textContent = "Apply";
            apply.disabled = setting.disabled === true;
            apply.addEventListener("click", () => {
                if (setting.disabled) return;
                this._emitSettingChange(setting, "custom", colorAttributes(setting, "custom", input.value.trim()));
            });
            input.addEventListener("change", () => {
                if (setting.disabled) return;
                this._emitSettingChange(setting, "custom", colorAttributes(setting, "custom", input.value.trim()));
            });
            custom.append(input, apply);
            wrapper.append(custom);
        }

        if (setting.help) {
            const help = document.createElement("div");
            help.className = "field-help";
            help.textContent = setting.help;
            wrapper.append(help);
        }
        return wrapper;
    }

    private _renderOptionContent(
        settingDisplay: SettingDisplay | undefined,
        optionDisplay: SettingDisplay | undefined,
        iconName: SettingIconName | undefined,
        label: string,
    ): Node[] {
        const display = optionDisplay ?? settingDisplay ?? (iconName ? "icon-label" : "label");
        const nodes: Node[] = [];
        const icon = iconName ? settingIcon(iconName) : null;

        if (icon && (display === "icon" || display === "icon-label")) {
            nodes.push(icon);
        }

        if (display !== "icon" || !icon) {
            const text = document.createElement("span");
            text.textContent = label;
            nodes.push(text);
        }

        return nodes;
    }

    private _control(tag: string, setting: SettingControl): HTMLElement {
        const control = document.createElement(tag);
        control.setAttribute("label", setting.label);
        control.setAttribute("value", String(setting.defaultValue ?? ""));
        control.setAttribute("label-display", setting.labelDisplay ?? "visible");
        if (setting.ariaLabel) {
            control.setAttribute("aria-label", setting.ariaLabel);
        } else if (setting.labelDisplay && setting.labelDisplay !== "visible") {
            control.setAttribute("aria-label", setting.ariaLabel ?? setting.label);
        }
        if (setting.help) control.setAttribute("hint", setting.help);
        if (setting.placeholder) control.setAttribute("placeholder", setting.placeholder);
        this._applyDisabled(control, setting);
        return control;
    }

    private _renderFieldLabel(label: string, display: SettingLabelDisplay | undefined): HTMLElement | null {
        if (display === "hidden") return null;
        const element = document.createElement("div");
        element.className = display === "sr-only" ? "field-label sr-only" : "field-label";
        element.textContent = label;
        return element;
    }

    private _renderEndpointPickerSetting(setting: EndpointPickerSetting): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.className = "field endpoint-field";

        const label = this._renderFieldLabel(setting.label, setting.labelDisplay);

        const button = document.createElement("button");
        button.className = "endpoint-button";
        button.type = "button";
        button.ariaLabel = setting.ariaLabel ?? setting.label;
        button.disabled = setting.disabled === true;
        this._syncEndpointButton(button, setting);
        if (!setting.disabled) {
            button.addEventListener("click", () => this._openEndpointPicker(setting, button));
        }

        if (label) wrapper.append(label);
        wrapper.append(button);
        if (setting.help) {
            const help = document.createElement("div");
            help.className = "field-help";
            help.textContent = setting.help;
            wrapper.append(help);
        }
        return wrapper;
    }

    private _syncEndpointButton(
        button: HTMLButtonElement,
        setting: EndpointPickerSetting,
        selected: EditorDataSource | null = this._selectedEndpoint(setting),
        fallbackValue = setting.defaultValue,
    ): void {
        button.replaceChildren();

        const method = selected?.method ?? setting.defaultMethod;
        if (method) {
            const methodBadge = document.createElement("span");
            methodBadge.className = "endpoint-method";
            methodBadge.textContent = method;
            button.append(methodBadge);
        }

        const value = document.createElement("span");
        value.className = selected ? "endpoint-value" : "endpoint-placeholder";
        value.textContent = selected?.label ?? fallbackValue ?? setting.placeholder ?? "Select endpoint";
        button.append(value);
    }

    private _openEndpointPicker(setting: EndpointPickerSetting, button: HTMLButtonElement): void {
        const picker = this._ensureEndpointPicker();
        this._disconnectEndpointPickerEvents?.();

        const onSelect = (event: Event): void => {
            this._disconnectEndpointPickerEvents?.();
            const detail = (event as CustomEvent<DataSourcePickerSelectDetail>).detail;
            const value = this._endpointValue(setting, detail);
            this._syncEndpointButton(button, setting, detail.source, value);
            this._emitSettingChange(setting, value, this._endpointAttributes(setting, detail, value));
        };
        const onRemove = (): void => {
            this._disconnectEndpointPickerEvents?.();
            const attributes: SettingsViewAttributeChanges = { [setting.attribute]: null };
            if (setting.methodAttribute) attributes[setting.methodAttribute] = null;
            if (this._usesSourceBinding(setting)) {
                attributes[CMS_BINDING_ATTRIBUTES.sourceBody] = null;
                attributes[CMS_BINDING_ATTRIBUTES.sourceTrigger] = null;
            }
            this._syncEndpointButton(button, setting, null, "");
            this._emitSettingChange(setting, "", attributes);
        };
        const cleanup = (): void => {
            picker.removeEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, onSelect);
            picker.removeEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, onRemove);
            if (this._disconnectEndpointPickerEvents === cleanup) this._disconnectEndpointPickerEvents = null;
        };
        this._disconnectEndpointPickerEvents = cleanup;

        picker.addEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, onSelect);
        picker.addEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, onRemove);
        picker.open(this._endpointOptions(setting), setting.label, {
            canRemove:      setting.required !== true && Boolean(setting.defaultValue),
            initialBinding: this._initialEndpointBinding(setting),
        });
    }

    private _ensureEndpointPicker(): DataSourcePicker {
        if (this._endpointPicker) return this._endpointPicker;
        const picker = new DataSourcePicker();
        this.shadowRoot!.append(picker);
        this._endpointPicker = picker;
        return picker;
    }

    private _endpointOptions(setting: EndpointPickerSetting): EditorDataSource[] {
        const methods = new Set(setting.methods ?? []);
        return this._dataSources.filter((source) => {
            const method = this._endpointMethod(source);
            if (methods.size > 0 && !methods.has(method)) return false;
            return true;
        });
    }

    private _selectedEndpoint(setting: EndpointPickerSetting): EditorDataSource | null {
        const value = setting.defaultValue;
        if (!value) return null;
        const binding = this._initialEndpointBinding(setting);
        return this._endpointOptions(setting).find(source => {
            if (this._usesSourceBinding(setting) && binding) {
                return binding.url === source.url
                    || binding.url.startsWith(`${source.url}?`)
                    || (source.url.includes("?") && binding.url.startsWith(`${source.url}&`));
            }
            return source.url === value;
        }) ?? null;
    }

    private _initialEndpointBinding(setting: EndpointPickerSetting): DataSourcePickerSourceBinding | null {
        const value = setting.defaultValue;
        if (!value) return null;

        if (this._usesSourceBinding(setting)) {
            const source = parseSource(value);
            const body = parseSourceBody(setting.defaultBody);
            return source ? {
                url: source.url,
                ...(source.alias ? { alias: source.alias } : {}),
                ...(setting.defaultMethod ? { method: setting.defaultMethod } : {}),
                ...(body ? { body: body as DataSourcePickerSourceBinding["body"] } : {}),
            } : null;
        }

        return { url: value };
    }

    private _endpointValue(setting: EndpointPickerSetting, detail: DataSourcePickerSelectDetail): string {
        if (this._usesSourceBinding(setting)) {
            return asSource(detail.binding as CmsSourceBinding);
        }

        return detail.source.url;
    }

    private _endpointAttributes(
        setting: EndpointPickerSetting,
        detail: DataSourcePickerSelectDetail,
        value: string,
    ): SettingsViewAttributeChanges {
        const attributes: SettingsViewAttributeChanges = { [setting.attribute]: value };
        if (setting.methodAttribute) attributes[setting.methodAttribute] = detail.binding.method ?? this._endpointMethod(detail.source);
        if (this._usesSourceBinding(setting)) {
            const body = detail.binding.body
                ? (asSourceBody as (body: NonNullable<DataSourcePickerSourceBinding["body"]>) => string)(detail.binding.body)
                : "";
            attributes[CMS_BINDING_ATTRIBUTES.sourceBody] = body || null;
            attributes[CMS_BINDING_ATTRIBUTES.sourceTrigger] = detail.binding.trigger === "submit" ? "submit" : null;
        }
        return attributes;
    }

    private _endpointMethod(source: EditorDataSource): EndpointPickerMethod {
        return source.method ?? "GET";
    }

    private _usesSourceBinding(setting: EndpointPickerSetting): boolean {
        return setting.attribute === CMS_BINDING_ATTRIBUTES.source;
    }

    private _renderTextCapability(capability: TextCapability, value: string, dataScopes: DataScope[]): HTMLElement {
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
            control.setAttribute("data-scopes", JSON.stringify(dataScopes));
            this._wireRichTextControl(control);
        } else {
            if (capability.dynamic) this._setDataScopes(control, dataScopes);
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

    private _wireTextControl(control: HTMLElement, selector: "input" | "textarea" | "select", setting: SettingControl): void {
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

    private _wirePageLinkControl(control: HTMLElement, setting: SettingControl): void {
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

    private _wireToggleControl(control: HTMLElement, setting: SettingControl): void {
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

    private _applyDisabled(control: HTMLElement, setting: SettingControl): void {
        if (setting.disabled) {
            control.setAttribute("disabled", "");
            control.setAttribute("aria-disabled", "true");
        } else {
            control.removeAttribute("disabled");
            control.removeAttribute("aria-disabled");
        }
    }

    private _setDataScopes(control: HTMLElement, dataScopes = this._dataScopes): void {
        control.setAttribute("data-scopes", JSON.stringify(dataScopes));
    }

    private _whenDefined(control: HTMLElement, callback: () => void): void {
        if (customElements.get(control.localName)) {
            callback();
            return;
        }

        customElements.whenDefined(control.localName).then(callback);
    }

    private _emitSettingChange(setting: SettingControl, value: string | boolean, attributes?: SettingsViewAttributeChanges): void {
        const changes = attributes ?? attributesForSettingValue(setting, value);
        this.dispatchEvent(new CustomEvent<SettingsViewSettingChangeDetail>(SETTINGS_VIEW_SETTING_CHANGE_EVENT, {
            bubbles: true,
            composed: true,
            detail: changes ? { setting, value, attributes: changes } : { setting, value },
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

function visibleSettings(settings: Setting[]): Setting[] {
    const values = collectSettingValues(settings);
    return settings.flatMap((setting): Setting[] => {
        if (!isSettingVisible(setting.visibleWhen, values)) return [];
        if (setting.type !== "row") return [setting];

        const visibleChildren = setting.settings.filter(child => isSettingVisible(child.visibleWhen, values));
        return visibleChildren.length > 0
            ? [{ ...setting, settings: visibleChildren }]
            : [];
    });
}

function collectSettingValues(settings: Setting[]): Map<string, SettingControl["defaultValue"]> {
    const values = new Map<string, SettingControl["defaultValue"]>();
    for (const setting of settings) {
        if (setting.type === "row") {
            for (const child of setting.settings) values.set(child.attribute, child.defaultValue);
        } else {
            values.set(setting.attribute, setting.defaultValue);
        }
    }
    return values;
}

function attributesForSettingValue(setting: SettingControl, value: string | boolean): SettingsViewAttributeChanges | undefined {
    const matchingRules = setting.attributesOnValue?.filter(rule => visibilityValueMatches(value, rule.value)) ?? [];
    if (matchingRules.length === 0) return undefined;

    const attributes: SettingsViewAttributeChanges = { [setting.attribute]: value };
    for (const rule of matchingRules) {
        Object.assign(attributes, rule.attributes);
    }
    return attributes;
}

function isSettingVisible(
    visibleWhen: Setting["visibleWhen"],
    values: Map<string, SettingControl["defaultValue"]>,
): boolean {
    if (!visibleWhen) return true;
    const rules = Array.isArray(visibleWhen) ? visibleWhen : [visibleWhen];
    return rules.every(rule => matchesVisibilityRule(rule, values.get(rule.attribute)));
}

function matchesVisibilityRule(rule: SettingVisibilityRule, actual: SettingControl["defaultValue"]): boolean {
    if (rule.equals !== undefined && !visibilityValueMatches(actual, rule.equals)) return false;
    if (rule.notEquals !== undefined && visibilityValueMatches(actual, rule.notEquals)) return false;
    return true;
}

function visibilityValueMatches(
    actual: SettingControl["defaultValue"],
    expected: SettingVisibilityValue | SettingVisibilityValue[],
): boolean {
    const expectedValues = Array.isArray(expected) ? expected : [expected];
    return expectedValues.some(value => normalizeVisibilityValue(actual) === normalizeVisibilityValue(value));
}

function normalizeVisibilityValue(value: SettingControl["defaultValue"] | SettingVisibilityValue): string | boolean {
    return typeof value === "boolean" ? value : String(value ?? "");
}

function colorAttributes(setting: ColorSetting, value: string, customValue: string): SettingsViewAttributeChanges {
    const base = attributesForSettingValue(setting, value) ?? { [setting.attribute]: value };
    if (!setting.customAttribute) return base;
    return {
        ...base,
        [setting.customAttribute]: value === "custom" ? customValue || null : null,
    };
}

function colorSwatchValue(value: string): string {
    if (value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl") || value.startsWith("var(")) return value;
    return COLOR_TOKEN_SWATCHES[value] ?? "linear-gradient(135deg, #eef2f1, #d9d9d9)";
}

function settingIcon(name: SettingIconName): SVGSVGElement | null {
    const path = SETTING_ICON_PATHS[name];
    if (!path) return null;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = path;
    return svg;
}

if (!customElements.get("cms-editor-v2-settings-view")) {
    customElements.define("cms-editor-v2-settings-view", SettingsView);
}
