import type { EditableNativeAttribute, EditablePageDocument } from "../document/index";
import { displayLabel, type EditorCatalogueItem } from "../model";
import { wrapEditorControl } from "./controls";

export function renderNativeElementFields(
    target: HTMLElement,
    documentModel: EditablePageDocument,
    element: HTMLElement,
    item?: EditorCatalogueItem,
    labels: Readonly<{ chooseImage: string }> = { chooseImage: "Choose an image" },
): void {
    target.replaceChildren();
    for (const field of documentModel.nativeElementFields(element, item)) {
        if (field.attributes.length === 0 && field.tags.length < 2) {
            continue;
        }
        const group = document.createElement("fieldset");
        group.dataset.nativeGroup = field.slot;
        const legend = document.createElement("legend");
        legend.textContent = `${field.label} · <${field.tag}>`;
        group.append(legend);
        for (const attribute of field.attributes) {
            group.append(attributeControl(field.slot, field.tag, attribute, labels));
        }
        target.append(group);
    }
    target.toggleAttribute("hidden", target.childElementCount === 0);
}

function attributeControl(
    slot: string,
    tag: string,
    attribute: EditableNativeAttribute,
    labels: Readonly<{ chooseImage: string }>,
): HTMLLabelElement {
    const label = document.createElement("label");
    label.toggleAttribute("data-boolean-control", attribute.kind === "boolean");
    const caption = document.createElement("span");
    caption.textContent = displayLabel(attribute.name);
    label.append(caption);
    const control = nativeControl(attribute);
    control.dataset.nativeSlot = slot;
    control.dataset.nativeAttribute = attribute.name;
    control.dataset.nativeKind = attribute.kind;
    const kind = attribute.kind === "boolean" ? "toggle" : control instanceof HTMLSelectElement ? "select" : "input";
    label.append(wrapEditorControl(control, kind));
    if (tag === "img" && attribute.name === "src" && control instanceof HTMLInputElement) {
        control.readOnly = true;
        const choose = document.createElement("button");
        choose.type = "button";
        choose.setAttribute("cms-bloc", "ulvia-official-action");
        choose.setAttribute("size", "sm");
        choose.setAttribute("variant", "outline");
        choose.dataset.openMediaPicker = "";
        choose.dataset.mediaNativeSlot = slot;
        choose.dataset.mediaNativeAttribute = attribute.name;
        choose.textContent = labels.chooseImage;
        label.append(choose);
    }
    return label;
}

function nativeControl(attribute: EditableNativeAttribute): HTMLInputElement | HTMLSelectElement {
    if (attribute.kind === "boolean") {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.role = "switch";
        input.checked = Boolean(attribute.value);
        return input;
    }
    if (attribute.values.length > 0) {
        const select = document.createElement("select");
        for (const value of attribute.values) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            select.append(option);
        }
        select.value = String(attribute.value);
        return select;
    }
    const input = document.createElement("input");
    input.type = attribute.name === "src" || attribute.name === "href" ? "url" : "text";
    if (attribute.name === "src") {
        input.placeholder = "/.cms/call/ulvia.cms.files/files/…";
    }
    input.autocomplete = "off";
    input.value = String(attribute.value);
    return input;
}
