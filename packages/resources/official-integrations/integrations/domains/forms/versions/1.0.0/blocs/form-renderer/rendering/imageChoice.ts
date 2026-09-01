import { optionKey, safeImageSource, type FormField } from "../definition";

export interface ImageChoiceItem {
    key: string;
    label: string;
    imageUrl: string;
    imageAlt: string;
    selected: boolean;
}

export function imageChoiceItems(field: FormField, saved: string | string[] | undefined): ImageChoiceItem[] {
    const selected = new Set(Array.isArray(saved) ? saved : saved ? [saved] : []);
    return (field.options ?? []).map((option) => ({
        key: optionKey(option),
        label: option.label,
        imageUrl: safeImageSource(option.imageUrl),
        imageAlt: option.imageAlt ?? "",
        selected: selected.has(optionKey(option)),
    }));
}

export function imageChoiceControl(field: FormField, saved: string | string[] | undefined): HTMLElement {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "forms-image-choice";
    const legend = document.createElement("legend");
    legend.textContent = field.label;
    fieldset.append(legend);
    if (field.hint) {
        const hint = document.createElement("p");
        hint.id = `forms-hint-${field.key}`;
        hint.className = "forms-image-choice-hint";
        hint.textContent = field.hint;
        fieldset.setAttribute("aria-describedby", hint.id);
        fieldset.append(hint);
    }

    const grid = document.createElement("div");
    grid.className = "forms-image-choice-grid";
    const inputs = imageChoiceItems(field, saved).map((option) => {
        const label = document.createElement("label");
        label.className = "forms-image-choice-option";
        const input = document.createElement("input");
        input.type = field.multiple ? "checkbox" : "radio";
        input.name = field.key;
        input.value = option.key;
        input.checked = option.selected;
        input.required = Boolean(field.required && !field.multiple);

        const card = document.createElement("span");
        card.className = "forms-image-choice-card";
        const image = document.createElement("img");
        image.src = option.imageUrl;
        image.alt = option.imageAlt;
        image.loading = "lazy";
        const caption = document.createElement("span");
        caption.textContent = option.label;
        card.append(image, caption);
        label.append(input, card);
        grid.append(label);
        return input;
    });
    fieldset.append(grid);
    bindMultipleRequired(inputs, Boolean(field.required && field.multiple));
    return fieldset;
}

function bindMultipleRequired(inputs: HTMLInputElement[], required: boolean): void {
    if (!required || !inputs[0]) {
        return;
    }
    const update = (): void => {
        inputs[0]!.setCustomValidity(inputs.some((input) => input.checked) ? "" : "Choose at least one option.");
    };
    inputs.forEach((input) => input.addEventListener("change", update));
    update();
}
