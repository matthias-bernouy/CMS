export function createSelectElement(label, attributes) {
    const template = document.createElement("template");
    template.innerHTML = "<mossa-select></mossa-select>";
    const select = template.content.firstElementChild;
    select.setAttribute("label", label);
    for (const [name, value] of Object.entries(attributes)) {
        select.setAttribute(name, value);
    }
    return select;
}

export function createOptionElement(value, label) {
    const template = document.createElement("template");
    template.innerHTML = "<mossa-option></mossa-option>";
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
