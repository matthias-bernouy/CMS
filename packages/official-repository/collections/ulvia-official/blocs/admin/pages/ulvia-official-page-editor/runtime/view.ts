import { authoringContract, displayLabel, type EditorCatalogueItem, type EditorSetting } from "./model";

export function renderCatalogue(target: HTMLElement, catalogue: EditorCatalogueItem[], query: string): void {
    target.replaceChildren();
    const normalized = query.trim().toLocaleLowerCase();
    for (const item of catalogue.filter((candidate) => matches(candidate, normalized))) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.add = item.id;
        const name = document.createElement("strong");
        name.textContent = item.name;
        const details = document.createElement("small");
        details.textContent = item.group;
        button.append(name, details);
        if (item.description) {
            const description = document.createElement("span");
            description.textContent = item.description;
            button.append(description);
        }
        target.append(button);
    }
    target.parentElement
        ?.querySelector<HTMLElement>("[data-catalogue-empty]")
        ?.toggleAttribute("hidden", target.childElementCount > 0);
}

export function renderOutline(
    target: HTMLOListElement,
    elements: HTMLElement[],
    catalogue: EditorCatalogueItem[],
    selected: number,
): void {
    target.replaceChildren();
    for (const [index, element] of elements.entries()) {
        const item = itemForElement(element, catalogue);
        const row = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.select = String(index);
        button.setAttribute("aria-current", String(index === selected));
        button.textContent = item?.name ?? displayLabel(element.localName);
        row.append(button);
        target.append(row);
    }
}

export function renderSettings(target: HTMLElement, element: HTMLElement, item?: EditorCatalogueItem): void {
    target.replaceChildren();
    const groups = new Map<string, EditorSetting[]>();
    const settings = item ? (authoringContract(item).settings ?? []) : [];
    for (const setting of settings) {
        if (!settingIsVisible(element, setting, settings)) {
            continue;
        }
        const entries = groups.get(setting.group ?? "") ?? [];
        entries.push(setting);
        groups.set(setting.group ?? "", entries);
    }
    for (const [group, settings] of groups) {
        const container = group ? document.createElement("fieldset") : document.createElement("div");
        container.dataset.settingGroup = group;
        if (group) {
            const legend = document.createElement("legend");
            legend.textContent = group;
            container.append(legend);
        }
        container.append(...settings.map((setting) => settingControl(element, setting)));
        target.append(container);
    }
}

export function itemForElement(
    element: HTMLElement,
    catalogue: EditorCatalogueItem[],
): EditorCatalogueItem | undefined {
    return catalogue.find((item) => element.getAttribute("cms-bloc") === item.id);
}

function matches(item: EditorCatalogueItem, query: string): boolean {
    return !query || `${item.name} ${item.group} ${item.description} ${item.id}`.toLocaleLowerCase().includes(query);
}

function settingControl(element: HTMLElement, setting: EditorSetting): HTMLLabelElement {
    const label = document.createElement("label");
    const caption = document.createElement("span");
    caption.textContent = setting.label;
    label.append(caption);
    if (setting.type === "boolean") {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = element.hasAttribute(setting.id);
        input.dataset.setting = setting.id;
        input.dataset.settingType = setting.type;
        label.append(input);
        return label;
    }
    const options =
        setting.control.kind === "select" || setting.control.kind === "segmented" || setting.control.kind === "color"
            ? ((setting.control.kind === "color" ? setting.control.tokens : setting.control.options) ?? [])
            : [];
    const control = options.length ? document.createElement("select") : document.createElement("input");
    control.dataset.setting = setting.id;
    control.dataset.settingType = setting.type;
    if (control.localName === "select") {
        const select = control as HTMLSelectElement;
        for (const optionDefinition of options) {
            const option = document.createElement("option");
            option.value = optionDefinition.value;
            option.textContent = optionDefinition.label;
            select.append(option);
        }
    } else {
        const input = control as HTMLInputElement;
        input.type = inputType(setting);
        if (setting.control.kind === "text" && setting.control.placeholder) {
            input.placeholder = setting.control.placeholder;
        }
        if (setting.minLength !== undefined) {
            input.minLength = setting.minLength;
        }
        if (setting.maxLength !== undefined) {
            input.maxLength = setting.maxLength;
        }
        if (setting.minimum !== undefined) {
            input.min = String(setting.minimum);
        }
        if (setting.maximum !== undefined) {
            input.max = String(setting.maximum);
        }
        if ((setting.control.kind === "number" || setting.control.kind === "range") && setting.control.step) {
            input.step = String(setting.control.step);
        }
    }
    control.value = element.getAttribute(setting.id) ?? String(setting.default ?? "");
    label.append(control);
    if ((setting.control.kind === "number" || setting.control.kind === "range") && setting.control.suffix) {
        const suffix = document.createElement("small");
        suffix.textContent = setting.control.suffix;
        label.append(suffix);
    }
    if (setting.help) {
        const help = document.createElement("small");
        help.textContent = setting.help;
        label.append(help);
    }
    return label;
}

function inputType(setting: EditorSetting): string {
    if (setting.control.kind === "range") {
        return "range";
    }
    return setting.type === "integer" || setting.type === "number" ? "number" : "text";
}

function settingIsVisible(element: HTMLElement, setting: EditorSetting, settings: EditorSetting[]): boolean {
    return (setting.visibleWhen ?? []).every((rule) => {
        const definition = settings.find(({ id }) => id === rule.setting);
        const referenced =
            definition?.type === "boolean"
                ? element.hasAttribute(rule.setting)
                : (element.getAttribute(rule.setting) ?? definition?.default ?? "");
        const equals = array(rule.equals);
        const notEquals = array(rule.notEquals);
        return (
            (equals.length === 0 || equals.some((value) => String(value) === String(referenced))) &&
            (notEquals.length === 0 || notEquals.every((value) => String(value) !== String(referenced)))
        );
    });
}

function array<T>(value: T | readonly T[] | undefined): readonly T[] {
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
