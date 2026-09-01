import type { FormAnswers, FormDefinition, FormField } from "./definition";

export function formsRoot(host: HTMLElement): HTMLElement {
    let root = host.querySelector<HTMLElement>("[data-forms-root]");
    if (!root) {
        root = document.createElement("div");
        root.dataset.formsRoot = "";
        host.append(root);
    }
    return root;
}

export function sourceBase(host: HTMLElement): string {
    const prefix = (host.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
    const sourceId = encodeURIComponent(host.getAttribute("source-id") || "forms");
    return `${prefix}/${sourceId}`;
}

function setOptional(element: HTMLElement, name: string, value: string | undefined): void {
    if (value) {
        element.setAttribute(name, value);
    }
}

function controlFor(field: FormField, saved: string | string[] | undefined): HTMLElement {
    if (field.type === "textarea") {
        return standardControl("basic-textarea", field, saved);
    }
    if (field.type === "select") {
        const select = standardControl("basic-select", field, saved);
        for (const option of field.options ?? []) {
            const item = document.createElement("basic-option");
            item.setAttribute("value", option.value);
            item.textContent = option.label;
            select.append(item);
        }
        return select;
    }
    if (field.type === "choice") {
        const group = standardControl("basic-chip-group", field, saved);
        group.setAttribute("mode", field.multiple ? "multiple" : "single");
        const selected = new Set(Array.isArray(saved) ? saved : saved ? [saved] : []);
        for (const option of field.options ?? []) {
            const chip = document.createElement("basic-chip");
            chip.setAttribute("value", option.value);
            chip.toggleAttribute("selected", selected.has(option.value));
            chip.textContent = option.label;
            group.append(chip);
        }
        return group;
    }
    if (field.type === "checkbox") {
        const checkbox = document.createElement("basic-checkbox");
        checkbox.setAttribute("name", field.key);
        checkbox.setAttribute("value", "true");
        checkbox.setAttribute("unchecked-value", "false");
        checkbox.toggleAttribute("checked", saved === "true");
        checkbox.toggleAttribute("required", Boolean(field.required));
        checkbox.textContent = field.label;
        return checkbox;
    }
    return standardControl("basic-input", field, saved);
}

function standardControl(tag: string, field: FormField, saved: string | string[] | undefined): HTMLElement {
    const element = document.createElement(tag);
    element.setAttribute("name", field.key);
    element.setAttribute("label", field.label);
    if (field.type !== "select" && field.type !== "choice") {
        element.setAttribute("type", field.type);
    }
    setOptional(element, "hint", field.hint);
    setOptional(element, "placeholder", field.placeholder);
    setOptional(element, "autocomplete", field.autocomplete);
    if (saved !== undefined) {
        element.setAttribute("value", Array.isArray(saved) ? saved.join(",") : saved);
    }
    element.toggleAttribute("required", Boolean(field.required));
    return element;
}

export interface StepViewActions {
    back(): void;
    submit(form: HTMLFormElement): void;
}

export function renderStep(
    root: HTMLElement,
    definition: FormDefinition,
    stepIndex: number,
    values: FormAnswers,
    actions: StepViewActions,
): void {
    const step = definition.steps[stepIndex];
    const form = document.createElement("form");
    form.noValidate = false;
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        actions.submit(form);
    });

    const progress = document.createElement("p");
    progress.className = "forms-progress-label";
    progress.textContent = `Step ${stepIndex + 1} of ${definition.steps.length}`;
    const meter = document.createElement("progress");
    meter.max = definition.steps.length;
    meter.value = stepIndex + 1;
    meter.setAttribute("aria-label", progress.textContent);
    const title = document.createElement("h2");
    title.textContent = step.title;
    form.append(progress, meter, title);
    if (step.description) {
        const description = document.createElement("p");
        description.className = "forms-step-description";
        description.textContent = step.description;
        form.append(description);
    }
    const fields = document.createElement("div");
    fields.className = "forms-fields";
    for (const field of step.fields) {
        fields.append(controlFor(field, values[field.key]));
    }
    const honeypot = document.createElement("input");
    honeypot.className = "forms-trap";
    honeypot.name = "website";
    honeypot.tabIndex = -1;
    honeypot.autocomplete = "off";
    fields.append(honeypot);
    form.append(fields, navigation(definition, stepIndex, actions));
    root.replaceChildren(form);
}

function navigation(definition: FormDefinition, stepIndex: number, actions: StepViewActions): HTMLElement {
    const footer = document.createElement("footer");
    footer.className = "forms-actions";
    if (stepIndex > 0) {
        const wrapper = document.createElement("basic-button");
        wrapper.setAttribute("appearance", "ghost");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Back";
        button.addEventListener("click", actions.back);
        wrapper.append(button);
        footer.append(wrapper);
    }
    const nextWrapper = document.createElement("basic-button");
    const next = document.createElement("button");
    next.type = "submit";
    next.textContent = stepIndex + 1 === definition.steps.length ? definition.submitLabel || "Submit" : "Continue";
    nextWrapper.append(next);
    footer.append(nextWrapper);
    return footer;
}

export function answersFrom(form: HTMLFormElement): FormAnswers {
    const answers: FormAnswers = {};
    for (const [key, value] of new FormData(form)) {
        if (key === "website" || typeof value !== "string") {
            continue;
        }
        const previous = answers[key];
        answers[key] =
            previous === undefined ? value : Array.isArray(previous) ? [...previous, value] : [previous, value];
    }
    return answers;
}
