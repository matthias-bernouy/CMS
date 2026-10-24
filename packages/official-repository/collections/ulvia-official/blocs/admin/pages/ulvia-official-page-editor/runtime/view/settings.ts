import { authoringContract, type EditorCatalogueItem, type EditorSetting } from "../model";
import { wrapEditorControl } from "./controls";

type RootFieldLabels = Readonly<{ linkUrl: string; nativeElement: string }>;

export function renderRootFields(
    target: HTMLElement,
    element: HTMLElement,
    item: EditorCatalogueItem | undefined,
    labels: RootFieldLabels,
): void {
    target.replaceChildren();
    const tags = item ? (authoringContract(item).root?.accepts ?? []) : [];
    if (tags.length > 1) {
        const label = document.createElement("label");
        const caption = document.createElement("span");
        const select = document.createElement("select");
        caption.textContent = labels.nativeElement;
        select.dataset.rootTag = "";
        for (const tag of tags) {
            const option = document.createElement("option");
            option.value = tag;
            option.textContent = `<${tag}>`;
            select.append(option);
        }
        select.value = element.localName;
        label.append(caption, wrapEditorControl(select, "select"));
        target.append(label);
    }
    if (element.localName === "a") {
        const label = document.createElement("label");
        const caption = document.createElement("span");
        const input = document.createElement("input");
        caption.textContent = labels.linkUrl;
        input.type = "url";
        input.inputMode = "url";
        input.autocomplete = "off";
        input.dataset.rootAttribute = "href";
        input.value = element.getAttribute("href") ?? "";
        label.append(caption, wrapEditorControl(input, "input"));
        target.append(label);
    }
}

export function renderSettings(
    target: HTMLElement,
    element: HTMLElement,
    item?: EditorCatalogueItem,
    labels: Readonly<{ chooseImage: string }> = { chooseImage: "Choose an image" },
): void {
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
    for (const [group, entries] of groups) {
        const container = group ? document.createElement("fieldset") : document.createElement("div");
        container.dataset.settingGroup = group;
        if (group) {
            const legend = document.createElement("legend");
            legend.textContent = group;
            container.append(legend);
        }
        container.append(...entries.map((setting) => settingControl(element, setting, labels)));
        target.append(container);
    }
}

function settingControl(
    element: HTMLElement,
    setting: EditorSetting,
    labels: Readonly<{ chooseImage: string }>,
): HTMLLabelElement {
    const label = document.createElement("label");
    const caption = document.createElement("span");
    caption.textContent = setting.label;
    label.append(caption);
    if (setting.type === "boolean") {
        label.dataset.booleanControl = "";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.role = "switch";
        input.checked = element.hasAttribute(setting.id);
        input.dataset.setting = setting.id;
        input.dataset.settingType = setting.type;
        label.append(wrapEditorControl(input, "toggle"));
        return label;
    }
    const options = settingOptions(setting);
    const control = options.length ? document.createElement("select") : document.createElement("input");
    control.dataset.setting = setting.id;
    control.dataset.settingType = setting.type;
    if (control instanceof HTMLSelectElement) {
        for (const definition of options) {
            const option = document.createElement("option");
            option.value = definition.value;
            option.textContent = definition.label;
            control.append(option);
        }
    } else {
        configureInput(control, setting);
    }
    control.value = element.getAttribute(setting.id) ?? String(setting.default ?? "");
    label.append(wrapEditorControl(control, control instanceof HTMLSelectElement ? "select" : "input"));
    if (setting.control.kind === "media-picker" && control instanceof HTMLInputElement) {
        control.readOnly = true;
        const choose = document.createElement("button");
        choose.type = "button";
        choose.setAttribute("cms-bloc", "ulvia-official-action");
        choose.setAttribute("size", "sm");
        choose.setAttribute("variant", "outline");
        choose.dataset.openMediaPicker = "";
        choose.dataset.mediaSetting = setting.id;
        choose.textContent = labels.chooseImage;
        label.append(choose);
    }
    appendSettingNotes(label, setting);
    return label;
}

function settingOptions(setting: EditorSetting): Array<{ value: string; label: string }> {
    if (setting.control.kind === "select" || setting.control.kind === "segmented") {
        return setting.control.options ?? [];
    }
    return setting.control.kind === "color" ? (setting.control.tokens ?? []) : [];
}

function configureInput(input: HTMLInputElement, setting: EditorSetting): void {
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

function appendSettingNotes(label: HTMLLabelElement, setting: EditorSetting): void {
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
