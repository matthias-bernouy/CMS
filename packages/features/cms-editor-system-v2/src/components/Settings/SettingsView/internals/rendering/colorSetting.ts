import type { ColorSetting, SettingLabelDisplay } from "@bernouy/cms-content/editor";
import type { SettingsViewThemeToken } from "../../SettingsView";

type RenderFieldLabel = (label: string, display: SettingLabelDisplay | undefined) => HTMLElement | null;
type EmitColorChange = (value: string) => void;

export function renderColorSetting(
    setting: ColorSetting,
    themeTokens: SettingsViewThemeToken[],
    renderFieldLabel: RenderFieldLabel,
    emitColorChange: EmitColorChange,
): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field color-field";
    const label = renderFieldLabel(setting.label, setting.labelDisplay);
    if (label) {
        wrapper.append(label);
    }

    const controls = document.createElement("div");
    controls.className = "color-custom";
    const picker = createColorPicker(setting);
    const input = createColorInput(setting);
    wireColorInputs(setting, picker, input, emitColorChange);

    if (themeTokens.length) {
        wrapper.append(createTokenSelect(setting, themeTokens, picker, input, emitColorChange));
    }
    const apply = document.createElement("button");
    apply.className = "color-custom-apply";
    apply.type = "button";
    apply.textContent = "Apply";
    apply.disabled = setting.disabled === true;
    apply.addEventListener("click", () => {
        if (!setting.disabled) {
            emitColorChange(input.value.trim());
        }
    });

    controls.append(picker, input, apply);
    wrapper.append(controls);
    if (setting.help) {
        const help = document.createElement("div");
        help.className = "field-help";
        help.textContent = setting.help;
        wrapper.append(help);
    }
    return wrapper;
}

function createTokenSelect(
    setting: ColorSetting,
    tokens: SettingsViewThemeToken[],
    picker: HTMLInputElement,
    input: HTMLInputElement,
    emitColorChange: EmitColorChange,
): HTMLSelectElement {
    const select = document.createElement("select");
    select.className = "color-token-select";
    select.ariaLabel = `${setting.label} theme token`;
    select.disabled = setting.disabled === true;
    const custom = document.createElement("option");
    custom.value = "";
    custom.textContent = "Custom color";
    select.append(custom);
    const groups = new Map<string, HTMLOptGroupElement>();
    for (const token of tokens) {
        const option = document.createElement("option");
        option.value = `var(--${token.variable})`;
        option.textContent = token.label;
        const category = token.category?.trim();
        if (!category) {
            select.append(option);
            continue;
        }
        let group = groups.get(category);
        if (!group) {
            group = document.createElement("optgroup");
            group.label = category;
            groups.set(category, group);
            select.append(group);
        }
        group.append(option);
    }
    const selected = Array.from(select.querySelectorAll("option")).find(
        (option) => option.value === (setting.defaultValue ?? ""),
    );
    if (selected) {
        selected.selected = true;
    }
    select.addEventListener("change", () => {
        if (setting.disabled || !select.value) {
            return;
        }
        input.value = select.value;
        picker.value = colorPickerValue(select.value);
        emitColorChange(select.value);
    });
    return select;
}

function createColorPicker(setting: ColorSetting): HTMLInputElement {
    const picker = document.createElement("input");
    picker.className = "color-custom-picker";
    picker.type = "color";
    picker.ariaLabel = `${setting.label} picker`;
    picker.value = colorPickerValue(setting.defaultValue);
    picker.disabled = setting.disabled === true;
    return picker;
}

function createColorInput(setting: ColorSetting): HTMLInputElement {
    const input = document.createElement("input");
    input.className = "color-custom-input";
    input.type = "text";
    input.placeholder = setting.placeholder ?? "#f6f7f8";
    input.value = setting.defaultValue ?? "";
    input.disabled = setting.disabled === true;
    return input;
}

function wireColorInputs(
    setting: ColorSetting,
    picker: HTMLInputElement,
    input: HTMLInputElement,
    emitColorChange: EmitColorChange,
): void {
    picker.addEventListener("input", () => {
        if (setting.disabled) {
            return;
        }
        input.value = picker.value;
        emitColorChange(picker.value);
    });
    input.addEventListener("change", () => {
        if (setting.disabled) {
            return;
        }
        picker.value = colorPickerValue(input.value);
        emitColorChange(input.value.trim());
    });
}

function colorPickerValue(value: string | undefined): string {
    const normalized = value?.trim() ?? "";
    if (/^#[\da-f]{6}$/i.test(normalized)) {
        return normalized;
    }
    if (/^#[\da-f]{3}$/i.test(normalized)) {
        return `#${normalized
            .slice(1)
            .split("")
            .map((character) => character.repeat(2))
            .join("")}`;
    }
    return "#000000";
}
