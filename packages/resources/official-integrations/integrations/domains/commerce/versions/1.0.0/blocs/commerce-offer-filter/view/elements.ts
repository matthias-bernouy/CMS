export function basicSelect(label, attributes) {
    const template = document.createElement("template");
    template.innerHTML = "<basic-select></basic-select>";
    const select = template.content.firstElementChild;
    select.setAttribute("label", label);
    select.setAttribute("text-color", "var(--text-main)");
    select.setAttribute("background-color", "var(--bg-surface)");
    select.setAttribute("border-color", "var(--border-default)");
    select.setAttribute("accent-color", "var(--secondary-base)");
    for (const [name, value] of Object.entries(attributes)) {
        select.setAttribute(name, value);
    }
    return select;
}

export function basicOption(value, label) {
    const template = document.createElement("template");
    template.innerHTML = "<basic-option></basic-option>";
    const item = template.content.firstElementChild;
    item.setAttribute("value", value);
    item.textContent = label;
    return item;
}

export function filterWrapper(filterTag, field, definition) {
    return element(filterTag, {
        field: field.key,
        operator: definition.operator,
        "value-type": definition.valueType,
        "data-filterable-field": field.key,
    });
}

export function element(tag, attributes) {
    const value = document.createElement(tag);
    for (const [name, content] of Object.entries(attributes)) {
        value.setAttribute(name, content);
    }
    return value;
}
