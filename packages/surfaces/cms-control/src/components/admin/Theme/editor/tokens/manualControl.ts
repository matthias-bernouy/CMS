import type { ThemeToken, ThemeTokenType } from "@bernouy/cms-content";

type ValueControl = HTMLElement & { value: string };

const FONT_STACKS = [
    ["System sans serif", 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'],
    ["Humanist sans serif", '"Trebuchet MS", system-ui, sans-serif'],
    ["Editorial serif", 'Georgia, "Times New Roman", serif'],
    ["Classic serif", '"Times New Roman", Times, serif'],
    ["Monospace", 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace'],
] as const;

const SHADOW_PRESETS = [
    ["None", "none"],
    ["Subtle", "0 .25rem .75rem rgb(18 30 24 / 10%)"],
    ["Soft", "0 .5rem 1.5rem rgb(18 30 24 / 12%)"],
    ["Strong", "0 .75rem 2rem rgb(18 30 24 / 18%)"],
] as const;

const LENGTH_UNITS = ["px", "rem", "em", "%", "vw", "vh", "vmin", "vmax", "ch"] as const;

export function renderManualControl(token: ThemeToken, value: string): HTMLElement {
    const editor = document.createElement("div");
    editor.className = "token-editor-panel manual-editor";
    editor.dataset.manualEditor = "true";
    editor.append(manualControl(token, value));
    return editor;
}

function manualControl(token: ThemeToken, value: string): HTMLElement {
    if (token.type === "color") {
        return colorControl(token, value);
    }
    if (token.type === "font-family") {
        return presetCombobox(token, value, FONT_STACKS, "Choose or enter a font stack");
    }
    if (token.type === "length") {
        return lengthControl(token, value);
    }
    if (token.type === "number") {
        return textControl(token, value, "number", "1");
    }
    if (token.type === "shadow") {
        return presetCombobox(token, value, SHADOW_PRESETS, "Choose or enter a shadow");
    }
    return textControl(token, value, "text", "Enter a value");
}

function colorControl(token: ThemeToken, value: string): HTMLElement {
    const control = document.createElement("div");
    control.className = "color-control";
    const picker = document.createElement("input");
    const hasPreview = /^#[0-9a-f]{6}$/i.test(value);
    picker.type = "color";
    picker.value = hasPreview ? value : "#000000";
    picker.dataset.valueControl = "true";
    picker.ariaLabel = `${token.label} color picker`;
    control.append(picker, textControl(token, value, "text", "#000000"));
    return control;
}

function lengthControl(token: ThemeToken, value: string): HTMLElement {
    const parsed = parseLength(value);
    const control = document.createElement("div");
    control.className = "length-editor";
    const number = textControl(token, parsed?.number ?? "", "number", "1");
    number.classList.add("length-number");
    number.dataset.lengthNumber = "true";
    number.removeAttribute("data-value-editor-control");
    number.setAttribute("step", "any");
    number.hidden = !parsed;
    const unit = document.createElement("p9r-select") as ValueControl;
    unit.className = "length-unit";
    unit.dataset.lengthUnit = "true";
    unit.setAttribute("aria-label", `${token.label} unit`);
    unit.append(
        option("", "Unitless"),
        ...LENGTH_UNITS.map((value) => option(value, value)),
        option("advanced", "CSS expression"),
    );
    unit.setAttribute("value", parsed?.unit ?? "advanced");
    unit.value = parsed?.unit ?? "advanced";
    const advanced = textControl(token, value, "text", "calc(100% - 2rem)");
    advanced.classList.add("length-expression");
    advanced.dataset.lengthExpression = "true";
    advanced.hidden = Boolean(parsed);
    control.append(number, unit, advanced);
    return control;
}

function textControl(token: ThemeToken, value: string, type: "number" | "text", placeholder: string): ValueControl {
    const input = document.createElement("p9r-input") as ValueControl;
    input.className = `value-control ${token.type}-control`;
    input.dataset.valueEditorControl = "true";
    input.setAttribute("aria-label", `${token.label} ${controlLabel(token.type)}`);
    input.setAttribute("type", type);
    input.setAttribute("placeholder", placeholder);
    if (type === "number") {
        input.setAttribute("step", "any");
    }
    input.setAttribute("value", value);
    input.value = value;
    return input;
}

function presetCombobox(
    token: ThemeToken,
    value: string,
    presets: ReadonlyArray<readonly [string, string]>,
    placeholder: string,
): ValueControl {
    const input = document.createElement("p9r-combobox") as ValueControl;
    input.className = `value-control ${token.type}-control`;
    input.dataset.valueEditorControl = "true";
    input.setAttribute("aria-label", `${token.label} ${controlLabel(token.type)}`);
    input.setAttribute("creatable", "");
    input.setAttribute("placeholder", placeholder);
    input.append(...presets.map(([label, value]) => option(value, label)));
    input.setAttribute("value", value);
    input.value = value;
    return input;
}

function option(value: string, label: string): HTMLOptionElement {
    const item = document.createElement("option");
    item.value = value;
    item.textContent = label;
    return item;
}

function parseLength(value: string): { number: string; unit: string } | undefined {
    const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em|%|vw|vh|vmin|vmax|ch)?$/iu.exec(value.trim());
    return match ? { number: match[1]!, unit: match[2] ?? "" } : undefined;
}

function controlLabel(type: ThemeTokenType): string {
    const labels: Record<ThemeTokenType, string> = {
        color: "color value",
        "font-family": "font family",
        length: "length",
        number: "number",
        shadow: "shadow",
        value: "value",
    };
    return labels[type];
}
