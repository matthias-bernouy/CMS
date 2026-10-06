type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | FormAssociatedLike;

type FormAssociatedLike = HTMLElement & {
    name?: string;
    value?: string | string[];
    checked?: boolean;
    uncheckedValue?: string | null;
    files?: FileList | File[];
    disabled?: boolean;
};

export function collectFormData(form: HTMLFormElement): FormData {
    const formData = new FormData(form);
    if (Array.from(formData.keys()).length > 0) {
        return formData;
    }

    for (const control of formControls(form)) {
        appendControl(formData, control);
    }
    return formData;
}

function formControls(form: HTMLFormElement): FormControl[] {
    return Array.from(form.querySelectorAll<FormControl>("input, select, textarea, [name]"));
}

function appendControl(formData: FormData, control: FormControl): void {
    const name = control.name?.trim();
    if (!name || control.disabled) {
        return;
    }

    const view = control.ownerDocument.defaultView ?? globalThis;
    if (control instanceof view.HTMLInputElement) {
        if ((control.type === "checkbox" || control.type === "radio") && !control.checked) {
            return;
        }
        if (control.type === "file") {
            for (const file of Array.from(control.files ?? [])) {
                formData.append(name, file);
            }
            return;
        }
    }

    if (control instanceof view.HTMLSelectElement && control.multiple) {
        for (const option of Array.from(control.selectedOptions)) {
            formData.append(name, option.value);
        }
        return;
    }

    if (!(control instanceof view.HTMLInputElement) && "files" in control) {
        for (const file of Array.from(control.files ?? [])) {
            formData.append(name, file);
        }
        return;
    }

    if (!(control instanceof view.HTMLInputElement) && "checked" in control && control.checked === false) {
        const uncheckedValue = control.uncheckedValue;
        if (uncheckedValue !== undefined && uncheckedValue !== null) {
            formData.append(name, uncheckedValue);
        }
        return;
    }

    const value = control.value ?? "";
    if (Array.isArray(value)) {
        for (const item of value) {
            formData.append(name, String(item));
        }
        return;
    }
    formData.append(name, String(value));
}
