export function renderAdvancedMode(expression: string, onInput: (value: string) => void): HTMLElement {
    const root = document.createElement("div");
    root.className = "mode-panel form-grid";
    const label = document.createElement("label");
    label.className = "control";
    const text = document.createElement("span");
    text.textContent = "Expression";
    const textarea = document.createElement("textarea");
    textarea.className = "advanced-expression";
    textarea.value = expression;
    textarea.placeholder = "plan.status == \"active\" && $source.loaded";
    textarea.addEventListener("input", () => onInput(textarea.value));
    label.append(text, textarea);
    root.append(label);
    return root;
}
