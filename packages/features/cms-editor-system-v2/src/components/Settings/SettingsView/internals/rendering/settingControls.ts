import type {
    DataScope,
    Setting,
    SettingControl,
    SettingDisplay,
    SettingIconName,
    SettingLabelDisplay,
} from "@bernouy/cms-content/editor";
import type { SettingsViewThemeToken } from "../../SettingsView";
import { renderColorSetting } from "./colorSetting";
import {
    applyDisabled,
    setDataScopes,
    wirePageLinkControl,
    wireTextControl,
    wireToggleControl,
} from "../controlWiring";
import type { EndpointSettingController } from "../endpointSetting";
import { settingIcon } from "./icons";

type EmitSettingChange = (setting: SettingControl, value: string | boolean) => void;

export class SettingControlRenderer {
    constructor(
        private readonly endpointSettings: EndpointSettingController,
        private readonly dataScopes: () => DataScope[],
        private readonly themeTokens: () => SettingsViewThemeToken[],
        private readonly emitSettingChange: EmitSettingChange,
    ) {}

    render(setting: Setting): HTMLElement {
        return setting.type === "row" ? this.renderRow(setting) : this.renderControl(setting);
    }

    private renderRow(setting: Extract<Setting, { type: "row" }>): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.className = "setting-row";
        const label = setting.label ? renderFieldLabel(setting.label, setting.labelDisplay) : null;
        if (label) {
            label.classList.add("setting-row-label");
            wrapper.classList.add("setting-row-labeled");
            wrapper.append(label);
        }
        const controls = document.createElement("div");
        controls.className = "setting-row-controls";
        controls.style.setProperty("--setting-row-count", String(Math.max(1, setting.settings.length)));
        for (const child of setting.settings) {
            const element = this.renderControl(child);
            element.classList.add("setting-row-control");
            controls.append(element);
        }
        wrapper.append(controls);
        return wrapper;
    }

    private renderControl(setting: SettingControl): HTMLElement {
        const emit = (value: string | boolean) => this.emitSettingChange(setting, value);
        if (setting.type === "textarea" || setting.type === "select") {
            const tag = setting.type === "textarea" ? "cms-editor-v2-textarea" : "cms-editor-v2-select";
            const selector = setting.type === "textarea" ? "textarea" : "select";
            const control = createSettingControl(tag, setting);
            if (setting.type === "textarea") {
                setDataScopes(control, this.dataScopes());
            } else {
                control.setAttribute("options", JSON.stringify(setting.options));
            }
            wireTextControl(control, selector, setting, emit);
            return control;
        }
        if (setting.type === "segmented") {
            return this.renderSegmented(setting);
        }
        if (setting.type === "toggle") {
            const control = createSettingControl("cms-editor-v2-toggle", setting);
            if (setting.defaultValue) {
                control.setAttribute("checked", "");
            }
            wireToggleControl(control, setting, emit);
            return control;
        }
        if (setting.type === "page-link") {
            const control = createSettingControl("cms-editor-v2-page-link", setting);
            control.setAttribute("allow-page", String(setting.allowPage !== false));
            control.setAttribute("allow-external", String(setting.allowExternal !== false));
            control.setAttribute("allow-media", String(setting.allowMedia !== false));
            wirePageLinkControl(control, setting, emit);
            return control;
        }
        if (setting.type === "endpoint-picker") {
            return this.endpointSettings.render(setting);
        }
        if (setting.type === "color") {
            return renderColorSetting(setting, this.themeTokens(), renderFieldLabel, emit);
        }
        const control = createSettingControl("cms-editor-v2-text-input", setting);
        setDataScopes(control, this.dataScopes());
        wireTextControl(control, "input", setting, emit);
        return control;
    }

    private renderSegmented(setting: Extract<SettingControl, { type: "segmented" }>): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.className = "field";
        const label = renderFieldLabel(setting.label, setting.labelDisplay);
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
            button.append(
                ...renderOptionContent(setting.display, option.display, option.icon ?? setting.icon, option.label),
            );
            button.addEventListener("click", () => {
                if (setting.disabled) {
                    return;
                }
                for (const item of Array.from(control.querySelectorAll("button"))) {
                    item.ariaPressed = String(item === button);
                }
                this.emitSettingChange(setting, option.value);
            });
            control.append(button);
        }
        if (label) {
            wrapper.append(label);
        }
        wrapper.append(control);
        return wrapper;
    }
}

export function createSettingControl(tag: string, setting: SettingControl): HTMLElement {
    const control = document.createElement(tag);
    control.setAttribute("label", setting.label);
    control.setAttribute("value", String(setting.defaultValue ?? ""));
    control.setAttribute("label-display", setting.labelDisplay ?? "visible");
    if (setting.ariaLabel || (setting.labelDisplay && setting.labelDisplay !== "visible")) {
        control.setAttribute("aria-label", setting.ariaLabel ?? setting.label);
    }
    if (setting.help) {
        control.setAttribute("hint", setting.help);
    }
    if (setting.placeholder) {
        control.setAttribute("placeholder", setting.placeholder);
    }
    applyDisabled(control, setting);
    return control;
}

export function renderFieldLabel(label: string, display: SettingLabelDisplay | undefined): HTMLElement | null {
    if (display === "hidden") {
        return null;
    }
    const element = document.createElement("div");
    element.className = display === "sr-only" ? "field-label sr-only" : "field-label";
    element.textContent = label;
    return element;
}

function renderOptionContent(
    settingDisplay: SettingDisplay | undefined,
    optionDisplay: SettingDisplay | undefined,
    iconName: SettingIconName | undefined,
    label: string,
): Node[] {
    const display = optionDisplay ?? settingDisplay ?? (iconName ? "icon-label" : "label");
    const icon = iconName ? settingIcon(iconName) : null;
    const nodes: Node[] = icon && (display === "icon" || display === "icon-label") ? [icon] : [];
    if (display !== "icon" || !icon) {
        const text = document.createElement("span");
        text.textContent = label;
        nodes.push(text);
    }
    return nodes;
}
