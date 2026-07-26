import type { ThemeDefinition, ThemeMode, ThemeToken } from "@bernouy/cms-content";

export function renderToken(
    token: ThemeToken,
    theme: ThemeDefinition,
    mode: ThemeMode,
    catalogEditable: boolean,
): HTMLElement {
    const overridden = Object.hasOwn(theme.values[mode] ?? {}, token.id);
    const value = effectiveValue(token, theme, mode);
    const row = document.createElement("div");
    row.className = "element-row";
    row.dataset.tokenId = token.id;
    row.dataset.tokenType = token.type;
    row.append(renderLabel(token, catalogEditable), renderControls(token, value, mode, overridden));
    return row;
}

function renderLabel(token: ThemeToken, catalogEditable: boolean): HTMLElement {
    const label = document.createElement("div");
    label.className = "element-label";
    if (catalogEditable) {
        const input = document.createElement("input");
        input.className = "token-label-input";
        input.type = "text";
        input.value = token.label;
        input.ariaLabel = `Label for --${token.variable}`;
        input.dataset.tokenLabel = "true";
        label.append(input);
    } else {
        const name = document.createElement("strong");
        name.className = "token-label-text";
        name.textContent = token.label;
        label.append(name);
    }
    const detail = document.createElement("span");
    detail.textContent = `${token.description} · var(--${token.variable})`;
    label.append(detail);
    return label;
}

function renderControls(token: ThemeToken, value: string, mode: ThemeMode, overridden: boolean): HTMLElement {
    const group = document.createElement("div");
    group.className = "token-controls";
    group.append(renderControl(token, value));
    const defaults = token.defaults;
    if (defaults) {
        group.append(renderDefault(token, mode, defaults, overridden));
    }
    return group;
}

function renderControl(token: ThemeToken, value: string): HTMLElement {
    if (token.type !== "color") {
        return valueInput(token, value);
    }
    const control = document.createElement("div");
    control.className = "color-control";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
    picker.dataset.valueControl = "true";
    picker.ariaLabel = `${token.label} color picker`;
    control.append(picker, valueInput(token, value));
    return control;
}

function valueInput(token: ThemeToken, value: string): HTMLInputElement {
    const input = document.createElement("input");
    const fontFamily = (token.type as string) === "font-family";
    input.className = fontFamily ? "value-control font-family-control" : "value-control";
    input.type = "text";
    input.value = value;
    input.dataset.valueControl = "true";
    input.ariaLabel = fontFamily ? `${token.label} font family` : `${token.label} CSS value`;
    input.autocomplete = "off";
    input.spellcheck = false;
    if (fontFamily) {
        input.placeholder = "Inter, system-ui, sans-serif";
    }
    return input;
}

function renderDefault(
    token: ThemeToken,
    mode: ThemeMode,
    defaults: NonNullable<ThemeToken["defaults"]>,
    overridden: boolean,
): HTMLElement {
    const line = document.createElement("div");
    line.className = "token-default";
    const expected = defaults[mode];
    const text = document.createElement("span");
    text.textContent = expected === undefined ? "Default: inherits the light value" : `Default: ${expected}`;
    const reset = document.createElement("button");
    reset.type = "button";
    reset.dataset.resetToken = token.id;
    reset.textContent = "Reset";
    reset.disabled = !overridden;
    reset.ariaLabel = `Reset ${token.label} to its integration default`;
    line.append(text, reset);
    return line;
}

function effectiveValue(token: ThemeToken, theme: ThemeDefinition, mode: ThemeMode): string {
    const direct = theme.values[mode]?.[token.id] ?? token.defaults?.[mode];
    if (direct !== undefined || mode === "light") {
        return direct ?? "";
    }
    return token.defaults?.light ?? "";
}
